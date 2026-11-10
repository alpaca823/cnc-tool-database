// Compare the generated server data engine with the actual offline backend.
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {webcrypto} = require('node:crypto');
const {execFileSync} = require('node:child_process');
const root = path.resolve(__dirname, '..');
const localSource = fs.readFileSync(path.join(root, '..', 'cnc-local', 'local-core.js'), 'utf8');
const generated = execFileSync('python', ['-c',
  "import sys;from pathlib import Path;sys.path.insert(0,sys.argv[1]);from build_engine import generate_engine;print(generate_engine(Path(sys.argv[2]).read_text()))",
  root, path.join(root, '..', 'cnc-local', 'local-core.js')], {encoding:'utf8'});
const plain = value => JSON.parse(JSON.stringify(value));
const seed = {format:'cnc-local-portable',schemaVersion:1,settings:[]};

async function pair() {
  const saved = new Map();
  const local = {window:{crypto:webcrypto},navigator:{},TextEncoder,Uint8Array,
    localStorage:{getItem:key=>saved.get(key)??null,setItem:(key,value)=>saved.set(key,value)},
    document:{getElementById:()=>({textContent:JSON.stringify(seed)})}};
  vm.createContext(local);vm.runInContext(localSource,local);await local.window.cncLocal.ready;
  const rpc = (name,...args) => local.window.cncLocal.call(name,...args);
  const {token} = await rpc('adminLogin','admin','Feds201');
  let state = {format:'cnc-local-database',schemaVersion:1,revision:0,settings:[],materials:[],mills:[],rawMaterials:[]};
  const context = {};vm.createContext(context);vm.runInContext(generated,context);
  const server = context.createCncDataApi_({
    uid:()=>webcrypto.randomUUID(),readState:()=>plain(state),storageWrite:value=>{state=plain(value);},
    requireAdmin:credential=>{if(credential!=='server-admin')throw new Error('AUTH_REQUIRED');}
  });
  return {
    local:async(name,...args)=>plain(await rpc(name,...args)), localToken:token,
    server:async(name,...args)=>plain(server[name](...args)),serverToken:'server-admin',
    engine:server,state:()=>plain(state)
  };
}

async function snapshot(p,which) {
  const data=await p[which]('adminExportBackup',p[which+'Token']);
  delete data.exportedAt;
  for (const key of ['settings','materials','mills','rawMaterials']) {
    for (const record of data[key]) {delete record.version;if(key==='rawMaterials')delete record.id;}
  }
  return data;
}

async function saveMaterial(p,name) {
  for(const target of ['local','server'])await p[target]('adminSaveMaterial',p[target+'Token'],{name},null);
}

test('generator preserves source methods and rejects API drift',()=>{
  assert.match(generated,/function createCncDataApi_\(host\)/);
  assert.doesNotMatch(generated,/\b(?:window|localStorage|navigator|async|await|Promise)\b/);
  assert.ok(generated.includes('function validateRawMaterial(record)'));
  const script="import sys;sys.path.insert(0,sys.argv[1]);from build_engine import generate_engine;from pathlib import Path;s=Path(sys.argv[2]).read_text();generate_engine(s.replace('    getMills()', '    getUnknownMills()'))";
  assert.throws(()=>execFileSync('python',['-c',script,root,path.join(root,'..','cnc-local','local-core.js')],{stdio:'pipe'}),/Command failed/);
});

test('shared material, mill, cutting and raw sheet CRUD have offline/server parity',async()=>{
  const p=await pair();await saveMaterial(p,'Aluminum 6061');await saveMaterial(p,'Plywood');
  for(const target of ['local','server']){
    const call=p[target],token=p[target+'Token'];
    await call('adminSaveMill',token,{number:'001',name:'Quarter inch',diameter:'.25',quantity:7,reorderLevel:2},null);
    await call('adminSaveSetting',token,{mill:'001',material:'Aluminum 6061',rpm:'12000',feed:'40',depth:'.125',plungeRate:'8',coolantMist:true,units:'inch'},null);
    await call('adminSaveRawMaterial',token,{material:'Aluminum 6061',length:'96',width:'48',quantity:3,location:'A'},null);
  }
  assert.deepEqual(await snapshot(p,'server'),await snapshot(p,'local'));
  for(const name of ['getOptions','getDashboard'])assert.deepEqual(await p.server(name),await p.local(name));
  const displayedLocal=await p.local('getSettings','001','Aluminum 6061');
  const displayedServer=await p.server('getSettings','001','Aluminum 6061');
  delete displayedLocal.version;delete displayedServer.version;assert.deepEqual(displayedServer,displayedLocal);
  for(const target of ['local','server']){
    const material=(await p[target]('getMaterials')).find(item=>item.name==='Aluminum 6061');
    await p[target]('adminSaveMaterial',p[target+'Token'],{name:'Aluminum renamed'},{name:material.name,version:material.version});
    await assert.rejects(p[target]('adminDeleteMaterial',p[target+'Token'],{name:'Aluminum renamed',version:(await p[target]('getMaterials')).find(item=>item.name==='Aluminum renamed').version}),/used/);
  }
  assert.deepEqual(await snapshot(p,'server'),await snapshot(p,'local'));
});

test('stale writes, invalid records and atomic import rejection match both variants',async()=>{
  const p=await pair();await saveMaterial(p,'Brass');
  for(const target of ['local','server']){
    const call=p[target],token=p[target+'Token'];
    await call('adminSaveMill',token,{number:'002',quantity:2},null);
    const mill=(await call('getMills'))[0];
    await call('adminSetInventory',token,'002',4,2,'Rack',mill.version);
    await assert.rejects(call('adminSetInventory',token,'002',99,2,'Rack',mill.version),/changed/);
    const before=await call('adminExportBackup',token);
    await assert.rejects(call('adminSaveRawMaterial',token,{material:'Brass',length:'0',width:'48',quantity:2},null),/positive/);
    await assert.rejects(call('adminImportBackup',token,{...before,rawMaterials:[{material:'Missing',length:'96',width:'48',quantity:2}]}),/missing/);
    const after=await call('adminExportBackup',token);delete before.exportedAt;delete after.exportedAt;
    assert.deepEqual(after,before,'Failed operations preserve all lists');
  }
  assert.deepEqual(await snapshot(p,'server'),await snapshot(p,'local'));
});

test('legacy metric import converts once and local backups transfer to the server',async()=>{
  const p=await pair();
  const legacy={format:'cnc-local-backup',schemaVersion:1,settings:[{mill:'0007',material:'Legacy',rpm:'12000',feed:'254',depth:'25.4',plungeRate:'50.8',coolantMist:false,units:'mm',notes:'Keep notes'}]};
  for(const target of ['local','server'])await p[target]('adminImportBackup',p[target+'Token'],legacy);
  assert.deepEqual(await snapshot(p,'server'),await snapshot(p,'local'));
  const transfer=await p.local('adminExportBackup',p.localToken);
  await p.server('adminImportBackup',p.serverToken,transfer);
  const actual=await p.server('getSettings','0007','Legacy');
  assert.equal(actual.feed,10);assert.equal(actual.depth,1);assert.equal(actual.plungeRate,2);assert.equal(actual.coolantMist,false);assert.equal(actual.units,'inch');
});

test('validateData preserves saved versions, validates references and ignores local auth',async()=>{
  const p=await pair();await saveMaterial(p,'Steel');
  const state=p.state();const normalized=plain(p.engine.validateData({...state,auth:{server:'private'}}));
  assert.deepEqual(normalized,{...state,auth:{server:'private'}});
  assert.throws(()=>p.engine.validateData({...state,revision:-1}),/format/);
  assert.throws(()=>p.engine.validateData({...state,settings:[{mill:'1',material:'Unknown',rpm:'1',feed:'1',depth:'1',units:'inch',version:'saved'}]}),/missing/);
  const actions=Array.from(p.engine.actions);
  assert.equal(actions.length,20);assert.equal(actions.includes('normalizeBackup'),false);assert.equal(actions.includes('adminLogin'),false);
});
