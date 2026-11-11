const{chromium}=require('playwright'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const{fixture}=require('./shared-fixture.cjs');
(async()=>{const root=path.resolve(__dirname,'../..'),backend=await fixture(),browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});try{
 for(const mode of ['local','shared']){
  const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await context.route('**/*',async route=>{const req=route.request(),url=req.url();if(url==='http://localhost:31473/')return route.fulfill({contentType:'text/html',body:fs.readFileSync(path.join(root,mode==='local'?'cnc-local/CNC-Tool-Database.html':'cnc-pages/public/index.html'),'utf8')});if(url==='http://localhost:31473/config.js')return route.fulfill({contentType:'text/javascript',body:'window.CNC_CONFIG={supabaseUrl:"https://project.supabase.co",publicKey:"public-test"}'});if(url==='https://project.supabase.co/functions/v1/cnc-api'){if(req.method()==='OPTIONS')return route.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'content-type,apikey'}});const{name,args}=req.postDataJSON();return route.fulfill({contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(await backend.call(name,...args))});}return route.abort();});


  await page.goto('http://localhost:31473/');await page.waitForFunction(()=>!document.getElementById('loginFields').disabled);
  await page.evaluate(async()=>{const{token}=await cncLocal.call('adminLogin','admin','Feds201');await cncLocal.call('adminSaveMill',token,{number:'ROW-A',name:'Roughing mill',type:'Rougher',diameter:'.25',notes:'First tool'},null);await cncLocal.call('adminSaveMill',token,{number:'ROW-B',name:'Finishing mill',type:'Finisher',diameter:'.125',notes:'Second tool',purchaseUrl:'https://supplier.example/finish'},null);});
  await page.reload();await page.waitForFunction(()=>!document.getElementById('loginFields').disabled);await page.locator('.nav-button[data-page=mills]').click();
  const rowA=page.locator('#millListBody tr').filter({hasText:'ROW-A'}),rowB=page.locator('#millListBody tr').filter({hasText:'ROW-B'});
  await rowB.locator('td').nth(2).click();assert.equal(await page.locator('#millDetails h2').textContent(),'Finishing mill');assert.match(await page.locator('#millDetails').textContent(),/Second tool/);assert.equal(await page.locator('#millDetails .purchase-link').getAttribute('href'),'https://supplier.example/finish');
  await rowA.locator('td small').click();assert.equal(await page.locator('#millDetails h2').textContent(),'Roughing mill');
  await rowB.locator('button.table-link').focus();await page.keyboard.press('Enter');assert.equal(await page.locator('#millDetails h2').textContent(),'Finishing mill');
  await page.locator('#globalSearch').fill('ROW-A');assert.equal(await page.locator('#millDetails h2').textContent(),'Roughing mill');await page.locator('#globalSearch').fill('no matches');assert.match(await page.locator('#millDetails').textContent(),/Select a mill/);await page.locator('#globalSearch').fill('');
  await page.setViewportSize({width:390,height:844});await rowB.locator('td').first().click({position:{x:10,y:10}});assert.equal(await page.locator('#millDetails h2').textContent(),'Finishing mill');assert.equal(await page.locator('#millListBody tr[aria-selected=true]').count(),1);assert.deepEqual(errors,[]);await context.close();
 }
 console.log('PASS: local/shared mill row, number, keyboard and mobile selection update details; search cannot leave stale details');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
