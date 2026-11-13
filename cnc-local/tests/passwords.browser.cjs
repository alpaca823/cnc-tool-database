// Exercise the built standalone file on an intercepted loopback origin. No server is required.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const target=path.join(root,'CNC-Tool-Database.html');
const origin='http://localhost:31460/passwords.html';
const storeKey='cnc-tool-database-v1';
const firstPassword='Mentor-Lathe-28';
const secondPassword='Supervisor-Mill-74';
const replacementPassword='Mentor-Lathe-92';

(async()=>{
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'cnc-passwords-'));
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  const contexts=[],errors=[],unexpectedRequests=[];
  async function open(html=fs.readFileSync(target,'utf8')) {
    const context=await browser.newContext({viewport:{width:1100,height:1100},acceptDownloads:true});contexts.push(context);
    await context.route(/^https?:/,route=>{
      if(route.request().url()===origin)return route.fulfill({contentType:'text/html',body:html});
      unexpectedRequests.push(route.request().url());return route.abort();
    });
    const page=await context.newPage();page.setDefaultTimeout(20000);page.on('pageerror',error=>errors.push(error.message));
    page.on('dialog',dialog=>dialog.accept());
    await page.goto(origin);await page.evaluate(()=>window.cncLocal.ready);
    return page;
  }
  const rpc=(page,name,...args)=>page.evaluate(({name,args})=>window.cncLocal.call(name,...args),{name,args});
  const idle=page=>page.waitForFunction(()=>!document.getElementById('passwordFields').disabled && !document.getElementById('settingFields').disabled && !document.getElementById('materialFields').disabled);
  const passwordCard=(page,label)=>page.locator('#passwordList article').filter({has:page.getByText(label,{exact:true})});
  const go=(page,name)=>page.locator('.nav-button[data-page="'+name+'"]').click();
  async function loginUI(page,password='Feds201') {
    if(await page.locator('#workspace').isHidden() && await page.locator('#adminPanel').isHidden())await page.locator('#toggleView').click();
    if(await page.locator('#workspace').isHidden()){
      await page.locator('#username').fill('admin');await page.locator('#password').fill(password);
      await page.locator('#loginForm button').click();await page.locator('#workspace').waitFor({state:'visible'});
    }
    await idle(page); await go(page,'settings');
  }
  async function waitPassword(page,label,present=true) {
    await page.waitForFunction(({label,present})=>[...document.querySelectorAll('#passwordList article')].some(article=>[...article.querySelectorAll('*')].some(element=>element.textContent===label))===present,{label,present});
    await idle(page);
  }
  async function addPasswordUI(page,label,password) {
    await page.locator('#passwordLabel').fill(label);await page.locator('#newPassword').fill(password);
    await page.locator('#confirmPassword').fill(password);await page.locator('#savePassword').click();
    await waitPassword(page,label);
  }
  function assertSafeList(rows) {
    for(const row of rows)assert.deepEqual(Object.keys(row).sort(),['id','isDefault','label']);
    assert.equal(rows.filter(row=>row.isDefault).length,1);
    assert.deepEqual(rows.find(row=>row.isDefault),{id:'default-admin',label:'Default fallback',isDefault:true});
  }
  async function seedLegacy(page,password) {
    await page.evaluate(async({storeKey,password})=>{
      const saltBytes=crypto.getRandomValues(new Uint8Array(24));
      const hex=bytes=>Array.from(new Uint8Array(bytes),byte=>byte.toString(16).padStart(2,'0')).join('');
      const material=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);
      const hash=hex(await crypto.subtle.deriveBits({name:'PBKDF2',salt:saltBytes,iterations:210000,hash:'SHA-256'},material,256));
      const state=JSON.parse(localStorage.getItem(storeKey));
      state.auth={salt:hex(saltBytes),hash,version:'legacy-password-fixture',iterations:210000};
      localStorage.setItem(storeKey,JSON.stringify(state));
    },{storeKey,password});
    await page.reload();await page.evaluate(()=>window.cncLocal.ready);
  }
  try {
    const page=await open();
    assert.equal((await page.locator('#appVersion').textContent()).trim(),'Version 1.14.27 · CNC Tool Database');
    assert.equal(await page.locator('#mentorNotice').isVisible(),false);
    assert.match(await page.locator('#mentorNotice').textContent(),/mentor must be present/i);
    await loginUI(page);
    await page.locator('#passwordDetails summary').click();
    assert.equal((await page.locator('#passwordDetails summary').textContent()).trim(),'Admin passwords');
    const fallback=await rpc(page,'adminLogin','admin','Feds201');
    assertSafeList(await rpc(page,'adminListPasswords',fallback.token));
    assert.equal((await rpc(page,'adminListPasswords',fallback.token)).length,1);
    await waitPassword(page,'Default fallback');
    assert.equal(await passwordCard(page,'Default fallback').getByRole('button',{name:/^(Edit|Remove)$/}).count(),0);

    await page.locator('#passwordLabel').fill('Shop mentor');await page.locator('#newPassword').fill(firstPassword);
    await page.locator('#confirmPassword').fill(secondPassword);await page.locator('#savePassword').click();
    await page.waitForFunction(()=>/match/i.test(document.getElementById('adminStatus').textContent));
    assert.equal((await rpc(page,'adminListPasswords',fallback.token)).length,1);
    await addPasswordUI(page,'Shop mentor',firstPassword);
    assert.equal(await page.locator('#workspace').isVisible(),true);
    await addPasswordUI(page,'Supervisor',secondPassword);
    let rows=await rpc(page,'adminListPasswords',fallback.token);assertSafeList(rows);assert.equal(rows.length,3);
    const first=rows.find(row=>row.label==='Shop mentor'),second=rows.find(row=>row.label==='Supervisor');
    assert.ok(first && second);assert.notEqual(first.id,second.id);
    const firstSession=await rpc(page,'adminLogin','admin',firstPassword);
    const secondSession=await rpc(page,'adminLogin','admin',secondPassword);
    assert.equal((await rpc(page,'adminListPasswords',firstSession.token)).length,3);
    assert.equal((await rpc(page,'adminListPasswords',secondSession.token)).length,3);
    await assert.rejects(rpc(page,'adminLogin','admin','Incorrect-password-99'),/incorrect|password/i);
    await assert.rejects(rpc(page,'adminLogin','mentor',firstPassword),/incorrect|username|password/i);
    console.log('PASS: Version 1.14.27, mentor notice, immutable fallback display, mismatch feedback, and two additional working admin passwords.');

    for(const malformed of [null,{},[],5,'forged-token']){
      await assert.rejects(rpc(page,'adminListPasswords',malformed),/AUTH_REQUIRED/);
      await assert.rejects(rpc(page,'adminAddPassword',malformed,'Unauthorized','Unauthorized-99'),/AUTH_REQUIRED/);
      await assert.rejects(rpc(page,'adminUpdatePassword',malformed,first.id,'Unauthorized','Unauthorized-99'),/AUTH_REQUIRED/);
      await assert.rejects(rpc(page,'adminDeletePassword',malformed,first.id),/AUTH_REQUIRED/);
    }
    for(const label of ['', '   ', 'x'.repeat(81), null, {}, 'shop MENTOR', 'Default fallback']){
      await assert.rejects(rpc(page,'adminAddPassword',fallback.token,label,'Another-valid-pass-99'),/label|name|default|already|duplicate|exist/i);
    }
    for(const password of ['', 'short', 'x'.repeat(129), null, {}, 'admin', 'FEDS201', firstPassword, firstPassword.toUpperCase()]){
      await assert.rejects(rpc(page,'adminAddPassword',fallback.token,'Invalid password',password),/password|already|duplicate|exist|default/i);
    }
    await assert.rejects(rpc(page,'adminUpdatePassword',fallback.token,first.id,'SUPERVISOR',''),/label|already|duplicate|exist/i);
    await assert.rejects(rpc(page,'adminUpdatePassword',fallback.token,first.id,'Shop mentor',secondPassword),/password|already|duplicate|exist/i);
    await assert.rejects(rpc(page,'adminUpdatePassword',fallback.token,'default-admin','Changed fallback','Changed-fallback-99'),/default|fallback|cannot/i);
    await assert.rejects(rpc(page,'adminDeletePassword',fallback.token,'default-admin'),/default|fallback|cannot/i);
    assert.deepEqual(await rpc(page,'adminListPasswords',fallback.token),rows);
    assert.ok((await rpc(page,'adminLogin','admin','Feds201')).token);
    console.log('PASS: malformed tokens, invalid/duplicate labels and passwords, and fallback changes are rejected without altering saved credentials.');

    await passwordCard(page,'Shop mentor').getByRole('button',{name:'Edit',exact:true}).click();
    assert.equal(await page.locator('#newPassword').inputValue(),'');
    await page.locator('#passwordLabel').fill('Shop mentor updated');await page.locator('#savePassword').click();
    await waitPassword(page,'Shop mentor updated');await waitPassword(page,'Shop mentor',false);
    await assert.rejects(rpc(page,'adminListPasswords',firstSession.token),/AUTH_REQUIRED/);
    const renamedSession=await rpc(page,'adminLogin','admin',firstPassword);
    assert.equal((await rpc(page,'adminListPasswords',secondSession.token)).length,3);
    assert.equal((await rpc(page,'adminListPasswords',fallback.token)).length,3);

    await passwordCard(page,'Shop mentor updated').getByRole('button',{name:'Edit',exact:true}).click();
    await page.locator('#newPassword').fill(replacementPassword);await page.locator('#confirmPassword').fill(replacementPassword);
    await page.locator('#savePassword').click();await idle(page);
    await assert.rejects(rpc(page,'adminListPasswords',renamedSession.token),/AUTH_REQUIRED/);
    await assert.rejects(rpc(page,'adminLogin','admin',firstPassword),/incorrect|password/i);
    const replacementSession=await rpc(page,'adminLogin','admin',replacementPassword);
    assert.equal((await rpc(page,'adminListPasswords',secondSession.token)).length,3);
    assert.equal((await rpc(page,'adminListPasswords',fallback.token)).length,3);
    await passwordCard(page,'Supervisor').getByRole('button',{name:'Remove',exact:true}).click();
    await waitPassword(page,'Supervisor',false);
    await assert.rejects(rpc(page,'adminLogin','admin',secondPassword),/incorrect|password/i);
    await assert.rejects(rpc(page,'adminListPasswords',secondSession.token),/AUTH_REQUIRED/);
    assert.equal((await rpc(page,'adminListPasswords',replacementSession.token)).length,2);
    assert.equal((await rpc(page,'adminListPasswords',fallback.token)).length,2);
    assert.equal(await page.locator('#workspace').isVisible(),true);
    console.log('PASS: label-only edits, password rotation, and removal revoke only the affected credential sessions; fallback sessions remain signed in.');

    await page.reload();await page.evaluate(()=>window.cncLocal.ready);
    await assert.rejects(rpc(page,'adminListPasswords',fallback.token),/AUTH_REQUIRED/);
    await assert.rejects(rpc(page,'adminLogin','admin',firstPassword),/incorrect|password/i);
    await assert.rejects(rpc(page,'adminLogin','admin',secondPassword),/incorrect|password/i);
    await loginUI(page,replacementPassword);
    const current=await rpc(page,'adminLogin','admin','Feds201');
    rows=await rpc(page,'adminListPasswords',current.token);assertSafeList(rows);assert.equal(rows.length,2);
    assert.equal(rows.find(row=>!row.isDefault).label,'Shop mentor updated');
    const saved=await page.evaluate(key=>localStorage.getItem(key),storeKey);
    for(const password of [firstPassword,secondPassword,replacementPassword])assert.equal(saved.includes(password),false);
    console.log('PASS: credentials and removal survive reload, old tokens expire, and saved auth contains no plaintext custom passwords.');

    await rpc(page,'adminSaveMaterial',current.token,{name:'Test aluminum',materialImage:''},null);
    await rpc(page,'adminSaveSetting',current.token,{mill:'001',material:'Test aluminum',rpm:'12000',feed:'8',depth:'.05',plungeRate:'2',coolantMist:true,units:'inch',notes:'Password portability fixture.'},null);
    const jsonPromise=page.waitForEvent('download');await page.locator('#exportBackup').click();
    const jsonDownload=await jsonPromise;const jsonPath=path.join(temp,'backup.json');await jsonDownload.saveAs(jsonPath);
    const backupText=fs.readFileSync(jsonPath,'utf8'),backup=JSON.parse(backupText);
    assert.equal(backup.settings[0].mill,'001');assert.equal(backup.materials[0].name,'Test aluminum');
    for(const key of ['auth','passwords','token'])assert.equal(Object.hasOwn(backup,key),false);
    for(const secret of [firstPassword,secondPassword,replacementPassword,'Shop mentor updated'])assert.equal(backupText.includes(secret),false);
    await idle(page);
    const htmlPromise=page.waitForEvent('download');await page.locator('#downloadPortable').click();
    const htmlDownload=await htmlPromise;const htmlPath=path.join(temp,'portable.html');await htmlDownload.saveAs(htmlPath);
    const portableHtml=fs.readFileSync(htmlPath,'utf8');
    const embedded=portableHtml.match(/<script id="cncEmbeddedData" type="application\/json">([\s\S]*?)<\/script>/);
    assert.ok(embedded);const portableData=JSON.parse(embedded[1]);
    for(const key of ['auth','passwords','token'])assert.equal(Object.hasOwn(portableData,key),false);
    for(const secret of [firstPassword,secondPassword,replacementPassword,'Shop mentor updated'])assert.equal(portableHtml.includes(secret),false);
    const authState=JSON.parse(saved).auth;
    for(const credential of authState.passwords || [])for(const field of ['hash','salt'])if(credential[field])assert.equal(portableHtml.includes(credential[field]),false);
    const receiving=await open(portableHtml),receivedAuth=await rpc(receiving,'adminLogin','admin','Feds201');
    assert.equal((await rpc(receiving,'adminListPasswords',receivedAuth.token)).length,1);
    await assert.rejects(rpc(receiving,'adminLogin','admin',replacementPassword),/incorrect|password/i);
    assert.equal((await rpc(receiving,'getSettings','001','Test aluminum')).feed,8);
    assert.equal((await receiving.locator('#appVersion').textContent()).trim(),'Version 1.14.27 · CNC Tool Database');
    assert.equal(await receiving.locator('#mentorNotice').isVisible(),false);

    const beforeImport=await rpc(page,'adminListPasswords',current.token);
    const changedBackup={...backup,settings:backup.settings.map(setting=>({...setting,feed:'9'}))};
    await rpc(page,'adminImportBackup',current.token,changedBackup);
    assert.deepEqual(await rpc(page,'adminListPasswords',current.token),beforeImport);
    assert.ok((await rpc(page,'adminLogin','admin',replacementPassword)).token);
    assert.ok((await rpc(page,'adminLogin','admin','Feds201')).token);
    assert.equal((await rpc(page,'getSettings','001','Test aluminum')).feed,9);
    console.log('PASS: actual JSON and standalone HTML downloads contain settings but no custom credentials; fresh copies use admin/Feds201, and imports preserve local passwords.');

    const legacy=await open();await seedLegacy(legacy,'Legacy-custom-52');
    const migratedDefault=await rpc(legacy,'adminLogin','admin','Feds201');
    const migratedCustom=await rpc(legacy,'adminLogin','admin','Legacy-custom-52');
    const migratedRows=await rpc(legacy,'adminListPasswords',migratedDefault.token);assertSafeList(migratedRows);
    assert.equal(migratedRows.length,2);assert.equal(migratedRows.find(row=>!row.isDefault).label,'Existing admin password');
    assert.equal((await rpc(legacy,'adminListPasswords',migratedCustom.token)).length,2);
    await legacy.reload();await legacy.evaluate(()=>window.cncLocal.ready);
    assert.ok((await rpc(legacy,'adminLogin','admin','Legacy-custom-52')).token);
    assert.ok((await rpc(legacy,'adminLogin','admin','Feds201')).token);
    const legacyDefault=await open();await seedLegacy(legacyDefault,'admin');
    const legacyDefaultAuth=await rpc(legacyDefault,'adminLogin','admin','Feds201');
    assert.equal((await rpc(legacyDefault,'adminListPasswords',legacyDefaultAuth.token)).length,1);
    console.log('PASS: a legacy custom single password migrates without losing access and gains the admin fallback; legacy admin creates no duplicate.');
    assert.deepEqual(errors,[]);assert.deepEqual(unexpectedRequests,[]);
  } finally {
    for(const context of contexts)await context.close();await browser.close();fs.rmSync(temp,{recursive:true,force:true});
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
