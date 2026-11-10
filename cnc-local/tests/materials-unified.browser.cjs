// Regressions for the single Materials master/detail workspace in the exact download.
// An intercepted loopback URL keeps these standalone-file checks server-free.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const target=path.resolve(__dirname,'..','CNC-Tool-Database.html');
const origin='http://localhost:31462/materials-unified.html';
const databaseKeys=['settings','materials','mills','rawMaterials'];

(async()=>{
  const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'cnc-materials-unified-'));
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  const contexts=[],errors=[],unexpectedRequests=[];
  // Await evaluated values explicitly: this Playwright runtime can treat an
  // async waitForFunction callback's Promise as truthy before it resolves.
  async function until(check,label,timeout=15000){
    const deadline=Date.now()+timeout;
    while(Date.now()<deadline){
      if(await check())return;
      await new Promise(resolve=>setTimeout(resolve,50));
    }
    throw new Error('Timed out: '+label);
  }
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
    if(await page.locator('#menuToggle').isVisible()&&await page.locator('#menuToggle').getAttribute('aria-expanded')!=='true')await page.locator('#menuToggle').click();
    await page.locator('.nav-button[data-page="'+name+'"]').click();
    await page.locator('.workspace-view[data-page="'+name+'"]').waitFor({state:'visible'});
  }
  async function idle(page){
    await until(()=>page.evaluate(()=>!document.getElementById('materialFields').disabled&&!document.getElementById('rawMaterialFields').disabled),'material editors idle');
  }
  async function login(page){
    if(await page.locator('#workspace').isHidden()){
      if(await page.locator('#loginCard').isHidden())await page.locator('#toggleView').click();
      await page.locator('#username').fill('admin');await page.locator('#password').fill('Feds201');
      await page.locator('#loginForm button[type="submit"]').click();await page.locator('#workspace').waitFor({state:'visible'});
    }
    await idle(page);
  }
  function materialChoice(page,name){return page.locator('#publicMaterialList button.material-choice').filter({has:page.getByRole('heading',{name,exact:true})});}
  function materialCard(page,name){return page.locator('#materialList article.setting').filter({has:page.getByRole('heading',{name,exact:true})});}
  function sheetRow(page,location){return page.locator('#rawMaterialListBody tr').filter({hasText:location});}
  async function select(page,name){
    // The header search is intentionally hidden at phone widths. A fresh
    // mobile page already has an empty query, so its material cards work directly.
    if(await page.locator('#globalSearch').inputValue())await page.locator('#globalSearch').fill('');
    await materialChoice(page,name).click();
    await until(async()=>await page.locator('#materialDetailTitle').innerText()===name,'selected material '+name);
  }
  async function manager(page){
    await navigate(page,'materials');
    if(await page.locator('#materialManagement').getAttribute('open')===null)await page.locator('#manageMaterials').click();
    await page.locator('#materialForm').waitFor({state:'visible'});await idle(page);
  }
  async function createMaterial(page,rpc,name,color){
    await manager(page);await page.locator('#cancelMaterialEdit').click();
    await page.locator('#materialName').fill(name);
    if(color){
      const fixture=await page.evaluate(color=>{
        const canvas=document.createElement('canvas');canvas.width=160;canvas.height=100;
        const paint=canvas.getContext('2d');paint.fillStyle=color;paint.fillRect(0,0,160,100);
        paint.fillStyle='#dbe2eb';paint.fillRect(20,20,120,60);return canvas.toDataURL('image/png');
      },color);
      await page.locator('#materialImageUpload').setInputFiles({name:'material.png',mimeType:'image/png',buffer:Buffer.from(fixture.split(',')[1],'base64')});
      await until(()=>page.evaluate(()=>document.getElementById('materialImagePreview').naturalWidth>0&&!document.getElementById('materialFields').disabled),'material image upload');
    }
    await page.locator('#saveMaterial').click();
    await until(async()=>(await rpc('getMaterials')).some(item=>item.name===name),'material saved '+name);
    await idle(page);await materialChoice(page,name).waitFor({state:'visible'});
    assert.equal(await page.locator('#materialName').inputValue(),'','Successful save clears the material editor');
    return (await rpc('getMaterials')).find(item=>item.name===name);
  }
  async function rawFields(page,fields){
    for(const [name,value]of Object.entries(fields)){
      const field=page.locator('#rawMaterial'+name[0].toUpperCase()+name.slice(1));
      if(name==='material')await field.selectOption(value);else await field.fill(String(value));
    }
  }
  async function addSheet(page,rpc,material,fields){
    await navigate(page,'materials');await select(page,material);await page.locator('#addRawMaterial').click();
    await page.locator('#rawMaterialEditor').waitFor({state:'visible'});
    assert.equal(await page.locator('#rawMaterialMaterial').inputValue(),material,'Add sheet prefills the selected material');
    await rawFields(page,fields);await page.locator('#saveRawMaterial').click();
    await until(async()=>(await rpc('getRawMaterials')).some(item=>item.material===material&&item.location===fields.location&&item.quantity===Number(fields.quantity)),'sheet saved '+fields.location);
    await idle(page);await page.locator('#rawMaterialEditor').waitFor({state:'hidden'});
    await sheetRow(page,fields.location).waitFor({state:'visible'});
  }
  async function assertSelected(page,name,expectedLocations,otherLocations,entries,sheets,image){
    await select(page,name);
    const body=await page.locator('#rawMaterialListBody').innerText();
    for(const location of expectedLocations)assert.ok(body.includes(location),'Selected material shows '+location);
    for(const location of otherLocations)assert.ok(!body.includes(location),'Selected material hides '+location);
    assert.equal(await page.locator('#rawMaterialListBody tr').count(),entries,'Selected detail shows only its sheet entries');
    const summary=await page.locator('#selectedMaterialSummary').innerText();
    assert.match(summary,new RegExp('\\b'+entries+'\\b'),'Summary contains the selected entry count');
    assert.match(summary,new RegExp('\\b'+sheets+'\\b'),'Summary contains the selected sheet quantity');
    if(image){
      assert.equal(await page.locator('#selectedMaterialPhoto').getAttribute('src'),image);
      await until(()=>page.locator('#selectedMaterialPhoto').evaluate(img=>img.naturalWidth>0),'selected material photo loads');
    }
  }
  async function assertReadOnly(page){
    for(const id of ['manageMaterials','materialManagement','addRawMaterial','rawMaterialEditor'])assert.equal(await page.locator('#'+id).isVisible(),false,'Operators cannot see '+id);
    assert.equal(await page.locator('#rawMaterialListBody button').count(),0,'Operator sheet rows have no write controls');
    assert.equal(await page.locator('#publicMaterialList button.material-choice').count(),3,'Operators retain the material selector');
  }
  async function assertNavigation(page){
    assert.equal(await page.locator('.nav-button').count(),6,'Six sidebar destinations');
    assert.equal(await page.locator('.nav-button[data-page="materials"]').count(),1,'One Materials sidebar tab');
    assert.equal(await page.locator('.nav-button[data-page="raw-materials"]').count(),0,'No duplicate raw-material sidebar tab');
    for(const name of ['dashboard','feeds','mills','inventory','materials','settings']){
      await navigate(page,name);
      assert.equal(await page.locator('.workspace-view:visible').count(),1,'Only '+name+' is displayed');
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,name+' fits the viewport');
    }
  }
  try{
    const {page,rpc}=await open();await navigate(page,'materials');
    assert.equal(await page.locator('.nav-button[data-page="materials"]').count(),1);
    assert.equal(await page.locator('.nav-button[data-page="raw-materials"]').count(),0);
    assert.equal(await page.locator('.nav-button').count(),6);
    assert.match(await page.locator('#appVersion').innerText(),/1\.14\.5/);
    assert.match(await page.locator('#mentorNotice').innerText(),/mentor.*present/i);
    assert.equal(await page.locator('#materialDetailEmpty').isVisible(),true,'A new installation has a material-selection empty state');
    assert.equal(await page.locator('#publicMaterialList button.material-choice').count(),0);
    assert.equal(await page.locator('#manageMaterials').isVisible(),false);
    assert.deepEqual(await rpc('getMaterials'),[]);assert.deepEqual(await rpc('getRawMaterials'),[]);
    await login(page);
    const aluminum=await createMaterial(page,rpc,'Aluminum 6061','#52839a');
    assert.equal(await page.locator('#materialDetailTitle').innerText(),'Aluminum 6061','The first material is selected automatically');
    const plywood=await createMaterial(page,rpc,'Plywood','#a0703b');
    await createMaterial(page,rpc,'Stainless steel');
    assert.match(aluminum.materialImage,/^data:image\//);assert.match(plywood.materialImage,/^data:image\//);
    assert.notEqual(aluminum.materialImage,plywood.materialImage,'Fixtures have distinct shared photos');
    await addSheet(page,rpc,'Aluminum 6061',{length:48,width:96,thickness:.125,quantity:4,location:'Metal rack A',notes:'Full aluminum sheets'});
    await addSheet(page,rpc,'Aluminum 6061',{length:24,width:36,thickness:.25,quantity:0,location:'Metal rack zero',notes:'Empty aluminum batch'});
    await addSheet(page,rpc,'Plywood',{length:60,width:120,thickness:.75,quantity:9,location:'Wood rack P',notes:'Plywood test fixture'});
    await assertSelected(page,'Aluminum 6061',['Metal rack A','Metal rack zero'],['Wood rack P'],2,4,aluminum.materialImage);
    await assertSelected(page,'Plywood',['Wood rack P'],['Metal rack A','Metal rack zero'],1,9,plywood.materialImage);
    await select(page,'Stainless steel');
    assert.equal(await page.locator('#rawMaterialEmpty').isVisible(),true,'An unused library material has a no-sheet state');
    assert.equal(await page.locator('#materialDetailEmpty').isVisible(),false,'An unused library material retains its selected detail');
    assert.ok(!await page.locator('#rawMaterialListBody').innerText(),'Unused material does not inherit another material\'s rows');
    await page.locator('#logout').click();await navigate(page,'materials');
    await assertSelected(page,'Aluminum 6061',['Metal rack A','Metal rack zero'],['Wood rack P'],2,4,aluminum.materialImage);
    await assertReadOnly(page);
    console.log('PASS: one Materials tab serves public and admin master/detail views, with per-material sheets, quantities, shared photos, zero quantities, and empty states.');

    for(const [material,query,selected,expected,excluded]of [
      ['Aluminum 6061','Aluminum 6061','Aluminum 6061',['Metal rack A','Metal rack zero'],['Wood rack P']],
      ['Aluminum 6061','Metal rack A','Aluminum 6061',['Metal rack A'],['Metal rack zero','Wood rack P']],
      ['Aluminum 6061','Wood rack P','Plywood',['Wood rack P'],['Metal rack A','Metal rack zero']],
      ['Plywood','Metal rack A','Aluminum 6061',['Metal rack A'],['Metal rack zero','Wood rack P']]
    ]){
      await select(page,material);await page.locator('#globalSearch').fill(query);
      await until(async()=>{
        const body=await page.locator('#rawMaterialListBody').innerText();
        return await page.locator('#materialDetailTitle').innerText()===selected&&expected.every(value=>body.includes(value))&&excluded.every(value=>!body.includes(value));
      },'global search selects '+selected+' and isolates its matching rows for '+query);
    }
    await page.locator('#globalSearch').fill('No matching material or batch');
    await until(()=>page.locator('#materialDetailEmpty').isVisible(),'unmatched search clears selected detail');
    assert.equal(await page.locator('#rawMaterialListBody tr').count(),0,'No-match search leaves no stale sheet rows');
    await page.locator('#globalSearch').fill('');await login(page);await navigate(page,'materials');
    const otherBefore=(await rpc('getRawMaterials')).find(item=>item.material==='Plywood');
    await select(page,'Aluminum 6061');await sheetRow(page,'Metal rack A').getByRole('button',{name:'Edit',exact:true}).click();
    await rawFields(page,{length:'47.5',width:'95.25',thickness:'',quantity:7,notes:'Trimmed sheets'});
    await page.locator('#saveRawMaterial').click();
    await until(async()=>(await rpc('getRawMaterials')).some(item=>item.location==='Metal rack A'&&item.quantity===7),'edited selected sheet');
    await idle(page);await page.locator('#rawMaterialEditor').waitFor({state:'hidden'});
    const edited=(await rpc('getRawMaterials')).find(item=>item.location==='Metal rack A');
    assert.equal(edited.length,'47.5');assert.equal(edited.width,'95.25');assert.equal(edited.thickness,undefined);
    assert.deepEqual((await rpc('getRawMaterials')).find(item=>item.material==='Plywood'),otherBefore,'Editing Aluminum does not alter Plywood');
    await addSheet(page,rpc,'Aluminum 6061',{length:12,width:18,quantity:2,location:'Temporary metal batch',notes:'Delete regression fixture'});
    await sheetRow(page,'Temporary metal batch').getByRole('button',{name:'Edit',exact:true}).click();
    await page.locator('#rawMaterialQuantity').fill('99');await page.locator('#cancelRawMaterialEdit').click();
    assert.equal((await rpc('getRawMaterials')).find(item=>item.location==='Temporary metal batch').quantity,2,'Cancel discards an unsaved quantity');
    await sheetRow(page,'Temporary metal batch').getByRole('button',{name:'Delete',exact:true}).click();
    await until(async()=>!(await rpc('getRawMaterials')).some(item=>item.location==='Temporary metal batch'),'deleted selected sheet');await idle(page);
    await assertSelected(page,'Aluminum 6061',['Metal rack A','Metal rack zero'],['Wood rack P','Temporary metal batch'],2,7,aluminum.materialImage);
    assert.deepEqual((await rpc('getRawMaterials')).find(item=>item.material==='Plywood'),otherBefore,'Deleting Aluminum does not alter Plywood');
    console.log('PASS: material-name/location search cannot expose another material\'s rows; selected-material add, edit, cancel, and delete preserve the rest of the inventory.');

    await manager(page);await materialCard(page,'Aluminum 6061').getByRole('button',{name:'Edit',exact:true}).click();
    await page.locator('#materialName').fill('Aluminum 6061-T6');await page.locator('#saveMaterial').click();
    await until(async()=>(await rpc('getMaterials')).some(item=>item.name==='Aluminum 6061-T6'),'renamed library material');await idle(page);
    const rawAfterRename=await rpc('getRawMaterials');
    assert.equal(rawAfterRename.filter(item=>item.material==='Aluminum 6061-T6').length,2);
    assert.equal(rawAfterRename.some(item=>item.material==='Aluminum 6061'),false);
    assert.deepEqual(rawAfterRename.find(item=>item.material==='Plywood'),otherBefore);
    await assertSelected(page,'Aluminum 6061-T6',['Metal rack A','Metal rack zero'],['Wood rack P'],2,7,aluminum.materialImage);
    await manager(page);await materialCard(page,'Aluminum 6061-T6').getByRole('button',{name:'Delete',exact:true}).click();
    await until(async()=>/used|referenc|sheet|inventory/i.test(await page.locator('#adminStatus').innerText()),'referenced material deletion blocked');
    assert.ok((await rpc('getMaterials')).some(item=>item.name==='Aluminum 6061-T6'));
    await materialCard(page,'Stainless steel').getByRole('button',{name:'Delete',exact:true}).click();
    await until(async()=>!(await rpc('getMaterials')).some(item=>item.name==='Stainless steel'),'unused library material deletion');await idle(page);
    await createMaterial(page,rpc,'Brass');
    await select(page,'Brass');assert.equal(await page.locator('#rawMaterialEmpty').isVisible(),true);
    await page.reload();await page.evaluate(()=>window.cncLocal.ready);await navigate(page,'materials');
    await assertSelected(page,'Plywood',['Wood rack P'],['Metal rack A','Metal rack zero'],1,9,plywood.materialImage);await assertReadOnly(page);
    await assertSelected(page,'Aluminum 6061-T6',['Metal rack A','Metal rack zero'],['Wood rack P'],2,7,aluminum.materialImage);
    assert.match(await sheetRow(page,'Metal rack A').innerText(),/47\.5/);
    assert.match(await sheetRow(page,'Metal rack zero').innerText(),/\b0\b/);
    console.log('PASS: material management creates, renames, and removes library entries; rename retains raw references/photos and unused versus referenced deletion rules survive reload.');

    await login(page);await navigate(page,'settings');
    const jsonEvent=page.waitForEvent('download');await page.locator('#exportBackup').click();
    const jsonDownload=await jsonEvent,jsonPath=path.join(temporary,'materials.json');await jsonDownload.saveAs(jsonPath);
    const backup=JSON.parse(fs.readFileSync(jsonPath,'utf8'));
    assert.equal(backup.rawMaterials.length,3);assert.equal(backup.materials.length,3);assert.equal(Object.hasOwn(backup,'auth'),false);
    assert.equal(backup.rawMaterials.some(item=>item.quantity===0),true);
    const htmlEvent=page.waitForEvent('download');await page.locator('#downloadPortable').click();
    const htmlDownload=await htmlEvent,htmlPath=path.join(temporary,'materials.html');await htmlDownload.saveAs(htmlPath);
    const portableHTML=fs.readFileSync(htmlPath,'utf8');const portable=await open(portableHTML);
    const portableAuth=await portable.rpc('adminLogin','admin','Feds201');
    const portableBackup=await portable.rpc('adminExportBackup',portableAuth.token);
    for(const key of databaseKeys)assert.deepEqual(portableBackup[key],backup[key],'Portable HTML retains '+key);
    await navigate(portable.page,'materials');
    await assertSelected(portable.page,'Plywood',['Wood rack P'],['Metal rack A','Metal rack zero'],1,9,plywood.materialImage);
    await assertSelected(portable.page,'Aluminum 6061-T6',['Metal rack A','Metal rack zero'],['Wood rack P'],2,7,aluminum.materialImage);await assertReadOnly(portable.page);
    const imported=await open();await login(imported.page);await navigate(imported.page,'settings');
    await imported.page.locator('#importFile').setInputFiles(jsonPath);
    await until(async()=>(await imported.rpc('getRawMaterials')).length===3,'JSON import restores sheets');await idle(imported.page);
    const importedAuth=await imported.rpc('adminLogin','admin','Feds201');const importedBackup=await imported.rpc('adminExportBackup',importedAuth.token);
    for(const key of databaseKeys)assert.deepEqual(importedBackup[key],backup[key],'Downloaded JSON imports '+key);
    await navigate(imported.page,'materials');await assertSelected(imported.page,'Plywood',['Wood rack P'],['Metal rack A','Metal rack zero'],1,9,plywood.materialImage);
    await select(imported.page,'Brass');assert.equal(await imported.page.locator('#rawMaterialEmpty').isVisible(),true);
    console.log('PASS: actual JSON and portable HTML downloads reopen in fresh browsers with correct material selection, sheet IDs/counts/dimensions, unused materials, and shared photos.');

    await assertNavigation(page);
    for(const theme of ['dark','light']){
      await navigate(page,'settings');await page.locator('[data-theme-choice="'+theme+'"]').click();
      await until(()=>page.evaluate(theme=>document.documentElement.dataset.theme===theme,theme),'desktop '+theme+' theme');
      await navigate(page,'materials');await assertSelected(page,'Plywood',['Wood rack P'],['Metal rack A','Metal rack zero'],1,9,plywood.materialImage);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,'Materials fits desktop in '+theme+' mode');
    }
    const mobile=await open(portableHTML,{width:390,height:844});await assertNavigation(mobile.page);
    for(const theme of ['dark','light']){
      await navigate(mobile.page,'settings');await mobile.page.locator('[data-theme-choice="'+theme+'"]').click();
      await until(()=>mobile.page.evaluate(theme=>document.documentElement.dataset.theme===theme,theme),'mobile '+theme+' theme');
      await navigate(mobile.page,'materials');await assertSelected(mobile.page,'Aluminum 6061-T6',['Metal rack A','Metal rack zero'],['Wood rack P'],2,7,aluminum.materialImage);
      assert.equal(await mobile.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,'Materials fits a 390px screen in '+theme+' mode');
    }
    await assertReadOnly(mobile.page);await login(mobile.page);await navigate(mobile.page,'materials');
    await select(mobile.page,'Plywood');await mobile.page.locator('#addRawMaterial').click();await mobile.page.locator('#rawMaterialEditor').waitFor({state:'visible'});
    assert.equal(await mobile.page.locator('#rawMaterialMaterial').inputValue(),'Plywood');
    assert.equal(await mobile.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,'Selected sheet editor fits mobile');
    await mobile.page.locator('#cancelRawMaterialEdit').click();await manager(mobile.page);
    assert.equal(await mobile.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,'Material manager fits mobile');
    if(process.env.CNC_UNIFIED_SCREENSHOT)await mobile.page.screenshot({path:process.env.CNC_UNIFIED_SCREENSHOT,fullPage:true,animations:'disabled'});
    console.log('PASS: all six pages, both themes, mobile material selection, and admin editors fit without document overflow.');
    assert.deepEqual(errors,[],'No uncaught browser errors');assert.deepEqual(unexpectedRequests,[],'Standalone HTML requests no external resources');
  }finally{
    for(const context of contexts)await context.close();await browser.close();fs.rmSync(temporary,{recursive:true,force:true});
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
