// Shared-material checks use an intercepted loopback origin; no external server is needed.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const target=path.join(root,'CNC-Tool-Database.html');
const origin='http://localhost:31460/materials.html';
(async()=>{
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'cnc-materials-'));
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  const contexts=[];
  const errors=[],unexpectedRequests=[];
  async function open(html=fs.readFileSync(target,'utf8')) {
    const context=await browser.newContext({viewport:{width:1100,height:1000},acceptDownloads:true}); contexts.push(context);
    await context.route(/^https?:/,route=>{
      if(route.request().url()===origin) return route.fulfill({contentType:'text/html',body:html});
      unexpectedRequests.push(route.request().url());return route.abort();
    });
    const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
    await page.goto(origin);await page.evaluate(()=>window.cncLocal.ready);
    return {context,page};
  }
  try {
    const {page}=await open();
    const rpc=(name,...args)=>page.evaluate(({name,args})=>window.cncLocal.call(name,...args),{name,args});
    const idle=()=>page.waitForFunction(()=>!document.getElementById('settingFields').disabled && !document.getElementById('materialFields').disabled);
    const go=name=>page.locator('.nav-button[data-page="'+name+'"]').click();
    const login=async()=>{
      if(await page.locator('#workspace').isHidden() && await page.locator('#adminPanel').isHidden()) await page.locator('#toggleView').click();
      if(await page.locator('#workspace').isHidden()){
        await page.locator('#password').fill('admin');await page.locator('#loginForm button').click();
        await page.locator('#workspace').waitFor({state:'visible'});
      }
      await idle(); await go('feeds');
    };
    const materialCard=name=>page.locator('#materialList article').filter({has:page.getByText(name,{exact:true})});
    async function waitMaterial(name,present=true){
      await page.waitForFunction(({name,present})=>[...document.querySelectorAll('#editMaterial option')].some(o=>o.value===name)===present,{name,present});
      await idle();
    }
    async function addMaterial(name){
      await go('materials');
      await page.locator('#manageMaterials').click();
      await page.locator('#materialName').fill(name);await page.locator('#saveMaterial').click();
      await waitMaterial(name);
    }
    async function setting(mill,material,extra={}){
      await go('feeds');
      for(const [id,value]of Object.entries({editMill:mill,editRpm:'12000',editFeed:'10',editDepth:'.125',editNotes:'Automated test fixture only.',...extra}))await page.locator('#'+id).fill(value);
      await page.locator('#editMaterial').selectOption(material);
      await page.locator('#saveSetting').click();
      await page.waitForFunction(({mill,material})=>[...document.querySelectorAll('#settingList article')].some(a=>a.textContent.includes('Mill '+mill)&&a.textContent.includes(material)),{mill,material});
      await idle();
    }
    async function show(mill,material){
      await go('feeds');
      await page.locator('#mill').selectOption(mill);await page.locator('#material').selectOption(material);
      await page.locator('#show').click();await page.locator('#result').waitFor({state:'visible'});
    }
    await login();
    assert.equal(await page.locator('#editMaterial').evaluate(el=>el.tagName),'SELECT');
    assert.equal(await page.locator('#editMaterial option[value=""]').count(),1);
    const auth=await rpc('adminLogin','admin','admin');
    await assert.rejects(rpc('adminListMaterials','forged'),/AUTH_REQUIRED/);
    await assert.rejects(rpc('adminSaveMaterial',auth.token,{name:' ',materialImage:''},null),/name|required|material/i);
    assert.equal((await rpc('adminListMaterials',auth.token)).length,0);
    const fixture=await page.evaluate(()=>{
      const canvas=document.createElement('canvas');canvas.width=320;canvas.height=200;
      const ctx=canvas.getContext('2d');ctx.fillStyle='#7a8795';ctx.fillRect(0,0,320,200);
      ctx.fillStyle='#c5d0d9';ctx.fillRect(30,30,260,140);
      return canvas.toDataURL('image/png').split(',')[1];
    });
    await go('materials');
    await page.locator('#manageMaterials').click();
    await page.locator('#materialName').fill('Aluminum 6061');
    await page.locator('#materialImageUpload').setInputFiles({name:'aluminum.png',mimeType:'image/png',buffer:Buffer.from(fixture,'base64')});
    await page.waitForFunction(()=>document.getElementById('materialImagePreview').naturalWidth>0 && !document.getElementById('materialFields').disabled);
    await page.locator('#saveMaterial').click();await waitMaterial('Aluminum 6061');
    const first=(await rpc('adminListMaterials',auth.token)).find(m=>m.name==='Aluminum 6061');
    assert.match(first.materialImage,/^data:image\/(jpeg|png|webp);base64,/);
    await addMaterial('Brass');
    await assert.rejects(rpc('adminSaveMaterial',auth.token,{name:'Aluminum 6061',materialImage:''},null),/already|duplicate|exists/i);
    assert.equal((await rpc('adminListMaterials',auth.token)).length,2);
    console.log('PASS: materials are created once, support a shared image, and populate a select dropdown; blank/duplicate names are rejected.');

    await setting('001','Aluminum 6061');
    await setting('002','Aluminum 6061',{editFeed:'8',editDepth:'.0625'});
    for(const mill of ['001','002'])assert.equal((await rpc('getSettings',mill,'Aluminum 6061')).materialImage,first.materialImage);
    await assert.rejects(rpc('adminSaveSetting',auth.token,{mill:'003',material:'Unknown material',rpm:'1000',feed:'10',depth:'.1',units:'inch'},null),/material|exist|create|select/i);
    await show('002','Aluminum 6061');
    await page.waitForFunction(()=>document.getElementById('resultMaterialImage').naturalWidth>0);
    assert.equal(await page.locator('#resultMaterialImage').getAttribute('src'),first.materialImage);
    console.log('PASS: the same material can be selected for multiple mills and its shared image appears in the user result.');

    await page.reload();await page.evaluate(()=>window.cncLocal.ready);await login();
    await assert.rejects(rpc('adminListMaterials',auth.token),/AUTH_REQUIRED/); // Reloaded pages intentionally clear old sessions.
    const current=await rpc('adminLogin','admin','admin');
    assert.equal((await rpc('adminListMaterials',current.token)).find(m=>m.name==='Aluminum 6061').usageCount,2);
    await go('settings');
    const jsonPromise=page.waitForEvent('download');await page.locator('#exportBackup').click();
    const jsonDownload=await jsonPromise;const backupPath=path.join(temp,'materials.json');await jsonDownload.saveAs(backupPath);
    const backup=JSON.parse(fs.readFileSync(backupPath,'utf8'));
    assert.ok(backup.materials.some(m=>m.name==='Brass'));
    assert.equal(backup.materials.find(m=>m.name==='Aluminum 6061').materialImage,first.materialImage);
    const htmlPromise=page.waitForEvent('download');await page.locator('#downloadPortable').click();
    const htmlDownload=await htmlPromise;const portablePath=path.join(temp,'portable.html');await htmlDownload.saveAs(portablePath);
    const receiving=await open(fs.readFileSync(portablePath,'utf8'));
    const receivedAuth=await receiving.page.evaluate(()=>window.cncLocal.call('adminLogin','admin','admin'));
    const receivedMaterials=await receiving.page.evaluate(token=>window.cncLocal.call('adminListMaterials',token),receivedAuth.token);
    assert.ok(receivedMaterials.some(m=>m.name==='Brass'));
    assert.equal(receivedMaterials.find(m=>m.name==='Aluminum 6061').materialImage,first.materialImage);
    assert.equal((await receiving.page.evaluate(()=>window.cncLocal.call('getSettings','002','Aluminum 6061'))).materialImage,first.materialImage);
    console.log('PASS: library entries, unused materials, and shared images survive reload, actual JSON export, and portable HTML opened in a fresh browser.');

    await go('materials');
    await page.locator('#manageMaterials').click();
    await materialCard('Aluminum 6061').getByRole('button',{name:'Edit',exact:true}).click();
    await page.locator('#materialName').fill('Aluminum 6061-T6');await page.locator('#saveMaterial').click();
    await waitMaterial('Aluminum 6061-T6');await waitMaterial('Aluminum 6061',false);
    assert.equal((await rpc('getSettings','001','Aluminum 6061-T6')).materialImage,first.materialImage);
    assert.equal((await rpc('getSettings','002','Aluminum 6061-T6')).feed,8);
    await assert.rejects(rpc('getSettings','001','Aluminum 6061'),/No settings/);
    page.on('dialog',d=>d.accept());
    await materialCard('Aluminum 6061-T6').getByRole('button',{name:'Delete',exact:true}).click();
    await page.waitForFunction(()=>/use|referenc|assigned|settings/i.test(document.getElementById('adminStatus').textContent));await idle();
    assert.ok((await rpc('adminListMaterials',current.token)).some(m=>m.name==='Aluminum 6061-T6'));
    await materialCard('Brass').getByRole('button',{name:'Delete',exact:true}).click();await waitMaterial('Brass',false);
    assert.equal((await rpc('adminListMaterials',current.token)).length,1);
    console.log('PASS: renaming a material updates every mill reference; used materials cannot be deleted, while unused materials can.');

    const before=await rpc('adminExportBackup',current.token);
    await assert.rejects(rpc('adminImportBackup',current.token,{...before,materials:[]}),/material|referenc|exist|unknown/i);
    assert.deepEqual((await rpc('adminExportBackup',current.token)).settings,before.settings);
    assert.deepEqual((await rpc('adminExportBackup',current.token)).materials,before.materials);
    await go('settings');
    await page.locator('#importFile').setInputFiles(backupPath);
    await page.waitForFunction(()=>document.getElementById('adminStatus').textContent.includes('imported') && !document.getElementById('materialFields').disabled);
    assert.ok((await rpc('adminListMaterials',current.token)).some(m=>m.name==='Brass'));
    await waitMaterial('Aluminum 6061');
    console.log('PASS: backup imports restore the material library; broken references are rejected without changing the database.');

    const legacy=await open();
    const legacySetting={mill:'099',material:'Legacy material',rpm:'9000',feed:'254',depth:'25.4',units:'mm',notes:'Legacy migration fixture',version:'old-setting',materialImage:first.materialImage};
    await legacy.page.evaluate(setting=>{
      const stored=JSON.parse(localStorage.getItem('cnc-tool-database-v1'));delete stored.materials;delete stored.mills;delete stored.rawMaterials;stored.settings=[setting];
      localStorage.setItem('cnc-tool-database-v1',JSON.stringify(stored));
    },legacySetting);
    await legacy.page.reload();await legacy.page.evaluate(()=>window.cncLocal.ready);
    const migrated=await legacy.page.evaluate(()=>window.cncLocal.call('getSettings','099','Legacy material'));
    assert.equal(migrated.feed,10);assert.equal(migrated.depth,1);assert.equal(migrated.materialImage,first.materialImage);
    const oldAuth=await legacy.page.evaluate(()=>window.cncLocal.call('adminLogin','admin','admin'));
    const migratedMaterials=await legacy.page.evaluate(token=>window.cncLocal.call('adminListMaterials',token),oldAuth.token);
    assert.equal(migratedMaterials[0].name,'Legacy material');
    await legacy.page.evaluate(({token,setting})=>window.cncLocal.call('adminImportBackup',token,{format:'cnc-local-backup',schemaVersion:1,settings:[{...setting,mill:'098',material:'Imported old material'}]}),{token:oldAuth.token,setting:legacySetting});
    const importedMaterials=await legacy.page.evaluate(token=>window.cncLocal.call('adminListMaterials',token),oldAuth.token);
    assert.equal(importedMaterials[0].name,'Imported old material');
    assert.equal((await legacy.page.evaluate(()=>window.cncLocal.call('getSettings','098','Imported old material'))).materialImage,first.materialImage);
    console.log('PASS: legacy browser data and older JSON backups automatically gain a material library, with photos and metric conversion preserved.');
    fs.mkdirSync(path.join(root,'previews'),{recursive:true});
    await go('materials');
    await page.locator('#manageMaterials').click();
    await page.screenshot({path:path.join(root,'previews','materials-admin.png'),fullPage:true});
    assert.deepEqual(errors,[]);assert.deepEqual(unexpectedRequests,[]);
  } finally {for(const context of contexts)await context.close();await browser.close();fs.rmSync(temp,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
