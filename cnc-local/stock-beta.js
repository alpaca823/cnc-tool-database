// The beta DOM is created only while an admin session is active.
let betaStockId='',betaOutline=null,betaName='',betaDrag=null;
const betaG=()=>window.cncStockGeometry;
function betaAuth(){
  if(!token){document.getElementById('betaNav')?.remove();document.getElementById('betaPage')?.remove();betaOutline=null;betaStockId='';if(wsPage==='beta')wsGo('dashboard');return;}
  if(document.getElementById('betaNav'))return;
  const nav=wsButton('⚗ Beta Testing',()=>wsGo('beta'),'nav-button');nav.id='betaNav';nav.dataset.page='beta';document.querySelector('#sidebar nav').append(nav);
  const panel=wsNode('section');panel.id='betaPage';panel.className='workspace-view';panel.dataset.page='beta';panel.hidden=true;
  panel.innerHTML=`<section class="card"><h2>Drawing placement beta</h2><p class="hint">Plan a full-depth cut on one sheet. Drag the blue outline or enter its position in inches. The remaining footprint keeps the cutout. Other sheets stay unchanged.</p><p class="hint">Use one closed straight-edged DXF LWPOLYLINE, or an SVG containing one polygon or rectangle, without transforms. Curves, holes, DWG and VCarve files are not supported. Export a simplified outline first. No toolpath or kerf compensation is calculated.</p><label for="betaStock">Stock sheet or remnant</label><select id="betaStock"></select><label for="betaExistingDrawing">Reuse a Cut List drawing</label><select id="betaExistingDrawing"><option value="">Choose an existing DXF or SVG (optional)</option></select><label for="betaDrawing">Or upload an outline (up to 1 MB)</label><input id="betaDrawing" type="file" accept=".dxf,.svg"><label for="betaUnits">Drawing units</label><select id="betaUnits"><option value="1">Inches</option><option value="0.03937007874015748">Millimeters (converted to inches)</option></select><div class="beta-controls"><label>X (inch)<input id="betaX" type="number" step="0.01" value="0"></label><label>Y (inch)<input id="betaY" type="number" step="0.01" value="0"></label><label>Rotation (degrees)<input id="betaAngle" type="number" step="1" value="0"></label><label>Outline width (inch)<input id="betaWidth" type="number" min="0.001" step="0.01"></label></div><p class="hint">X/Y position the drawing’s lower-left bounding corner; width scales it proportionally. Confirm the size before recording.</p><svg id="betaCanvas" class="beta-canvas" role="img" aria-label="Stock footprint and movable drawing"></svg><p id="betaSummary" class="hint"></p><p id="betaStatus" role="status" class="status"></p><button id="betaRecord" type="button" disabled>Record cut on one sheet</button><p class="hint">Admin only. Records are logged in Settings and can be undone there unless later edits conflict. Disconnected scraps remain grouped in one remnant record. Dimensions show the original sheet bounds; only the shaded area is available.</p></section>`;
  el('appVersion').before(panel); // Move inside main so workspace layout and tab visibility apply.
  document.querySelector('main').append(panel);
  el('betaStock').addEventListener('change',()=>{betaStockId=el('betaStock').value;betaRender();});
  el('betaDrawing').addEventListener('change',()=>{el('betaExistingDrawing').value='';betaLoad();});
  el('betaExistingDrawing').addEventListener('change',()=>{el('betaDrawing').value='';betaLoad();});
  for(const id of ['betaX','betaY','betaAngle','betaWidth'])el(id).addEventListener('input',betaRender);
  el('betaUnits').addEventListener('change',()=>{if(el('betaDrawing').files.length||el('betaExistingDrawing').value)betaLoad();});
  el('betaRecord').addEventListener('click',betaRecord);
  const svg=el('betaCanvas');svg.addEventListener('pointerdown',e=>{if(e.target.id!=='betaPlaced')return;betaDrag={p:betaPoint(e),x:Number(el('betaX').value),y:Number(el('betaY').value)};svg.setPointerCapture(e.pointerId);});
  svg.addEventListener('pointermove',e=>{if(!betaDrag)return;const p=betaPoint(e);el('betaX').value=(betaDrag.x+p.x-betaDrag.p.x).toFixed(3);el('betaY').value=(betaDrag.y+p.y-betaDrag.p.y).toFixed(3);betaRender();});
  for(const name of ['pointerup','pointercancel','lostpointercapture'])svg.addEventListener(name,()=>betaDrag=null);
  betaRefresh();
}
function betaPoint(e){const svg=el('betaCanvas'),p=new DOMPoint(e.clientX,e.clientY);const q=p.matrixTransform(svg.getScreenCTM().inverse());return {x:q.x,y:-q.y};}
function betaSource(){return wsRawMaterials.find(row=>row.id===betaStockId);}
function betaRefresh(){
  if(!token||!el('betaPage'))return;
  const savedSelect=el('betaExistingDrawing'),savedId=savedSelect.value;savedSelect.replaceChildren(new Option('Choose an existing DXF or SVG (optional)',''));for(const file of wsDrawingFiles.filter(f=>/\.(svg|dxf)$/i.test(f.name)))savedSelect.append(new Option(file.name,file.id));savedSelect.value=savedId;
  const select=el('betaStock');select.replaceChildren();
  for(const row of wsRawMaterials.filter(r=>r.quantity>0)){const opt=wsNode('option',row.material+' · '+row.length+' × '+row.width+' inch · '+row.quantity+' available'+(row.cutouts?.length?' · shaped remnant':''));opt.value=row.id;select.append(opt);}
  if(Array.from(select.options).some(o=>o.value===betaStockId))select.value=betaStockId;else betaStockId=select.value;
  betaRender();
}
function betaPlaced(){
  if(!betaOutline)throw Error('Upload an outline first.');
  const bounds=betaOutline.reduce((b,p)=>[Math.min(b[0],p[0]),Math.max(b[1],p[0])],[Infinity,-Infinity]);
  const width=Number(el('betaWidth').value),x=Number(el('betaX').value),y=Number(el('betaY').value),angle=Number(el('betaAngle').value)*Math.PI/180;
  if(![width,x,y,angle].every(Number.isFinite)||width<=0)throw Error('Enter valid position, rotation, and width.');
  const scale=width/(bounds[1]-bounds[0]),c=Math.cos(angle),s=Math.sin(angle),p=betaOutline.map(([a,b])=>[(a*c-b*s)*scale,(a*s+b*c)*scale]),minX=Math.min(...p.map(v=>v[0])),minY=Math.min(...p.map(v=>v[1]));return p.map(v=>[v[0]-minX+x,v[1]-minY+y]);
}
function betaRender(){
  if(!token||!el('betaCanvas'))return;
  const svg=el('betaCanvas'),source=betaSource();svg.replaceChildren();el('betaRecord').disabled=true;
  if(!source){el('betaStatus').textContent='Add stock in Materials first.';return;}
  const l=Number(source.length),w=Number(source.width),pad=Math.max(l,w)*.04;svg.setAttribute('viewBox',[-pad,-w-pad,l+2*pad,w+2*pad].join(' '));
  const shape=(d,fill,id)=>{const p=document.createElementNS('http://www.w3.org/2000/svg','path');p.setAttribute('d',d);p.setAttribute('fill',fill);p.setAttribute('fill-rule','evenodd');p.setAttribute('transform','scale(1,-1)');if(id)p.id=id;svg.append(p);return p;};
  shape(betaG().path([[0,0],[l,0],[l,w],[0,w]])+(source.cutouts||[]).map(betaG().path).join(''),'var(--beta-stock, #829b91)');
  const remaining=l*w-(source.cutouts||[]).reduce((n,p)=>n+betaG().area(p),0);el('betaSummary').textContent=source.material+' · '+l+' × '+w+' inch · '+remaining.toFixed(2)+' square inches remaining'+(betaName?' · '+betaName:'');
  try{if(!betaOutline){el('betaStatus').textContent='Choose a drawing to place on this sheet.';return;}const placed=betaPlaced(),node=shape(betaG().path(placed),'#398bff88','betaPlaced');node.setAttribute('stroke','#398bff');node.setAttribute('stroke-width',Math.max(l,w)*.003);betaG().validate([...(source.cutouts||[]),placed],l,w);el('betaStatus').textContent='Fits available material · cut area '+betaG().area(placed).toFixed(2)+' square inches.';el('betaRecord').disabled=adminBusy;}
  catch(error){el('betaStatus').textContent=error.message;el('betaPlaced')?.setAttribute('fill','#ff555588');}
}
function betaParse(text,extension){
  if(extension==='svg'){
    const doc=new DOMParser().parseFromString(text,'image/svg+xml');if(doc.querySelector('parsererror')||doc.documentElement.localName!=='svg')throw Error('Invalid SVG.');
    if(doc.querySelector('[transform],[style],path,circle,ellipse,line,polyline,use,image,text,script,foreignObject,style,defs,mask,clipPath'))throw Error('Export one polygon or rectangle with no transforms, curves, or other objects.');
    const nodes=doc.querySelectorAll('polygon,rect');if(nodes.length!==1)throw Error('Use exactly one closed polygon or rectangle.');const n=nodes[0];
    if(n.localName==='polygon'){const vals=(n.getAttribute('points')||'').trim().split(/[\s,]+/).map(Number);if(vals.length%2)throw Error('Invalid polygon points.');return betaG().polygon(Array.from({length:vals.length/2},(_,i)=>[vals[2*i],vals[2*i+1]]));}
    const number=(key,fallback=0)=>{const raw=n.getAttribute(key);if(raw===null)return fallback;if(!/^[+-]?(?:\d*\.)?\d+(?:e[+-]?\d+)?$/i.test(raw))throw Error('SVG dimensions must be plain numbers.');return Number(raw);};if(number('rx')||number('ry'))throw Error('Rounded rectangles are not supported.');const x=number('x'),y=number('y'),w=number('width'),h=number('height');if(w<=0||h<=0)throw Error('Invalid rectangle.');return [[x,y],[x+w,y],[x+w,y+h],[x,y+h]];
  }
  if(extension!=='dxf')throw Error('Choose a DXF or SVG outline.');
  const lines=text.replace(/\r/g,'').trim().split('\n').map(s=>s.trim());if(lines.length%2)throw Error('Invalid ASCII DXF.');const pairs=[];for(let i=0;i<lines.length;i+=2)pairs.push([lines[i],lines[i+1]]);
  let section='',entities=[],current=null;
  for(let i=0;i<pairs.length;i++){const [code,value]=pairs[i];if(code==='0'&&value==='SECTION'){section=pairs[i+1]?.[1];continue;}if(code==='0'&&value==='ENDSEC'){section='';continue;}if(section!=='ENTITIES')continue;if(code==='0'){current={type:value,attrs:[]};entities.push(current);}else if(current)current.attrs.push([code,value]);}
  if(entities.length!==1||entities[0].type!=='LWPOLYLINE')throw Error('Export exactly one closed DXF LWPOLYLINE.');const attrs=entities[0].attrs;
  if(!(Number(attrs.find(p=>p[0]==='70')?.[1])&1)||attrs.some(([c,v])=>['42','39'].includes(c)&&Number(v)!==0)||attrs.some(([c,v])=>c==='210'&&Number(v)!==0||c==='220'&&Number(v)!==0||c==='230'&&Number(v)!==1))throw Error('Use a closed, flat outline without arcs.');
  const p=[];for(const [c,v] of attrs){if(c==='10')p.push([Number(v),NaN]);if(c==='20'&&p.length)p.at(-1)[1]=Number(v);}return betaG().polygon(p);
}
async function betaLoad(){
  betaOutline=null;betaName='';el('betaRecord').disabled=true;let file=el('betaDrawing').files[0];const savedId=el('betaExistingDrawing').value;if(!file&&!savedId){betaRender();return;}
  try{if(savedId){const saved=await rpc('getCutDrawing',savedId);file=new File([Uint8Array.from(atob(saved.data),c=>c.charCodeAt(0))],saved.name);if(!token||!el('betaPage'))return;}if(file.size>1048576)throw Error('Outline must be up to 1 MB.');const outline=betaParse(await file.text(),file.name.split('.').pop().toLowerCase()),factor=Number(el('betaUnits').value);if(!token||!el('betaPage'))return;betaOutline=outline.map(p=>[p[0]*factor,p[1]*factor*(file.name.toLowerCase().endsWith('.svg')?-1:1)]);betaName=file.name;el('betaWidth').value=String(Math.max(...betaOutline.map(p=>p[0]))-Math.min(...betaOutline.map(p=>p[0])));el('betaX').value='0';el('betaY').value='0';el('betaAngle').value='0';betaRender();}
  catch(error){if(el('betaStatus')){betaRender();el('betaStatus').textContent=error.message;}}
}
async function betaRecord(){
  if(!token||adminBusy)return;
  const source=betaSource();if(!source)return;
  try{const placed=betaPlaced();betaG().validate([...(source.cutouts||[]),placed],Number(source.length),Number(source.width));if(!window.confirm('Record this full-depth cut on ONE sheet? One sheet will be replaced by a shaped remnant.'))return;setBusy(true);el('betaRecord').disabled=true;const id=await rpc('adminRecordShapeCut',token,{id:source.id,version:source.version},placed);betaStockId=id;betaOutline=null;await refreshWorkspaceData();betaRefresh();el('betaStatus').textContent='Cut recorded. Select another outline to continue, or undo it in Settings.';}
  catch(error){el('betaStatus').textContent=message(error);}finally{setBusy(false);}
}
