// Straight-edged stock footprints, shared by the UI and database validator.
window.cncStockGeometry = (() => {
  const eps=1e-8;
  const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
  const area=p=>Math.abs(p.reduce((s,a,i)=>{const b=p[(i+1)%p.length];return s+a[0]*b[1]-b[0]*a[1];},0)/2);
  const on=(a,b,p)=>Math.abs(cross(a,b,p))<eps&&p[0]>=Math.min(a[0],b[0])-eps&&p[0]<=Math.max(a[0],b[0])+eps&&p[1]>=Math.min(a[1],b[1])-eps&&p[1]<=Math.max(a[1],b[1])+eps;
  function intersects(a,b,c,d){return (cross(a,b,c)*cross(a,b,d)<-eps&&cross(c,d,a)*cross(c,d,b)<-eps)||on(a,b,c)||on(a,b,d)||on(c,d,a)||on(c,d,b);}
  function inside(p,ring){let hit=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if(on(a,b,p))return true;if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])hit=!hit;}return hit;}
  function polygon(input){
    if(!Array.isArray(input)||input.length<3||input.length>200)throw Error('Use one closed outline with 3–200 straight vertices.');
    let p=input.map(v=>{if(!Array.isArray(v)||v.length!==2||v.some(n=>typeof n!=='number'||!Number.isFinite(n)||Math.abs(n)>100000))throw Error('Invalid outline coordinates.');return v.slice();});
    if(p.length>3&&p[0][0]===p.at(-1)[0]&&p[0][1]===p.at(-1)[1])p.pop();
    if(area(p)<1e-6)throw Error('The outline has no usable area.');
    for(let i=0;i<p.length;i++){
      if(Math.hypot(p[i][0]-p[(i+1)%p.length][0],p[i][1]-p[(i+1)%p.length][1])<eps)throw Error('Repeated outline vertex.');
      for(let j=i+1;j<p.length;j++)if(j!==i+1&&!(i===0&&j===p.length-1)&&intersects(p[i],p[(i+1)%p.length],p[j],p[(j+1)%p.length]))throw Error('Outline must not cross itself.');
    }return p;
  }
  function overlap(a,b){if(a.some(p=>inside(p,b))||b.some(p=>inside(p,a)))return true;return a.some((p,i)=>b.some((q,j)=>intersects(p,a[(i+1)%a.length],q,b[(j+1)%b.length])));}
  function validate(cuts,l,w){
    if(!Array.isArray(cuts)||cuts.length>100)throw Error('A footprint can contain up to 100 cuts.');
    const result=cuts.map(polygon);if(result.reduce((n,p)=>n+p.length,0)>2000)throw Error('A footprint can contain up to 2,000 vertices.');
    for(let i=0;i<result.length;i++){
      if(result[i].some(p=>p[0]<0||p[1]<0||p[0]>l||p[1]>w))throw Error('Place the entire outline inside the sheet.');
      for(let j=0;j<i;j++)if(overlap(result[i],result[j]))throw Error('This outline touches or overlaps an earlier cut.');
    }
    if(result.reduce((s,p)=>s+area(p),0)>=l*w-1e-6)throw Error('The cut must leave some material.');
    return result;
  }
  function path(p){return 'M'+p.map(v=>v.join(',')).join('L')+'Z';}
  return {area,polygon,validate,path};
})();
