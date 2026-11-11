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

test('purchase links persist through inventory changes and backups; unsafe links reject atomically',async()=>{
 const f=await fixture(),{token}=await f.ok('adminLogin','ADMIN','feds201');
 const url='https://supplier.example/end-mill?size=0.25&flutes=2';
 await f.ok('adminSaveMill',token,{number:'BUY-001',purchaseUrl:url,quantity:1,reorderLevel:2},null);
 let mill=(await f.ok('getMills'))[0];assert.equal(mill.purchaseUrl,url);
 await f.ok('adminSetInventory',token,mill.number,0,2,'Drawer',mill.version);
 assert.equal((await f.ok('getMills'))[0].purchaseUrl,url);
 const backup=await f.ok('adminExportBackup',token);assert.equal(backup.mills[0].purchaseUrl,url);
 for(const invalid of ['javascript:alert(1)','data:text/html,bad','https://user:pass@host.example/',{},'https://','https://supplier.example/'+ 'x'.repeat(2048)]){
  const before=structuredClone(f.getState());const result=await f.call('adminSaveMill',token,{number:'Invalid',purchaseUrl:invalid},null);assert.equal(result.ok,false);assert.deepEqual(f.getState(),before);
 }
 await f.ok('adminImportBackup',token,backup);mill=(await f.ok('getMills'))[0];assert.equal(mill.purchaseUrl,url);
 await f.ok('adminSaveMill',token,{...mill,purchaseUrl:''},{number:mill.number,version:mill.version});assert.equal((await f.ok('getMills'))[0].purchaseUrl,undefined);
});

test('notes protect edits, reject stale writes, export safely, and accept older backups',async()=>{
 const f=await fixture(),{token}=await f.ok('adminLogin','admin','Feds201');
 assert.deepEqual(await f.ok('getNotes'),[]);
 assert.equal((await f.call('adminSaveNote','bad',{title:'No',body:'Blocked'},null)).ok,false);
 await f.ok('adminSaveNote',token,{title:'Setup',body:'First line\n<script>literal text</script>'},null);
 const original=(await f.ok('getNotes'))[0];
 assert.equal((await f.ok('getWorkspaceData')).notes[0].id,original.id);
 await f.ok('adminSaveNote',token,{title:'Setup updated',body:'Fresh'},original);
 const before=JSON.stringify(f.getState());
 assert.equal((await f.call('adminSaveNote',token,{title:'Stale',body:'Lost'},original)).ok,false);
 assert.equal((await f.call('adminDeleteNote',token,original)).ok,false);
 assert.equal((await f.call('adminSaveNote',token,{title:'',body:'Bad'},null)).ok,false);
 assert.equal((await f.call('adminSaveNote',token,{title:'Bad',body:'x'.repeat(10001)},null)).ok,false);
 assert.equal(JSON.stringify(f.getState()),before);
 const backup=await f.ok('adminExportBackup',token);assert.equal(backup.notes[0].body,'Fresh');assert.equal('version' in backup.notes[0],false);assert.equal('auth' in backup,false);
 const invalid=structuredClone(backup);invalid.notes.push(invalid.notes[0]);assert.equal((await f.call('adminImportBackup',token,invalid)).ok,false);assert.equal(JSON.stringify(f.getState()),before);
 await f.ok('adminImportBackup',token,backup);assert.equal((await f.ok('getNotes'))[0].body,'Fresh');
 const current=(await f.ok('getNotes'))[0];await f.ok('adminDeleteNote',token,current);assert.deepEqual(await f.ok('getNotes'),[]);
 delete backup.notes;await f.ok('adminImportBackup',token,backup);assert.deepEqual(await f.ok('getNotes'),[]);
});

test('pins and cut plans persist, protect stale edits, and keep inventory independent',async()=>{
 const f=await fixture(),{token}=await f.ok('adminLogin','admin','Feds201');
 await f.ok('adminSaveNote',token,{title:'Pinned note',body:'Reminder'},null);const old=(await f.ok('getNotes'))[0];assert.equal(old.pinned,false);
 assert.equal((await f.call('adminSetNotePinned','bad',old,true)).ok,false);
 await f.ok('adminSetNotePinned',token,old,true);const pinned=(await f.ok('getNotes'))[0];assert.equal(pinned.pinned,true);
 assert.equal((await f.call('adminSetNotePinned',token,old,false)).ok,false);
 await f.ok('adminSaveNote',token,{title:'Edited pin',body:'Preserved pin'},pinned);assert.equal((await f.ok('getNotes'))[0].pinned,true);
 await f.ok('adminSaveCut',token,{title:'Panel',material:'Plywood',quantity:'2',length:'24',width:'12',thickness:'.5',notes:'Keep grain direction'},null);
 const cut=(await f.ok('getCuts'))[0];assert.equal(cut.quantity,2);assert.equal(cut.completed,false);
 const inventory=JSON.stringify((await f.ok('getWorkspaceData')).rawMaterials);
 assert.equal((await f.call('adminSetCutCompleted','bad',cut,true)).ok,false);await f.ok('adminSetCutCompleted',token,cut,true);
 assert.equal((await f.call('adminDeleteCut',token,cut)).ok,false);const completed=(await f.ok('getCuts'))[0];assert.equal(completed.completed,true);
 await f.ok('adminSaveCut',token,{title:'Updated panel',quantity:3},completed);assert.equal((await f.ok('getCuts'))[0].completed,true);
 assert.equal(JSON.stringify((await f.ok('getWorkspaceData')).rawMaterials),inventory);
 const before=JSON.stringify(f.getState());for(const bad of [{title:'Bad',quantity:0},{title:'Bad',quantity:1.5},{title:'Bad',quantity:1,length:-1},{title:'Bad',quantity:1,completed:'yes'}])assert.equal((await f.call('adminSaveCut',token,bad,null)).ok,false);
 assert.equal((await f.call('adminSetNotePinned',token,(await f.ok('getNotes'))[0],'true')).ok,false);assert.equal(JSON.stringify(f.getState()),before);
 const backup=await f.ok('adminExportBackup',token);assert.equal(backup.notes[0].pinned,true);assert.equal(backup.cuts[0].completed,true);assert.equal('version' in backup.cuts[0],false);assert.equal('auth' in backup,false);
 const invalid=structuredClone(backup);invalid.cuts.push(invalid.cuts[0]);assert.equal((await f.call('adminImportBackup',token,invalid)).ok,false);assert.equal(JSON.stringify(f.getState()),before);
 await f.ok('adminImportBackup',token,backup);assert.equal((await f.ok('getCuts'))[0].completed,true);assert.equal((await f.ok('getNotes'))[0].pinned,true);
 const latest=(await f.ok('getCuts'))[0];await f.ok('adminSetCutCompleted',token,latest,false);await f.ok('adminDeleteCut',token,(await f.ok('getCuts'))[0]);assert.deepEqual(await f.ok('getCuts'),[]);
 delete backup.cuts;delete backup.notes[0].pinned;await f.ok('adminImportBackup',token,backup);assert.deepEqual(await f.ok('getCuts'),[]);assert.equal((await f.ok('getNotes'))[0].pinned,false);
});

test('recording a sheet cut atomically decrements stock and creates a smaller remainder',async()=>{
 const f=await fixture(),{token}=await f.ok('adminLogin','admin','Feds201');await f.ok('adminSaveMaterial',token,{name:'Plywood'},null);
 await f.ok('adminSaveRawMaterial',token,{material:'Plywood',length:96,width:48,thickness:'.5',quantity:2,location:'Rack',notes:'Batch'},null);
 const original=(await f.ok('getRawMaterials'))[0],before=JSON.stringify(f.getState());
 assert.equal((await f.call('adminCutRawMaterial','bad',original,null)).ok,false);
 for(const remainder of [{length:96,width:48},{length:100,width:40},{length:0,width:12},{length:60,width:60},{}])assert.equal((await f.call('adminCutRawMaterial',token,original,remainder)).ok,false);
 assert.equal(JSON.stringify(f.getState()),before);
 await f.ok('adminCutRawMaterial',token,original,{length:36,width:48});let rows=await f.ok('getRawMaterials');assert.equal(rows.length,2);
 const source=rows.find(x=>x.id===original.id),left=rows.find(x=>x.id!==original.id);assert.equal(source.quantity,1);assert.equal(left.quantity,1);assert.equal(left.length,'36');assert.equal(left.thickness,'.5');assert.equal(left.location,'Rack');assert.equal(left.notes,'Batch');assert.notEqual(source.version,original.version);
 const after=JSON.stringify(f.getState());assert.equal((await f.call('adminCutRawMaterial',token,original,null)).ok,false);assert.equal(JSON.stringify(f.getState()),after);
 await f.ok('adminCutRawMaterial',token,source,null);rows=await f.ok('getRawMaterials');assert.equal(rows.find(x=>x.id===source.id).quantity,0);
 const zero=rows.find(x=>x.id===source.id);assert.equal((await f.call('adminCutRawMaterial',token,zero,null)).ok,false);
 await f.ok('adminCutRawMaterial',token,rows.find(x=>x.id===left.id),{length:40,width:30});rows=await f.ok('getRawMaterials');assert.equal(rows.length,3,'A rotated leftover can fit');
 const backup=await f.ok('adminExportBackup',token);await f.ok('adminImportBackup',token,backup);assert.equal((await f.ok('getRawMaterials')).reduce((n,x)=>n+x.quantity,0),1);
});

test('cut priorities and planned order survive updates and backups with stale-move protection',async()=>{
 const f=await fixture(),{token}=await f.ok('adminLogin','admin','Feds201');
 for(const title of ['First','Second','Third'])await f.ok('adminSaveCut',token,{title,quantity:1},null);
 let cuts=await f.ok('getCuts');assert.deepEqual(cuts.map(c=>c.title),['First','Second','Third']);assert.ok(cuts.every(c=>c.priority==='normal'));
 const original=cuts[1];assert.equal((await f.call('adminSetCutPriority','bad',original,'urgent')).ok,false);await f.ok('adminSetCutPriority',token,original,'urgent');
 assert.equal((await f.call('adminSetCutPriority',token,original,'low')).ok,false);
 cuts=await f.ok('getCuts');await f.ok('adminSaveCut',token,{title:'Second',quantity:2},cuts[1]);cuts=await f.ok('getCuts');assert.equal(cuts[1].priority,'urgent','Older clients preserve an existing priority');
 const before=JSON.stringify(f.getState());assert.equal((await f.call('adminMoveCut','bad',cuts[1],cuts[0])).ok,false);assert.equal((await f.call('adminSetCutPriority',token,cuts[1],'critical')).ok,false);assert.equal((await f.call('adminMoveCut',token,cuts[0],cuts[2])).ok,false);assert.equal(JSON.stringify(f.getState()),before);
 const oldFirst=cuts[0],oldSecond=cuts[1];await f.ok('adminMoveCut',token,oldSecond,oldFirst);cuts=await f.ok('getCuts');assert.deepEqual(cuts.map(c=>c.title),['Second','First','Third']);
 assert.equal((await f.call('adminMoveCut',token,oldSecond,oldFirst)).ok,false,'A repeated request cannot reverse the move');
 await f.ok('adminSetCutCompleted',token,cuts[1],true);cuts=await f.ok('getCuts');assert.equal((await f.call('adminMoveCut',token,cuts[1],cuts[2])).ok,false,'Completed jobs cannot be reordered');
 await f.ok('adminMoveCut',token,cuts[2],cuts[0]);cuts=await f.ok('getCuts');assert.deepEqual(cuts.filter(c=>!c.completed).map(c=>c.title),['Third','Second'],'Completed entries do not block adjacent pending moves');
 const backup=await f.ok('adminExportBackup',token);const order=backup.cuts.map(c=>c.id);await f.ok('adminImportBackup',token,backup);cuts=await f.ok('getCuts');assert.deepEqual(cuts.map(c=>c.id),order);assert.equal(cuts.find(c=>c.title==='Second').priority,'urgent');
 const invalid=structuredClone(backup);invalid.cuts[0].priority='critical';const saved=JSON.stringify(f.getState());assert.equal((await f.call('adminImportBackup',token,invalid)).ok,false);assert.equal(JSON.stringify(f.getState()),saved);
 backup.cuts.forEach(c=>delete c.priority);await f.ok('adminImportBackup',token,backup);assert.ok((await f.ok('getCuts')).every(c=>c.priority==='normal'));assert.deepEqual((await f.ok('getCuts')).map(c=>c.id),order);
});

test('public broken-mill reports can be undone once, newest first, including after backup import',async()=>{
 const f=await fixture(),{token}=await f.ok('adminLogin','admin','Feds201');await f.ok('adminSaveMill',token,{number:'BREAK',name:'End mill',quantity:2},null);
 const first=(await f.ok('getMills'))[0];await f.ok('reportBrokenMill',{number:first.number,version:first.version},{reporter:'Student',details:'Chipped flute'});
 assert.equal((await f.ok('getMills'))[0].quantity,1);assert.equal((await f.call('reportBrokenMill',first,{})).ok,false);
 let current=(await f.ok('getMills'))[0];await f.ok('reportBrokenMill',{number:current.number,version:current.version},{});assert.equal((await f.ok('getMills'))[0].quantity,0);
 current=(await f.ok('getMills'))[0];assert.equal((await f.call('reportBrokenMill',current,{})).ok,false);
 assert.equal((await f.call('adminListReports','bad')).ok,false);let reports=await f.ok('adminListReports',token);assert.equal(reports.length,2);assert.equal(reports[1].reporter,'Student');
 assert.equal((await f.call('adminUndoReport','bad',reports[0])).ok,false);assert.equal((await f.call('adminUndoReport',token,reports[1])).ok,false,'Newer report must be undone first');
 const backup=await f.ok('adminExportBackup',token);assert.equal('auth' in backup,false);await f.ok('adminImportBackup',token,backup);reports=await f.ok('adminListReports',token);
 const newest=reports[0];await f.ok('adminUndoReport',token,newest);assert.equal((await f.ok('getMills'))[0].quantity,1);assert.equal((await f.call('adminUndoReport',token,newest)).ok,false);
 reports=await f.ok('adminListReports',token);await f.ok('adminUndoReport',token,reports.find(r=>!r.undone));assert.equal((await f.ok('getMills'))[0].quantity,2);
 assert.ok((await f.ok('adminListReports',token)).every(r=>r.undone));assert.equal('reports' in await f.ok('getWorkspaceData'),false,'Undo snapshots are admin-only');
});

test('material report chains undo leftovers safely and preserve later edits',async()=>{
 const f=await fixture(),{token}=await f.ok('adminLogin','admin','Feds201');await f.ok('adminSaveMaterial',token,{name:'Sheet'},null);await f.ok('adminSaveRawMaterial',token,{material:'Sheet',length:96,width:48,quantity:2,thickness:'.5'},null);
 const full=(await f.ok('getRawMaterials'))[0];const before=JSON.stringify(f.getState());assert.equal((await f.call('reportMaterialCut',full,{length:200,width:200},{})).ok,false);assert.equal(JSON.stringify(f.getState()),before);
 await f.ok('reportMaterialCut',full,{length:48,width:24},{reporter:'Operator'});let rows=await f.ok('getRawMaterials');const leftover=rows.find(x=>x.id!==full.id);await f.ok('reportMaterialCut',leftover,{length:12,width:12},{});
 let reports=await f.ok('adminListReports',token);assert.equal((await f.call('adminUndoReport',token,reports[1])).ok,false,'A used leftover blocks its parent undo');
 const backup=await f.ok('adminExportBackup',token);await f.ok('adminImportBackup',token,backup);reports=await f.ok('adminListReports',token);await f.ok('adminUndoReport',token,reports[0]);reports=await f.ok('adminListReports',token);await f.ok('adminUndoReport',token,reports.find(r=>!r.undone));rows=await f.ok('getRawMaterials');assert.equal(rows.length,1);assert.equal(rows[0].quantity,2);
 await f.ok('reportMaterialCut',rows[0],null,{});const report=(await f.ok('adminListReports',token))[0];const latest=(await f.ok('getRawMaterials'))[0];await f.ok('adminSaveRawMaterial',token,{...latest,quantity:5},latest);const saved=JSON.stringify(f.getState());assert.equal((await f.call('adminUndoReport',token,report)).ok,false);assert.equal(JSON.stringify(f.getState()),saved,'Undo cannot overwrite an admin edit');
});

test('cut completion reports are public, admin-reversible, and independent of material stock',async()=>{
 const f=await fixture(),{token}=await f.ok('adminLogin','admin','Feds201');await f.ok('adminSaveCut',token,{title:'Job',quantity:1},null);const cut=(await f.ok('getCuts'))[0];const inventory=JSON.stringify((await f.ok('getWorkspaceData')).rawMaterials);
 await f.ok('reportCompletedCut',cut,{});assert.equal((await f.ok('getCuts'))[0].completed,true);assert.equal((await f.call('reportCompletedCut',cut,{})).ok,false);assert.equal((await f.call('adminSaveCut','bad',{title:'Hacked',quantity:1},null)).ok,false);
 const portable=await f.ok('adminPortableData',token);await f.ok('adminImportBackup',token,portable);const report=(await f.ok('adminListReports',token))[0];await f.ok('adminUndoReport',token,report);assert.equal((await f.ok('getCuts'))[0].completed,false);assert.equal(JSON.stringify((await f.ok('getWorkspaceData')).rawMaterials),inventory);
 const backup=await f.ok('adminExportBackup',token);backup.reports[0].source.quantityBefore=-1; // cut reports do not carry a quantity, so unknown fields are dropped safely.
 delete backup.reports;delete backup.reportVersions;await f.ok('adminImportBackup',token,backup);assert.deepEqual(await f.ok('adminListReports',token),[]);
});

test('visitor totals are anonymous, deduplicated, independent of inventory, and public',async()=>{
 const f=await fixture(),before=JSON.stringify(f.getState());assert.deepEqual(await f.ok('getVisitorStats'),{today:0,total:0,timezone:'America/New_York'});
 const token='a'.repeat(32);await Promise.all(Array.from({length:5},()=>f.ok('trackVisit',token)));assert.equal((await f.ok('getVisitorStats')).total,1);assert.equal(JSON.stringify(f.getState()),before,'Counting never initializes or writes inventory');
 await f.ok('trackVisit','b'.repeat(32));const stats=await f.ok('getVisitorStats');assert.equal(stats.total,2);assert.deepEqual(Object.keys(stats).sort(),['timezone','today','total']);
 for(const args of [[],['bad'],['x'.repeat(32)],['a'.repeat(32),'extra']])assert.equal((await f.call('trackVisit',...args)).ok,false);
 assert.equal((await f.call('getVisitorStats','extra')).ok,false);
 const response=await f.handler()(new Request('https://project.supabase.co/functions/v1/cnc-api',{method:'POST',headers:{origin:'https://wrong.example','content-type':'application/json'},body:JSON.stringify({name:'trackVisit',args:['c'.repeat(32)]})}));assert.equal(response.status,403);assert.equal((await f.ok('getVisitorStats')).total,2);
 const {token:admin}=await f.ok('adminLogin','admin','Feds201'),backup=await f.ok('adminExportBackup',admin);assert.equal('visits' in backup,false);await f.ok('adminImportBackup',admin,backup);assert.equal((await f.ok('getVisitorStats')).total,2,'Inventory restore leaves visitor totals alone');
});

test('public cut planning logs every action and admin undo restores the complete plan after export',async()=>{
 const f=await fixture(),{token}=await f.ok('adminLogin','admin','Feds201');
 await f.ok('reportSaveCut',{title:'First',quantity:2},null,{reporter:'Student'});await f.ok('reportSaveCut',{title:'Second',quantity:1},null,{});
 let cuts=await f.ok('getCuts');await f.ok('reportSetCutPriority',cuts[0],'urgent');cuts=await f.ok('getCuts');await f.ok('reportSaveCut',{...cuts[0],title:'Edited first'},cuts[0],{});
 cuts=await f.ok('getCuts');await f.ok('reportMoveCut',cuts[1],cuts[0]);cuts=await f.ok('getCuts');assert.deepEqual(cuts.map(c=>c.title),['Second','Edited first']);await f.ok('reportDeleteCut',cuts[0],{});
 const backup=await f.ok('adminExportBackup',token);assert.equal(backup.reports.filter(r=>r.kind==='plan').length,6);assert.equal('auth' in backup,false);await f.ok('adminImportBackup',token,backup);
 for(let i=0;i<6;i++){const report=(await f.ok('adminListReports',token)).find(r=>!r.undone);assert.equal((await f.call('adminUndoReport','bad',report)).ok,false);await f.ok('adminUndoReport',token,report);const plan=await f.ok('getCuts');if(i===0)assert.deepEqual(plan.map(c=>c.title),['Second','Edited first']);if(i===1)assert.deepEqual(plan.map(c=>c.title),['Edited first','Second']);if(i===2)assert.equal(plan[0].title,'First');if(i===3)assert.equal(plan[0].priority,'normal');}
 assert.deepEqual(await f.ok('getCuts'),[]);assert.ok((await f.ok('adminListReports',token)).every(r=>r.undone));assert.deepEqual(await f.ok('getMills'),[]);
});

test('public plan updates reject stale/invalid changes and undo respects dependent deletions',async()=>{
 const f=await fixture(),{token}=await f.ok('adminLogin','admin','Feds201');await f.ok('reportSaveCut',{title:'A',quantity:1},null,{});await f.ok('reportSaveCut',{title:'B',quantity:1},null,{});await f.ok('reportSaveCut',{title:'C',quantity:1},null,{});
 let cuts=await f.ok('getCuts');const stale=cuts[0];await f.ok('reportSetCutPriority',stale,'high');const saved=JSON.stringify(f.getState());
 for(const [name,args]of [['reportSaveCut',[{title:'Bad',quantity:0},null,{}]],['reportSaveCut',[{title:'Stale',quantity:1},stale,{}]],['reportSetCutPriority',[stale,'urgent']],['reportMoveCut',[stale,cuts[2]]]])assert.equal((await f.call(name,...args)).ok,false);assert.equal(JSON.stringify(f.getState()),saved);
 cuts=await f.ok('getCuts');await f.ok('reportDeleteCut',cuts[1],{});let reports=await f.ok('adminListReports',token);const createA=reports.find(r=>r.kind==='plan'&&r.plan.action==='create'&&r.plan.after[0].title==='A');assert.equal((await f.call('adminUndoReport',token,createA)).ok,false,'Cannot remove a deletion anchor');
 cuts=await f.ok('getCuts');await f.ok('reportSaveCut',{...cuts[0],title:'A changed'},cuts[0],{});reports=await f.ok('adminListReports',token);const deletion=reports.find(r=>r.kind==='plan'&&r.plan.action==='delete');assert.equal((await f.call('adminUndoReport',token,deletion)).ok,false,'A changed anchor blocks restoring an old position');
 await f.ok('adminUndoReport',token,reports[0]);reports=await f.ok('adminListReports',token);await f.ok('adminUndoReport',token,reports.find(r=>r.kind==='plan'&&r.plan.action==='delete'));assert.deepEqual((await f.ok('getCuts')).map(c=>c.title),['A','B','C']);
 const edited=(await f.ok('getCuts'))[0];await f.ok('reportCompletedCut',edited,{});cuts=await f.ok('getCuts');await f.ok('reportReopenCut',cuts[0]);assert.equal((await f.ok('getCuts'))[0].completed,false);
 reports=await f.ok('adminListReports',token);await f.ok('adminUndoReport',token,reports[0]);assert.equal((await f.ok('getCuts'))[0].completed,true);reports=await f.ok('adminListReports',token);await f.ok('adminUndoReport',token,reports.find(r=>!r.undone&&r.kind==='cut'));assert.equal((await f.ok('getCuts'))[0].completed,false);
 assert.equal((await f.call('adminSaveMill','bad',{number:'FORGED'},null)).ok,false);assert.equal((await f.call('adminSaveMaterial','bad',{name:'FORGED'},null)).ok,false);assert.equal((await f.call('adminSaveNote','bad',{title:'FORGED',body:'No'},null)).ok,false);
});
