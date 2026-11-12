// The beta DOM is created only while an admin session is active.
let betaStockId='',betaOutline=null,betaName='',betaDrag=null,betaAutoClosed=[],betaCurved=false;
const betaG=()=>window.cncStockGeometry;
function betaAuth(){
  if(!token){document.getElementById('betaNav')?.remove();document.getElementById('betaPage')?.remove();betaCancelDwg();betaOutline=null;betaStockId='';if(wsPage==='beta')wsGo('dashboard');return;}
  if(document.getElementById('betaNav'))return;
  const nav=wsButton('⚗ Beta Testing',()=>wsGo('beta'),'nav-button');nav.id='betaNav';nav.dataset.page='beta';document.querySelector('#sidebar nav').append(nav);
  const panel=wsNode('section');panel.id='betaPage';panel.className='workspace-view';panel.dataset.page='beta';panel.hidden=true;
  panel.innerHTML=`<section class="card"><h2>Drawing placement beta</h2><p class="hint">Plan a full-depth cut on one sheet. Drag the blue outline or enter its position in inches. The remaining footprint keeps the cutout. Other sheets stay unchanged.</p><p class="hint">Use DWG/DXF lines, arcs, circles or 2D polylines, or SVG lines, polygons and rectangles. Connected edges join automatically; open outlines close with a straight edge shown in orange. Separate outlines move together. Splines, nested holes, branching edges and VCarve files are not supported. Circular curves are approximated with short straight segments for stock tracking, not CNC toolpaths. Text stamps such as “IN PROGRESS” and dimensions are omitted from placement. DWG decoding runs locally in your browser. No toolpath or kerf compensation is calculated.</p><label for="betaStock">Stock sheet or remnant</label><select id="betaStock"></select><label for="betaExistingDrawing">Reuse a Cut List drawing</label><select id="betaExistingDrawing"><option value="">Choose an existing DWG, DXF or SVG (optional)</option></select><label for="betaDrawing">Or upload an outline (up to 1 MB)</label><input id="betaDrawing" type="file" accept=".dwg,.dxf,.svg"><label for="betaUnits">Drawing units</label><select id="betaUnits"><option value="1">Inches</option><option value="0.03937007874015748">Millimeters (converted to inches)</option></select><div class="beta-controls"><label>X (inch)<input id="betaX" type="number" step="0.01" value="0"></label><label>Y (inch)<input id="betaY" type="number" step="0.01" value="0"></label><label>Rotation (degrees)<input id="betaAngle" type="number" step="1" value="0"></label><label>Outline width (inch)<input id="betaWidth" type="number" min="0.001" step="0.01"></label></div><p class="hint">X/Y position the drawing’s lower-left bounding corner; width scales it proportionally. Confirm the size before recording.</p><svg id="betaCanvas" class="beta-canvas" role="img" aria-label="Stock footprint and movable drawing"></svg><p id="betaSummary" class="hint"></p><p id="betaStatus" role="status" class="status"></p><div class="actions"><button id="betaRecord" type="button" disabled>Record cut on one sheet</button><button id="betaClean" type="button" class="secondary" disabled>Download clean DXF</button></div><p class="hint">Admin only. Records are logged in Settings and can be undone there unless later edits conflict. Disconnected scraps remain grouped in one remnant record. Dimensions show the original sheet bounds; only the shaded area is available.</p></section>`;
  el('appVersion').before(panel); // Move inside main so workspace layout and tab visibility apply.
  document.querySelector('main').append(panel);
  el('betaStock').addEventListener('change',()=>{betaStockId=el('betaStock').value;betaRender();});
  el('betaDrawing').addEventListener('change',()=>{el('betaExistingDrawing').value='';betaLoad();});
  el('betaExistingDrawing').addEventListener('change',()=>{el('betaDrawing').value='';betaLoad();});
  for(const id of ['betaX','betaY','betaAngle','betaWidth'])el(id).addEventListener('input',betaRender);
  el('betaUnits').addEventListener('change',()=>{if(el('betaDrawing').files.length||el('betaExistingDrawing').value)betaLoad();});
  el('betaRecord').addEventListener('click',betaRecord);
  el('betaClean').addEventListener('click',()=>{if(!token||!betaOutline)return;try{const rings=betaPlaced(),pairs=['0','SECTION','2','HEADER','9','$ACADVER','1','AC1015','9','$INSUNITS','70','1','0','ENDSEC','0','SECTION','2','ENTITIES'];for(const ring of rings){pairs.push('0','LWPOLYLINE','100','AcDbEntity','8','0','100','AcDbPolyline','90',String(ring.length),'70','1');for(const p of ring)pairs.push('10',String(p[0]),'20',String(p[1]));}pairs.push('0','ENDSEC','0','EOF');saveDownload(pairs.join('\n')+'\n','application/dxf','clean-outline.dxf');}catch(error){el('betaStatus').textContent=error.message;}});
  const svg=el('betaCanvas');svg.addEventListener('pointerdown',e=>{if(e.target.id!=='betaPlaced')return;betaDrag={p:betaPoint(e),x:Number(el('betaX').value),y:Number(el('betaY').value)};svg.setPointerCapture(e.pointerId);});
  svg.addEventListener('pointermove',e=>{if(!betaDrag)return;const p=betaPoint(e);el('betaX').value=(betaDrag.x+p.x-betaDrag.p.x).toFixed(3);el('betaY').value=(betaDrag.y+p.y-betaDrag.p.y).toFixed(3);betaRender();});
  for(const name of ['pointerup','pointercancel','lostpointercapture'])svg.addEventListener(name,()=>betaDrag=null);
  betaRefresh();
}
function betaPoint(e){const svg=el('betaCanvas'),p=new DOMPoint(e.clientX,e.clientY);const q=p.matrixTransform(svg.getScreenCTM().inverse());return {x:q.x,y:-q.y};}
function betaSource(){return wsRawMaterials.find(row=>row.id===betaStockId);}
function betaRefresh(){
  if(!token||!el('betaPage'))return;
  const savedSelect=el('betaExistingDrawing'),savedId=savedSelect.value;savedSelect.replaceChildren(new Option('Choose an existing DWG, DXF or SVG (optional)',''));for(const file of wsDrawingFiles.filter(f=>/\.(dwg|svg|dxf)$/i.test(f.name)))savedSelect.append(new Option(file.name,file.id));savedSelect.value=savedId;
  const select=el('betaStock');select.replaceChildren();
  for(const row of wsRawMaterials.filter(r=>r.quantity>0)){const opt=wsNode('option',row.material+' · '+row.length+' × '+row.width+' inch · '+row.quantity+' available'+(row.cutouts?.length?' · shaped remnant':''));opt.value=row.id;select.append(opt);}
  if(Array.from(select.options).some(o=>o.value===betaStockId))select.value=betaStockId;else betaStockId=select.value;
  betaRender();
}
function betaPlaced(){
  if(!betaOutline)throw Error('Upload an outline first.');
  const bounds=betaOutline.flat().reduce((b,p)=>[Math.min(b[0],p[0]),Math.max(b[1],p[0])],[Infinity,-Infinity]);
  const width=Number(el('betaWidth').value),x=Number(el('betaX').value),y=Number(el('betaY').value),angle=Number(el('betaAngle').value)*Math.PI/180;
  if(![width,x,y,angle].every(Number.isFinite)||width<=0)throw Error('Enter valid position, rotation, and width.');
  const scale=width/(bounds[1]-bounds[0]),c=Math.cos(angle),s=Math.sin(angle),p=betaOutline.map(ring=>ring.map(([a,b])=>[(a*c-b*s)*scale,(a*s+b*c)*scale])),minX=Math.min(...p.flat().map(v=>v[0])),minY=Math.min(...p.flat().map(v=>v[1]));return p.map(ring=>ring.map(v=>[v[0]-minX+x,v[1]-minY+y]));
}
function betaRender(){
  if(!token||!el('betaCanvas'))return;
  const svg=el('betaCanvas'),source=betaSource();svg.replaceChildren();el('betaRecord').disabled=true;el('betaClean').disabled=true;
  if(!source){el('betaStatus').textContent='Add stock in Materials first.';return;}
  const l=Number(source.length),w=Number(source.width),pad=Math.max(l,w)*.04;svg.setAttribute('viewBox',[-pad,-w-pad,l+2*pad,w+2*pad].join(' '));
  const shape=(d,fill,id)=>{const p=document.createElementNS('http://www.w3.org/2000/svg','path');p.setAttribute('d',d);p.setAttribute('fill',fill);p.setAttribute('fill-rule','evenodd');p.setAttribute('transform','scale(1,-1)');if(id)p.id=id;svg.append(p);return p;};
  shape(betaG().path([[0,0],[l,0],[l,w],[0,w]])+(source.cutouts||[]).map(betaG().path).join(''),'var(--beta-stock, #829b91)');
  const remaining=l*w-(source.cutouts||[]).reduce((n,p)=>n+betaG().area(p),0);el('betaSummary').textContent=source.material+' · '+l+' × '+w+' inch · '+remaining.toFixed(2)+' square inches remaining'+(betaName?' · '+betaName:'');
  try{if(!betaOutline){el('betaStatus').textContent='Choose a drawing to place on this sheet.';return;}const placed=betaPlaced(),node=shape(placed.map(betaG().path).join(''),'#398bff88','betaPlaced');node.setAttribute('stroke','#398bff');node.setAttribute('stroke-width',Math.max(l,w)*.003);betaG().validate([...(source.cutouts||[]),...placed],l,w);for(let i=0;i<placed.length;i++)if(betaAutoClosed[i]){const edge=shape('M'+placed[i].at(-1).join(',')+'L'+placed[i][0].join(','),'none');edge.setAttribute('stroke','#ff9f35');edge.setAttribute('stroke-width',Math.max(l,w)*.006);edge.style.pointerEvents='none';}
    el('betaStatus').textContent=placed.length+' grouped outline(s) · '+betaAutoClosed.filter(Boolean).length+' automatically closed · Fits available material · cut area '+placed.reduce((n,p)=>n+betaG().area(p),0).toFixed(2)+' square inches.'+(betaCurved?' Curved edges approximated (up to 2° per segment).':'');el('betaRecord').disabled=adminBusy;el('betaClean').disabled=adminBusy;}
  catch(error){el('betaStatus').textContent=error.message;el('betaPlaced')?.setAttribute('fill','#ff555588');}
}
let betaLoadRevision=0;
async function betaLoad(){
  const revision=++betaLoadRevision;betaCancelDwg();betaOutline=null;betaName='';el('betaRecord').disabled=true;let file=el('betaDrawing').files[0];const savedId=el('betaExistingDrawing').value;if(!file&&!savedId){betaRender();return;}
  try{if(savedId){const saved=await rpc('getCutDrawing',savedId);file=new File([Uint8Array.from(atob(saved.data),c=>c.charCodeAt(0))],saved.name);if(revision!==betaLoadRevision||!token||!el('betaPage'))return;}if(file.size>1048576)throw Error('Outline must be up to 1 MB.');const extension=file.name.split('.').pop().toLowerCase();if(extension==='dwg')el('betaStatus').textContent='Reading DWG outline on this device…';const content=extension==='dwg'?await betaDwgToDxf(file):await file.text();if(revision!==betaLoadRevision||!token||!el('betaPage'))return;const outline=betaParse(content,extension==='dwg'?'dxf':extension),factor=Number(el('betaUnits').value);if(!token||!el('betaPage'))return;betaAutoClosed=outline.autoClosed||[];betaCurved=!!outline.curved;betaOutline=outline.map(ring=>ring.map(p=>[p[0]*factor,p[1]*factor*(file.name.toLowerCase().endsWith('.svg')?-1:1)]));betaName=file.name;el('betaWidth').value=String(Math.max(...betaOutline.flat().map(p=>p[0]))-Math.min(...betaOutline.flat().map(p=>p[0])));el('betaX').value='0';el('betaY').value='0';el('betaAngle').value='0';betaRender();}
  catch(error){if(revision===betaLoadRevision&&el('betaStatus')){betaRender();el('betaStatus').textContent=error.message;}}
}
async function betaRecord(){
  if(!token||adminBusy)return;
  const source=betaSource();if(!source)return;
  try{const placed=betaPlaced();betaG().validate([...(source.cutouts||[]),...placed],Number(source.length),Number(source.width));if(!window.confirm('Record '+placed.length+' grouped outline(s) on ONE sheet? '+(betaAutoClosed.some(Boolean)?'Open outlines were automatically closed with straight edges. Verify the orange edges. ':'')+'One sheet will be replaced by a shaped remnant.'))return;setBusy(true);el('betaRecord').disabled=true;const id=await rpc('adminRecordShapeCut',token,{id:source.id,version:source.version},placed);betaStockId=id;betaOutline=null;await refreshWorkspaceData();betaRefresh();el('betaStatus').textContent='Cut recorded. Select another outline to continue, or undo it in Settings.';}
  catch(error){el('betaStatus').textContent=message(error);}finally{setBusy(false);}
}
