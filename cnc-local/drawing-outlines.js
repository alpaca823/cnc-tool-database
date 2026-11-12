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
  if(!chains.length||chains.length>500)throw Error('Use 1–500 outline entities.');
  if(chains.some(c=>!Array.isArray(c.points)||c.points.length<2))throw Error('An outline needs at least two vertices.');
  const points=chains.flatMap(c=>c.points);if(points.length>2000)throw Error('Simplify the drawing to at most 2,000 vertices.');
  if(points.some(p=>p.length!==2||p.some(n=>!Number.isFinite(n)||Math.abs(n)>100000)))throw Error('Invalid drawing coordinates.');
  const span=Math.max(1,...points.map(p=>Math.abs(p[0])),...points.map(p=>Math.abs(p[1]))),tolerance=Math.min(.001,span*1e-7);
  const near=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1])<=tolerance;
  const remaining=chains.map(c=>({points:c.points.map(p=>p.slice()),closed:c.closed})),outlines=[],autoClosed=[];
  // Multiple branches at an endpoint are ambiguous, never invent their order.
  const ends=remaining.filter(c=>!c.closed).flatMap((c,i)=>[{p:c.points[0],chain:c},{p:c.points.at(-1),chain:c}]);
  for(const e of ends)if(ends.filter(f=>f.chain!==e.chain&&near(e.p,f.p)).length>1)throw Error('Drawing branches at an endpoint. Remove duplicate or branching edges first.');
  while(remaining.length){
    const chain=remaining.shift(),p=chain.points;
    if(!chain.closed){
      while(!near(p[0],p.at(-1))){
        const candidates=[];
        for(let i=0;i<remaining.length;i++){const c=remaining[i];if(c.closed)continue;for(const end of [0,c.points.length-1])if(near(p.at(-1),c.points[end]))candidates.push({i,reverse:end!==0});}
        if(candidates.length>1)throw Error('Ambiguous outline connections. Remove duplicate or branching edges first.');
        if(!candidates.length){
          // Continue from the other end before deciding an open chain needs closing.
          const other=[];for(let i=0;i<remaining.length;i++){const c=remaining[i];if(c.closed)continue;for(const end of [0,c.points.length-1])if(near(p[0],c.points[end]))other.push({i,reverse:end===0});}
          if(other.length>1)throw Error('Ambiguous outline connections.');
          if(!other.length)break;
          const match=other[0],next=remaining.splice(match.i,1)[0].points;if(match.reverse)next.reverse();p.unshift(...next.slice(0,-1));continue;
        }
        const match=candidates[0],next=remaining.splice(match.i,1)[0].points;if(match.reverse)next.reverse();p.push(...next.slice(1));
      }
    }
    const connected=near(p[0],p.at(-1));if(connected)p.pop();
    if(p.length<3)throw Error('An isolated line cannot form a cut. Connect it to at least two other edges.');
    autoClosed.push(!chain.closed&&!connected);outlines.push(betaG().polygon(p));
    if(outlines.length>100)throw Error('A group can contain up to 100 outlines.');
  }
  outlines.autoClosed=autoClosed;outlines.curved=chains.some(c=>c.curved);return outlines;
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
  const chains=[],value=(attrs,code,fallback=0)=>Number(attrs.find(p=>p[0]===code)?.[1]??fallback);
  for(let i=0;i<entities.length;i++){
    const {type,attrs}=entities[i];
    if(['TEXT','MTEXT','ATTRIB','ATTDEF','DIMENSION','LEADER','MLEADER'].includes(type))continue;
    if(attrs.some(([c,v])=>['39','30','31'].includes(c)&&Number(v)!==0)||attrs.some(([c,v])=>c==='210'&&Number(v)!==0||c==='220'&&Number(v)!==0||c==='230'&&Number(v)!==1))throw Error('Use flat 2D outlines.');
    if(type==='LINE')chains.push({points:[[value(attrs,'10',NaN),value(attrs,'20',NaN)],[value(attrs,'11',NaN),value(attrs,'21',NaN)]],closed:false});
    else if(type==='ARC'||type==='CIRCLE'){
      const start=value(attrs,'50',NaN)*Math.PI/180,end=value(attrs,'51',NaN)*Math.PI/180,sweep=type==='CIRCLE'?2*Math.PI:((end-start)%(2*Math.PI)+2*Math.PI)%(2*Math.PI);
      chains.push({points:betaArcPoints(value(attrs,'10',NaN),value(attrs,'20',NaN),value(attrs,'40',NaN),type==='CIRCLE'?0:start,sweep),closed:type==='CIRCLE',curved:true});
    }else if(type==='LWPOLYLINE'){
      const vertices=[];for(const [c,v] of attrs){if(c==='10')vertices.push({point:[Number(v),NaN],bulge:0});if(c==='20'&&vertices.length)vertices.at(-1).point[1]=Number(v);if(c==='42'&&vertices.length)vertices.at(-1).bulge=Number(v);}chains.push(betaPolylinePoints(vertices,!!(value(attrs,'70')&1)));
    }else if(type==='POLYLINE'){
      if(value(attrs,'70')&(~129))throw Error('Use 2D polylines.');const p=[];while(entities[i+1]?.type==='VERTEX'){const vertex=entities[++i].attrs;if(value(vertex,'30')!==0)throw Error('Use flat 2D outlines.');p.push({point:[value(vertex,'10',NaN),value(vertex,'20',NaN)],bulge:value(vertex,'42')});}if(entities[i+1]?.type!=='SEQEND')throw Error('Incomplete DXF polyline.');i++;chains.push(betaPolylinePoints(p,!!(value(attrs,'70')&1)));
    }else throw Error('Unsupported drawing entity: '+type+'. Supported sketch edges are lines, arcs, circles and 2D polylines.');
  }return betaJoinOutlines(chains);
}
