const {chromium}=require('playwright'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),vm=require('node:vm');
const {fixture}=require('./shared-fixture.cjs');
(async()=>{
 const root=path.resolve(__dirname,'../..');
 // Deterministic merge regressions exercise the same browser implementation.
 const source=fs.readFileSync(path.join(root,'cnc-local/arcade.js'),'utf8');
 const sandbox={document:{querySelector:()=>({setAttribute(){},addEventListener(){}})},Math:Object.create(Math)};sandbox.Math.random=()=>0;
 vm.runInNewContext(source.replace('})();','globalThis.test={set(v){cells=v;score=0;game="2048";render=()=>{};},move,get(){return {cells,score};}};})();'),sandbox);
 for(const [start,direction,expected,score]of [
  [[2,2,2,2,...Array(12).fill(0)],'left',[4,4,2,0],8],
  [[2,2,4,0,...Array(12).fill(0)],'left',[4,4,2,0],4],
  [[2,2,2,2,...Array(12).fill(0)],'right',[2,0,4,4],8]
 ]){sandbox.test.set(start);sandbox.test.move(direction);assert.deepEqual(Array.from(sandbox.test.get().cells.slice(0,4)),expected);assert.equal(sandbox.test.get().score,score);}
 sandbox.test.set([2,0,0,0,...Array(12).fill(0)]);sandbox.test.move('left');assert.equal(sandbox.test.get().cells.filter(Boolean).length,1,'Invalid moves do not spawn');
 const backend=await fixture(),browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 try {for(const mode of ['local','shared']){
  const context=await browser.newContext({viewport:{width:390,height:844},colorScheme:'light',reducedMotion:'reduce'}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await context.route('**/*',async route=>{const req=route.request(),url=req.url();
   if(url==='http://localhost:31474/')return route.fulfill({contentType:'text/html',body:fs.readFileSync(path.join(root,mode==='local'?'cnc-local/CNC-Tool-Database.html':'cnc-pages/public/index.html'),'utf8')});
   if(url==='http://localhost:31474/config.js')return route.fulfill({contentType:'text/javascript',body:'window.CNC_CONFIG={supabaseUrl:"https://project.supabase.co",publicKey:"test"}'});
   if(url==='https://project.supabase.co/functions/v1/cnc-api'){if(req.method()==='OPTIONS')return route.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'content-type,apikey'}});const{name,args}=req.postDataJSON();return route.fulfill({contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(await backend.call(name,...args))});}return route.abort();});
  await page.goto('http://localhost:31474/');await page.evaluate(()=>cncLocal.ready);
  const logo=page.locator('.brand-mark');for(let i=0;i<4;i++)await logo.click();assert.equal(await page.locator('dialog.arcade').count(),0);await logo.click();await page.locator('dialog.arcade[open]').waitFor();
  assert.equal(await page.locator('#arcadeBoard .arcade-tile').count(),16);assert.equal(await page.locator('#arcadeBoard .arcade-tile').evaluateAll(nodes=>nodes.filter(n=>n.textContent).length),2);
  await page.keyboard.press('ArrowLeft');
  await page.locator('#arcadeBoard').evaluate(board=>{for(const [type,x]of [['touchstart',150],['touchend',50]]){const event=new Event(type);Object.defineProperty(event,'changedTouches',{value:[{clientX:x,clientY:100}]});board.dispatchEvent(event);}});
  assert.match(await page.locator('#arcadeStatus').textContent(),/Score:/);
  assert.ok(await page.locator('dialog.arcade').evaluate(n=>getComputedStyle(n).transitionDuration.split(',').every(v=>parseFloat(v)<=.001)),'Reduced motion honored');
  await page.getByRole('button',{name:'Tic-tac-toe',exact:true}).click();
  for(const i of [0,3,1,4,2])await page.locator('#arcadeBoard button').nth(i).click();assert.match(await page.locator('#arcadeStatus').textContent(),/X wins/);
  await page.getByRole('button',{name:'New game',exact:true}).click();assert.match(await page.locator('#arcadeStatus').textContent(),/X to play/);
  await page.getByRole('button',{name:'Memory',exact:true}).click();await page.locator('#arcadeBoard button').nth(0).click();await page.locator('#arcadeBoard button').nth(1).click();
  await page.getByRole('button',{name:'New game',exact:true}).click();await page.waitForTimeout(850);assert.equal(await page.locator('#arcadeBoard button').filter({hasText:'?'}).count(),16,'New game cancels stale mismatch timers');
  assert.ok(await page.locator('dialog.arcade').evaluate(n=>n.scrollWidth<=n.clientWidth),'Mobile dialog fits');
  await page.keyboard.press('Escape');assert.equal(await page.locator('dialog.arcade').evaluate(n=>n.open),false);assert.equal(await logo.evaluate(n=>n===document.activeElement),true);
  await page.setViewportSize({width:1440,height:1000});
  const search=page.locator('#globalSearch');await search.fill('old search');await page.keyboard.press('Control+k');await page.keyboard.type('new');assert.equal(await search.inputValue(),'new');
  await logo.focus();for(let i=0;i<5;i++)await page.keyboard.press('Enter');await page.locator('dialog.arcade[open]').waitFor();await page.getByRole('button',{name:'Close',exact:true}).click();
  await page.emulateMedia({reducedMotion:'no-preference'});
  for(let i=0;i<5;i++)await logo.click();
  await page.getByRole('button',{name:'2048',exact:true}).click();
  let animated=false;
  for(const key of ['ArrowLeft','ArrowDown','ArrowRight','ArrowUp']){
   await page.keyboard.press(key);
   animated=animated||await page.locator('#arcadeBoard').evaluate(b=>b.getAnimations({subtree:true}).some(a=>a.effect.getTiming().duration>=100));
   await page.waitForTimeout(300);
  }
  assert.equal(animated,true,'Tiles slide using real compositor animations');
  for(const key of ['ArrowLeft','ArrowDown','ArrowRight','ArrowUp','ArrowLeft'])await page.keyboard.press(key);
  await page.getByRole('button',{name:'New game',exact:true}).click();await page.waitForTimeout(650);
  assert.equal(await page.locator('#arcadeBoard .arcade-tile').evaluateAll(nodes=>nodes.filter(n=>n.textContent).length),2,'Reset cancels in-flight animations and queued moves');
  await page.keyboard.press('ArrowRight');await page.getByRole('button',{name:'Memory',exact:true}).click();await page.waitForTimeout(300);
  assert.equal(await page.locator('#arcadeBoard button').count(),16,'Switching games cancels old moves');
  await page.setViewportSize({width:390,height:844});
  await page.getByRole('button',{name:'Solitaire',exact:true}).click();
  assert.equal(await page.locator('.sol-column').count(),7);
  assert.equal(await page.locator('.sol-card:not(.sol-back)').count(),7);
  await page.getByRole('button',{name:'Draw (24)',exact:true}).click();
  assert.equal(await page.getByRole('button',{name:'Draw (23)',exact:true}).count(),1);
  assert.equal(await page.locator('.sol-card:not(.sol-back)').count(),8);
  assert.equal(await page.getByRole('checkbox',{name:'Easy moves'}).isChecked(),true);
  await page.getByRole('button',{name:'Undo',exact:true}).click();
  assert.equal(await page.getByRole('button',{name:'Draw (24)',exact:true}).count(),1,'Undo restores the draw');
  await page.locator('.sol-column .sol-card:not(.sol-back)').first().click();
  assert.match(await page.locator('#arcadeStatus').textContent(),/moved automatically|No automatic move/);
  await page.getByRole('checkbox',{name:'Easy moves'}).uncheck();
  await page.locator('.sol-column .sol-card:not(.sol-back)').first().click();
  assert.match(await page.locator('#arcadeStatus').textContent(),/selected/);
  assert.ok(await page.locator('dialog.arcade').evaluate(n=>n.scrollWidth<=n.clientWidth),'Solitaire fits mobile');
  await page.getByRole('button',{name:'New game',exact:true}).click();
  assert.equal(await page.getByRole('button',{name:'Draw (24)',exact:true}).count(),1);
  assert.deepEqual(errors,[]);await context.close();console.log('PASS: '+mode+' modal, unlock, all games, reset timers, keyboard, mobile and search regression');
 }}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
