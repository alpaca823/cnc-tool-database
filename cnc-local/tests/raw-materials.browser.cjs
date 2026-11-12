// Exercises the exact downloadable HTML, including its UI, storage, and exports.
// Routing a loopback URL avoids managed Chromium restrictions on file:// pages.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const target=path.resolve(__dirname,'..','CNC-Tool-Database.html');
const origin='http://localhost:31461/raw-materials.html';
const arrayKeys=['settings','materials','mills','rawMaterials'];

(async()=>{
  const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'cnc-raw-materials-'));
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  const contexts=[],errors=[],unexpectedRequests=[];
  async function open(html=fs.readFileSync(target,'utf8'),viewport={width:1440,height:1000}){
    const context=await browser.newContext({viewport,colorScheme:'light',acceptDownloads:true});contexts.push(context);
    await context.route(/^https?:/,route=>{
      if(route.request().url()===origin)return route.fulfill({contentType:'text/html',body:html});
      unexpectedRequests.push(route.request().url());return route.abort();
    });
    const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
    page.on('dialog',dialog=>dialog.accept());
    await page.goto(origin);await page.evaluate(()=>window.cncLocal.ready);
    return {page,context,rpc:(name,...args)=>page.evaluate(({name,args})=>window.cncLocal.call(name,...args),{name,args})};
  }
  async function navigate(page,name){
    const button=page.locator('.nav-button[data-page="'+name+'"]');
    if(await page.locator('#menuToggle').isVisible()&&await page.locator('#menuToggle').getAttribute('aria-expanded')!=='true')await page.locator('#menuToggle').click();
    await button.click();await page.locator('.workspace-view[data-page="'+name+'"]').waitFor({state:'visible'});
  }
  async function login(page){
    if(await page.locator('#workspace').isHidden()){
      if(await page.locator('#loginCard').isHidden())await page.locator('#toggleView').click();
      await page.locator('#username').fill('admin');await page.locator('#password').fill('Feds201');
      await page.locator('#loginForm button[type="submit"]').click();
      await page.locator('#workspace').waitFor({state:'visible'});
    }
  }
  // This runtime's Playwright treats a Promise returned by waitForFunction as
  // truthy before it resolves. Poll evaluated results to await real RPC state.
  async function waitCondition(page,condition,arg){
    const deadline=Date.now()+15000;
    while(Date.now()<deadline){
      if(await page.evaluate(condition,arg))return;
      await new Promise(resolve=>setTimeout(resolve,50));
    }
    throw new Error('Timed out waiting for '+condition.toString());
  }
  async function waitRecords(page,predicate,arg){
    await waitCondition(page,async({source,arg})=>{
      const records=await window.cncLocal.call('getRawMaterials');
      return Function('records','arg','return ('+source+')(records,arg)')(records,arg);
    },{source:predicate.toString(),arg});
  }
  async function rawForm(page,record){
    for(const [key,value]of Object.entries(record)){
      const field=page.locator('#rawMaterial'+key[0].toUpperCase()+key.slice(1));
      if(key==='material')await field.selectOption(value);else await field.fill(String(value));
    }
  }
  async function selectMaterial(page,name){
    await page.locator('button.material-choice[data-material='+JSON.stringify(name)+']').click();
    await page.waitForFunction(name=>document.getElementById('materialDetailTitle').textContent===name,name);
  }
  async function addRaw(page,record){
    await navigate(page,'materials');await selectMaterial(page,record.material);
    await page.locator('#addRawMaterial').click();
    await page.locator('#rawMaterialEditor').waitFor({state:'visible'});await rawForm(page,record);
    await page.locator('#saveRawMaterial').click();
    await waitRecords(page,(records,arg)=>records.some(record=>record.location===arg.location&&record.quantity===arg.quantity),record);
    await page.waitForFunction(()=>!document.getElementById('rawMaterialFields').disabled&&document.getElementById('rawMaterialEditor').hidden);
  }
  function row(page,location){return page.locator('#rawMaterialListBody tr').filter({hasText:location});}
  function writableRaw({materialImage,...record}){return record;}
  async function exportState(rpc,token){
    const backup=await rpc('adminExportBackup',token);
    return Object.fromEntries(arrayKeys.map(key=>[key,backup[key]]));
  }
  async function unchangedAfter(rpc,token,action,pattern){
    const before=await exportState(rpc,token);
    await assert.rejects(action,pattern);
    assert.deepEqual(await exportState(rpc,token),before,'Rejected mutation leaves every database list intact');
  }
  try{
    const {page,rpc}=await open();
    await navigate(page,'materials');
    assert.deepEqual(await rpc('getRawMaterials'),[],'New installations start with no invented raw stock');
    assert.equal(await page.locator('#addRawMaterial').isVisible(),false);
    assert.equal(await page.locator('#rawMaterialForm').isVisible(),false);
    assert.match(await page.locator('#appVersion').innerText(),/1\.16\.0/);
    assert.match(await page.locator('#mentorNotice').innerText(),/mentor.*present/i);
    const draft={material:'Aluminum 6061',length:48,width:96,thickness:.75,quantity:4,location:'Sheet rack A',notes:'Full aluminum sheets'};
    await assert.rejects(rpc('adminSaveRawMaterial','forged',draft,null),/AUTH_REQUIRED/);
    await assert.rejects(rpc('adminDeleteRawMaterial','forged',{id:'unknown',version:'unknown'}),/AUTH_REQUIRED/);
    assert.deepEqual(await rpc('getRawMaterials'),[]);
    console.log('PASS: operators can open Materials; writes require authentication, with the current version and mentor notice visible.');

    await login(page);let auth=await rpc('adminLogin','admin','Feds201');
    let image=await page.evaluate(()=>{
      const canvas=document.createElement('canvas');canvas.width=64;canvas.height=48;
      const paint=canvas.getContext('2d');paint.fillStyle='#b3bac6';paint.fillRect(0,0,64,48);
      paint.fillStyle='#397454';paint.fillRect(8,8,48,32);return canvas.toDataURL('image/png');
    });
    await navigate(page,'materials');
    await page.locator('#manageMaterials').click();
    await page.locator('#materialName').fill(draft.material);
    await page.locator('#materialImageUpload').setInputFiles({name:'aluminum.png',mimeType:'image/png',buffer:Buffer.from(image.split(',')[1],'base64')});
    await page.waitForFunction(()=>document.getElementById('materialImagePreview').naturalWidth>0&&!document.getElementById('materialFields').disabled);
    await page.locator('#saveMaterial').click();
    await waitCondition(page,async()=>!document.getElementById('materialFields').disabled&&(await window.cncLocal.call('getMaterials')).some(material=>material.name==='Aluminum 6061'));
    const savedMaterial=(await rpc('getMaterials')).find(material=>material.name===draft.material);
    assert.ok(savedMaterial,'Saved material exists after UI submission: '+JSON.stringify(await page.evaluate(async()=>({materials:await window.cncLocal.call('getMaterials'),status:document.getElementById('adminStatus').textContent,state:JSON.parse(localStorage.getItem('cnc-tool-database-v1'))}))));
    image=savedMaterial.materialImage;
    assert.match(image,/^data:image\//,'The uploaded shared photo is stored locally');
    await addRaw(page,draft);
    await addRaw(page,{...draft,quantity:0,location:'Sheet rack B',notes:'Empty batch retained for reorder'});
    let records=await rpc('getRawMaterials');
    assert.equal(records.length,2);assert.notEqual(records[0].id,records[1].id,'Identical dimensions can represent distinct batches');
    assert.equal(records.reduce((sum,record)=>sum+record.quantity,0),4);
    assert.equal(records.every(record=>record.materialImage===image),true,'Raw records use their shared material photo');
    assert.match(await row(page,'Sheet rack B').innerText(),/\b0\b/,'Zero sheets remains visible');
    const photo=row(page,'Sheet rack A').locator('img');
    await photo.waitFor({state:'visible'});await page.waitForFunction(()=>Array.from(document.querySelectorAll('#rawMaterialListBody img')).some(img=>img.naturalWidth>0));
    assert.equal(await photo.getAttribute('src'),image);
    assert.match(await row(page,'Sheet rack A').innerText(),/48|48\.0/);
    assert.match(await page.locator('.workspace-view[data-page="materials"]').innerText(),/inch|inches|\(in\)/i);
    assert.deepEqual(await page.locator('#rawMaterialStats .stat-value').allTextContents(),['2','4','0']);
    const dashboard=await rpc('getDashboard');
    assert.equal(dashboard.rawMaterialRecords,2);assert.equal(dashboard.rawSheets,4);
    assert.equal(dashboard.unitsInStock,0,'Sheet quantities stay separate from cutting tool inventory');

    await row(page,'Sheet rack A').getByRole('button',{name:'Edit',exact:true}).click();
    await rawForm(page,{length:'47.5',width:'95.25',thickness:'',quantity:'7',notes:'Trimmed sheets for the router'});
    await page.locator('#saveRawMaterial').click();
    await waitRecords(page,records=>records.some(record=>record.location==='Sheet rack A'&&Number(record.length)===47.5&&Number(record.width)===95.25&&record.quantity===7));
    await page.waitForFunction(()=>!document.getElementById('rawMaterialFields').disabled&&document.getElementById('rawMaterialEditor').hidden);
    let first=(await rpc('getRawMaterials')).find(record=>record.location==='Sheet rack A');
    assert.ok(first.thickness==null,'Optional blank thickness stays unspecified');
    assert.deepEqual(await page.locator('#rawMaterialStats .stat-value').allTextContents(),['2','7','0']);
    assert.match(await row(page,'Sheet rack A').innerText(),/47\.5/);
    for(const [query,expected]of [['rack B','Sheet rack B'],['Trimmed sheets','Sheet rack A']]){
      await page.locator('#globalSearch').fill(query);
      await page.waitForFunction(expected=>document.querySelectorAll('#rawMaterialListBody tr').length===1&&document.getElementById('rawMaterialListBody').textContent.includes(expected),expected);
    }
    await page.locator('#globalSearch').fill('no matching batch');
    await page.waitForFunction(()=>!document.getElementById('rawMaterialListBody').textContent.includes('Sheet rack'));
    await page.locator('#globalSearch').fill('');
    await row(page,'Sheet rack A').getByRole('button',{name:'Edit',exact:true}).click();
    await page.locator('#rawMaterialQuantity').fill('99');await page.locator('#cancelRawMaterialEdit').click();
    assert.equal((await rpc('getRawMaterials')).find(record=>record.id===first.id).quantity,7);
    await page.reload();await page.evaluate(()=>window.cncLocal.ready);await navigate(page,'materials');
    await selectMaterial(page,draft.material);
    assert.equal((await rpc('getRawMaterials')).length,2);assert.match(await row(page,'Sheet rack A').innerText(),/Trimmed sheets/);
    assert.equal(await page.locator('#addRawMaterial').isVisible(),false,'Reload returns to the read-only operator view');
    assert.equal(await row(page,'Sheet rack A').getByRole('button',{name:'Edit',exact:true}).isVisible(),false);
    await assert.rejects(rpc('adminSaveRawMaterial',auth.token,{...draft,quantity:99},null),/AUTH_REQUIRED/);
    await login(page);auth=await rpc('adminLogin','admin','Feds201');
    console.log('PASS: UI create/edit/cancel, duplicate-size batches, optional thickness, zero quantities, photos, search, and reload persistence work.');

    await navigate(page,'materials');await page.locator('#addRawMaterial').click();
    await rawForm(page,{...draft,quantity:'-1'});
    assert.equal(await page.locator('#rawMaterialForm').evaluate(form=>form.checkValidity()),false,'Negative sheet count is invalid in the form');
    await page.locator('#rawMaterialQuantity').fill('1.5');
    assert.equal(await page.locator('#rawMaterialForm').evaluate(form=>form.checkValidity()),false,'Fractional sheet count is invalid in the form');
    await page.locator('#rawMaterialQuantity').fill('1');await page.locator('#rawMaterialLength').fill('0');
    assert.equal(await page.locator('#rawMaterialForm').evaluate(form=>form.checkValidity()),false,'Zero length is invalid in the form');
    await page.locator('#rawMaterialLength').fill('48');await page.locator('#rawMaterialQuantity').fill('');
    assert.equal(await page.locator('#rawMaterialForm').evaluate(form=>form.checkValidity()),false,'Sheet count is required');
    await page.locator('#cancelRawMaterialEdit').click();
    for(const invalid of [
      {length:0},{length:-1},{width:0},{width:-1},{thickness:0},{thickness:-.25},
      {quantity:-1},{quantity:1.5},{quantity:''},{quantity:null},{material:'Unknown material'},
      {length:'not a number'},{width:'Infinity'},{units:'mm'}
    ])await unchangedAfter(rpc,auth.token,()=>rpc('adminSaveRawMaterial',auth.token,{...draft,...invalid},null),/material|length|width|thickness|quantity|positive|whole|finite|number|sheet/i);
    first=(await rpc('getRawMaterials')).find(record=>record.location==='Sheet rack A');
    await rpc('adminSaveRawMaterial',auth.token,{...writableRaw(first),quantity:8},{id:first.id,version:first.version});
    await unchangedAfter(rpc,auth.token,()=>rpc('adminSaveRawMaterial',auth.token,{...writableRaw(first),quantity:99},{id:first.id,version:first.version}),/chang|stale|refresh|version/i);
    await unchangedAfter(rpc,auth.token,()=>rpc('adminDeleteRawMaterial',auth.token,{id:first.id,version:first.version}),/chang|stale|refresh|version/i);
    await unchangedAfter(rpc,auth.token,()=>rpc('adminDeleteRawMaterial',auth.token,{id:'missing',version:'missing'}),/exist|found|select|refresh/i);
    console.log('PASS: form and backend validation reject invalid inches/counts; stale edits/deletes and missing records leave all lists unchanged.');

    let material=(await rpc('adminListMaterials',auth.token)).find(item=>item.name===draft.material);
    assert.equal(material.usageCount,0);assert.equal(material.rawUsageCount,2);
    await rpc('adminSaveMaterial',auth.token,{name:'Aluminum 6061-T6',materialImage:image},{name:material.name,version:material.version});
    assert.equal((await rpc('getRawMaterials')).every(record=>record.material==='Aluminum 6061-T6'),true,'Material rename follows all raw references');
    material=(await rpc('adminListMaterials',auth.token)).find(item=>item.name==='Aluminum 6061-T6');
    await unchangedAfter(rpc,auth.token,()=>rpc('adminDeleteMaterial',auth.token,{name:material.name,version:material.version}),/raw|sheet|used|reference/i);
    await rpc('adminSaveMaterial',auth.token,{name:'Zero reference only'},null);
    await rpc('adminSaveRawMaterial',auth.token,{material:'Zero reference only',length:12,width:24,quantity:0,location:'Zero-only fixture',notes:''},null);
    const zeroMaterial=(await rpc('adminListMaterials',auth.token)).find(item=>item.name==='Zero reference only');
    assert.equal(zeroMaterial.usageCount,0);assert.equal(zeroMaterial.rawUsageCount,1);
    await unchangedAfter(rpc,auth.token,()=>rpc('adminDeleteMaterial',auth.token,{name:zeroMaterial.name,version:zeroMaterial.version}),/raw|sheet|used|reference/i);
    await page.reload();await page.evaluate(()=>window.cncLocal.ready);await login(page);auth=await rpc('adminLogin','admin','Feds201');
    await navigate(page,'materials');await selectMaterial(page,'Zero reference only');
    await row(page,'Zero-only fixture').getByRole('button',{name:'Delete',exact:true}).click();
    await waitRecords(page,records=>!records.some(record=>record.location==='Zero-only fixture'));
    await page.waitForFunction(()=>!document.getElementById('rawMaterialFields').disabled);
    const removable=(await rpc('adminListMaterials',auth.token)).find(item=>item.name==='Zero reference only');
    await rpc('adminDeleteMaterial',auth.token,{name:removable.name,version:removable.version});
    assert.equal((await rpc('getMaterials')).some(item=>item.name==='Zero reference only'),false);
    await navigate(page,'materials');
    await selectMaterial(page,'Aluminum 6061-T6');
    assert.match(await page.locator('#rawMaterialListBody').innerText(),/Aluminum 6061-T6/);
    console.log('PASS: shared material renames retain raw references; referenced materials, including zero-sheet-only entries, cannot be deleted; deleting a raw batch releases the reference.');

    await navigate(page,'settings');
    const jsonEvent=page.waitForEvent('download');await page.locator('#exportBackup').click();
    const jsonDownload=await jsonEvent,jsonPath=path.join(temporary,'raw-materials.json');await jsonDownload.saveAs(jsonPath);
    const backup=JSON.parse(fs.readFileSync(jsonPath,'utf8'));
    assert.equal(backup.rawMaterials.length,2);assert.equal(backup.rawMaterials.some(record=>record.quantity===0),true);
    assert.equal(backup.materials.length,1);assert.equal(backup.materials[0].materialImage,image);
    assert.equal(Object.hasOwn(backup,'auth'),false);
    const htmlEvent=page.waitForEvent('download');await page.locator('#downloadPortable').click();
    const htmlDownload=await htmlEvent,htmlPath=path.join(temporary,'raw-materials.html');await htmlDownload.saveAs(htmlPath);
    const portable=await open(fs.readFileSync(htmlPath,'utf8'));
    const portableAuth=await portable.rpc('adminLogin','admin','Feds201');
    const portableBackup=await portable.rpc('adminExportBackup',portableAuth.token);
    for(const key of arrayKeys)assert.deepEqual(portableBackup[key],backup[key],'Portable HTML retains '+key);
    await navigate(portable.page,'materials');
    await selectMaterial(portable.page,'Aluminum 6061-T6');
    assert.match(await row(portable.page,'Sheet rack B').innerText(),/\b0\b/);
    assert.equal(await row(portable.page,'Sheet rack A').locator('img').getAttribute('src'),image);
    const imported=await open();await login(imported.page);await navigate(imported.page,'settings');
    await imported.page.locator('#importFile').setInputFiles(jsonPath);
    await waitRecords(imported.page,records=>records.length===2&&records.some(record=>record.material==='Aluminum 6061-T6'));
    await imported.page.waitForFunction(()=>document.getElementById('adminStatus').textContent.includes('Backup imported'));
    const importedAuth=await imported.rpc('adminLogin','admin','Feds201');
    const importedBackup=await imported.rpc('adminExportBackup',importedAuth.token);
    for(const key of arrayKeys)assert.deepEqual(importedBackup[key],backup[key],'Downloaded JSON imports '+key);
    for(const malformed of [
      {...backup,materials:[]},
      {...backup,rawMaterials:{}},
      {...backup,rawMaterials:[{...backup.rawMaterials[0],length:0}]},
      {...backup,rawMaterials:[{...backup.rawMaterials[0],quantity:1.5}]},
      {...backup,rawMaterials:[backup.rawMaterials[0],backup.rawMaterials[0]]}
    ])await unchangedAfter(imported.rpc,importedAuth.token,()=>imported.rpc('adminImportBackup',importedAuth.token,malformed),/material|raw|sheet|length|quantity|duplicate|same|unique|positive|whole|number|list|array/i);
    console.log('PASS: actual JSON/HTML downloads reopen in fresh browsers with raw counts, dimensions, IDs, and shared photos; invalid imports are atomic.');

    const legacy=await open();const legacyAuth=await legacy.rpc('adminLogin','admin','Feds201');
    const oldBackup={...backup};delete oldBackup.rawMaterials;
    await legacy.rpc('adminImportBackup',legacyAuth.token,oldBackup);
    assert.deepEqual(await legacy.rpc('getRawMaterials'),[],'Old backups do not invent physical sheet inventory');
    assert.equal((await legacy.rpc('getMaterials')).length,1,'Old material library is retained');
    await legacy.rpc('adminImportBackup',legacyAuth.token,backup);
    await legacy.page.evaluate(()=>{
      const state=JSON.parse(localStorage.getItem('cnc-tool-database-v1'));delete state.rawMaterials;
      localStorage.setItem('cnc-tool-database-v1',JSON.stringify(state));
    });
    await legacy.page.reload();await legacy.page.evaluate(()=>window.cncLocal.ready);
    assert.deepEqual(await legacy.rpc('getRawMaterials'),[],'Existing browser storage upgrades to an empty raw list');
    assert.equal((await legacy.rpc('getMaterials'))[0].name,'Aluminum 6061-T6');
    console.log('PASS: legacy JSON backups and browser storage upgrade with an empty raw list and their existing material library.');

    await navigate(page,'settings');await page.locator('[data-theme-choice="dark"]').click();
    await page.waitForFunction(()=>document.documentElement.dataset.theme==='dark');
    await navigate(page,'materials');await selectMaterial(page,'Aluminum 6061-T6');
    assert.match(await row(page,'Sheet rack A').innerText(),/Aluminum 6061-T6/);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,'No desktop page overflow in dark mode');
    if(process.env.CNC_RAW_SCREENSHOT)await page.screenshot({path:process.env.CNC_RAW_SCREENSHOT,fullPage:true});
    const mobile=await open(fs.readFileSync(htmlPath,'utf8'),{width:390,height:844});
    await navigate(mobile.page,'settings');await mobile.page.locator('[data-theme-choice="dark"]').click();
    await mobile.page.waitForFunction(()=>document.documentElement.dataset.theme==='dark');
    await navigate(mobile.page,'materials');
    await selectMaterial(mobile.page,'Aluminum 6061-T6');
    assert.match(await row(mobile.page,'Sheet rack A').innerText(),/47\.5/);
    assert.equal(await mobile.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,'Raw table scrolls within its container on mobile');
    assert.equal(await mobile.page.locator('#addRawMaterial').isVisible(),false);
    await login(mobile.page);await navigate(mobile.page,'materials');
    await mobile.page.locator('#addRawMaterial').click();
    await mobile.page.locator('#rawMaterialEditor').waitFor({state:'visible'});
    assert.equal(await mobile.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,'Raw editor fits a 390 px viewport');
    await mobile.page.locator('#cancelRawMaterialEdit').click();
    console.log('PASS: Materials sheet inventory is usable in dark mode and on a 390 px screen, with no document overflow.');
    assert.deepEqual(errors,[],'No uncaught browser errors');
    assert.deepEqual(unexpectedRequests,[],'The standalone HTML requests no external resources');
  }finally{
    for(const context of contexts)await context.close();await browser.close();
    fs.rmSync(temporary,{recursive:true,force:true});
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
