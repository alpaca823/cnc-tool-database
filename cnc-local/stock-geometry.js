// Straight-edged stock footprints, shared by the UI and database validator.
window.cncStockGeometry = (() => {
  const eps=1e-8;
  const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
  const area=p=>Math.abs(p.reduce((s,a,i)=>{const b=p[(i+1)%p.length];return s+a[0]*b[1]-b[0]*a[1];},0)/2);
  const on=(a,b,p)=>Math.abs(cross(a,b,p))<eps&&p[0]>=Math.min(a[0],b[0])-eps&&p[0]<=Math.max(a[0],b[0])+eps&&p[1]>=Math.min(a[1],b[1])-eps&&p[1]<=Math.max(a[1],b[1])+eps;
  function intersects(a,b,c,d){const p=cross(a,b,c),q=cross(a,b,d),r=cross(c,d,a),s=cross(c,d,b);return (((p>eps&&q< -eps)||(p< -eps&&q>eps))&&((r>eps&&s< -eps)||(r< -eps&&s>eps)))||on(a,b,c)||on(a,b,d)||on(c,d,a)||on(c,d,b);}
  function inside(p,ring){let hit=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if(on(a,b,p))return true;if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])hit=!hit;}return hit;}
  // Broad-phase sweep avoids comparing every segment of a complex outline.
  function edgesMeet(a,b=null){
    const records=[];
    for(const [group,ring] of [[0,a],...(b?[[1,b]]:[])])for(let i=0;i<ring.length;i++){const p=ring[i],q=ring[(i+1)%ring.length];records.push({p,q,i,group,length:ring.length,minX:Math.min(p[0],q[0]),maxX:Math.max(p[0],q[0]),minY:Math.min(p[1],q[1]),maxY:Math.max(p[1],q[1])});}
    records.sort((x,y)=>x.minX-y.minX);let active=[];
    for(const edge of records){active=active.filter(other=>other.maxX>=edge.minX-eps);for(const other of active){
      if(b&&edge.group===other.group)continue;
      if(!b&&(Math.abs(edge.i-other.i)===1||Math.abs(edge.i-other.i)===edge.length-1))continue;
      if(edge.minY>other.maxY+eps||other.minY>edge.maxY+eps)continue;
      if(intersects(edge.p,edge.q,other.p,other.q))return true;
    }active.push(edge);}return false;
  }
  function polygon(input){
    if(!Array.isArray(input)||input.length<3||input.length>5001)throw Error('Use a closed outline with 3–5,000 vertices.');
    let p=input.map(v=>{if(!Array.isArray(v)||v.length!==2||v.some(n=>typeof n!=='number'||!Number.isFinite(n)||Math.abs(n)>100000))throw Error('Invalid outline coordinates.');return v.slice();});
    if(p.length>3&&p[0][0]===p.at(-1)[0]&&p[0][1]===p.at(-1)[1])p.pop();
    if(p.length>5000)throw Error('Use a closed outline with at most 5,000 vertices.');
    if(area(p)<1e-6)throw Error('The outline has no usable area.');
    for(let i=0;i<p.length;i++)if(Math.hypot(p[i][0]-p[(i+1)%p.length][0],p[i][1]-p[(i+1)%p.length][1])<eps)throw Error('Repeated outline vertex.');
    if(edgesMeet(p))throw Error('Outline must not cross itself.');return p;
  }
  function overlap(a,b){return edgesMeet(a,b)||inside(a[0],b)||inside(b[0],a);}
  function validate(cuts,l,w){
    if(!Array.isArray(cuts)||cuts.length>100)throw Error('A footprint can contain up to 100 cuts.');
    const result=cuts.map(polygon);if(result.reduce((n,p)=>n+p.length,0)>20000)throw Error('A footprint can contain up to 20,000 vertices.');
    for(let i=0;i<result.length;i++){
      if(result[i].some(p=>p[0]<0||p[1]<0||p[0]>l||p[1]>w))throw Error('Place the entire outline inside the sheet.');
      for(let j=0;j<i;j++)if(overlap(result[i],result[j]))throw Error('Cut outlines must not touch or overlap each other or earlier cuts.');
    }
    if(result.reduce((s,p)=>s+area(p),0)>=l*w-1e-6)throw Error('The cut must leave some material.');
    return result;
  }
  function path(p){return 'M'+p.map(v=>v.join(',')).join('L')+'Z';}
  return {area,polygon,validate,path,inside,edgesMeet};
})();
