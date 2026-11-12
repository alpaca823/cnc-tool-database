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
test('ambiguous, isolated, self-crossing and malformed curved entities fail with no invented outline',()=>{
 const p=parser();
 for(const entities of [[line([0,0],[1,0])],[line([0,0],[1,0]),line([1,0],[1,1]),line([1,0],[2,0])],[['0','ARC','10','0','20','0','40','2']],[['0','LWPOLYLINE','70','1','10','0','20','0','42','NaN','10','2','20','0','10','2','20','2']]])assert.throws(()=>p.betaParse(dxf(entities),'dxf'));
 assert.throws(()=>p.betaJoinOutlines([{points:[[0,0],[3,3],[0,3],[3,0]],closed:false}]));assert.throws(()=>p.betaJoinOutlines([{points:[],closed:false}]));
});

test('ARC joins a line into a semicircle and wrapped angles keep the correct sweep',()=>{
 const p=parser(),rings=p.betaParse(dxf([['0','ARC','10','0','20','0','40','2','50','0','51','180'],line([-2,0],[2,0])]),'dxf');assert.equal(rings.length,1);assert.equal(rings.autoClosed[0],false);assert.equal(rings.curved,true);assert.ok(Math.abs(p.window.cncStockGeometry.area(rings[0])-2*Math.PI)<.002);assert.ok(rings[0].every(v=>v[1]>=-1e-8));
 const wrapped=p.betaParse(dxf([['0','ARC','10','0','20','0','40','2','50','270','51','90']]),'dxf');assert.equal(wrapped.autoClosed[0],true);assert.ok(wrapped[0].every(v=>v[0]>=-1e-8));assert.ok(Math.abs(p.window.cncStockGeometry.area(wrapped[0])-2*Math.PI)<.002);
});
test('CIRCLE and positive/negative bulges produce bounded, noncrossing curved outlines',()=>{
 const p=parser(),circle=p.betaParse(dxf([['0','CIRCLE','10','3','20','3','40','2']]),'dxf');assert.equal(circle.autoClosed[0],false);assert.ok(Math.abs(p.window.cncStockGeometry.area(circle[0])-4*Math.PI)<.003);p.window.cncStockGeometry.validate(circle,6,6);
 for(const bulge of ['1','-1']){const rings=p.betaParse(dxf([['0','LWPOLYLINE','70','1','10','-2','20','0','42',bulge,'10','2','20','0']]),'dxf');assert.ok(Math.abs(p.window.cncStockGeometry.area(rings[0])-2*Math.PI)<.002);assert.equal(rings.curved,true);assert.ok(rings[0].every(v=>Number(bulge)>0?v[1]<=1e-8:v[1]>=-1e-8));}
 const legacy=p.betaParse(dxf([['0','POLYLINE','70','1'],['0','VERTEX','10','-2','20','0','42','1'],['0','VERTEX','10','2','20','0'],['0','SEQEND']]),'dxf');assert.ok(Math.abs(p.window.cncStockGeometry.area(legacy[0])-2*Math.PI)<.002);
 for(const radius of ['0','-1','NaN'])assert.throws(()=>p.betaParse(dxf([['0','CIRCLE','10','3','20','3','40',radius]]),'dxf'));
});

test('rounding noise, constant elevation and paper viewports do not reject a flat sketch',()=>{
 const p=parser(),shape=['0','ARC','10','0','20','0','30','5.000000000000001','40','2','50','0','51','180','210','-1.224646799147353E-16','220','-6.123233995736767E-17','230','1'];
 const rings=p.betaParse(dxf([shape,[...line([-2,0],[2,0]),'30','5','31','5','39','2'],['0','VIEWPORT','67','1','30','100']]),'dxf');assert.equal(rings.length,1);assert.ok(Math.abs(p.window.cncStockGeometry.area(rings[0])-2*Math.PI)<.002);
 assert.throws(()=>p.betaParse(dxf([[...line([0,0],[2,0]),'30','0','31','1'],line([2,0],[2,2]),line([2,2],[0,0])]),'dxf'),/different heights/);
 assert.throws(()=>p.betaParse(dxf([['0','CIRCLE','10','3','20','3','40','2','210','1','220','0','230','0']]),'dxf'),/tilted/);
});
test('closed tab junctions and nested details keep the outer stock-removal footprint',()=>{
 const p=parser(),shape=[line([0,0],[2,0]),line([2,0],[4,0]),line([4,0],[6,0]),line([6,0],[6,5]),line([6,5],[0,5]),line([0,5],[0,0]),line([2,0],[2,2]),line([2,2],[4,2]),line([4,2],[4,0]),line([2,0],[4,0]),line([1,3],[2,3]),line([2,3],[2,4]),line([2,4],[1,4]),line([1,4],[1,3])];
 const rings=p.betaParse(dxf(shape),'dxf');assert.equal(rings.length,1);assert.equal(p.window.cncStockGeometry.area(rings[0]),30);assert.ok(rings.details.length>0);assert.equal(rings.autoClosed[0],false);
});
test('complex outlines support 5,000 vertices and still reject crossings and excessive size',()=>{
 const p=parser(),ring=Array.from({length:5000},(_,i)=>[10+5*Math.cos(i*2*Math.PI/5000),10+5*Math.sin(i*2*Math.PI/5000)]);
 assert.equal(p.window.cncStockGeometry.validate([ring],20,20)[0].length,5000);assert.equal(p.betaJoinOutlines([{points:ring,closed:true}])[0].length,5000);
 const tooMany=Array.from({length:5001},(_,i)=>[10+5*Math.cos(i*2*Math.PI/5001),10+5*Math.sin(i*2*Math.PI/5001)]);assert.throws(()=>p.window.cncStockGeometry.polygon(tooMany),/5,000/);
 assert.throws(()=>p.window.cncStockGeometry.polygon([[0,0],[.01,.01],[0,.008],[.015,0]]),/cross/);
});
