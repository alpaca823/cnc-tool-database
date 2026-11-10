// Regression checks for an absent database backend and supported startup failures.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
(async()=>{
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  async function open(html,init) {
    const context=await browser.newContext();
    if(init) await context.addInitScript(init);
    await context.route('http://localhost:31460/startup.html',r=>r.fulfill({contentType:'text/html',body:html}));
    const page=await context.newPage();
    const errors=[]; page.on('pageerror',error=>errors.push(error.message));
    await page.goto('http://localhost:31460/startup.html');
    return {context,page,errors};
  }
  const built=fs.readFileSync(path.join(root,'CNC-Tool-Database.html'),'utf8');
  try {
    let instance=await open(built);
    await instance.page.waitForFunction(()=>!document.getElementById('loginFields').disabled);
    await instance.page.locator('#toggleView').click();
    await instance.page.locator('#password').fill('admin');
    await instance.page.locator('#loginForm button').click();
    await instance.page.locator('#workspace').waitFor({state:'visible'});
    assert.deepEqual(instance.errors,[]);
    await instance.context.close();
    console.log('PASS: complete downloadable HTML starts and accepts admin/admin.');

    instance=await open(fs.readFileSync(path.join(root,'app-shell.html'),'utf8'));
    await instance.page.waitForFunction(()=>document.getElementById('status').textContent.includes('complete CNC-Tool-Database.html'));
    await instance.page.locator('#toggleView').click();
    assert.match(await instance.page.locator('#loginStatus').textContent(),/extract it first/);
    assert.equal(await instance.page.locator('#loginForm button').isDisabled(),true);
    assert.doesNotMatch(await instance.page.locator('#loginStatus').textContent(),/Cannot read properties/);
    assert.deepEqual(instance.errors,[]);
    await instance.context.close();
    console.log('PASS: missing backend gives file recovery instructions and prevents a broken login call.');

    instance=await open(built,()=>Object.defineProperty(window,'crypto',{value:undefined,configurable:true}));
    await instance.page.waitForFunction(()=>document.getElementById('loginStatus').textContent.includes('browser does not support'));
    assert.equal(await instance.page.locator('#loginForm button').isDisabled(),true);
    assert.deepEqual(instance.errors,[]);
    await instance.context.close();
    console.log('PASS: unsupported password APIs are reported at startup without an undefined call.');

    instance=await open(built,()=>Object.defineProperty(window,'localStorage',{get(){throw new Error('blocked');},configurable:true}));
    await instance.page.waitForFunction(()=>document.getElementById('loginStatus').textContent.includes('Browser storage is unavailable'));
    assert.equal(await instance.page.locator('#loginForm button').isDisabled(),true);
    assert.deepEqual(instance.errors,[]);
    await instance.context.close();
    console.log('PASS: blocked browser storage reports its actual failure without an undefined call.');
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
