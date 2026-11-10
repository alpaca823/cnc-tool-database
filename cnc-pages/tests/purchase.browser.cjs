const{chromium}=require('playwright'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const{fixture}=require('./shared-fixture.cjs');
(async()=>{const root=path.resolve(__dirname,'../..'),backend=await fixture(),browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});try{
 for(const mode of ['local','shared']){
  const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await context.route('**/*',async route=>{const req=route.request(),url=req.url();if(url==='http://localhost:31472/')return route.fulfill({contentType:'text/html',body:fs.readFileSync(path.join(root,mode==='local'?'cnc-local/CNC-Tool-Database.html':'cnc-pages/public/index.html'),'utf8')});if(url==='http://localhost:31472/config.js')return route.fulfill({contentType:'text/javascript',body:'window.CNC_CONFIG={supabaseUrl:"https://project.supabase.co",publicKey:"public-test"}'});if(url==='https://project.supabase.co/functions/v1/cnc-api'){if(req.method()==='OPTIONS')return route.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'content-type,apikey'}});const{name,args}=req.postDataJSON();return route.fulfill({contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(await backend.call(name,...args))});}return route.abort();});
  await page.goto('http://localhost:31472/');await page.waitForFunction(()=>!document.getElementById('loginFields').disabled);await page.locator('#toggleView').click();await page.locator('#password').fill('Feds201');await page.locator('#loginForm button').click();await page.locator('#workspace').waitFor({state:'visible'});await page.waitForFunction(()=>!document.getElementById('millFields').disabled);
  await page.locator('.nav-button[data-page=mills]').click();await page.locator('#addMill').click();await page.locator('#millNumber').fill('PURCHASE-'+mode);await page.locator('#millPurchaseUrl').fill('https://supplier.example/exact-mill');await page.locator('#saveMill').click();await page.waitForFunction(()=>document.getElementById('millEditor').hidden);
  await page.locator('#millDetails .purchase-link').waitFor();assert.equal(await page.locator('#millDetails .purchase-link').getAttribute('href'),'https://supplier.example/exact-mill');assert.equal(await page.locator('#millDetails .purchase-link').getAttribute('rel'),'noopener noreferrer');
  await page.evaluate(async()=>{const{token}=await cncLocal.call('adminLogin','admin','Feds201');const m=(await cncLocal.call('getMills'))[0];await cncLocal.call('adminSetInventory',token,m.number,1,2,'Rack',m.version);});
  await page.reload();await page.waitForFunction(()=>!document.getElementById('loginFields').disabled);await page.locator('.nav-button[data-page=dashboard]').click();await page.locator('#dashboardStock .purchase-link').waitFor();
  await page.locator('.nav-button[data-page=inventory]').click();await page.locator('#inventoryListBody .purchase-link').waitFor();assert.equal(await page.locator('#inventoryListBody .purchase-link').getAttribute('target'),'_blank');
  assert.equal(await page.locator('#inventoryLocation').count(),0);
  assert.doesNotMatch(await page.locator('#pageDescription').textContent(),/location/i);
  assert.doesNotMatch(await page.locator('#globalSearch').getAttribute('placeholder'),/location/i);
  assert.equal(await page.locator('[data-page=inventory] th').filter({hasText:/location/i}).count(),0);
  await page.locator('#toggleView').click();await page.locator('#password').fill('Feds201');await page.locator('#loginForm button').click();await page.locator('#workspace').waitFor({state:'visible'});
  await page.locator('#inventoryListBody button').filter({hasText:'Update stock'}).first().click();await page.locator('#inventoryQuantity').fill('2');await page.locator('#saveInventory').click();
  await page.waitForFunction(()=>document.getElementById('inventoryStatus').textContent==='Inventory saved.');
  assert.equal(await page.evaluate(async()=>(await cncLocal.call('getMills'))[0].location),'Rack','Editing counts preserves existing location');
  await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);assert.deepEqual(errors,[]);await context.close();
 }
 console.log('PASS: local/shared purchase-link editor, persisted details, public low-inventory dashboard/table buttons, safe new tabs, and mobile layout.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
