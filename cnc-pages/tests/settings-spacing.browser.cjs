const{chromium}=require('playwright'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const{fixture}=require('./shared-fixture.cjs');
(async()=>{const root=path.resolve(__dirname,'../..'),backend=await fixture(),browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});try{
 for(const mode of ['local','shared']){
  const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await context.route('**/*',async route=>{const req=route.request(),url=req.url();if(url==='http://localhost:31488/')return route.fulfill({contentType:'text/html',body:fs.readFileSync(path.join(root,mode==='local'?'cnc-local/CNC-Tool-Database.html':'cnc-pages/public/index.html'),'utf8')});if(url==='http://localhost:31488/config.js')return route.fulfill({contentType:'text/javascript',body:'window.CNC_CONFIG={supabaseUrl:"https://project.supabase.co",publicKey:"public-test"}'});if(url==='https://project.supabase.co/functions/v1/cnc-api'){if(req.method()==='OPTIONS')return route.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'content-type,apikey'}});const{name,args}=req.postDataJSON();return route.fulfill({contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(await backend.call(name,...args))});}return route.abort();});







  await page.goto('http://localhost:31488/');await page.waitForFunction(()=>!document.getElementById('loginFields').disabled);assert.equal(await page.locator('.workspace-view[data-page=dashboard]').isVisible(),true);await page.locator('.nav-button[data-page=settings]').click();
  for(const admin of [false,true]){
   if(admin){await page.locator('#toggleView').click();await page.locator('#password').fill('Feds201');await page.locator('#loginForm button').click();await page.locator('#workspace').waitFor({state:'visible'});await page.waitForFunction(()=>!document.getElementById('materialFields').disabled);}
   for(const width of [2048,1440,1024,768,390])for(const theme of ['dark','light']){
    await page.setViewportSize({width,height:1200});await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
    const gaps=await page.locator('#settingsHome').evaluate(home=>{
     const check=parent=>{const children=Array.from(parent.children).filter(n=>n.getClientRects().length&&getComputedStyle(n).display!=='none');return children.slice(1).map((node,index)=>node.getBoundingClientRect().top-children[index].getBoundingClientRect().bottom);};return [...check(home),...Array.from(home.querySelectorAll(':scope > div.admin-only')).filter(n=>n.getClientRects().length).flatMap(check)];
    });assert.ok(gaps.length>=3);assert.ok(gaps.every(gap=>gap>=16),'Settings cards have a clear gap: '+gaps.join(','));assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
   }
   await page.setViewportSize({width:1440,height:1200});await page.locator('#openWhatsNew').click();assert.equal(await page.locator('#settingsHome').isVisible(),false);assert.equal(await page.locator('#whatsNewPage').isVisible(),true);await page.locator('#backFromWhatsNew').click();assert.equal(await page.locator('#settingsHome').isVisible(),true);
  }
  await page.reload();await page.waitForFunction(()=>!document.getElementById('loginFields').disabled);assert.equal(await page.locator('.workspace-view[data-page=dashboard]').isVisible(),true);assert.equal(await page.locator('#mentorNotice').isVisible(),false);assert.deepEqual(errors,[]);await context.close();
 }
 console.log('PASS: local/shared Settings spacing for public/admin cards at five widths in both themes; release-page navigation and Dashboard home preserved');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
