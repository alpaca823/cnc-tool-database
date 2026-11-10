const {chromium}=require('playwright'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const root=path.resolve(__dirname,'../..'),version=fs.readFileSync(path.join(root,'cnc-local/VERSION'),'utf8').trim();
 const html=fs.readFileSync(path.join(root,'CNC-Scripts-Copy-Helper-v'+version+'.html'),'utf8');
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 try{
  const context=await browser.newContext({permissions:['clipboard-read','clipboard-write']});
  const errors=[],requests=[];
  await context.route(/^https?:/,route=>{if(route.request().url()==='http://localhost:31468/copy')return route.fulfill({contentType:'text/html',body:html});requests.push(route.request().url());return route.abort();});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto('http://localhost:31468/copy');
  assert.equal(await page.locator('.copy').count(),3);
  for(const name of ['Code.gs','Index.html','appsscript.json']){
   const card=page.locator('.card').filter({has:page.locator('textarea[aria-label="'+name+' contents"]')});
   await card.locator('button').click();await card.locator('.status').filter({hasText:'Copied'}).waitFor();
   assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),fs.readFileSync(path.join(root,'cnc-scripts',name),'utf8'),'Clipboard exact '+name);
  }
  await page.evaluate(()=>{Object.defineProperty(navigator,'clipboard',{value:{writeText:async()=>{throw new Error('Denied');}}});document.execCommand=()=>false;});
  const first=page.locator('.card').first();await first.locator('button').click();await first.locator('.status').filter({hasText:'code is selected'}).waitFor();
  assert.equal(await first.locator('details').evaluate(e=>e.open),true);
  assert.equal(await first.locator('textarea').evaluate(e=>e.selectionEnd-e.selectionStart),fs.readFileSync(path.join(root,'cnc-scripts/Code.gs'),'utf8').length);
  await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
  assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);
  console.log('PASS: all three buttons copy the exact generated files to the real clipboard; denied clipboard selects complete text; mobile fits; no external requests.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
