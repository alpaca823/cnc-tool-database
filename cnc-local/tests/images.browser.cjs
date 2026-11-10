// Image-feature checks use an intercepted loopback origin because managed Chromium blocks file://.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const target=path.join(root,'CNC-Tool-Database.html');
const URL='http://localhost:31460/images.html';
(async()=>{
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'cnc-images-'));
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  const context=await browser.newContext({viewport:{width:1000,height:1000},acceptDownloads:true});
  const errors=[],unexpectedRequests=[];
  try {
    await context.route(/^https?:/,route=>{
      if(route.request().url()===URL) return route.fulfill({contentType:'text/html',body:fs.readFileSync(target,'utf8')});
      unexpectedRequests.push(route.request().url()); return route.abort();
    });
    const page=await context.newPage(); page.on('pageerror',e=>errors.push(e.message));
    const rpc=(name,...args)=>page.evaluate(({name,args})=>window.cncLocal.call(name,...args),{name,args});
    const idle=()=>page.waitForFunction(()=>!document.getElementById('settingFields').disabled);
    const go=name=>page.locator('.nav-button[data-page="'+name+'"]').click();
    async function login() {
      if(await page.locator('#workspace').isHidden() && await page.locator('#adminPanel').isHidden()) await page.locator('#toggleView').click();
      if(await page.locator('#workspace').isHidden()) {
        await page.locator('#password').fill('Feds201'); await page.locator('#loginForm button').click();
        await page.locator('#workspace').waitFor({state:'visible'});
      }
      await idle(); await go('feeds');
    }
    async function save() {
      await go('feeds');
      await page.locator('#saveSetting').click();
      await page.waitForFunction(()=>document.getElementById('adminStatus').textContent.includes('saved') && !document.getElementById('settingFields').disabled);
    }
    async function show() {
      await go('feeds');
      await page.locator('#mill').selectOption('001'); await page.locator('#material').selectOption('Test material');
      await page.locator('#show').click(); await page.locator('#result').waitFor({state:'visible'});
    }
    await page.goto(URL); await page.evaluate(()=>window.cncLocal.ready);
    await login();
    await go('materials');
    await page.locator('#manageMaterials').click();
    await page.locator('#materialName').fill('Test material');
    await page.locator('#saveMaterial').click();
    await page.waitForFunction(()=>document.getElementById('adminStatus').textContent.includes('saved') && !document.getElementById('settingFields').disabled);
    await go('feeds');
    for(const [id,value] of Object.entries({editMill:'001',editRpm:'12000',editFeed:'10',editDepth:'.125',editNotes:'Automated test fixture; not a machining recommendation.'})) await page.locator('#'+id).fill(value);
    await page.locator('#editMaterial').selectOption('Test material');
    await save(); await show();
    assert.equal(await page.locator('#resultImages').isHidden(),true);
    console.log('PASS: existing settings without images still save and display; the empty image area is hidden.');

    const fixtures=await page.evaluate(()=>{
      function png(width,height,color) {
        const canvas=document.createElement('canvas'); canvas.width=width; canvas.height=height;
        const ctx=canvas.getContext('2d'); ctx.fillStyle=color; ctx.fillRect(0,0,width,height);
        ctx.fillStyle='#fff'; ctx.fillRect(40,40,width-80,height-80);
        ctx.fillStyle=color; ctx.beginPath(); ctx.arc(width/2,height/2,Math.min(width,height)/4,0,Math.PI*2);ctx.fill();
        return canvas.toDataURL('image/png').split(',')[1];
      }
      return {tool:png(1800,1200,'#12675b'),material:png(400,320,'#6b7280')};
    });
    await login();
    await go('materials');
    await page.locator('#manageMaterials').click();
    await page.locator('#materialList article').filter({hasText:'Test material'}).getByRole('button',{name:'Edit',exact:true}).click();
    await page.locator('#materialImageUpload').setInputFiles({name:'material.png',mimeType:'image/png',buffer:Buffer.from(fixtures.material,'base64')});
    await page.waitForFunction(()=>document.getElementById('materialImagePreview').naturalWidth>0 && !document.getElementById('materialFields').disabled);
    await page.locator('#saveMaterial').click();
    await page.waitForFunction(()=>document.getElementById('adminStatus').textContent.includes('saved') && !document.getElementById('settingFields').disabled);
    await go('feeds');
    await page.locator('#settingList').getByRole('button',{name:'Edit',exact:true}).click();
    await page.locator('#toolImageUpload').setInputFiles({name:'tool.png',mimeType:'image/png',buffer:Buffer.from(fixtures.tool,'base64')});
    await page.waitForFunction(()=>document.getElementById('toolImagePreview').naturalWidth>0 && !document.getElementById('settingFields').disabled);
    await save();
    const both=await rpc('getSettings','001','Test material');
    assert.match(both.toolImage,/^data:image\/(jpeg|png|webp);base64,/);
    assert.match(both.materialImage,/^data:image\/(jpeg|png|webp);base64,/);
    assert.ok(both.toolImage.length<250000); assert.ok(both.materialImage.length<250000);
    await show();
    await page.waitForFunction(()=>document.getElementById('resultToolImage').naturalWidth>0 && document.getElementById('resultMaterialImage').naturalWidth>0);
    assert.equal(await page.locator('#resultToolFigure').isVisible(),true);
    assert.equal(await page.locator('#resultMaterialFigure').isVisible(),true);
    assert.ok(await page.locator('#resultToolImage').evaluate(img=>Math.max(img.naturalWidth,img.naturalHeight)<=800));
    assert.equal(await page.locator('#resultToolImage').getAttribute('src'),both.toolImage);
    assert.equal(await page.locator('#resultMaterialImage').getAttribute('src'),both.materialImage);
    fs.mkdirSync(path.join(root,'previews'),{recursive:true});
    await page.screenshot({path:path.join(root,'previews','images-result.png'),fullPage:true});
    console.log('PASS: optional tool/material uploads are resized, saved, and shown with the selected cutting settings.');

    await page.reload(); await page.evaluate(()=>window.cncLocal.ready);
    assert.equal((await rpc('getSettings','001','Test material')).toolImage,both.toolImage);
    await login(); await page.locator('#settingList').getByRole('button',{name:'Edit',exact:true}).click();
    await go('materials');
    await page.locator('#manageMaterials').click();
    await page.locator('#materialList article').filter({hasText:'Test material'}).getByRole('button',{name:'Edit',exact:true}).click();
    await page.waitForFunction(()=>document.getElementById('toolImagePreview').naturalWidth>0 && document.getElementById('materialImagePreview').naturalWidth>0);
    await page.screenshot({path:path.join(root,'previews','local-admin-images.png'),fullPage:true});
    await go('settings');
    const jsonPromise=page.waitForEvent('download'); await page.locator('#exportBackup').click();
    const jsonDownload=await jsonPromise; const backupPath=path.join(temp,'settings.json'); await jsonDownload.saveAs(backupPath);
    const backup=JSON.parse(fs.readFileSync(backupPath,'utf8'));
    assert.equal(backup.settings[0].toolImage,both.toolImage);
    assert.equal(backup.materials.find(item=>item.name==='Test material').materialImage,both.materialImage);
    assert.equal(backup.settings[0].materialImage,undefined, 'A shared image is stored once in the material library.');
    const htmlPromise=page.waitForEvent('download'); await page.locator('#downloadPortable').click();
    const htmlDownload=await htmlPromise; const htmlPath=path.join(temp,'portable.html'); await htmlDownload.saveAs(htmlPath);
    const portableHTML=fs.readFileSync(htmlPath,'utf8');
    const receiver=await browser.newContext();
    await receiver.route(/^https?:/,route=>route.request().url()===URL ? route.fulfill({contentType:'text/html',body:portableHTML}):route.abort());
    const receivingPage=await receiver.newPage(); await receivingPage.goto(URL);
    const received=await receivingPage.evaluate(()=>window.cncLocal.call('getSettings','001','Test material'));
    assert.equal(received.toolImage,both.toolImage); assert.equal(received.materialImage,both.materialImage);
    await receivingPage.locator('#mill').selectOption('001'); await receivingPage.locator('#material').selectOption('Test material');
    await receivingPage.locator('#show').click();
    await receivingPage.waitForFunction(()=>document.getElementById('resultToolImage').naturalWidth>0 && document.getElementById('resultMaterialImage').naturalWidth>0);
    await receiver.close();
    console.log('PASS: images survive reload/edit, JSON export, and portable HTML opened in a fresh browser.');

    await go('feeds');
    await page.locator('#removeToolImage').click(); await save(); await show();
    assert.equal(await page.locator('#resultToolFigure').isHidden(),true);
    assert.equal(await page.locator('#resultMaterialFigure').isVisible(),true);
    assert.ok(!(await rpc('getSettings','001','Test material')).toolImage);
    await login();
    page.on('dialog',d=>d.accept());
    await go('settings');
    await page.locator('#importFile').setInputFiles(backupPath);
    await page.waitForFunction(()=>document.getElementById('adminStatus').textContent.includes('imported') && !document.getElementById('settingFields').disabled);
    assert.equal((await rpc('getSettings','001','Test material')).toolImage,both.toolImage);
    console.log('PASS: removing one image preserves the other; JSON import restores the embedded images.');

    const auth=await rpc('adminLogin','admin','Feds201');
    const before=await rpc('adminExportBackup',auth.token);
    for(const invalid of ['https://example.com/tool.jpg','data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=']) {
      await assert.rejects(rpc('adminImportBackup',auth.token,{...before,settings:[{...before.settings[0],toolImage:invalid}]}),/image|JPEG|PNG|WebP/i);
      assert.deepEqual((await rpc('adminExportBackup',auth.token)).settings,before.settings);
    }
    assert.deepEqual(errors,[]); assert.deepEqual(unexpectedRequests,[]);
    console.log('PASS: unsupported/external image values are rejected before changing saved settings; no image network requests occur.');
  } finally {await context.close();await browser.close();fs.rmSync(temp,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
