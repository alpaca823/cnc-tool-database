const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const {webcrypto} = require('node:crypto');
const source = fs.readFileSync(path.join(__dirname,'..','local-core.js'),'utf8');
const KEY = 'cnc-tool-database-v1';
const plain = value => JSON.parse(JSON.stringify(value));
const metric = {mill:'001',material:'Aluminum',rpm:'12000',feed:'254',depth:'25.4',units:'mm',notes:'Approved shop settings',version:'metric-original'};
const inch = {mill:'002',material:'Steel',rpm:'4000',feed:'10',depth:'.125',units:'inch',notes:'Keep unchanged',version:'inch-original'};
function app(saved, seed) {
  const store = new Map(saved == null ? [] : [[KEY, typeof saved === 'string' ? saved : JSON.stringify(saved)]]);
  const window = {crypto:webcrypto};
  const context = {window, navigator:{}, TextEncoder, Uint8Array, localStorage:{getItem:k=>store.get(k) ?? null,setItem:(k,v)=>store.set(k,String(v))}, document:{getElementById:()=>seed ? {textContent:JSON.stringify(seed)} : null}};
  vm.createContext(context); vm.runInContext(source,context);
  return {api:window.cncLocal,store,read:()=>JSON.parse(store.get(KEY))};
}
let base;
test.before(async()=>{const initial=app(); await initial.api.ready; base=initial.read();});

test('saved mixed units migrate once; identifiers, credentials, RPM, notes, and inch values remain intact',async()=>{
  const old={...plain(base),revision:8,settings:[metric,inch]};
  delete old.materials; delete old.mills; delete old.rawMaterials; // A pre-library browser database has no catalogs or raw-material inventory.
  const migrated=app(old); await migrated.api.ready;
  const actual=migrated.read();
  assert.equal(actual.revision,9);
  assert.deepEqual(actual.auth,old.auth);
  assert.equal(actual.settings[0].feed,'10'); assert.equal(actual.settings[0].depth,'1');
  assert.equal(actual.settings[0].units,'inch'); assert.equal(actual.settings[0].mill,'001');
  assert.equal(actual.settings[0].rpm,'12000'); assert.equal(actual.settings[0].notes,metric.notes);
  assert.notEqual(actual.settings[0].version,metric.version);
  assert.deepEqual(actual.settings[1],inch);
  const auth=await migrated.api.call('adminLogin','admin','Feds201');
  await assert.rejects(migrated.api.call('adminSaveSetting',auth.token,{...metric,units:'inch'}, {key:{mill:metric.mill,material:metric.material},version:metric.version}),/changed after/);
  const reloaded=app(actual); await reloaded.api.ready;
  assert.deepEqual(reloaded.read(),actual);
});

test('metric backups and portable seeds normalize to inches, and export/import does not convert again',async()=>{
  const portable={format:'cnc-local-portable',schemaVersion:1,settings:[metric,inch]};
  const seeded=app(null,portable); await seeded.api.ready;
  const auth=await seeded.api.call('adminLogin','admin','Feds201');
  const exported=await seeded.api.call('adminExportBackup',auth.token);
  assert.ok(exported.settings.every(row=>row.units==='inch'));
  assert.equal(exported.settings[0].feed,'10'); assert.equal(exported.settings[0].depth,'1');
  await seeded.api.call('adminImportBackup',auth.token,exported);
  const again=await seeded.api.call('adminExportBackup',auth.token);
  assert.deepEqual(plain(again.settings),plain(exported.settings));
  await seeded.api.call('adminImportBackup',auth.token,{...exported,settings:[{...metric,feed:'25.4',depth:'.254'}]});
  const result=await seeded.api.call('getSettings','001','Aluminum');
  assert.equal(result.feed,1); assert.equal(result.depth,.01); assert.equal(result.rpm,12000);
  const data=await seeded.api.call('adminPortableData',auth.token);
  assert.equal(data.settings[0].units,'inch');
});

test('a bad row prevents any migration write; failed imports also leave all saved data untouched',async()=>{
  const old={...plain(base),settings:[metric,{...inch,feed:'invalid'}]};
  delete old.materials; delete old.mills; delete old.rawMaterials;
  const broken=app(old);
  await assert.rejects(broken.api.ready,/cannot be read/);
  assert.equal(broken.store.get(KEY),JSON.stringify(old));
  const valid=app(); await valid.api.ready;
  const auth=await valid.api.call('adminLogin','admin','Feds201');
  const before=valid.store.get(KEY);
  await assert.rejects(valid.api.call('adminImportBackup',auth.token,{format:'cnc-local-backup',schemaVersion:1,settings:[metric,{...inch,depth:0}]}));
  assert.equal(valid.store.get(KEY),before);
});

test('very small positive metric cuts survive conversion, validation, and repeated reads without rounding to zero',async()=>{
  const tiny='0.'+'0'.repeat(37)+'1';
  const saved={...plain(base),settings:[{...metric,depth:tiny,feed:'800'}]};
  delete saved.materials; delete saved.mills; delete saved.rawMaterials;
  const converted=app(saved); await converted.api.ready;
  const first=converted.read();
  assert.ok(Number(first.settings[0].depth)>0);
  assert.ok(first.settings[0].depth.length>40);
  assert.ok(Math.abs(Number(first.settings[0].feed)-(800/25.4))<1e-12);
  const reloaded=app(first); await reloaded.api.ready;
  assert.deepEqual(reloaded.read(),first);
});
