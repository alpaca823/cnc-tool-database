// Exercises the standalone app via file://, or an intercepted loopback origin when managed Chromium blocks files.
const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const target = path.resolve(__dirname, '..', 'CNC-Tool-Database.html');
const loopback = process.env.CNC_TEST_LOOPBACK === '1';
const targetURL = loopback ? 'http://localhost:31460/CNC-Tool-Database.html' : pathToFileURL(target).href;
const previews = path.resolve(__dirname, '..', 'previews');
const setting = {mill:'001',material:'Aluminum 6061',rpm:'12000',feed:'800',depth:'.5',units:'inch',notes:'Browser test values only.'};

(async () => {
  assert.ok(fs.existsSync(target), 'Build CNC-Tool-Database.html before running browser checks.');
  fs.mkdirSync(previews, {recursive:true});
  const browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium',headless:true,timeout:15000,args:['--no-sandbox','--disable-dev-shm-usage','--disable-crash-reporter','--disable-breakpad']});
  const context = await browser.newContext({viewport:{width:1000,height:1000},acceptDownloads:true});
  const page = await context.newPage();
  const errors = [], network = [];
  page.on('pageerror', error => errors.push(error.message));
  await context.route(/^https?:/, route => {
    if (loopback && route.request().url() === targetURL) return route.fulfill({contentType:'text/html',body:fs.readFileSync(target,'utf8')});
    network.push(route.request().url()); return route.abort();
  });
  const rpc = (method, ...args) => page.evaluate(async ({method,args}) => window.cncLocal.call(method,...args), {method,args});
  const idle = () => page.waitForFunction(() => !document.getElementById('settingFields').disabled);
  const status = text => page.waitForFunction(text => document.getElementById('adminStatus').textContent.includes(text),text);
  const go = name => page.locator('.nav-button[data-page="'+name+'"]').click();
  const openAdmin = async () => {
    if (await page.locator('#workspace').isHidden() && await page.locator('#adminPanel').isHidden()) await page.locator('#toggleView').click();
  };
  const login = async password => {
    await openAdmin();
    await page.locator('#username').fill('admin');
    await page.locator('#password').fill(password);
    await page.locator('#loginForm button').click();
  };
  const fill = async values => {
    await go('feeds');
    for (const [name,id] of Object.entries({mill:'editMill',rpm:'editRpm',feed:'editFeed',depth:'editDepth',notes:'editNotes'}))
      if (values[name] !== undefined) await page.locator('#'+id).fill(values[name]);
    if (values.material !== undefined) await page.locator('#editMaterial').selectOption(values.material);
    if (values.units) assert.equal(await page.locator('#editUnits').inputValue(), values.units);
  };
  const addMaterial = async name => {
    await go('materials');
    await page.locator('#manageMaterials').click();
    await page.locator('#materialName').fill(name);
    await page.locator('#saveMaterial').click();
    await status('saved'); await idle();
    assert.equal(await page.locator('#editMaterial option').filter({hasText:name}).count(),1);
    await go('feeds');
  };
  try {
    await page.goto(targetURL);
    await page.evaluate(() => window.cncLocal.ready);
    assert.deepEqual(await rpc('getOptions'),[]);
    assert.equal(await page.locator('#mill').isDisabled(),true);
    console.log('PASS: first launch is empty; test origin:', loopback ? 'intercepted loopback (file navigation blocked by environment policy)' : 'file://');

    await login('wrong');
    await page.waitForFunction(() => document.getElementById('loginStatus').textContent.includes('Incorrect'));
    await login('admin');
    await page.locator('#workspace').waitFor({state:'visible'}); await idle();
    await addMaterial(setting.material);
    await fill(setting); await page.locator('#saveSetting').click(); await status('saved'); await idle();
    assert.equal(await page.locator('#settingList .setting').count(),1);
    await fill(setting); await page.locator('#saveSetting').click(); await status('already'); await idle();
    assert.equal(await page.locator('#settingList .setting').count(),1);
    await page.locator('#cancelEdit').click();
    console.log('PASS: initial admin/admin login, failed login, add, and duplicate protection.');

    await go('feeds');
    await page.locator('#mill').selectOption('001');
    await page.locator('#material').selectOption(setting.material);
    await page.locator('#show').click(); await page.locator('#result').waitFor({state:'visible'});
    assert.equal(await page.locator('#rpm').textContent(),'12,000 RPM');
    assert.equal(await page.locator('#feed').textContent(),'800 inch/min');
    assert.equal(await page.locator('#depth').textContent(),'0.5 inch');
    await page.screenshot({path:path.join(previews,'local-user.png'),fullPage:true});
    await page.reload(); await page.evaluate(() => window.cncLocal.ready);
    assert.deepEqual(await rpc('getOptions'),[{mill:'001',materials:[setting.material]}]);
    console.log('PASS: public lookup units and leading-zero IDs survive reloading the file.');

    await login('admin'); await page.locator('#workspace').waitFor({state:'visible'}); await idle();
    await page.locator('#settingList').getByRole('button',{name:'Edit',exact:true}).click();
    await fill({feed:'825'}); await page.locator('#saveSetting').click(); await status('saved'); await idle();
    assert.equal((await rpc('getSettings','001',setting.material)).feed,825);
    await page.screenshot({path:path.join(previews,'local-admin.png'),fullPage:true});
    await addMaterial('Mild Steel');
    await fill({...setting,mill:'002',material:'Mild Steel',rpm:'4000',feed:'250',depth:'0.25'});
    await page.locator('#saveSetting').click(); await status('saved'); await idle();
    page.on('dialog',dialog => dialog.accept());
    await page.locator('#settingList .setting').filter({hasText:'Mild Steel'}).getByRole('button',{name:'Delete',exact:true}).click();
    await status('deleted'); await idle();
    assert.equal(await page.locator('#settingList .setting').count(),1);
    console.log('PASS: edit and confirmed delete update persistent settings.');

    const auth = await rpc('adminLogin','admin','admin');
    for (const method of ['adminListSettings','adminListMaterials','adminExportBackup','adminPortableData'])
      await assert.rejects(rpc(method,'forged-token'),/AUTH_REQUIRED/);
    const backup = await rpc('adminExportBackup',auth.token);
    assert.equal(backup.format,'cnc-local-backup'); assert.equal(backup.schemaVersion,1);
    assert.equal(backup.settings.length,1); assert.equal(backup.settings[0].mill,'001');
    assert.equal('auth' in backup,false);
    const before = await rpc('getSettings','001',setting.material);
    await assert.rejects(rpc('adminImportBackup',auth.token,{...backup,settings:[setting,setting]}),/duplicate|already/i);
    await assert.rejects(rpc('adminImportBackup',auth.token,{...backup,settings:[{...setting,rpm:'0'}]}),/positive|RPM|rpm/);
    assert.deepEqual(await rpc('getSettings','001',setting.material),before);
    const legacyImport={...backup,materials:[{name:'Imported material'}],settings:[{...setting,mill:'003',material:'Imported material',units:'inch'}]};
    delete legacyImport.mills; delete legacyImport.rawMaterials; // Older backups derive their mill library from cutting settings and have no raw inventory.
    await rpc('adminImportBackup',auth.token,legacyImport);
    assert.deepEqual(await rpc('getOptions'),[{mill:'003',materials:['Imported material']}]);
    await rpc('adminImportBackup',auth.token,backup);
    console.log('PASS: protected backup export, full import validation, and atomic replacement.');

    await go('settings');
    await page.locator('#passwordDetails summary').click();
    await page.locator('#passwordLabel').fill('Shop admin');
    await page.locator('#newPassword').fill('shop-password-42');
    await page.locator('#confirmPassword').fill('shop-password-42');
    await page.locator('#savePassword').click();
    await page.locator('#passwordList').getByText('Shop admin',{exact:true}).waitFor();
    assert.equal(await page.locator('#workspace').isVisible(),true);
    assert.equal((await rpc('adminListSettings',auth.token)).length,1);
    await page.locator('#logout').click(); await page.locator('#workspace').waitFor({state:'hidden'});
    await page.reload(); await page.evaluate(() => window.cncLocal.ready);
    await assert.rejects(rpc('adminListSettings',auth.token),/AUTH_REQUIRED/);
    await login('shop-password-42'); await page.locator('#workspace').waitFor({state:'visible'}); await idle();
    await page.locator('#logout').click(); await page.locator('#workspace').waitFor({state:'hidden'});
    await login('admin'); await page.locator('#workspace').waitFor({state:'visible'}); await idle();
    await page.locator('#logout').click(); await page.locator('#workspace').waitFor({state:'hidden'});
    console.log('PASS: added password persists across reload, existing sessions remain valid, permanent admin fallback and logout work.');

    await go('feeds'); await page.setViewportSize({width:390,height:844});
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),false);
    assert.deepEqual(network,[]); assert.deepEqual(errors,[]);
    console.log('PASS: mobile width, no page errors, and zero HTTP requests.');
    console.log('All standalone browser checks passed.');
  } finally {await browser.close();}
})().catch(error => {console.error(error);process.exitCode=1;});
