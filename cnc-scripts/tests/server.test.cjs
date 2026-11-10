// Runs the real compiled Apps Script in Node with persistent service doubles.
// These tests verify server logic and adapters; they do not deploy to Google.
const test=require('node:test');
const assert=require('node:assert/strict');
const {createGasMock}=require('./gas-mock.cjs');
const image='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
const collections=['settings','materials','mills','rawMaterials'];
function environment(){
  const mock=createGasMock();const server=mock.load();
  server.setupDatabase();
  const call=(name,...args)=>mock.call(server,name,...args);
  const ok=(name,...args)=>{const result=call(name,...args);assert.equal(result.ok,true,result.error);return result.value;};
  const bad=(name,args,pattern)=>{const result=call(name,...args);assert.equal(result.ok,false,'Expected rejection: '+name);assert.match(result.error,pattern);return result;};
  const login=password=>ok('adminLogin','admin',password).token;
  const token=login('admin');
  return {mock,server,call,ok,bad,login,token};
}
function seed(env){
  const {ok,token}=env;
  ok('adminSaveMaterial',token,{name:'Aluminum 6061',materialImage:image},null);
  ok('adminSaveMill',token,{number:'001',name:'Quarter-inch end mill',diameter:'0.25',flutes:2,quantity:4,reorderLevel:1,location:'Drawer A',toolImage:image},null);
  ok('adminSaveSetting',token,{mill:'001',material:'Aluminum 6061',rpm:'12000',feed:'40',plungeRate:'8',depth:'.125',units:'inch',coolantMist:true,notes:'Shop-approved sample values'},null);
  ok('adminSaveRawMaterial',token,{material:'Aluminum 6061',length:'96',width:'48',thickness:'.125',quantity:3,location:'Rack A',notes:'=literal batch note'},null);
}
function authRaw(mock){const active=mock.state.properties.get('CNC_AUTH_ACTIVE');if(!active)return mock.state.properties.get('CNC_AUTH');const pointer=JSON.parse(active);return Array.from({length:pointer.parts},(_,i)=>mock.state.properties.get('CNC_AUTH_'+pointer.slot+'_'+i)).join('');}
function data(backup){return Object.fromEntries(collections.map(key=>[key,backup[key]]));}
function balanced(mock){assert.equal(mock.state.lockHeld,false,'Script lock is released');assert.equal(mock.state.locks,mock.state.releases,'Every acquired script lock is released');}

test('setup is repeatable, empty data works, and fresh requests see the same database',()=>{
  const {mock,server,ok}=environment();
  assert.equal(mock.state.spreadsheets.size,1);assert.equal(mock.state.folders.size,1);
  assert.deepEqual(ok('getOptions'),[]);assert.deepEqual(ok('getMills'),[]);assert.deepEqual(ok('getRawMaterials'),[]);
  const pointer=mock.state.properties.get('CNC_ACTIVE_SNAPSHOT');
  const auth=authRaw(mock);const authPointer=mock.state.properties.get('CNC_AUTH_ACTIVE');
  server.setupDatabase();
  assert.equal(mock.state.spreadsheets.size,1);assert.equal(mock.state.folders.size,1);
  assert.equal(mock.state.properties.get('CNC_ACTIVE_SNAPSHOT'),pointer,'Setup preserves committed data');
  assert.equal(authRaw(mock),auth,'Setup preserves credentials');assert.equal(mock.state.properties.get('CNC_AUTH_ACTIVE'),authPointer,'Setup preserves the credential commit pointer');
  assert.deepEqual(mock.call(mock.load(),'getOptions'),{ok:true,value:[]});
  assert.match(server.doGet().title,/CNC/i);balanced(mock);
});

test('server rejects malformed, unknown and forged requests before protected mutations',()=>{
  const {mock,server,bad,ok,token}=environment();
  for(const action of ['__proto__','constructor','toString','setupDatabase','notAnAction'])bad(action,[],/unknown|unsupported|action/i);
  for(const args of [null,{},'not an array']){
    const result=JSON.parse(JSON.stringify(server.cncCall('getOptions',args)));
    assert.equal(result.ok,false);assert.match(result.error,/argument|request|array/i);
  }
  bad('adminLogin',['wrong','admin'],/incorrect/i);
  bad('adminLogin',['admin','wrong'],/incorrect/i);
  bad('adminSaveMaterial',['forged',{name:'Forged'},null],/AUTH_REQUIRED|session|sign in/i);
  assert.deepEqual(ok('getMaterials'),[]);
  ok('adminLogout',token);bad('adminListMaterials',[token],/AUTH_REQUIRED|session|sign in/i);
  balanced(mock);
});

test('custom password labels, duplicate protection, revocation, expiry and permanent fallback persist across requests',()=>{
  const {mock,ok,bad,login,token}=environment();
  ok('adminAddPassword',token,'Mentor A','mentor-pass-A');
  ok('adminAddPassword',token,'Mentor B','mentor-pass-B');
  const first=ok('adminListPasswords',token).find(item=>item.label==='Mentor A');
  const second=ok('adminListPasswords',token).find(item=>item.label==='Mentor B');
  assert.equal(ok('adminListPasswords',token).filter(item=>item.isDefault).length,1);
  bad('adminAddPassword',[token,'mentor a','different-password'],/label|exists/i);
  bad('adminAddPassword',[token,'Duplicate value','mentor-pass-A'],/password.*exist|duplicate/i);
  bad('adminAddPassword',[token,'Short','tiny'],/8|length/i);
  bad('adminUpdatePassword',[token,'default-admin','Changed','fallback-changed'],/fallback|default/i);
  bad('adminDeletePassword',[token,'default-admin'],/fallback|default/i);
  const tokenA=login('mentor-pass-A'), tokenB=login('mentor-pass-B');
  const fresh=mock.load();
  assert.equal(mock.call(fresh,'adminListPasswords',tokenA).ok,true,'Session reaches another Apps Script request');
  ok('adminUpdatePassword',token,first.id,'Mentor A renamed','');
  bad('adminListPasswords',[tokenA],/AUTH_REQUIRED|session|sign in/i);
  assert.equal(ok('adminListPasswords',tokenB).length,3,'Unrelated session remains valid');
  const renamedToken=login('mentor-pass-A');
  ok('adminUpdatePassword',token,first.id,'Mentor A renamed','mentor-pass-A2');
  bad('adminListPasswords',[renamedToken],/AUTH_REQUIRED|session|sign in/i);
  bad('adminLogin',['admin','mentor-pass-A'],/incorrect/i);
  const rotatedToken=login('mentor-pass-A2');assert.equal(ok('adminListPasswords',rotatedToken).length,3);
  ok('adminDeletePassword',token,second.id);
  bad('adminListPasswords',[tokenB],/AUTH_REQUIRED|session|sign in/i);
  assert.ok(login('admin'),'Default remains usable');
  mock.state.advance(3600001);
  bad('adminListPasswords',[rotatedToken],/AUTH_REQUIRED|session|sign in/i);
  assert.ok(login('admin'),'Default is usable after session expiry');
  const persisted=[...mock.state.properties.values()].join('\n');
  for(const password of ['mentor-pass-A','mentor-pass-A2','mentor-pass-B'])assert.ok(!persisted.includes(password),'Custom password is not persisted as plaintext');
  balanced(mock);
});

test('mills, settings, inventory and sheet batches retain IDs, inches, plunge/mist and private shared images',()=>{
  const env=environment();seed(env);const {mock,ok,token}=env;
  assert.deepEqual(ok('getOptions'),[{mill:'001',materials:['Aluminum 6061']}]);
  const setting=ok('getSettings','001','Aluminum 6061');
  assert.equal(setting.feed,40);assert.equal(setting.plungeRate,8);assert.equal(setting.depth,.125);assert.equal(setting.coolantMist,true);assert.equal(setting.units,'inch');
  assert.equal(setting.materialImage,image);assert.equal(setting.toolImage,image);
  const mill=ok('getMills')[0],material=ok('getMaterials')[0],raw=ok('getRawMaterials')[0];
  assert.equal(mill.number,'001');assert.equal(mill.diameter,'0.25');assert.equal(mill.quantity,4);assert.equal(mill.stockStatus,'in');
  assert.equal(raw.length,'96');assert.equal(raw.width,'48');assert.equal(raw.thickness,'.125');assert.equal(raw.quantity,3);assert.equal(raw.materialImage,image);assert.ok(raw.id);assert.ok(raw.version);
  assert.equal(material.rawUsageCount,1);assert.equal(material.usageCount,1);
  const dashboard=ok('getDashboard');assert.equal(dashboard.rawSheets,3);assert.equal(dashboard.unitsInStock,4);
  assert.ok([...mock.state.files.values()].some(file=>file.mime==='image/png'),'Uploaded image is stored in Drive');
  assert.ok([...mock.state.files.values()].every(file=>!file.public),'No file was made public');
  const fresh=mock.load();assert.deepEqual(mock.call(fresh,'getRawMaterials').value,[raw]);
  const snapshotValues=[...mock.state.spreadsheets.values()].flatMap(book=>book.sheets.flatMap(sheet=>sheet.cells.flat()));
  assert.ok(!snapshotValues.join('').includes(image),'Snapshots hold image references, not oversized embedded photos');
  const snapshotText=snapshotValues.join('');assert.ok(!snapshotText.includes('mentor-pass'),'Snapshots omit passwords');
  balanced(mock);
});

test('versions prevent lost updates and invalid forms cannot change saved records',()=>{
  const env=environment();seed(env);const {mock,ok,bad,token}=env;
  const mill=ok('getMills')[0];
  ok('adminSetInventory',token,mill.number,'2','3','Drawer B',mill.version);
  bad('adminSetInventory',[token,mill.number,'99','3','Drawer C',mill.version],/changed|refresh/i);
  const latest=ok('getMills')[0];assert.equal(latest.quantity,2);assert.equal(latest.stockStatus,'low');
  bad('adminSetInventory',[token,latest.number,'1.5','3','',latest.version],/whole|integer/i);
  const raw=ok('getRawMaterials')[0];const {id,version,materialImage,...fields}=raw;
  ok('adminSaveRawMaterial',token,{...fields,quantity:0},{id,version});
  bad('adminSaveRawMaterial',[token,{...fields,quantity:9},{id,version}],/changed|refresh/i);
  bad('adminDeleteRawMaterial',[token,{id,version}],/changed|refresh/i);
  for(const invalid of [{length:'0'},{width:'-1'},{thickness:'0'},{quantity:1.5},{units:'mm'},{material:'Unknown'}])bad('adminSaveRawMaterial',[token,{...fields,...invalid},null],/positive|whole|inch|material/i);
  assert.equal(ok('getRawMaterials')[0].quantity,0);
  const setting=ok('adminListSettings',token)[0];const original={key:setting.key,version:setting.version};
  bad('adminSaveSetting',[token,{...setting,plungeRate:'0'},original],/positive/i);
  bad('adminSaveSetting',[token,{...setting,coolantMist:'yes'},original],/enabled|disabled|boolean/i);
  assert.equal(ok('getSettings','001','Aluminum 6061').plungeRate,8);balanced(mock);
});

test('material/mill renames preserve references and deletion respects zero-quantity sheet records',()=>{
  const env=environment();seed(env);const {mock,ok,bad,token}=env;
  let material=ok('getMaterials')[0];
  ok('adminSaveMaterial',token,{name:'Aluminum 6061-T6',materialImage:image},{name:material.name,version:material.version});
  const raw=ok('getRawMaterials')[0];assert.equal(raw.material,'Aluminum 6061-T6');assert.equal(raw.materialImage,image);
  assert.equal(ok('getSettings','001','Aluminum 6061-T6').materialImage,image);
  bad('adminSaveMaterial',[token,{name:'Stale'},{name:material.name,version:material.version}],/exists|changed|refresh/i);
  const mill=ok('getMills')[0];
  ok('adminSaveMill',token,{...mill,number:'002'},{number:mill.number,version:mill.version});
  assert.equal(ok('getSettings','002','Aluminum 6061-T6').mill,'002');
  bad('adminDeleteMill',[token,{number:'002',version:ok('getMills')[0].version}],/used|settings/i);
  const setting=ok('adminListSettings',token)[0];ok('adminDeleteSetting',token,{key:setting.key,version:setting.version});
  const {id,version,materialImage,...fields}=raw;ok('adminSaveRawMaterial',token,{...fields,quantity:0},{id,version});
  material=ok('getMaterials')[0];bad('adminDeleteMaterial',[token,{name:material.name,version:material.version}],/raw|sheet|record|used/i);
  const zero=ok('getRawMaterials')[0];ok('adminDeleteRawMaterial',token,{id:zero.id,version:zero.version});
  ok('adminDeleteMaterial',token,{name:material.name,version:material.version});
  assert.deepEqual(ok('getMaterials'),[]);balanced(mock);
});

test('JSON/portable data retains shared records and images, imports preserve credentials and reject invalid references atomically',()=>{
  const env=environment();seed(env);const {mock,ok,bad,token}=env;
  ok('adminAddPassword',token,'Cloud mentor','cloud-mentor-password');
  const backup=ok('adminExportBackup',token),portable=ok('adminPortableData',token);
  assert.deepEqual(data(portable),data(backup));assert.equal(Object.hasOwn(backup,'auth'),false);
  assert.ok(!JSON.stringify(backup).includes('cncImageId'),'Backups contain portable images, not Drive-only IDs');
  assert.equal(backup.materials[0].materialImage,image);assert.equal(backup.mills[0].toolImage,image);
  const beforePointer=mock.state.properties.get('CNC_ACTIVE_SNAPSHOT');
  bad('adminImportBackup',[token,{...backup,materials:[]}],/material.*missing|refers/i);
  assert.equal(mock.state.properties.get('CNC_ACTIVE_SNAPSHOT'),beforePointer);
  assert.deepEqual(data(ok('adminExportBackup',token)),data(backup));
  ok('adminImportBackup',token,{...backup,auth:{password:'hostile'}});
  assert.deepEqual(data(ok('adminExportBackup',token)),data(backup));
  assert.ok(ok('adminLogin','admin','cloud-mentor-password').token);
  const other=environment();other.ok('adminImportBackup',other.token,backup);
  assert.deepEqual(data(other.ok('adminExportBackup',other.token)),data(backup));
  other.bad('adminLogin',['admin','cloud-mentor-password'],/incorrect/i);
  assert.ok(other.ok('adminLogin','admin','Feds201').token);balanced(mock);balanced(other.mock);
});

test('failed snapshot writes and pointer commits leave the complete previous revision readable',()=>{
  const env=environment();seed(env);const {mock,ok,bad,token}=env;
  const backup=ok('adminExportBackup',token),before=data(backup);
  const input={...backup,materials:[...backup.materials,{name:'New material'}]};
  for(const kind of ['range.setValues','spreadsheet.flush']){
    const pointer=mock.state.properties.get('CNC_ACTIVE_SNAPSHOT');mock.state.failNext(kind);
    bad('adminImportBackup',[token,input],/Injected|failure|save/i);
    assert.equal(mock.state.properties.get('CNC_ACTIVE_SNAPSHOT'),pointer,kind+' cannot expose a staged snapshot');
    assert.deepEqual(data(ok('adminExportBackup',token)),before,kind+' preserves every data collection');
    assert.deepEqual(data(mock.call(mock.load(),'adminExportBackup',token).value),before,'Fresh request sees committed snapshot');
  }
  const pointer=mock.state.properties.get('CNC_ACTIVE_SNAPSHOT');
  mock.state.failNext('properties.setProperty','Injected pointer failure',entry=>entry.key==='CNC_ACTIVE_SNAPSHOT');
  bad('adminImportBackup',[token,input],/Injected|failure|save/i);
  assert.equal(mock.state.properties.get('CNC_ACTIVE_SNAPSHOT'),pointer);
  assert.deepEqual(data(ok('adminExportBackup',token)),before);
  ok('adminImportBackup',token,input);assert.equal(ok('getMaterials').length,2,'Retry saves after transient failures');
  balanced(mock);
});

test('legacy metric data converts once, old backups create libraries, and formula-like notes stay literal',()=>{
  const {mock,ok,token}=environment();
  const legacy={format:'cnc-local-backup',schemaVersion:1,settings:[{mill:'0007',material:'Legacy aluminum',rpm:'6000',feed:'254',plungeRate:'127',depth:'25.4',units:'mm',coolantMist:false,notes:'=IMPORTXML("sample")'}]};
  ok('adminImportBackup',token,legacy);
  let setting=ok('getSettings','0007','Legacy aluminum');assert.equal(setting.feed,10);assert.equal(setting.plungeRate,5);assert.equal(setting.depth,1);assert.equal(setting.coolantMist,false);assert.equal(setting.units,'inch');assert.equal(setting.notes,legacy.settings[0].notes);
  assert.equal(ok('getMills')[0].number,'0007');assert.equal(ok('getMills')[0].stockStatus,'untracked');assert.equal(ok('getMaterials')[0].name,'Legacy aluminum');assert.deepEqual(ok('getRawMaterials'),[]);
  const backup=ok('adminExportBackup',token);ok('adminImportBackup',token,backup);setting=ok('getSettings','0007','Legacy aluminum');assert.equal(setting.feed,10);assert.equal(setting.depth,1);balanced(mock);
});

test('large snapshots cross sheet-cell boundaries without truncation, and failed staging bodies preserve the prior snapshot',()=>{
  const {mock,ok,bad,token}=environment();
  const backup={format:'cnc-local-backup',schemaVersion:1,materials:[{name:'Batch material'}],mills:[],rawMaterials:[],settings:[]};
  for(let i=0;i<80;i++)backup.rawMaterials.push({id:'batch-'+i,material:'Batch material',length:'96',width:'48',quantity:i,location:'Rack '+i,notes:'Unique batch '+i+' '+('x'.repeat(1900))});
  ok('adminImportBackup',token,backup);
  let pointer=JSON.parse(mock.state.properties.get('CNC_ACTIVE_SNAPSHOT'));
  assert.ok(pointer.parts>1,'Large payload uses multiple bounded sheet cells');
  const sheet=[...mock.state.spreadsheets.values()][0].sheets.find(sheet=>sheet.name===pointer.sheet);
  for(const row of sheet.cells.slice(1))assert.ok(row[1].length<=38002,'Every snapshot chunk stays below Sheets cell limits');
  const before=data(ok('adminExportBackup',token));
  assert.equal(before.rawMaterials.length,80);assert.equal(before.rawMaterials[79].notes,backup.rawMaterials[79].notes);
  assert.deepEqual(data(mock.call(mock.load(),'adminExportBackup',token).value),before);
  const rawPointer=mock.state.properties.get('CNC_ACTIVE_SNAPSHOT');
  mock.state.failAt('range.setValues',2,'Injected staging body failure');
  bad('adminImportBackup',[token,{...backup,rawMaterials:[]}],/Injected|failure/i);
  assert.equal(mock.state.properties.get('CNC_ACTIVE_SNAPSHOT'),rawPointer);
  assert.deepEqual(data(ok('adminExportBackup',token)),before);balanced(mock);
});

test('corrupt committed snapshots and image bytes are reported without replacing stored data',()=>{
  const env=environment();seed(env);const {mock,server,call,token}=env;
  const pointer=mock.state.properties.get('CNC_ACTIVE_SNAPSHOT');
  const parsed=JSON.parse(pointer);
  const sheet=[...mock.state.spreadsheets.values()][0].sheets.find(sheet=>sheet.name===parsed.sheet);
  const original=sheet.cells[1][1];sheet.cells[1][1]+='corrupt';
  let result=call('getDashboard');assert.equal(result.ok,false);assert.match(result.error,/integrity|incomplete|invalid/i);
  result=call('adminSaveMaterial',token,{name:'Must not save'},null);assert.equal(result.ok,false);assert.match(result.error,/integrity|incomplete|invalid/i);
  assert.throws(()=>server.setupDatabase(),/integrity|incomplete|invalid/i);
  assert.equal(mock.state.properties.get('CNC_ACTIVE_SNAPSHOT'),pointer);assert.equal(sheet.cells[1][1],original+'corrupt');
  sheet.cells[1][1]=original;
  const photo=[...mock.state.files.values()].find(file=>file.mime==='image/png');const originalBytes=photo.data;photo.data=Buffer.from('not the original image');
  result=call('getMaterials');assert.equal(result.ok,false);assert.match(result.error,/image.*changed|incomplete|invalid/i);
  assert.equal(mock.state.properties.get('CNC_ACTIVE_SNAPSHOT'),pointer);photo.data=originalBytes;
  assert.equal(call('getMaterials').ok,true,'Repairing test damage restores normal reads');balanced(mock);
});

test('custom password count and label boundaries are enforced without changing the saved list',()=>{
  const {mock,ok,bad,token}=environment();
  for(let i=0;i<20;i++)ok('adminAddPassword',token,'Mentor '+i,'password-number-'+i);
  const saved=authRaw(mock);
  assert.equal(ok('adminListPasswords',token).length,21);
  bad('adminAddPassword',[token,'Mentor 21','one-password-too-many'],/20|most|limit/i);
  bad('adminAddPassword',[token,'x'.repeat(81),'valid-new-password'],/80|label/i);
  assert.equal(authRaw(mock),saved);
  for(const value of mock.state.properties.values())assert.ok(Buffer.byteLength(value,'utf8')<=9000,'Every Script Properties value fits its UTF-8 byte limit');
  assert.ok(ok('adminLogin','admin','password-number-19').token);balanced(mock);
});

test('credential write failures preserve prior logins and lock acquisition failures are recoverable',()=>{
  const {mock,ok,bad,login,token}=environment();
  ok('adminAddPassword',token,'Mentor','original-mentor-password');
  const credential=ok('adminListPasswords',token).find(item=>!item.isDefault),mentorToken=login('original-mentor-password');
  const previous=authRaw(mock);
  mock.state.failNext('properties.setProperty','Injected credential write failure',entry=>entry.key==='CNC_AUTH_ACTIVE');
  bad('adminUpdatePassword',[token,credential.id,'Mentor changed','replacement-mentor-password'],/Injected|failure/i);
  assert.equal(authRaw(mock),previous);assert.equal(ok('adminListPasswords',mentorToken).length,2);
  assert.ok(login('original-mentor-password'));
  mock.state.failNext('lock.waitLock','Injected lock timeout');bad('getDashboard',[],/busy/i);
  assert.equal(ok('getDashboard').mills,0);balanced(mock);
});

test('twenty maximum-length Unicode password labels stay within per-property UTF-8 limits and survive fresh requests',()=>{
  const {mock,ok,token}=environment();
  const labels=Array.from({length:20},(_,i)=>'材'.repeat(78)+String(i).padStart(2,'0'));
  for(let i=0;i<labels.length;i++)ok('adminAddPassword',token,labels[i],'unicode-mentor-password-'+i);
  const raw=authRaw(mock);
  assert.ok(Buffer.byteLength(raw,'utf8')>9000,'The complete credential list exceeds one Script Properties value');
  const pointer=JSON.parse(mock.state.properties.get('CNC_AUTH_ACTIVE'));assert.ok(pointer.parts>1,'Credentials are saved in bounded chunks');
  for(const value of mock.state.properties.values())assert.ok(Buffer.byteLength(value,'utf8')<=9000,'Each property fits the actual UTF-8 byte limit');
  assert.deepEqual(ok('adminListPasswords',token).filter(item=>!item.isDefault).map(item=>item.label),labels);
  const fresh=mock.load();
  const login=mock.call(fresh,'adminLogin','admin','unicode-mentor-password-19');assert.equal(login.ok,true,login.error);
  assert.equal(mock.call(mock.load(),'adminListPasswords',login.value.token).value.length,21);
  balanced(mock);
});

test('auth chunk and pointer failures preserve old credentials, while corrupt auth chunks cannot trigger a silent reset',()=>{
  const {mock,server,ok,bad,login,token}=environment();
  for(let i=0;i<8;i++)ok('adminAddPassword',token,'😀'.repeat(38)+String(i).padStart(2,'0'),'chunk-mentor-password-'+i);
  const list=ok('adminListPasswords',token),credential=list.find(item=>!item.isDefault),mentorToken=login('chunk-mentor-password-0');
  const previous=authRaw(mock),active=mock.state.properties.get('CNC_AUTH_ACTIVE');
  for(const testProperty of [entry=>/^CNC_AUTH_[AB]_0$/.test(entry.key),entry=>entry.key==='CNC_AUTH_ACTIVE']){
    mock.state.failNext('properties.setProperty','Injected auth snapshot write failure',testProperty);
    bad('adminUpdatePassword',[token,credential.id,'A replacement label','replacement-mentor-password'],/Injected|failure/i);
    assert.equal(authRaw(mock),previous);assert.equal(mock.state.properties.get('CNC_AUTH_ACTIVE'),active);
    assert.deepEqual(ok('adminListPasswords',mentorToken),list,'Prior sessions and complete password list stay usable after write failure');
    assert.ok(login('chunk-mentor-password-0'));
  }
  const pointer=JSON.parse(active),key='CNC_AUTH_'+pointer.slot+'_0',part=mock.state.properties.get(key);
  mock.state.properties.set(key,part+'corrupt');
  bad('adminLogin',['admin','Feds201'],/integrity|invalid|incomplete/i);
  bad('adminAddPassword',[token,'Must not save','must-not-save-password'],/integrity|invalid|incomplete/i);
  assert.throws(()=>server.setupDatabase(),/integrity|invalid|incomplete/i);
  assert.equal(mock.state.properties.get('CNC_AUTH_ACTIVE'),active);assert.equal(mock.state.properties.get(key),part+'corrupt');
  mock.state.properties.set(key,part);assert.deepEqual(ok('adminListPasswords',mentorToken),list);balanced(mock);
});

test('sheet snapshot chunk boundaries preserve surrogate pairs in long Unicode notes',()=>{
  const {mock,ok,token}=environment();
  const backup={format:'cnc-local-backup',schemaVersion:1,materials:[{name:'Unicode material'}],mills:[],rawMaterials:[],settings:[]};
  for(let i=0;i<80;i++)backup.rawMaterials.push({id:'unicode-batch-'+i,material:'Unicode material',length:'96',width:'48',quantity:i,location:'Rack '+i,notes:'Batch '+String(i).padStart(2,'0')+':'+('x'.repeat(1850))});
  ok('adminImportBackup',token,backup);
  function stored(){const pointer=JSON.parse(mock.state.properties.get('CNC_ACTIVE_SNAPSHOT'));const sheet=[...mock.state.spreadsheets.values()][0].sheets.find(sheet=>sheet.name===pointer.sheet);return {pointer,parts:sheet.cells.slice(1,pointer.parts+1).map(row=>row[1].slice(2))};}
  const baseline=stored().parts.join('');
  let edited=false;
  for(let boundary=38000;boundary<baseline.length&&!edited;boundary+=38000){
    for(const record of backup.rawMaterials){
      const start=baseline.indexOf('"notes":"'+record.notes)+9;
      if(start>=9&&boundary-1>=start&&boundary-1<start+record.notes.length){
        const offset=boundary-1-start;
        record.notes=record.notes.slice(0,offset)+'😀'+record.notes.slice(offset+1);edited=true;break;
      }
    }
  }
  assert.equal(edited,true,'Fixture places a surrogate pair across an exact 38,000-code-unit boundary');
  ok('adminImportBackup',token,backup);
  const {parts}=stored();
  for(const part of parts){
    assert.ok(part.length<=38000);
    for(let i=0;i<part.length;i++){
      const unit=part.charCodeAt(i);
      if(unit>=0xd800&&unit<=0xdbff){assert.ok(i+1<part.length,'A high surrogate must not end a chunk');const next=part.charCodeAt(++i);assert.ok(next>=0xdc00&&next<=0xdfff,'Surrogate pair remains intact');}
      else assert.ok(unit<0xdc00||unit>0xdfff,'A low surrogate must not start a chunk');
    }
  }
  assert.deepEqual(ok('adminExportBackup',token).rawMaterials.map(item=>item.notes),backup.rawMaterials.map(item=>item.notes));
  assert.deepEqual(mock.call(mock.load(),'getRawMaterials').value.map(item=>item.notes),backup.rawMaterials.map(item=>item.notes));
  balanced(mock);
});


test('password restoration preserves existing data and inactive Google-account configuration',()=>{
 const env=environment();seed(env);const {mock,server,ok,token,bad}=env;
 mock.state.properties.set('CNC_OWNER_EMAIL','owner@example.com');
 mock.state.properties.set('CNC_EDITORS',JSON.stringify([{email:'editor@example.com',version:'old-grant'}]));
 const before=data(ok('adminExportBackup',token));
 const pointer=mock.state.properties.get('CNC_ACTIVE_SNAPSHOT');
 server.setupDatabase_();
 assert.equal(mock.state.properties.get('CNC_ACTIVE_SNAPSHOT'),pointer);
 assert.equal(mock.state.properties.get('CNC_OWNER_EMAIL'),'owner@example.com');
 assert.equal(JSON.parse(mock.state.properties.get('CNC_EDITORS'))[0].email,'editor@example.com');
 assert.deepEqual(data(ok('adminExportBackup',token)),before);
 bad('adminSaveMaterial',['forged-token',{name:'Blocked'},null],/AUTH_REQUIRED/);
 assert.ok(ok('adminLogin','admin','Feds201').token);balanced(mock);
});

test('Mills and Material Stock show separate readable inventories with literal IDs and numeric counts',()=>{
 const env=environment();seed(env);const {mock,ok,token,server}=env;
 const book=[...mock.state.spreadsheets.values()][0];
 const rows=name=>book.sheets.find(sheet=>sheet.name===name).api.getDataRange().getValues();
 assert.equal(rows('Mills')[0][0],'Mill number');assert.equal(rows('Material Stock')[0][0],'Material');
 assert.equal(rows('Mills')[1][0],'001');assert.equal(rows('Mills')[1][3],.25);assert.equal(rows('Mills')[1][5],4);
 assert.equal(rows('Material Stock')[1][2],96);assert.equal(rows('Material Stock')[1][4],.125);assert.equal(rows('Material Stock')[1][5],3);
 assert.equal(rows('Material Stock')[1][7],'=literal batch note');
 const id=rows('Material Stock')[1][1];
 const material=ok('adminListMaterials',token)[0];ok('adminSaveMaterial',token,{name:'Aluminum renamed'},{name:material.name,version:material.version});
 assert.equal(rows('Material Stock')[1][0],'Aluminum renamed');assert.equal(rows('Material Stock')[1][1],id);
 const mill=ok('getMills')[0];ok('adminSetInventory',token,mill.number,0,'','Rack Z',mill.version);
 assert.equal(rows('Mills')[1][5],0);assert.equal(rows('Mills')[1][6],'');assert.equal(rows('Mills')[1][8],'Out of stock');
 ok('adminSaveMill',token,{number:'002'},null);assert.equal(rows('Mills')[2][5],'');assert.equal(rows('Mills')[2][8],'Not counted');
 const raw=ok('getRawMaterials')[0];ok('adminDeleteRawMaterial',token,{id:raw.id,version:raw.version});assert.equal(rows('Material Stock').length,1);
 const backup=ok('adminExportBackup',token);server.setupDatabase();assert.deepEqual(data(ok('adminExportBackup',token)),data(backup));
 balanced(mock);
});

test('inventory view failures preserve committed saves, show warnings without read-side rebuilds, and repair on setup',()=>{
 const {mock,server,ok,token}=environment();
 for(let i=0;i<1;i++)mock.state.failNext('range.setValues','Inventory view unavailable',entry=>entry.sheet==='Mills');
 assert.equal(ok('adminSaveMill',token,{number:'003',quantity:7},null),true);
 assert.equal(ok('getMills')[0].quantity,7);
 assert.match(ok('getDashboard').sheetSyncWarning,/data is saved.*could not refresh/);
 server.setupDatabase();
 assert.equal(ok('getDashboard').sheetSyncWarning,undefined);
 const book=[...mock.state.spreadsheets.values()][0];assert.equal(book.sheets.find(s=>s.name==='Mills').cells[1][5],7);
 assert.equal(mock.state.properties.get('CNC_INVENTORY_VIEW_REVISION'),String(JSON.parse(mock.state.properties.get('CNC_ACTIVE_SNAPSHOT')).revision));balanced(mock);
});

test('existing unrelated tab contents are not overwritten and setup backfills missing views',()=>{
 const {mock,server,ok,token}=environment();const book=[...mock.state.spreadsheets.values()][0];
 book.sheets=book.sheets.filter(s=>s.name!=='Material Stock');server.setupDatabase();assert.ok(book.sheets.some(s=>s.name==='Material Stock'));
 const sheet=book.sheets.find(s=>s.name==='Mills');sheet.cells=[['My unrelated data'],['Keep me']];
 assert.equal(ok('adminSaveMill',token,{number:'004'},null),true);
 assert.match(ok('getDashboard').sheetSyncWarning,/Rename the existing/);
 assert.deepEqual(sheet.cells,[['My unrelated data'],['Keep me']]);assert.equal(ok('getMills')[0].number,'004');balanced(mock);
});

test('bulk workspace reads acquire one lock and read one saved snapshot without rebuilding inventory tabs',()=>{
 const {mock,ok}=environment();const before=mock.state.trace.length,locks=mock.state.locks;
 const result=ok('getWorkspaceData');assert.deepEqual(result.mills,[]);assert.deepEqual(result.materials,[]);
 const trace=mock.state.trace.slice(before);assert.equal(mock.state.locks-locks,1);
 assert.equal(trace.filter(e=>e.kind==='range.getValues'&&e.row===2).length,1);
 assert.equal(trace.filter(e=>e.kind==='sheet.clear').length,0);balanced(mock);
});
test('lock contention is explicitly retryable before any save begins',()=>{
 const {mock,call,token}=environment();const snapshot=mock.state.properties.get('CNC_ACTIVE_SNAPSHOT');
 mock.state.lockHeld=true;
 const result=call('adminSaveMill',token,{number:'Not saved'},null);assert.equal(result.ok,false);assert.equal(result.retryable,true);
 assert.equal(mock.state.properties.get('CNC_ACTIVE_SNAPSHOT'),snapshot);mock.state.lockHeld=false;
 assert.equal(call('adminSaveMill',token,{number:''},null).retryable,false);balanced(mock);
});
test('cutting-setting-only changes do not rewrite the inventory spreadsheet views',()=>{
 const env=environment();seed(env);const {mock,ok,token}=env;const item=ok('adminListSettings',token)[0];const start=mock.state.trace.length;
 ok('adminSaveSetting',token,{...item,feed:'41'}, {key:item.key,version:item.version});
 const trace=mock.state.trace.slice(start);assert.equal(trace.filter(e=>e.kind==='sheet.clear'&&['Mills','Material Stock'].includes(e.name)).length,0);balanced(mock);
});
