const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
function parser(){const ctx={window:{}};vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.resolve(__dirname,'../../cnc-local/stock-geometry.js'),'utf8')+'\nfunction betaG(){return window.cncStockGeometry;}\n'+fs.readFileSync(path.resolve(__dirname,'../../cnc-local/drawing-outlines.js'),'utf8'),ctx);return ctx;}
const dxf=entities=>['0','SECTION','2','ENTITIES',...entities.flat(),'0','ENDSEC','0','EOF'].join('\n');
const line=(a,b)=>['0','LINE','10',String(a[0]),'20',String(a[1]),'11',String(b[0]),'21',String(b[1])];
test('shuffled/reversed edges join into closed groups; open chains flag a closing edge',()=>{
 const p=parser(),rings=p.betaParse(dxf([line([4,3],[4,0]),line([0,0],[4,0]),line([0,3],[4,3]),line([10,0],[12,0]),line([12,2],[10,2]),line([12,0],[12,2]),line([10,2],[10,0])]),'dxf');
 assert.equal(rings.length,2);assert.equal(rings.autoClosed.filter(Boolean).length,1);assert.deepEqual(Array.from(rings,r=>p.window.cncStockGeometry.area(r)).sort((a,b)=>a-b),[4,12]);assert.equal(p.window.cncStockGeometry.validate(rings,20,10).length,2);
});
test('open legacy 2D polylines close, while text and dimensions do not become geometry',()=>{
 const p=parser(),rings=p.betaParse(dxf([['0','TEXT','1','IN PROGRESS'],['0','MTEXT','1','IN PROGRESS'],['0','DIMENSION'],['0','POLYLINE','70','128'],['0','VERTEX','10','0','20','0'],['0','VERTEX','10','3','20','0'],['0','VERTEX','10','3','20','2'],['0','VERTEX','10','0','20','2'],['0','SEQEND']]),'dxf');assert.equal(rings.length,1);assert.equal(rings.autoClosed[0],true);assert.equal(p.window.cncStockGeometry.area(rings[0]),6);
});
test('ambiguous, isolated, self-crossing and curved entities fail with no invented outline',()=>{
 const p=parser();
 for(const entities of [[line([0,0],[1,0])],[line([0,0],[1,0]),line([1,0],[1,1]),line([1,0],[2,0])],[['0','ARC','10','0','20','0','40','2']],[['0','LWPOLYLINE','70','1','10','0','20','0','42','1','10','2','20','0','10','2','20','2']]])assert.throws(()=>p.betaParse(dxf(entities),'dxf'));
 assert.throws(()=>p.betaJoinOutlines([{points:[[0,0],[3,3],[0,3],[3,0]],closed:false}]));assert.throws(()=>p.betaJoinOutlines([{points:[],closed:false}]));
});
