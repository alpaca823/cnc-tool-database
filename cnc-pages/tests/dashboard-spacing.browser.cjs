const{chromium}=require('playwright'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const{fixture}=require('./shared-fixture.cjs');
(async()=>{const root=path.resolve(__dirname,'../..'),backend=await fixture(),browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});try{
 for(const mode of ['local','shared']){
  const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await context.route('**/*',async route=>{const req=route.request(),url=req.url();if(url==='http://localhost:31487/')return route.fulfill({contentType:'text/html',body:fs.readFileSync(path.join(root,mode==='local'?'cnc-local/CNC-Tool-Database.html':'cnc-pages/public/index.html'),'utf8')});if(url==='http://localhost:31487/config.js')return route.fulfill({contentType:'text/javascript',body:'window.CNC_CONFIG={supabaseUrl:"https://project.supabase.co",publicKey:"public-test"}'});if(url==='https://project.supabase.co/functions/v1/cnc-api'){if(req.method()==='OPTIONS')return route.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'content-type,apikey'}});const{name,args}=req.postDataJSON();return route.fulfill({contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(await backend.call(name,...args))});}return route.abort();});






  await page.goto('http://localhost:31487/');await page.waitForFunction(()=>!document.getElementById('loginFields').disabled);assert.equal(await page.locator('.workspace-view[data-page=dashboard]').isVisible(),true);assert.equal(await page.locator('#pageTitle').textContent(),'Dashboard');assert.equal(await page.locator('.nav-button[aria-current=page]').getAttribute('data-page'),'dashboard');assert.equal(await page.locator('#mentorNotice').isVisible(),false);
  await page.evaluate(async()=>{const{token}=await cncLocal.call('adminLogin','admin','Feds201');await cncLocal.call('adminSaveMill',token,{number:'SPACING',name:'Dashboard mill',quantity:0,reorderLevel:1},null);await cncLocal.call('adminSaveCut',token,{title:'Dashboard cut with a long name to exercise wrapping',quantity:2,priority:'high'},null);});
  for(const alerts of [true,false]){
   await page.setViewportSize({width:1440,height:1200});
   if(!alerts)await page.evaluate(async()=>{const{token}=await cncLocal.call('adminLogin','admin','Feds201'),mill=(await cncLocal.call('getMills'))[0];await cncLocal.call('adminSetInventory',token,mill.number,5,1,'',mill.version);});
   await page.reload();await page.waitForFunction(()=>!document.getElementById('loginFields').disabled);await page.locator('.nav-button[data-page=dashboard]').click();await page.locator('#dashboardCuts .dashboard-cut').waitFor();
   for(const width of [2048,1440,1024,768,390])for(const theme of ['dark','light']){
    await page.setViewportSize({width,height:1200});await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
    const bounds=await page.locator('[data-page=dashboard].workspace-view').evaluate(panel=>{
     const rect=node=>{const r=node.getBoundingClientRect();return {top:r.top,bottom:r.bottom};};return {stats:rect(panel.querySelector('#dashboardStats')),middle:rect(panel.querySelector('.admin-layout')),alerts:rect(panel.querySelector('.admin-layout > .card')),cuts:rect(panel.querySelector('#dashboardCuts').closest('.card'))};
    });assert.ok(bounds.middle.top-bounds.stats.bottom>=16,'Stats have a visible gap');assert.ok(bounds.cuts.top-bounds.middle.bottom>=16,'Cut List clears both preceding cards');assert.ok(bounds.cuts.top-bounds.alerts.bottom>=16,'Inventory alerts do not touch Cut List');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
   }
  }
  if(mode==='local'){await page.setViewportSize({width:1440,height:1200});await page.evaluate(()=>document.documentElement.dataset.theme='dark');await page.screenshot({path:'/tmp/cnc-dashboard-spacing.png'});}
  await page.setViewportSize({width:1440,height:1200});await page.locator('.nav-button[data-page=feeds]').click();assert.equal(await page.locator('#mentorNotice').isVisible(),true);await page.reload();await page.waitForFunction(()=>!document.getElementById('loginFields').disabled);assert.equal(await page.locator('.workspace-view[data-page=dashboard]').isVisible(),true);await page.locator('.nav-button[data-page=materials]').click();assert.equal(await page.locator('[data-page=dashboard].workspace-view').isVisible(),false);assert.deepEqual(errors,[]);await context.close();
 }
 console.log('PASS: local/shared Dashboard card separation at five widths, both themes, alerts/empty states, and hidden-tab behavior');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
