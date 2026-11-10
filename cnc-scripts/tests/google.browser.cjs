// Chromium exercises the exact Google build through the real compiled server
// and durable Apps Script doubles. This is not a live Google deployment check.
const {chromium}=require('playwright');
const {createGasMock}=require('./gas-mock.cjs');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const origin='http://localhost:31467/Index.html';
const hosted=fs.readFileSync(path.join(__dirname,'..','Index.html'),'utf8');
const keys=['settings','materials','mills','rawMaterials'];
const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
// Inspect rendered colors so a fixed dark navigation palette cannot pass by
// changing only html[data-theme]. Reduce motion in test contexts for stable CSS.
async function assertChromeTheme(page,theme){
  const colors=await page.evaluate(()=>{
    const sample=selector=>{const css=getComputedStyle(document.querySelector(selector));return {color:css.color,background:css.backgroundColor,image:css.backgroundImage};};
    return {sidebar:sample('.app-sidebar'),topbar:sample('.app-topbar'),brand:sample('.app-brand'),inactive:sample('.nav-button:not(.active)'),active:sample('.nav-button.active'),summary:sample('.sidebar-summary p strong'),storage:sample('.sidebar-storage'),search:sample('#globalSearch')};
  });
  const rgb=color=>color.match(/[\d.]+/g).slice(0,3).map(Number);
  const luminance=color=>rgb(color).map(value=>{value/=255;return value<=.04045?value/12.92:((value+.055)/1.055)**2.4;}).reduce((sum,value,index)=>sum+value*[.2126,.7152,.0722][index],0);
  const contrast=(foreground,background)=>{const a=luminance(foreground),b=luminance(background);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);};
  for(const name of ['sidebar','topbar','search']){
    const channels=rgb(colors[name].background);
    assert.ok(theme==='light'?channels.every(value=>value>200):channels.every(value=>value<85),name+' has the rendered '+theme+' background: '+colors[name].background);
  }
  if(theme==='light')assert.equal(colors.sidebar.image,'none','A fixed dark sidebar gradient cannot cover the light background');
  for(const name of ['inactive','summary','storage'])assert.ok(contrast(colors[name].color,colors.sidebar.background)>=4.5,name+' stays readable against the '+theme+' sidebar');
  assert.ok(contrast(colors.brand.color,colors.topbar.background)>=4.5,'The brand stays readable against the '+theme+' header');
  assert.ok(contrast(colors.search.color,colors.search.background)>=4.5,'Search text stays readable in '+theme+' mode');
  assert.deepEqual(rgb(colors.active.color),[255,255,255],'Active navigation retains white text');
  const active=rgb(colors.active.background);
  assert.ok(active[2]>active[0]+60&&active[2]>active[1]+50,'Active navigation retains its blue highlight');
  assert.ok(contrast(colors.active.color,colors.active.background)>=4.5,'Active navigation remains readable');
  await page.locator('.nav-button.active').hover();
  const hovered=await page.locator('.nav-button.active').evaluate(button=>{const css=getComputedStyle(button);return {color:css.color,background:css.backgroundColor};});
  assert.deepEqual(rgb(hovered.color),[255,255,255],'Hovered active navigation retains white text');
  assert.ok(contrast(hovered.color,hovered.background)>=4.5,'Hovered active navigation remains readable');
  await page.mouse.move(1,1);
}

(async()=>{
  const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'cnc-google-browser-'));
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  const contexts=[],errors=[],requests=[];const backend=createGasMock();backend.load().setupDatabase();
  async function until(check,label,timeout=15000){const end=Date.now()+timeout;while(Date.now()<end){if(await check())return;await new Promise(resolve=>setTimeout(resolve,40));}throw new Error('Timed out: '+label);}
  async function open({html=hosted,mock=backend,bridge=true,local=false,viewport={width:1440,height:1000}}={}){
    const context=await browser.newContext({viewport,colorScheme:'light',reducedMotion:'reduce',acceptDownloads:true});contexts.push(context);
    let transportFailure=false;
    if(bridge&&!local){
      await context.exposeFunction('__cncRpc',(name,args)=>{if(transportFailure&&(transportFailure===true||transportFailure===name)){transportFailure=false;throw new Error('Simulated lost Google connection');}return mock.call(mock.load(),name,...args);});
      await context.addInitScript(()=>{
        const runner=(success,failure)=>({withSuccessHandler(next){return runner(next,failure);},withFailureHandler(next){return runner(success,next);},cncCall(name,args){window.__cncRpc(name,args).then(value=>{if(success)success(value);},error=>{if(failure)failure(error);});}});
        window.google={script:{run:runner()}};
      });
    }
    await context.route(/^https?:/,route=>{if(route.request().url()===origin)return route.fulfill({contentType:'text/html',body:html});requests.push(route.request().url());return route.abort();});
    const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>dialog.accept());
    await page.goto(origin);
    const rpc=(name,...args)=>page.evaluate(({name,args})=>window.cncLocal.call(name,...args),{name,args});
    return {page,context,rpc,failTransport(name=true){transportFailure=name;}};
  }
  async function ready(page){await page.evaluate(()=>window.cncLocal.ready);await until(()=>page.evaluate(()=>!document.getElementById('loginFields').disabled),'login initialized');}
  async function idle(page){await until(()=>page.evaluate(()=>!document.getElementById('materialFields').disabled&&!document.getElementById('rawMaterialFields').disabled),'editors idle');}
  async function go(page,name){if(await page.locator('#menuToggle').isVisible()&&await page.locator('#menuToggle').getAttribute('aria-expanded')!=='true')await page.locator('#menuToggle').click();await page.locator('.nav-button[data-page="'+name+'"]').click();await page.locator('.workspace-view[data-page="'+name+'"]').waitFor({state:'visible'});}
  async function login(page,password='admin'){if(await page.locator('#loginCard').isHidden())await page.locator('#toggleView').click();await page.locator('#username').fill('admin');await page.locator('#password').fill(password);await page.locator('#loginForm button[type=submit]').click();await page.locator('#workspace').waitFor({state:'visible'});await idle(page);}
  async function select(page,name){await go(page,'materials');await page.locator('button.material-choice').filter({has:page.getByRole('heading',{name,exact:true})}).click();await until(async()=>await page.locator('#materialDetailTitle').innerText()===name,'material selected');}
  function row(page,location){return page.locator('#rawMaterialListBody tr').filter({hasText:location});}
  async function sheetFields(page,fields){for(const [key,value]of Object.entries(fields))await page.locator('#rawMaterial'+key[0].toUpperCase()+key.slice(1)).fill(String(value));}
  async function sheet(page,rpc,location,quantity){await page.locator('#addRawMaterial').click();assert.equal(await page.locator('#rawMaterialMaterial').inputValue(),'Aluminum 6061');await sheetFields(page,{length:96,width:48,thickness:.125,quantity,location});await page.locator('#saveRawMaterial').click();await until(async()=>(await rpc('getRawMaterials')).some(item=>item.location===location&&item.quantity===quantity),'sheet saved '+location);await idle(page);await page.locator('#rawMaterialEditor').waitFor({state:'hidden'});}
  async function download(page,id,name){await idle(page);const event=page.waitForEvent('download');await page.locator('#'+id).click();const file=await event;const destination=path.join(temporary,name);await file.saveAs(destination);await idle(page);return destination;}
  try{
    const first=await open(),{page,rpc}=first;await ready(page);
    assert.equal(await page.evaluate(()=>cncLocal.kind),'google');assert.equal(await page.locator('.nav-button').count(),6);
    assert.match(await page.locator('.offline-pill').innerText(),/Google Sheets/);assert.match(await page.locator('.sidebar-storage').innerText(),/Shared Google database/);
    assert.match(await page.locator('#appVersion').innerText(),/1\.14\.0/);assert.match(await page.locator('#mentorNotice').innerText(),/mentor.*present/i);
    assert.equal(await page.evaluate(()=>localStorage.getItem('cnc-tool-database-v1')),null);await go(page,'materials');assert.equal(await page.locator('#manageMaterials').isVisible(),false);
    await login(page);await go(page,'materials');await page.locator('#manageMaterials').click();await page.locator('#materialName').fill('Aluminum 6061');
    await page.locator('#materialImageUpload').setInputFiles({name:'material.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});await until(()=>page.evaluate(()=>document.getElementById('materialImagePreview').naturalWidth>0&&!document.getElementById('materialFields').disabled),'image upload');
    await page.locator('#saveMaterial').click();await until(async()=>(await rpc('getMaterials')).length===1,'created material');await idle(page);
    await select(page,'Aluminum 6061');await sheet(page,rpc,'Rack A',3);await sheet(page,rpc,'Temporary batch',1);
    await row(page,'Temporary batch').getByRole('button',{name:'Delete',exact:true}).click();await until(async()=>(await rpc('getRawMaterials')).length===1,'deleted batch');await idle(page);
    await row(page,'Rack A').getByRole('button',{name:'Edit',exact:true}).click();await page.locator('#rawMaterialQuantity').fill('5');await page.locator('#saveRawMaterial').click();await until(async()=>(await rpc('getRawMaterials'))[0].quantity===5,'edited count');await idle(page);
    await row(page,'Rack A').getByRole('button',{name:'Edit',exact:true}).click();await page.locator('#rawMaterialQuantity').fill('99');await page.locator('#cancelRawMaterialEdit').click();assert.equal((await rpc('getRawMaterials'))[0].quantity,5);
    const auth=await rpc('adminLogin','admin','Feds201');
    const image=(await rpc('getMaterials'))[0].materialImage;assert.match(image,/^data:image\//);
    await rpc('adminSaveMaterial',auth.token,{name:'Plywood'},null);
    await rpc('adminSaveRawMaterial',auth.token,{material:'Plywood',length:'96',width:'48',quantity:9,location:'Wood rack'},null);
    await rpc('adminSaveMill',auth.token,{number:'001',name:'Quarter-inch end mill',diameter:'.25',flutes:2,quantity:4,reorderLevel:1,toolImage:image},null);
    const note='</script><script>window.__injected=true</script><img src=x onerror="window.__injected=true">';
    await rpc('adminSaveSetting',auth.token,{mill:'001',material:'Aluminum 6061',rpm:'12000',feed:'40',plungeRate:'8',depth:'.125',coolantMist:true,units:'inch',notes:note},null);
    await page.reload();await ready(page);await login(page);await go(page,'settings');
    assert.equal(await page.locator('#downloadPortable').innerText(),'Download offline HTML');await page.locator('#passwordDetails summary').click();
    await page.locator('#passwordLabel').fill('Shared mentor');await page.locator('#newPassword').fill('mentor-cloud-357');await page.locator('#confirmPassword').fill('mentor-cloud-357');await page.locator('#savePassword').click();
    await until(async()=>(await rpc('adminListPasswords',auth.token)).length===2,'shared password saved');await idle(page);
    const second=await open();await ready(second.page);await select(second.page,'Aluminum 6061');assert.equal(await second.page.locator('#manageMaterials').isVisible(),false);assert.equal(await second.page.locator('#rawMaterialListBody tr').count(),1);assert.match(await row(second.page,'Rack A').innerText(),/\b5\b/);assert.equal(await second.page.locator('#selectedMaterialPhoto').getAttribute('src'),image);assert.equal(await second.page.locator('#rawMaterialListBody button').count(),0);
    await login(second.page,'mentor-cloud-357');await second.page.reload();await ready(second.page);await login(second.page,'mentor-cloud-357');
    assert.equal(await second.page.evaluate(()=>localStorage.getItem('cnc-tool-database-v1')),null);
    console.log('PASS: exact Google build uses server RPC, shared data/passwords across fresh browsers, six pages, public roles, photos, selected-material sheet CRUD, and no local database storage.');

    await go(page,'feeds');await page.locator('#mill').selectOption('001');await page.locator('#material').selectOption('Aluminum 6061');await page.locator('#show').click();await page.locator('#result').waitFor({state:'visible'});
    assert.match(await page.locator('#result').innerText(),/40 inch\/min/);assert.match(await page.locator('#result').innerText(),/8 inch\/min/);assert.match(await page.locator('#result').innerText(),/Enabled/);assert.equal(await page.evaluate(()=>window.__injected),undefined);
    await go(page,'settings');const jsonPath=await download(page,'exportBackup','shared-backup.json');const backupText=fs.readFileSync(jsonPath,'utf8'),backup=JSON.parse(backupText);
    assert.equal(backup.settings[0].notes,note);for(const key of ['auth','passwords','token'])assert.equal(Object.hasOwn(backup,key),false);assert.equal(backupText.includes('mentor-cloud-357'),false);assert.equal(backupText.includes('Shared mentor'),false);
    const htmlPath=await download(page,'downloadPortable','offline.html');const offline=fs.readFileSync(htmlPath,'utf8');
    assert.ok(offline.includes('Local-only storage and settings API'));assert.equal(offline.includes('Google Apps Script transport'),false);assert.equal(offline.includes('cncOfflineTemplate'),false);assert.equal(offline.includes('mentor-cloud-357'),false);assert.equal(offline.includes('Shared mentor'),false);
    const receiver=await open({html:offline,local:true});await ready(receiver.page);assert.equal(await receiver.page.evaluate(()=>typeof window.google),'undefined');assert.equal(await receiver.page.locator('.offline-pill').innerText(),'Offline');assert.equal(await receiver.page.evaluate(()=>window.__injected),undefined);
    const localAuth=await receiver.rpc('adminLogin','admin','Feds201'),localBackup=await receiver.rpc('adminExportBackup',localAuth.token);for(const key of keys)assert.deepEqual(localBackup[key],backup[key],'Offline download retains '+key);assert.equal((await receiver.rpc('adminListPasswords',localAuth.token)).length,1);await assert.rejects(receiver.rpc('adminLogin','admin','mentor-cloud-357'),/incorrect/i);
    const emptyLocal=await open({html:fs.readFileSync(path.join(__dirname,'..','..','cnc-local','CNC-Tool-Database.html'),'utf8'),local:true});await ready(emptyLocal.page);await login(emptyLocal.page);await go(emptyLocal.page,'settings');await emptyLocal.page.locator('#importFile').setInputFiles(jsonPath);await until(async()=>(await emptyLocal.rpc('getRawMaterials')).length===2,'JSON imports into local');const importedAuth=await emptyLocal.rpc('adminLogin','admin','Feds201');const importedBackup=await emptyLocal.rpc('adminExportBackup',importedAuth.token);for(const key of keys)assert.deepEqual(importedBackup[key],backup[key],'Google JSON imports into local '+key);
    const freshBackend=createGasMock();freshBackend.load().setupDatabase();const importedGoogle=await open({mock:freshBackend});await ready(importedGoogle.page);await login(importedGoogle.page);await go(importedGoogle.page,'settings');await importedGoogle.page.locator('#importFile').setInputFiles(jsonPath);await until(async()=>(await importedGoogle.rpc('getRawMaterials')).length===2,'JSON imports into fresh Google');const ga=await importedGoogle.rpc('adminLogin','admin','Feds201');const gb=await importedGoogle.rpc('adminExportBackup',ga.token);for(const key of keys)assert.deepEqual(gb[key],backup[key],'Downloaded JSON restores Google '+key);
    console.log('PASS: JSON downloads import into both variants; offline HTML starts without Google with exact records/images, safe script-like notes, permanent fallback, and no custom server credentials.');

    for(const theme of ['dark','light']){await go(page,'settings');await page.locator('[data-theme-choice="'+theme+'"]').click();await until(()=>page.evaluate(theme=>document.documentElement.dataset.theme===theme,theme),'theme '+theme);await assertChromeTheme(page,theme);await select(page,'Aluminum 6061');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);}
    await go(page,'settings');await page.locator('[data-theme-choice=system]').click();
    for(const theme of ['dark','light']){
      await page.emulateMedia({colorScheme:theme});
      await until(()=>page.evaluate(theme=>document.documentElement.dataset.theme===theme,theme),'system chrome '+theme);
      await assertChromeTheme(page,theme);
    }
    await page.reload();await ready(page);await assertChromeTheme(page,'light');await login(page);await select(page,'Aluminum 6061');
    const mobile=await open({viewport:{width:390,height:844}});await ready(mobile.page);
    for(const name of ['dashboard','feeds','mills','inventory','materials','settings']){await go(mobile.page,name);assert.equal(await mobile.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,'Mobile '+name+' fits');}
    for(const theme of ['dark','light']){
      await go(mobile.page,'settings');await mobile.page.locator('[data-theme-choice="'+theme+'"]').click();
      await until(()=>mobile.page.evaluate(theme=>document.documentElement.dataset.theme===theme,theme),'mobile chrome '+theme);
      await mobile.page.locator('#menuToggle').click();
      assert.equal(await mobile.page.locator('#sidebar').evaluate(sidebar=>sidebar.getBoundingClientRect().left>=-1),true,'The Google mobile drawer is open');
      await assertChromeTheme(mobile.page,theme);
      await mobile.page.locator('#menuToggle').click();
    }
    await go(mobile.page,'settings');await mobile.page.locator('[data-theme-choice=dark]').click();await select(mobile.page,'Aluminum 6061');await login(mobile.page);await mobile.page.locator('#addRawMaterial').click();assert.equal(await mobile.page.locator('#rawMaterialMaterial').inputValue(),'Aluminum 6061');assert.equal(await mobile.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,'Mobile admin editor fits');await mobile.page.locator('#cancelRawMaterialEdit').click();
    const before=await rpc('getRawMaterials');first.failTransport();await assert.rejects(rpc('getRawMaterials'),/lost Google connection/);assert.deepEqual(await rpc('getRawMaterials'),before);
    first.failTransport('adminSaveRawMaterial');await page.locator('#addRawMaterial').click();await sheetFields(page,{length:10,width:10,quantity:1,location:'Failed write'});await page.locator('#saveRawMaterial').click();await until(async()=>/lost Google connection/.test(await page.locator('#rawMaterialStatus').innerText()),'transport write error shown');assert.deepEqual(await rpc('getRawMaterials'),before);
    console.log('PASS: Google rendered sidebar/header/search palettes follow light/dark/system themes and mobile drawers; six destinations, admin editors, and failed RPC recovery keep layout and data intact.');

    const absent=await open({bridge:false});await until(async()=>/deployed Google Apps Script/.test(await absent.page.locator('#status').innerText()),'missing bridge instructions');assert.equal(await absent.page.evaluate(()=>document.getElementById('loginFields').disabled),true);
    const unconfigured=await open({mock:createGasMock()});await until(async()=>/setupDatabase/.test(await unconfigured.page.locator('#status').innerText()),'unconfigured project instructions');assert.equal(await unconfigured.page.evaluate(()=>document.getElementById('loginFields').disabled),true);
    assert.deepEqual(errors,[],'No uncaught browser errors');assert.deepEqual(requests,[],'No unexpected network resources');assert.equal(backend.state.lockHeld,false);assert.equal(backend.state.locks,backend.state.releases);
    console.log('PASS: missing Apps Script bridge and unconfigured projects explain recovery without undefined calls; no browser errors or unexpected network requests.');
  }finally{for(const context of contexts)await context.close();await browser.close();fs.rmSync(temporary,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
