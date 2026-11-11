const{chromium}=require('playwright'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const{fixture}=require('./shared-fixture.cjs');
(async()=>{const root=path.resolve(__dirname,'../..'),backend=await fixture(),browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});try{
 for(const mode of ['local','shared']){
  const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));let tracking=0;
  await context.route('**/*',async route=>{const req=route.request(),url=req.url();if(url==='http://localhost:31480/')return route.fulfill({contentType:'text/html',body:fs.readFileSync(path.join(root,mode==='local'?'cnc-local/CNC-Tool-Database.html':'cnc-pages/public/index.html'),'utf8')});if(url==='http://localhost:31480/config.js')return route.fulfill({contentType:'text/javascript',body:'window.CNC_CONFIG={supabaseUrl:"https://project.supabase.co",publicKey:"public-test"}'});if(url==='https://project.supabase.co/functions/v1/cnc-api'){if(req.method()==='OPTIONS')return route.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'content-type,apikey'}});const{name,args}=req.postDataJSON();if(name==='trackVisit')tracking++;return route.fulfill({contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(await backend.call(name,...args))});}return route.abort();});






  await page.goto('http://localhost:31480/');await page.waitForFunction(()=>!document.getElementById('loginFields').disabled);
  await page.locator('.nav-button[data-page=settings]').click();
  if(mode==='local'){assert.equal(tracking,0);assert.equal(await page.locator('#visitorStats').isVisible(),false);assert.match(await page.locator('#visitorStatus').textContent(),/Offline use is not counted/);}
  else {
    await page.waitForFunction(()=>document.getElementById('visitorTotal').textContent==='1');assert.equal(await page.locator('#visitorCounter').isVisible(),true);assert.equal(await page.locator('#workspace').isVisible(),false);assert.equal(tracking,1);
    await page.locator('#refreshVisitorStats').click();await page.waitForFunction(()=>!document.getElementById('refreshVisitorStats').disabled);assert.equal(tracking,1);assert.equal(await page.locator('#visitorTotal').textContent(),'1');
    await page.locator('.nav-button[data-page=mills]').click();await page.locator('.nav-button[data-page=settings]').click();await page.waitForFunction(()=>!document.getElementById('refreshVisitorStats').disabled);assert.equal(tracking,1);
    await page.reload();await page.waitForFunction(()=>!document.getElementById('loginFields').disabled);await page.locator('.nav-button[data-page=settings]').click();await page.waitForFunction(()=>document.getElementById('visitorTotal').textContent==='1');assert.equal(tracking,2,'Reload reuses the same anonymous token and is deduplicated on the server');
    await page.emulateMedia({colorScheme:'light'});await page.locator('[data-theme-choice=light]').click();assert.equal(await page.locator('#visitorCounter').isVisible(),true);
  }
  await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);assert.deepEqual(errors,[]);await context.close();
 }
 // A pending counter request must not hold up the inventory request queue.
 const context=await browser.newContext(),page=await context.newPage();let release;const blocked=new Promise(resolve=>release=resolve);
 await context.route('**/*',async route=>{const req=route.request(),url=req.url();if(url==='http://localhost:31481/')return route.fulfill({contentType:'text/html',body:fs.readFileSync(path.join(root,'cnc-pages/public/index.html'),'utf8')});if(url.endsWith('/config.js'))return route.fulfill({contentType:'text/javascript',body:'window.CNC_CONFIG={supabaseUrl:"https://project.supabase.co",publicKey:"test"}'});if(url==='https://project.supabase.co/functions/v1/cnc-api'){if(req.method()==='OPTIONS')return route.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'content-type,apikey'}});const{name,args}=req.postDataJSON();if(name==='trackVisit'){await blocked;return route.fulfill({contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({ok:false,error:'Counter offline'})});}return route.fulfill({contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(await backend.call(name,...args))});}return route.abort();});
 await page.goto('http://localhost:31481/');await page.waitForFunction(()=>!document.getElementById('loginFields').disabled);await page.locator('.nav-button[data-page=inventory]').click();assert.equal(await page.locator('.workspace-view[data-page=inventory]').isVisible(),true);release();await page.waitForFunction(()=>document.getElementById('visitorStatus').textContent.includes('unavailable'));assert.equal(await page.locator('.workspace-view[data-page=inventory]').isVisible(),true);await context.close();
 console.log('PASS: public Settings totals, page-load counting, refresh deduplication, offline exclusion, theme/mobile fit and isolated counter failure');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
