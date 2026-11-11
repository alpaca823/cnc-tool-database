const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {fixture}=require('./shared-fixture.cjs');
(async()=>{
 const root=path.resolve(__dirname,'../..'),html=fs.readFileSync(path.join(root,'cnc-pages/public/index.html'),'utf8'),backend=await fixture();
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 const errors=[],requests=[];
 try{
  async function open(configured=true){
   const context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});
   await context.route('**/*',async route=>{
    const req=route.request(),url=req.url();
    if(url==='http://localhost:31470/')return route.fulfill({contentType:'text/html',body:html});
    if(url==='http://localhost:31470/config.js')return route.fulfill({contentType:'text/javascript',body:'window.CNC_CONFIG='+JSON.stringify(configured?{supabaseUrl:'https://project.supabase.co',publicKey:'public-test'}:{})});
    if(url==='https://project.supabase.co/functions/v1/cnc-api'){
     if(req.method()==='OPTIONS')return route.fulfill({status:204,headers:{'access-control-allow-origin':'http://localhost:31470','access-control-allow-headers':'content-type,apikey','access-control-allow-methods':'POST,OPTIONS'}});
     const {name,args}=req.postDataJSON();requests.push(name);const result=await backend.call(name,...args);
     return route.fulfill({contentType:'application/json',headers:{'access-control-allow-origin':'http://localhost:31470'},body:JSON.stringify(result)});
    }
    return route.abort();
   });
   const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto('http://localhost:31470/');return page;
  }
  const page=await open();await page.evaluate(()=>cncLocal.ready);
  assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');
  assert.equal(await page.locator('#mentorNotice').isVisible(),true);
  for(const name of ['dashboard','mills','inventory','materials','cuts','notes','settings']){
   await page.locator('.nav-button[data-page='+name+']').click();
   assert.equal(await page.locator('#mentorNotice').isVisible(),false);
  }
  await page.locator('[data-theme-choice=light]').click();
  await page.reload();await page.evaluate(()=>cncLocal.ready);
  assert.equal(await page.locator('html').getAttribute('data-theme'),'light','Saved preference survives reload');
  await page.waitForFunction(()=>!document.getElementById('loginFields').disabled);
  assert.equal(await page.evaluate(()=>cncLocal.kind),'shared');assert.equal(await page.locator('.nav-button').count(),8);
  await page.locator('#toggleView').click();await page.locator('#password').fill('Feds201');await page.locator('#loginForm button').click();await page.locator('#workspace').waitFor({state:'visible'});
  await page.waitForFunction(()=>!document.getElementById('materialFields').disabled);
  await page.locator('.nav-button[data-page=materials]').click();await page.locator('#manageMaterials').click();await page.locator('#materialName').fill('Shared aluminum');await page.locator('#saveMaterial').click();
  await page.waitForFunction(()=>document.getElementById('adminStatus').textContent.includes('Material saved'));
  const reader=await open();await reader.waitForFunction(()=>!document.getElementById('loginFields').disabled);
  await reader.locator('.nav-button[data-page=materials]').click();await reader.getByRole('heading',{name:'Shared aluminum',exact:true}).first().waitFor();
  assert.equal(await reader.locator('#manageMaterials').isVisible(),false);assert.equal(await reader.evaluate(()=>localStorage.getItem('cnc-tool-database-v1')),null);
  assert.ok(requests.includes('getWorkspaceData'));assert.ok(!requests.includes('getMills'),'Workspace loads in one bulk request');
  const missing=await open(false);await missing.locator('#status').filter({hasText:'has not been connected'}).waitFor();
  assert.equal(await missing.locator('#loginFields').evaluate(e=>e.disabled),true);
  assert.deepEqual(errors,[]);
  console.log('PASS: exact Pages build connects to shared server, admin edits appear in another browser, public role stays read-only, workspace uses one bulk request, and unconfigured setup is clear.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
