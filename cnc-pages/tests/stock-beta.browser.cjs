const{chromium}=require('playwright'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const{fixture}=require('./shared-fixture.cjs');
(async()=>{const root=path.resolve(__dirname,'../..'),backend=await fixture(),browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});try{
 for(const mode of ['local','shared']){
  const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>{errors.push(e.message);console.log('ERROR',e.message);});page.setDefaultTimeout(10000);
  await context.route('**/*',async route=>{const req=route.request(),url=req.url();if(url==='http://localhost:31484/')return route.fulfill({contentType:'text/html',body:fs.readFileSync(path.join(root,mode==='local'?'cnc-local/CNC-Tool-Database.html':'cnc-pages/public/index.html'),'utf8')});if(url==='http://localhost:31484/config.js')return route.fulfill({contentType:'text/javascript',body:'window.CNC_CONFIG={supabaseUrl:"https://project.supabase.co",publicKey:"public-test"}'});if(url==='https://project.supabase.co/functions/v1/cnc-api'){if(req.method()==='OPTIONS')return route.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'content-type,apikey'}});const{name,args}=req.postDataJSON();return route.fulfill({contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(await backend.call(name,...args))});}return route.abort();});






  await page.goto('http://localhost:31484/');await page.waitForFunction(()=>!document.getElementById('loginFields').disabled);
  assert.equal(await page.locator('#betaNav').count(),0);assert.equal(await page.locator('#betaPage').count(),0);await page.evaluate(()=>wsGo('beta'));assert.equal(await page.locator('#pageTitle').textContent(),'Dashboard');
  await page.locator('#toggleView').click();await page.locator('#password').fill('Feds201');await page.locator('#loginForm button').click();await page.locator('#workspace').waitFor({state:'visible'});
  await page.evaluate(async()=>{await rpc('adminSaveMaterial',token,{name:'Beta test'},null);await rpc('adminSaveRawMaterial',token,{material:'Beta test',length:24,width:12,quantity:2},null);await refreshWorkspaceData();});
  await page.locator('#betaNav').click();assert.equal(await page.locator('#betaPage').isVisible(),true);
  await page.locator('#betaDrawing').setInputFiles({name:'outline.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><polygon points="0,0 4,0 4,3 0,3"/></svg>')});await page.waitForFunction(()=>!document.getElementById('betaRecord').disabled);
  await page.locator('#betaX').fill('2');await page.locator('#betaY').fill('2');await page.locator('#betaAngle').fill('90');assert.equal(await page.locator('#betaRecord').isEnabled(),true);
  await page.locator('#betaPlaced').scrollIntoViewIfNeeded();const b=await page.locator('#betaPlaced').boundingBox();await page.mouse.move(b.x+b.width/2,b.y+b.height/2);await page.mouse.down();await page.mouse.move(b.x+b.width/2+20,b.y+b.height/2+10,{steps:5});await page.mouse.up();assert.ok(Number(await page.locator('#betaX').inputValue())>2);
  await page.locator('#betaX').fill('-1');assert.equal(await page.locator('#betaRecord').isDisabled(),true);await page.locator('#betaX').fill('2');
  page.once('dialog',d=>d.accept());await page.locator('#betaRecord').click();await page.waitForFunction(()=>document.getElementById('betaStatus').textContent.startsWith('Cut recorded'));
  const rows=await page.evaluate(()=>rpc('getRawMaterials'));assert.equal(rows.length,2);assert.equal(rows.find(r=>r.cutouts).cutouts.length,1);assert.equal(rows.find(r=>!r.cutouts).quantity,1);
  const backup=await page.evaluate(()=>rpc('adminPortableData',token));assert.equal(backup.rawMaterials.find(r=>r.cutouts).cutouts.length,1);
  await page.evaluate(()=>{let rejected=false;try{betaParse('<svg><path d="M0 0L2 0L2 2Z"/></svg>','svg');}catch(e){rejected=true;}if(!rejected)throw Error('Unsupported SVG accepted');});
  const dxf=['0','SECTION','2','ENTITIES','0','LWPOLYLINE','70','1','10','0','20','0','10','2','20','0','10','2','20','2','10','0','20','2','0','ENDSEC','0','EOF'].join('\n');await page.locator('#betaDrawing').setInputFiles({name:'part.dxf',mimeType:'application/dxf',buffer:Buffer.from(dxf)});await page.waitForFunction(()=>document.getElementById('betaWidth').value==='2');
  await page.evaluate(async()=>{const text='<svg xmlns="http://www.w3.org/2000/svg"><rect width="1" height="2"/></svg>';await rpc('reportSaveCut',{title:'Saved drawing',quantity:1,newDrawings:[{name:'reuse.svg',type:'image/svg+xml',data:btoa(text),size:text.length}]},null,{});await refreshWorkspaceData();});
  await page.locator('#betaExistingDrawing').selectOption({label:'reuse.svg'});await page.waitForFunction(()=>document.getElementById('betaWidth').value==='1');assert.equal(await page.locator('#betaDrawing').inputValue(),'');
  await page.locator('.nav-button[data-page=settings]').click();const dl=page.waitForEvent('download');await page.locator('#downloadPortable').click();const download=await dl,html=fs.readFileSync(await download.path(),'utf8');
  const offline=await browser.newContext();await offline.route('**/*',r=>r.fulfill({contentType:'text/html',body:html}));const copy=await offline.newPage();await copy.goto('http://localhost:31484/');await copy.waitForFunction(()=>!document.getElementById('loginFields').disabled);assert.equal(await copy.locator('#betaNav').count(),0);const offlineRows=await copy.evaluate(()=>rpc('getRawMaterials'));assert.equal(offlineRows.find(r=>r.cutouts).cutouts.length,1);await offline.close();
  await page.locator('#betaNav').click();
  await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);await page.setViewportSize({width:1440,height:1000});
  await page.evaluate(async()=>{await rpc('adminLogout',token);token='';wsAuthChanged();});assert.equal(await page.locator('#betaNav').count(),0);assert.equal(await page.locator('#betaPage').count(),0);assert.equal(await page.locator('#pageTitle').textContent(),'Dashboard');assert.deepEqual(errors,[]);await context.close();
 }
 console.log('PASS: admin-only beta DOM, SVG/DXF import, drag/rotate, bounds rejection, stock split, portable geometry, mobile fit and logout');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
