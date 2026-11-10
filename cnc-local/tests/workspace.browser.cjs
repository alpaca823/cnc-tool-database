// End-to-end coverage for the standalone v1.10 workspace. The intercepted origin
// serves the exact built HTML without running a server or contacting the network.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const target=path.join(root,'CNC-Tool-Database.html');
const origin='http://localhost:31460/workspace.html';
const pages=['dashboard','feeds','mills','inventory','materials','settings'];

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
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'cnc-workspace-'));
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  const contexts=[],errors=[],unexpectedRequests=[];
  async function open(html=fs.readFileSync(target,'utf8'),viewport={width:1440,height:1000}){
    const context=await browser.newContext({viewport,colorScheme:'light',reducedMotion:'reduce',acceptDownloads:true});contexts.push(context);
    await context.route(/^https?:/,route=>{
      if(route.request().url()===origin)return route.fulfill({contentType:'text/html',body:html});
      unexpectedRequests.push(route.request().url());return route.abort();
    });
    const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
    page.on('dialog',dialog=>dialog.accept());
    await page.goto(origin);await page.evaluate(()=>window.cncLocal.ready);
    return {context,page,rpc:(name,...args)=>page.evaluate(({name,args})=>window.cncLocal.call(name,...args),{name,args})};
  }
  async function navigate(page,name){
    await page.locator('.nav-button[data-page="'+name+'"]').click();
    await page.locator('.workspace-view[data-page="'+name+'"]').waitFor({state:'visible'});
    for(const other of pages.filter(value=>value!==name))assert.equal(await page.locator('.workspace-view[data-page="'+other+'"]').isVisible(),false,other+' is hidden while '+name+' is active');
  }
  async function login(page){
    if(await page.locator('#workspace').isHidden()){
      if(await page.locator('#loginCard').isHidden())await page.locator('#toggleView').click();
      if(await page.locator('#username').count())await page.locator('#username').fill('admin');
      await page.locator('#password').fill('Feds201');await page.locator('#loginForm button[type="submit"]').click();
      await page.locator('#workspace').waitFor({state:'visible'});
    }
  }
  async function field(page,id,value){
    const locator=page.locator('#'+id);
    if(await locator.evaluate(element=>element.tagName)==='SELECT'){
      const options=await locator.locator('option').evaluateAll(elements=>elements.map(element=>({value:element.value,label:element.textContent.trim()})));
      const match=options.find(option=>option.value===String(value)||option.label===String(value));
      assert.ok(match,'Expected an option for '+id+': '+value);await locator.selectOption(match.value);
    }else await locator.fill(String(value));
  }
  async function eventually(page,method,predicate,arg){
    // Poll resolved API values explicitly: this Playwright build treats an async
    // waitForFunction callback's Promise as truthy even when it resolves false.
    const deadline=Date.now()+30000;
    while(true){
      const records=await page.evaluate(method=>window.cncLocal.call(method),method);
      if(predicate(records,arg))return records;
      assert.ok(Date.now()<deadline,'Timed out waiting for '+method+': '+JSON.stringify(records));
      await new Promise(resolve=>setTimeout(resolve,50));
    }
  }
  async function addMill(page,number,name,extra={}){
    await navigate(page,'mills');await page.locator('#addMill').click();
    for(const [id,value]of Object.entries({millNumber:number,millName:name,millType:'End Mill',millDiameter:'.25',millFlutes:'2',millCoating:'Uncoated',millNotes:'Workspace integration fixture',...extra}))await field(page,id,value);
    await page.locator('#saveMill').click();
    await eventually(page,'getMills',(records,number)=>records.some(record=>record.number===number),number);
    await page.waitForFunction(()=>!document.getElementById('millFields').disabled&&document.getElementById('millEditor').hidden);
  }
  async function stock(page,number,quantity,reorder,location){
    await navigate(page,'inventory');
    const row=page.locator('#inventoryListBody tr').filter({hasText:number});
    await row.getByRole('button',{name:/update stock|edit/i}).click();
    await field(page,'inventoryMill',number);await field(page,'inventoryQuantity',quantity);
    await field(page,'inventoryReorderLevel',reorder);await field(page,'inventoryLocation',location);
    await page.locator('#saveInventory').click();
    await eventually(page,'getMills',(records,arg)=>records.some(record=>record.number===arg.number&&record.quantity===arg.quantity&&record.reorderLevel===arg.reorder&&record.location===arg.location),{number,quantity,reorder,location});
    await page.waitForFunction(()=>!document.getElementById('inventoryFields').disabled&&document.getElementById('inventoryStatus').textContent==='Inventory saved.');
  }
  try{
    const {page,rpc}=await open();
    await page.locator('.workspace-view[data-page="feeds"]').waitFor({state:'visible'});
    assert.match(await page.locator('body').innerText(),/mentor.*present/i);
    assert.equal(await page.locator('html').getAttribute('data-theme'),'dark','Fresh browsers default to dark');
    await assertChromeTheme(page,'dark');
    assert.match(await page.locator('body').innerText(),/1\.14\.4/);
    assert.equal(await page.locator('.nav-button').count(),pages.length);
    for(const name of pages){await navigate(page,name);assert.equal(await page.locator('#mentorNotice').isVisible(),name==='feeds','Mentor notice belongs only to Feeds & Speeds');}
    await navigate(page,'mills');assert.equal(await page.locator('#addMill').isVisible(),false);
    await navigate(page,'materials');assert.equal(await page.locator('#materialForm').isVisible(),false);
    await navigate(page,'inventory');assert.equal(await page.locator('#inventoryForm').isVisible(),false);
    await assert.rejects(rpc('adminSaveMill','forged',{number:'FORGED',name:'Blocked',type:'End Mill'},null),/AUTH_REQUIRED/);
    await assert.rejects(rpc('adminSetInventory','forged','FORGED',1,0,'',null),/AUTH_REQUIRED/);
    console.log('PASS: side tabs navigate independently; operators see the mentor notice, current version, and read-only records.');

    await navigate(page,'settings');
    for(const theme of ['dark','light']){
      await page.locator('[data-theme-choice="'+theme+'"]').click();
      await page.waitForFunction(theme=>document.documentElement.dataset.theme===theme,theme);
      await assertChromeTheme(page,theme);
      await page.reload();await page.evaluate(()=>window.cncLocal.ready);
      assert.equal(await page.locator('html').getAttribute('data-theme'),theme);
      await assertChromeTheme(page,theme);
      await navigate(page,'settings');
    }
    await page.emulateMedia({colorScheme:'dark'});
    await page.locator('[data-theme-choice="system"]').click();
    await page.waitForFunction(()=>document.documentElement.dataset.theme==='dark');
    await page.reload();await page.evaluate(()=>window.cncLocal.ready);
    assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');
    await assertChromeTheme(page,'dark');
    await page.emulateMedia({colorScheme:'light'});
    await page.waitForFunction(()=>document.documentElement.dataset.theme==='light');
    await assertChromeTheme(page,'light');
    console.log('PASS: rendered sidebar, header, navigation, and search colors follow light/dark/system themes, persist on reload, and keep readable text.');

    await login(page);let auth=await rpc('adminLogin','admin','Feds201');
    await addMill(page,'MX-101','Quarter-inch aluminum end mill');
    await addMill(page,'MX-102','Spare finishing end mill',{millDiameter:'.125',millFlutes:'4',millCoating:'TiAlN'});
    let mills=await rpc('getMills');
    assert.equal(mills.length,2,JSON.stringify(mills));assert.equal(mills[0].stockStatus,'untracked');
    assert.equal(mills.some(mill=>Object.hasOwn(mill,'quantity')),false,'New tools do not invent inventory quantities');
    await page.locator('#globalSearch').fill('MX-102');
    await page.waitForFunction(()=>document.querySelectorAll('#millListBody tr').length===1);
    assert.match(await page.locator('#millListBody').innerText(),/Spare finishing end mill/);
    assert.doesNotMatch(await page.locator('#millListBody').innerText(),/MX-101/);
    await page.locator('#globalSearch').fill('no matching tool');
    await page.waitForFunction(()=>!document.getElementById('millListBody').textContent.includes('MX-10'));
    await page.locator('#globalSearch').fill('');
    await page.locator('#millListBody tr').filter({hasText:'MX-101'}).getByRole('button',{name:'Quarter-inch aluminum end mill',exact:true}).click();
    assert.match(await page.locator('#millDetails').innerText(),/Quarter-inch aluminum end mill/);
    assert.match(await page.locator('#millDetails').innerText(),/(?:0)?\.25|1\/4/);

    const image=await page.evaluate(()=>{
      const canvas=document.createElement('canvas');canvas.width=64;canvas.height=48;
      const paint=canvas.getContext('2d');paint.fillStyle='#a0afbd';paint.fillRect(0,0,64,48);
      paint.fillStyle='#1354c1';paint.fillRect(8,8,48,32);return canvas.toDataURL('image/png');
    });
    await navigate(page,'materials');
    await page.locator('#manageMaterials').click();
    await page.locator('#materialName').fill('Aluminum 6061');
    await page.locator('#materialImageUpload').setInputFiles({name:'material.png',mimeType:'image/png',buffer:Buffer.from(image.split(',')[1],'base64')});
    await page.waitForFunction(()=>document.getElementById('materialImagePreview').naturalWidth>0&&!document.getElementById('materialFields').disabled);
    await page.locator('#saveMaterial').click();
    await eventually(page,'getMaterials',records=>records.some(record=>record.name==='Aluminum 6061'));
    await page.waitForFunction(()=>!document.getElementById('materialFields').disabled&&document.getElementById('adminStatus').textContent.startsWith('Material saved.')&&[...document.getElementById('editMaterial').options].some(option=>option.value==='Aluminum 6061'));
    await navigate(page,'feeds');
    for(const [id,value]of Object.entries({editMill:'MX-101',editRpm:'12000',editFeed:'35',editPlungeRate:'7.5',editDepth:'.125',editNotes:'Use the mentor-approved setup.'}))await field(page,id,value);
    await page.locator('#editMaterial').selectOption('Aluminum 6061');await page.locator('#editCoolantMist').check();
    await page.locator('#saveSetting').click();
    await page.waitForFunction(()=>!document.getElementById('settingFields').disabled&&document.getElementById('adminStatus').textContent.startsWith('Setting saved.'));
    assert.equal((await rpc('getSettings','MX-101','Aluminum 6061')).plungeRate,7.5);
    await page.locator('#mill').selectOption('MX-101');await page.locator('#material').selectOption('Aluminum 6061');
    await page.locator('#show').click();await page.locator('#result').waitFor({state:'visible'});
    assert.match(await page.locator('#plungeRate').innerText(),/7\.5.*(inch|in)/i);
    assert.match(await page.locator('#coolantMist').innerText(),/enabled|yes|on/i);
    await page.waitForFunction(()=>document.getElementById('resultMaterialImage').naturalWidth>0);
    const materialImage=(await rpc('getMaterials')).find(material=>material.name==='Aluminum 6061').materialImage;
    assert.equal(await page.locator('#resultMaterialImage').getAttribute('src'),materialImage);
    console.log('PASS: Mills, material photos, shared material dropdowns, cutting settings, plunge rate, and coolant mist work together.');

    await stock(page,'MX-101',8,2,'Cabinet A / bin 4');
    assert.equal((await rpc('getMills')).find(mill=>mill.number==='MX-101').stockStatus,'in');
    await stock(page,'MX-101',2,2,'Cabinet A / bin 4');
    assert.equal((await rpc('getMills')).find(mill=>mill.number==='MX-101').stockStatus,'low');
    await stock(page,'MX-101',0,2,'Cabinet A / bin 4');
    assert.equal((await rpc('getMills')).find(mill=>mill.number==='MX-101').stockStatus,'out');
    await stock(page,'MX-101',5,2,'Cabinet A / bin 4');
    await stock(page,'MX-102',1,1,'Cabinet B');
    const dashboard=await rpc('getDashboard');
    for(const [key,value]of Object.entries({mills:2,materials:1,settings:1,trackedMills:2,unitsInStock:6,lowStock:1,outOfStock:0}))assert.equal(dashboard[key],value,'Dashboard '+key);
    let first=(await rpc('getMills')).find(mill=>mill.number==='MX-101');
    for(const [quantity,reorder]of [[-1,2],[1.5,2],[1,-1],[1,1.5]])await assert.rejects(rpc('adminSetInventory',auth.token,first.number,quantity,reorder,'Invalid fixture',first.version),/quantity|inventory|whole|integer|stock|reorder|number/i);
    await rpc('adminSetInventory',auth.token,first.number,6,2,first.location,first.version);
    await assert.rejects(rpc('adminSetInventory',auth.token,first.number,99,2,'Stale update',first.version),/chang|stale|refresh|version/i);
    first=(await rpc('getMills')).find(mill=>mill.number==='MX-101');
    await assert.rejects(rpc('adminDeleteMill',auth.token,{number:first.number,version:first.version}),/settings|used|reference/i);
    await assert.rejects(rpc('adminSaveMill',auth.token,{number:'MX-102',name:'Duplicate',type:'End Mill'},null),/exist|duplicate/i);
    await assert.rejects(rpc('adminSaveMill',auth.token,{number:'INVALID',name:'Bad diameter',type:'End Mill',diameter:-.25},null),/diameter|positive/i);
    await rpc('adminSaveMill',auth.token,{...first,number:'MX-201',name:'Renamed production end mill',toolImage:image},{number:first.number,version:first.version});
    assert.equal((await rpc('getMills')).some(mill=>mill.number==='MX-101'),false);
    assert.equal((await rpc('getSettings','MX-201','Aluminum 6061')).feed,35);
    assert.equal((await rpc('getSettings','MX-201','Aluminum 6061')).toolImage,image);
    await assert.rejects(rpc('getSettings','MX-101','Aluminum 6061'),/No settings/i);
    console.log('PASS: stock thresholds, dashboard counts, integer validation, stale-write protection, reference-safe deletion, and mill renaming preserve data.');

    await rpc('adminAddPassword',auth.token,'Workshop mentor','Workshop-Mentor-2026');
    await page.reload();await page.evaluate(()=>window.cncLocal.ready);
    await assert.rejects(rpc('adminListSettings',auth.token),/AUTH_REQUIRED/);
    assert.equal((await rpc('getMills')).find(mill=>mill.number==='MX-201').quantity,6);
    assert.ok((await rpc('adminLogin','admin','Workshop-Mentor-2026')).token);
    await login(page);auth=await rpc('adminLogin','admin','Feds201');
    await navigate(page,'settings');
    const jsonEvent=page.waitForEvent('download');await page.locator('#exportBackup').click();
    const jsonDownload=await jsonEvent,backupPath=path.join(temp,'workspace.json');await jsonDownload.saveAs(backupPath);
    const backup=JSON.parse(fs.readFileSync(backupPath,'utf8'));
    assert.equal(backup.mills.length,2);assert.equal(backup.settings.length,1);assert.equal(backup.materials.length,1);
    const backedMill=backup.mills.find(mill=>mill.number==='MX-201');
    assert.equal(Number(backedMill.diameter),.25);
    for(const [key,value]of Object.entries({name:'Renamed production end mill',flutes:2,quantity:6,reorderLevel:2,location:'Cabinet A / bin 4',toolImage:image}))assert.equal(backedMill[key],value,'Backup mill '+key);
    assert.equal(Number(backup.settings[0].plungeRate),7.5);assert.equal(backup.settings[0].coolantMist,true);
    assert.equal(backup.materials[0].materialImage,materialImage);
    assert.equal(Object.hasOwn(backup,'auth'),false);assert.doesNotMatch(JSON.stringify(backup),/Workshop-Mentor-2026|Workshop mentor/);
    const htmlEvent=page.waitForEvent('download');await page.locator('#downloadPortable').click();
    const htmlDownload=await htmlEvent,portablePath=path.join(temp,'workspace.html');await htmlDownload.saveAs(portablePath);
    const portable=await open(fs.readFileSync(portablePath,'utf8'));
    const portableAuth=await portable.rpc('adminLogin','admin','Feds201');
    const received=await portable.rpc('adminExportBackup',portableAuth.token);
    for(const key of ['mills','materials','settings','rawMaterials'])assert.deepEqual(received[key],backup[key],'Portable '+key);
    assert.equal((await portable.rpc('adminListPasswords',portableAuth.token)).length,1);
    await assert.rejects(portable.rpc('adminLogin','admin','Workshop-Mentor-2026'),/incorrect|invalid/i);
    await rpc('adminImportBackup',auth.token,backup);
    const restored=await rpc('adminExportBackup',auth.token);
    for(const key of ['mills','materials','settings','rawMaterials'])assert.deepEqual(restored[key],backup[key],'JSON roundtrip '+key);
    assert.ok((await rpc('adminLogin','admin','Workshop-Mentor-2026')).token);
    await assert.rejects(rpc('adminImportBackup',auth.token,{...backup,mills:[]}),/mill|reference|exist|unknown/i);
    const afterRejected=await rpc('adminExportBackup',auth.token);
    for(const key of ['mills','materials','settings','rawMaterials'])assert.deepEqual(afterRejected[key],backup[key],'Rejected import preserves '+key);
    console.log('PASS: reload, actual JSON/HTML downloads, fresh-browser HTML reopening, and atomic imports preserve used/unused mills, inventory, photos, and cutting data while keeping passwords private.');

    const legacy=await open();
    const oldSetting={mill:'LEGACY-7',material:'Legacy aluminum',rpm:'9000',feed:'254',depth:'25.4',units:'mm',notes:'Legacy fixture',toolImage:image,materialImage,version:'legacy-version'};
    await legacy.page.evaluate(setting=>{
      const stored=JSON.parse(localStorage.getItem('cnc-tool-database-v1'));
      delete stored.mills;delete stored.materials;delete stored.rawMaterials;stored.settings=[setting];
      localStorage.setItem('cnc-tool-database-v1',JSON.stringify(stored));
    },oldSetting);
    await legacy.page.reload();await legacy.page.evaluate(()=>window.cncLocal.ready);
    const migrated=(await legacy.rpc('getMills'))[0];
    assert.equal(migrated.number,'LEGACY-7');assert.equal(migrated.toolImage,image);assert.equal(migrated.stockStatus,'untracked');assert.equal(Object.hasOwn(migrated,'quantity'),false);
    const migratedSetting=await legacy.rpc('getSettings','LEGACY-7','Legacy aluminum');
    assert.equal(migratedSetting.feed,10);assert.equal(migratedSetting.depth,1);assert.equal(migratedSetting.materialImage,materialImage);
    const legacyAuth=await legacy.rpc('adminLogin','admin','Feds201');
    await legacy.rpc('adminImportBackup',legacyAuth.token,{format:'cnc-local-backup',schemaVersion:1,settings:[{...oldSetting,mill:'LEGACY-8'}]});
    assert.equal((await legacy.rpc('getMills'))[0].number,'LEGACY-8');assert.equal((await legacy.rpc('getMills'))[0].stockStatus,'untracked');
    console.log('PASS: pre-library browser data and old backups derive mills, convert metric cutting data, retain photos, and leave stock untracked.');

    const mobile=await open(fs.readFileSync(portablePath,'utf8'),{width:390,height:844});
    for(const name of pages){
      await mobile.page.locator('#menuToggle').click();await navigate(mobile.page,name);
      assert.equal(await mobile.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,'No document overflow on mobile '+name);
    }
    await mobile.page.locator('#menuToggle').click();await navigate(mobile.page,'settings');
    for(const theme of ['dark','light']){
      await mobile.page.locator('[data-theme-choice="'+theme+'"]').click();
      await mobile.page.waitForFunction(theme=>document.documentElement.dataset.theme===theme,theme);
      await mobile.page.locator('#menuToggle').click();
      assert.equal(await mobile.page.locator('#sidebar').evaluate(sidebar=>sidebar.getBoundingClientRect().left>=-1),true,'The mobile drawer is open');
      await assertChromeTheme(mobile.page,theme);
      await mobile.page.locator('#menuToggle').click();
    }
    await mobile.page.locator('#menuToggle').click();await navigate(mobile.page,'feeds');
    await mobile.page.locator('#mill').selectOption('MX-201');await mobile.page.locator('#material').selectOption('Aluminum 6061');
    await mobile.page.locator('#show').click();await mobile.page.locator('#result').waitFor({state:'visible'});
    assert.match(await mobile.page.locator('#result').innerText(),/7\.5/);
    await mobile.page.waitForFunction(()=>document.getElementById('resultToolImage').naturalWidth>0&&document.getElementById('resultMaterialImage').naturalWidth>0);
    assert.equal(await mobile.page.locator('#resultToolImage').getAttribute('src'),image);
    assert.equal(await mobile.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,'No result overflow on mobile');
    console.log('PASS: all six sidebar tabs and cutting results work at 390 px without document overflow.');
    assert.deepEqual(errors,[],'No uncaught browser errors');assert.deepEqual(unexpectedRequests,[],'Standalone HTML makes no external network requests');
  }finally{
    for(const context of contexts)await context.close();await browser.close();fs.rmSync(temp,{recursive:true,force:true});
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
