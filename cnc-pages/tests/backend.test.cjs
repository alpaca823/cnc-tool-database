const test=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./shared-fixture.cjs');
test('shared server persists data and sessions across fresh requests, with protected writes and portable backups',async()=>{
 const f=await fixture();assert.equal((await f.ok('getWorkspaceData')).mills.length,0);
 const denied=await f.call('adminSaveMaterial','forged',{name:'Bad'},null);assert.equal(denied.ok,false);
 const {token}=await f.ok('adminLogin','AdMiN','fEdS201');
 await f.ok('adminSaveMaterial',token,{name:'Aluminum'},null);
 await f.ok('adminSaveMill',token,{number:'001',quantity:5,diameter:'.25'},null);
 await f.ok('adminSaveSetting',token,{mill:'001',material:'Aluminum',rpm:'12000',feed:'40',depth:'.125',units:'inch',plungeRate:'8',coolantMist:true},null);
 await f.ok('adminSaveRawMaterial',token,{material:'Aluminum',length:'96',width:'48',quantity:3},null);
 const shared=await f.ok('getWorkspaceData');assert.equal(shared.mills[0].number,'001');assert.equal(shared.mills[0].quantity,5);assert.equal(shared.rawMaterials[0].quantity,3);
 const backup=await f.ok('adminExportBackup',token);assert.equal('auth' in backup,false);assert.equal(backup.settings[0].coolantMist,true);
 await f.ok('adminAddPassword',token,'Mentor','mentor-shared-123');
 const mentor=await f.ok('adminLogin','admin','mentor-shared-123');assert.equal((await f.ok('adminListPasswords',mentor.token)).length,2);
 await f.ok('adminLogout',mentor.token);assert.equal((await f.call('adminListSettings',mentor.token)).ok,false);
});
test('database compare-and-swap conflicts never overwrite a committed snapshot',async()=>{
 const f=await fixture();const {token}=await f.ok('adminLogin','AdMiN','fEdS201');const before=structuredClone(f.getState());
 f.conflict();const result=await f.call('adminSaveMaterial',token,{name:'Must not commit'},null);
 assert.equal(result.ok,false);assert.equal(result.retryable,true);assert.deepEqual(f.getState(),before);assert.deepEqual(await f.ok('getMaterials'),[]);
});
test('origins and action allowlist fail closed; public responses exclude credential records',async()=>{
 const f=await fixture();const response=await f.handler()(new Request('https://project.supabase.co/functions/v1/cnc-api',{method:'POST',headers:{origin:'https://other.example'},body:'{}'}));assert.equal(response.status,403);
 for(const name of ['__proto__','constructor','storageRead'])assert.equal((await f.call(name)).ok,false);
 const value=await f.ok('getWorkspaceData');assert.equal(JSON.stringify(value).includes('auth'),false);assert.equal('auth' in f.getState().data,true);
});
