// Plunge/coolant checks use the exact standalone HTML at an intercepted loopback origin.
const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const target = path.join(root, 'CNC-Tool-Database.html');
const origin = 'http://localhost:31460/plunge-mist.html';
const legacySetting = {mill:'099',material:'Legacy material',rpm:'9000',feed:'10',depth:'.1',units:'inch',notes:'Older settings test fixture.',version:'old-record'};

(async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'cnc-plunge-mist-'));
  const browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  const contexts = [];
  const errors = [], network = [];
  async function open(html = fs.readFileSync(target, 'utf8')) {
    const context = await browser.newContext({viewport:{width:1050,height:1100},acceptDownloads:true});
    contexts.push(context);
    await context.route(/^https?:/, route => {
      if (route.request().url() === origin) return route.fulfill({contentType:'text/html',body:html});
      network.push(route.request().url()); return route.abort();
    });
    const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
    await page.goto(origin); await page.evaluate(() => window.cncLocal.ready);
    return page;
  }
  const rpc = (page, name, ...args) => page.evaluate(({name,args}) => window.cncLocal.call(name,...args), {name,args});
  const idle = page => page.waitForFunction(() => !document.getElementById('settingFields').disabled && !document.getElementById('materialFields').disabled);
  const go=(page,name)=>page.locator('.nav-button[data-page="'+name+'"]').click();
  async function login(page) {
    if (await page.locator('#workspace').isHidden() && await page.locator('#adminPanel').isHidden()) await page.locator('#toggleView').click();
    if (await page.locator('#workspace').isHidden()) {
      await page.locator('#password').fill('Feds201'); await page.locator('#loginForm button').click();
      await page.locator('#workspace').waitFor({state:'visible'});
    }
    await idle(page); await go(page,'feeds');
  }
  async function save(page) {
    await page.locator('#saveSetting').click();
    await page.waitForFunction(() => document.getElementById('adminStatus').textContent.includes('saved') && !document.getElementById('settingFields').disabled);
  }
  async function edit(page, mill) {
    await login(page);
    const row = page.locator('#settingList article').filter({has:page.getByText(new RegExp('^Mill ' + mill + ' ·'))});
    await row.getByRole('button', {name:'Edit',exact:true}).click();
  }
  async function show(page, mill, material) {
    await go(page,'feeds');
    await page.locator('#mill').selectOption(mill); await page.locator('#material').selectOption(material);
    await page.locator('#show').click(); await page.locator('#result').waitFor({state:'visible'});
  }
  try {
    const page = await open();
    await login(page);
    await go(page,'materials');
    await page.locator('#manageMaterials').click();
    await page.locator('#materialName').fill('Aluminum'); await page.locator('#saveMaterial').click();
    await page.waitForFunction(() => [...document.getElementById('editMaterial').options].some(o => o.value === 'Aluminum'));
    await idle(page);
    await go(page,'feeds');
    assert.equal(await page.locator('#editCoolantMist').isChecked(), false);
    assert.equal(await page.locator('#editCoolantMist').evaluate(el => el.indeterminate), false);
    for (const [id,value] of Object.entries({editMill:'001',editRpm:'12000',editFeed:'10',editDepth:'.125',editNotes:'Automated test fixture only.'})) await page.locator('#'+id).fill(value);
    await page.locator('#editMaterial').selectOption('Aluminum');
    await save(page); await show(page,'001','Aluminum');
    assert.equal(await page.locator('#plungeRate').textContent(), 'Not specified');
    assert.equal(await page.locator('#coolantMist').textContent(), 'Disabled');
    const initial = await rpc(page,'getSettings','001','Aluminum');
    assert.ok(initial.plungeRate == null || initial.plungeRate === '');
    assert.equal(initial.coolantMist, false);
    console.log('PASS: new settings allow a blank plunge rate, and an unchecked checkbox records mist disabled.');

    await edit(page,'001');
    await page.locator('#editPlungeRate').fill('2.5'); await page.locator('#editCoolantMist').check();
    await save(page); await show(page,'001','Aluminum');
    assert.equal(await page.locator('#plungeRate').textContent(), '2.5 inch/min');
    assert.equal(await page.locator('#coolantMist').textContent(), 'Enabled');
    await page.reload(); await page.evaluate(() => window.cncLocal.ready);
    const persisted = await rpc(page,'getSettings','001','Aluminum');
    assert.equal(Number(persisted.plungeRate), 2.5); assert.equal(persisted.coolantMist, true);
    await edit(page,'001');
    assert.equal(await page.locator('#editPlungeRate').inputValue(), '2.5');
    assert.equal(await page.locator('#editCoolantMist').isChecked(), true);
    await save(page);
    assert.equal((await rpc(page,'getSettings','001','Aluminum')).coolantMist, true);
    await edit(page,'001'); await page.locator('#editCoolantMist').uncheck(); await save(page); await show(page,'001','Aluminum');
    assert.equal(await page.locator('#coolantMist').textContent(), 'Disabled');
    await edit(page,'001'); await page.locator('#editCoolantMist').check(); await save(page);
    console.log('PASS: plunge rate and mist enabled/disabled display correctly and survive edit, resave, and reload.');

    const auth = await rpc(page,'adminLogin','admin','Feds201');
    const before = await rpc(page,'adminExportBackup',auth.token);
    for (const change of [{plungeRate:'0'},{plungeRate:'-1'},{plungeRate:'many'},{plungeRate:'Infinity'},{coolantMist:'false'},{coolantMist:1}]) {
      const item = (await rpc(page,'adminListSettings',auth.token))[0];
      await assert.rejects(rpc(page,'adminSaveSetting',auth.token,{...before.settings[0],...change},{key:item.key,version:item.version}),/plunge|positive|mist|boolean|coolant/i);
      assert.deepEqual((await rpc(page,'adminExportBackup',auth.token)).settings, before.settings);
    }
    await assert.rejects(rpc(page,'adminImportBackup',auth.token,{...before,settings:[{...before.settings[0],plungeRate:'0'}]}),/plunge|positive/i);
    assert.deepEqual((await rpc(page,'adminExportBackup',auth.token)).settings,before.settings);
    console.log('PASS: invalid plunge values and non-boolean mist flags are rejected without changing saved settings.');

    await go(page,'settings');
    const jsonPromise = page.waitForEvent('download'); await page.locator('#exportBackup').click();
    const jsonDownload = await jsonPromise, jsonPath = path.join(temp,'settings.json'); await jsonDownload.saveAs(jsonPath);
    const json = JSON.parse(fs.readFileSync(jsonPath,'utf8'));
    assert.equal(json.settings[0].plungeRate,'2.5'); assert.equal(json.settings[0].coolantMist,true);
    const htmlPromise = page.waitForEvent('download'); await page.locator('#downloadPortable').click();
    const htmlDownload = await htmlPromise, htmlPath = path.join(temp,'portable.html'); await htmlDownload.saveAs(htmlPath);
    const receiving = await open(fs.readFileSync(htmlPath,'utf8'));
    const received = await rpc(receiving,'getSettings','001','Aluminum');
    assert.equal(Number(received.plungeRate),2.5); assert.equal(received.coolantMist,true);
    await show(receiving,'001','Aluminum');
    assert.equal(await receiving.locator('#plungeRate').textContent(),'2.5 inch/min');
    assert.equal(await receiving.locator('#coolantMist').textContent(),'Enabled');
    page.on('dialog',d => d.accept());
    await rpc(page,'adminImportBackup',auth.token,{...json,settings:[{...json.settings[0],plungeRate:'1',coolantMist:false}]});
    await page.locator('#importFile').setInputFiles(jsonPath);
    await page.waitForFunction(() => document.getElementById('adminStatus').textContent.includes('imported') && !document.getElementById('settingFields').disabled);
    assert.equal((await rpc(page,'getSettings','001','Aluminum')).coolantMist,true);
    assert.equal(Number((await rpc(page,'getSettings','001','Aluminum')).plungeRate),2.5);
    console.log('PASS: actual JSON backup/import and portable HTML retain both plunge rate and coolant mist.');

    const old = await open();
    await old.evaluate(setting => {
      const stored = JSON.parse(localStorage.getItem('cnc-tool-database-v1'));
      delete stored.materials; delete stored.mills; stored.settings = [setting];
      localStorage.setItem('cnc-tool-database-v1',JSON.stringify(stored));
    },legacySetting);
    await old.reload(); await old.evaluate(() => window.cncLocal.ready);
    await show(old,'099','Legacy material');
    assert.equal(await old.locator('#plungeRate').textContent(),'Not specified');
    assert.equal(await old.locator('#coolantMist').textContent(),'Not specified');
    await edit(old,'099');
    assert.equal(await old.locator('#editPlungeRate').inputValue(),'');
    assert.equal(await old.locator('#editCoolantMist').evaluate(el => el.indeterminate),true);
    await old.locator('#editNotes').fill('Legacy entry edited without guessing plunge or mist.');
    await save(old);
    const preserved = await rpc(old,'getSettings','099','Legacy material');
    assert.ok(preserved.plungeRate == null || preserved.plungeRate === ''); assert.equal(preserved.coolantMist,undefined);
    await show(old,'099','Legacy material');
    assert.equal(await old.locator('#coolantMist').textContent(),'Not specified');
    await edit(old,'099'); await old.locator('#editCoolantMist').check(); await save(old);
    assert.equal((await rpc(old,'getSettings','099','Legacy material')).coolantMist,true);
    console.log('PASS: old settings remain unspecified; editing unrelated fields preserves the unknown mist state until explicitly selected.');

    const oldAuth = await rpc(old,'adminLogin','admin','Feds201');
    const metric = {...legacySetting,mill:'098',material:'Metric legacy',units:'mm',feed:'254',depth:'25.4',plungeRate:'254',coolantMist:false};
    await rpc(old,'adminImportBackup',oldAuth.token,{format:'cnc-local-backup',schemaVersion:1,settings:[metric]});
    const converted = await rpc(old,'getSettings','098','Metric legacy');
    assert.equal(converted.feed,10); assert.equal(converted.depth,1); assert.equal(Number(converted.plungeRate),10); assert.equal(converted.coolantMist,false);
    await old.reload(); await old.evaluate(() => window.cncLocal.ready);
    assert.equal(Number((await rpc(old,'getSettings','098','Metric legacy')).plungeRate),10);
    const conversionAuth = await rpc(old,'adminLogin','admin','Feds201');
    const convertedBackup = await rpc(old,'adminExportBackup',conversionAuth.token);
    assert.equal(convertedBackup.settings[0].plungeRate,'10'); assert.equal(convertedBackup.settings[0].units,'inch');
    console.log('PASS: metric plunge rates convert to inch/min once, while explicit false coolant mist stays false.');
    fs.mkdirSync(path.join(root,'previews'),{recursive:true});
    await receiving.screenshot({path:path.join(root,'previews','plunge-mist-result.png'),fullPage:true});
    assert.deepEqual(errors,[]); assert.deepEqual(network,[]);
  } finally {for (const context of contexts) await context.close(); await browser.close(); fs.rmSync(temp,{recursive:true,force:true});}
})().catch(error => {console.error(error);process.exitCode=1;});
