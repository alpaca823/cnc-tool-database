// Sample circular geometry at no more than 2 degrees per straight segment.
function betaArcPoints(cx,cy,r,start,sweep){
  if(![cx,cy,r,start,sweep].every(Number.isFinite)||r<=0||Math.abs(sweep)<1e-10||Math.abs(sweep)>2*Math.PI+1e-8)throw Error('Invalid circular drawing geometry.');
  const count=Math.ceil(Math.abs(sweep)/(Math.PI/90));
  return Array.from({length:count+1},(_,i)=>{const a=start+sweep*i/count;return [cx+r*Math.cos(a),cy+r*Math.sin(a)];});
}
function betaPolylinePoints(vertices,closed){
  if(vertices.length<2)throw Error('A polyline needs at least two vertices.');
  const result=[];let curved=false;
  for(let i=0;i<vertices.length-(closed?0:1);i++){
    const a=vertices[i],b=vertices[(i+1)%vertices.length],bulge=a.bulge??0;
    if(!Number.isFinite(bulge))throw Error('Invalid polyline bulge.');
    if(!bulge){result.push(a.point.slice());continue;}
    const dx=b.point[0]-a.point[0],dy=b.point[1]-a.point[1],chord=Math.hypot(dx,dy);
    if(chord<1e-10)throw Error('A curved segment needs different endpoints.');
    const offset=(1-bulge*bulge)/(4*bulge),cx=(a.point[0]+b.point[0])/2-dy*offset,cy=(a.point[1]+b.point[1])/2+dx*offset;
    const pts=betaArcPoints(cx,cy,Math.hypot(a.point[0]-cx,a.point[1]-cy),Math.atan2(a.point[1]-cy,a.point[0]-cx),4*Math.atan(bulge));
    pts[0]=a.point.slice();result.push(...pts.slice(0,-1));curved=true;
  }
  if(!closed)result.push(vertices.at(-1).point.slice());
  return {points:result,closed,curved};
}
// Convert drawing entities into a group of simple stock-removal outlines.
function betaJoinOutlines(chains){
  if(!chains.length||chains.length>10000)throw Error('Use 1–10,000 outline entities.');
  if(chains.some(c=>!Array.isArray(c.points)||c.points.length<2))throw Error('An outline needs at least two vertices.');
  const points=chains.flatMap(c=>c.points);if(points.length>20000)throw Error('Simplify the drawing to at most 20,000 vertices.');
  if(points.some(p=>p.length!==2||p.some(n=>!Number.isFinite(n)||Math.abs(n)>100000)))throw Error('Invalid drawing coordinates.');
  const span=Math.max(1,...points.map(p=>Math.abs(p[0])),...points.map(p=>Math.abs(p[1]))),tolerance=Math.min(.001,span*1e-7);
  const nodes=[],adj=[],buckets=new Map(),edges=new Set();
  function vertex(p){const x=Math.floor(p[0]/tolerance),y=Math.floor(p[1]/tolerance);for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)for(const id of buckets.get((x+dx)+','+(y+dy))||[])if(Math.hypot(nodes[id][0]-p[0],nodes[id][1]-p[1])<=tolerance)return id;const id=nodes.length;nodes.push(p.slice());adj.push([]);const key=x+','+y;if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(id);return id;}
  for(const chain of chains){const ids=chain.points.map(vertex);for(let i=0;i<ids.length-(chain.closed?0:1);i++){const a=ids[i],b=ids[(i+1)%ids.length];if(a===b)continue;const key=Math.min(a,b)+':'+Math.max(a,b);if(edges.has(key))continue;edges.add(key);adj[a].push(b);adj[b].push(a);}}
  for(let i=0;i<nodes.length;i++)adj[i].sort((a,b)=>Math.atan2(nodes[a][1]-nodes[i][1],nodes[a][0]-nodes[i][0])-Math.atan2(nodes[b][1]-nodes[i][1],nodes[b][0]-nodes[i][0]));
  const seen=new Set(),rings=[],autoClosed=[];let detailed=false;
  for(let start=0;start<nodes.length;start++){
    if(seen.has(start)||!adj[start].length)continue;const component=[],todo=[start];seen.add(start);
    while(todo.length){const id=todo.pop();component.push(id);for(const next of adj[id])if(!seen.has(next)){seen.add(next);todo.push(next);}}
    const branched=component.some(i=>adj[i].length>2),loose=component.filter(i=>adj[i].length===1);
    if(branched){
      if(loose.length)throw Error('Drawing branches include loose edges. Remove construction lines or close those edges.');
      detailed=true;const traversed=new Set();
      for(const from of component)for(const to of adj[from]){
        if(traversed.has(from+':'+to))continue;let a=from,b=to;const face=[];
        for(let steps=0;steps<=edges.size*2;steps++){
          const key=a+':'+b;if(traversed.has(key))break;traversed.add(key);face.push(nodes[a]);const next=adj[b][(adj[b].indexOf(a)-1+adj[b].length)%adj[b].length];a=b;b=next;if(a===from&&b===to)break;
        }
        const signed=face.reduce((sum,p,i)=>{const q=face[(i+1)%face.length];return sum+p[0]*q[1]-q[0]*p[1];},0)/2;
        if(signed < -1e-6){rings.push(betaG().polygon(face));autoClosed.push(false);}
      }
    }else{
      const first=loose[0]??component[0],path=[];let previous=-1,current=first;
      do{path.push(nodes[current]);const next=adj[current].find(i=>i!==previous);if(next===undefined)break;previous=current;current=next;}while(current!==first&&path.length<=component.length);
      if(path.length<3)throw Error('An isolated line cannot form a cut. Connect it to at least two other edges.');
      rings.push(betaG().polygon(path));autoClosed.push(loose.length>0);
    }
  }
  if(!rings.length)throw Error('No closed stock footprint was found.');
  // Internal cut details stay visible, but removing a part consumes its outer footprint.
  const info=rings.map((ring,i)=>({i,area:betaG().area(ring),box:ring.reduce((b,p)=>[Math.min(b[0],p[0]),Math.min(b[1],p[1]),Math.max(b[2],p[0]),Math.max(b[3],p[1])],[Infinity,Infinity,-Infinity,-Infinity])})).sort((a,b)=>b.area-a.area),kept=[];
  for(const item of info){const nested=kept.some(outer=>outer.area>item.area&&outer.box[0]<=item.box[0]&&outer.box[1]<=item.box[1]&&outer.box[2]>=item.box[2]&&outer.box[3]>=item.box[3]&&!betaG().edgesMeet(rings[outer.i],rings[item.i])&&betaG().inside(rings[item.i][0],rings[outer.i]));if(nested)detailed=true;else{kept.push(item);if(kept.length>100)throw Error('A group can contain up to 100 outer footprints.');}}
  const outlines=kept.map(item=>rings[item.i]);
  outlines.autoClosed=kept.map(item=>autoClosed[item.i]);outlines.curved=chains.some(c=>c.curved);outlines.details=detailed?chains.map(c=>({points:c.points,closed:c.closed})):[];return outlines;
}
function betaParse(text,extension){
  if(extension==='svg'){
    const doc=new DOMParser().parseFromString(text,'image/svg+xml');if(doc.querySelector('parsererror')||doc.documentElement.localName!=='svg')throw Error('Invalid SVG.');
    doc.querySelectorAll('text').forEach(n=>n.remove());
    if(doc.querySelector('[transform],[style],path,circle,ellipse,use,image,script,foreignObject,style,defs,mask,clipPath'))throw Error('Export polygons, polylines, rectangles or lines without transforms or curves.');
    const chains=[];
    const number=(n,key,fallback=0)=>{const raw=n.getAttribute(key);if(raw===null)return fallback;if(!/^[+-]?(?:\d*\.)?\d+(?:e[+-]?\d+)?$/i.test(raw))throw Error('SVG dimensions must be plain numbers.');return Number(raw);};
    for(const n of doc.querySelectorAll('polygon,polyline,rect,line')){
      if(['polygon','polyline'].includes(n.localName)){const vals=(n.getAttribute('points')||'').trim().split(/[\s,]+/).map(Number);if(vals.length%2)throw Error('Invalid polygon points.');chains.push({points:Array.from({length:vals.length/2},(_,i)=>[vals[2*i],vals[2*i+1]]),closed:n.localName==='polygon'});}
      else if(n.localName==='line')chains.push({points:[[number(n,'x1'),number(n,'y1')],[number(n,'x2'),number(n,'y2')]],closed:false});
      else {if(number(n,'rx')||number(n,'ry'))throw Error('Rounded rectangles are not supported.');const x=number(n,'x'),y=number(n,'y'),w=number(n,'width'),h=number(n,'height');if(w<=0||h<=0)throw Error('Invalid rectangle.');chains.push({points:[[x,y],[x+w,y],[x+w,y+h],[x,y+h]],closed:true});}
    }return betaJoinOutlines(chains);
  }
  if(extension!=='dxf')throw Error('Choose a DWG, DXF or SVG drawing.');
  const lines=text.replace(/\r/g,'').trim().split('\n').map(s=>s.trim());if(lines.length%2)throw Error('Invalid ASCII DXF.');const pairs=[];for(let i=0;i<lines.length;i+=2)pairs.push([lines[i],lines[i+1]]);
  let section='',entities=[],current=null;
  for(let i=0;i<pairs.length;i++){const [code,value]=pairs[i];if(code==='0'&&value==='SECTION'){section=pairs[i+1]?.[1];continue;}if(code==='0'&&value==='ENDSEC'){section='';continue;}if(section!=='ENTITIES')continue;if(code==='0'){current={type:value,attrs:[]};entities.push(current);}else if(current)current.attrs.push([code,value]);}
  let inputPointCount=0;
  const heights=[],chains=[],value=(attrs,code,fallback=0)=>Number(attrs.find(p=>p[0]===code)?.[1]??fallback);
  for(let i=0;i<entities.length;i++){
    const {type,attrs}=entities[i];
    if(value(attrs,'67')===1||['VIEWPORT','TEXT','MTEXT','ATTRIB','ATTDEF','DIMENSION','LEADER','MLEADER'].includes(type))continue;
    const normal=[value(attrs,'210'),value(attrs,'220'),value(attrs,'230',1)];if(normal.some(n=>!Number.isFinite(n))||Math.abs(normal[0])>1e-7||Math.abs(normal[1])>1e-7||Math.abs(normal[2]-1)>1e-7)throw Error('This outline uses a tilted coordinate plane. Export a top-view 2D sketch.');
    if(type==='LINE')heights.push(value(attrs,'30'),value(attrs,'31'));else heights.push(value(attrs,type==='LWPOLYLINE'?'38':'30'));
    if(type==='LINE')chains.push({points:[[value(attrs,'10',NaN),value(attrs,'20',NaN)],[value(attrs,'11',NaN),value(attrs,'21',NaN)]],closed:false});
    else if(type==='ARC'||type==='CIRCLE'){
      const start=value(attrs,'50',NaN)*Math.PI/180,end=value(attrs,'51',NaN)*Math.PI/180,sweep=type==='CIRCLE'?2*Math.PI:((end-start)%(2*Math.PI)+2*Math.PI)%(2*Math.PI);
      chains.push({points:betaArcPoints(value(attrs,'10',NaN),value(attrs,'20',NaN),value(attrs,'40',NaN),type==='CIRCLE'?0:start,sweep),closed:type==='CIRCLE',curved:true});
    }else if(type==='LWPOLYLINE'){
      const vertices=[];for(const [c,v] of attrs){if(c==='10')vertices.push({point:[Number(v),NaN],bulge:0});if(c==='20'&&vertices.length)vertices.at(-1).point[1]=Number(v);if(c==='42'&&vertices.length)vertices.at(-1).bulge=Number(v);}chains.push(betaPolylinePoints(vertices,!!(value(attrs,'70')&1)));
    }else if(type==='POLYLINE'){
      if(value(attrs,'70')&(~129))throw Error('Use 2D polylines.');const p=[];while(entities[i+1]?.type==='VERTEX'){const vertex=entities[++i].attrs;if(vertex.some(([c])=>c==='30'))heights.push(value(vertex,'30')+value(attrs,'30'));p.push({point:[value(vertex,'10',NaN),value(vertex,'20',NaN)],bulge:value(vertex,'42')});}if(entities[i+1]?.type!=='SEQEND')throw Error('Incomplete DXF polyline.');i++;chains.push(betaPolylinePoints(p,!!(value(attrs,'70')&1)));
    }else throw Error('Unsupported drawing entity: '+type+'. Supported sketch edges are lines, arcs, circles and 2D polylines.');
    inputPointCount+=chains.at(-1).points.length;if(inputPointCount>20000||chains.length>10000)throw Error('Simplify the drawing to at most 20,000 vertices and 10,000 entities.');
  }if(heights.some(z=>!Number.isFinite(z))||Math.max(...heights)-Math.min(...heights)>1e-6)throw Error('The drawing has edges at different heights. Export a single flat sketch.');return betaJoinOutlines(chains);
}
