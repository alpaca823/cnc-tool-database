// Completion waits until the selected drawing has been placed and stock recorded.
let wsCompletionJob=null,wsCompletionPending=null;
function wsClearCutCompletion(){
  wsCompletionJob=null;
  if(el('placementJobContext')){el('placementJobContext').hidden=true;el('placementJobContext').replaceChildren();}
  if(el('betaExistingDrawing'))el('betaExistingDrawing').disabled=false;
  if(el('betaDrawing'))el('betaDrawing').disabled=false;
  if(el('betaStock'))el('betaStock').disabled=false;
}
function wsOpenCutCompletion(item){
  if(adminBusy)return;wsCompletionPending={id:item.id,version:item.version,title:item.title,quantity:item.quantity};
  let dialog=el('cutCompletionDialog');
  if(!dialog){dialog=wsNode('dialog');dialog.id='cutCompletionDialog';dialog.className='report-dialog';dialog.setAttribute('aria-labelledby','cutCompletionTitle');dialog.innerHTML='<h2 id="cutCompletionTitle">Record this job’s cut</h2><p id="cutCompletionSubject"></p><form id="cutCompletionForm"><label for="completionDrawing">Drawing used</label><select id="completionDrawing" required></select><label for="completionStock">Material / stock piece used</label><select id="completionStock" required></select><p class="hint">Next, position the drawing where you cut it. The job stays pending until you record the cut. Recording consumes one stock piece and saves its remaining shape.</p><p id="cutCompletionStatus" class="status" role="status"></p><div class="actions"><button id="continueCutCompletion" type="submit">Continue to placement</button><button id="cancelCutCompletion" class="secondary" type="button">Cancel</button></div></form>';document.body.append(dialog);
    el('cancelCutCompletion').addEventListener('click',()=>dialog.close());dialog.addEventListener('close',()=>{wsCompletionPending=null;});
    el('cutCompletionForm').addEventListener('submit',async event=>{
      event.preventDefault();if(adminBusy||!wsCompletionPending)return;
      const pending=wsCompletionPending,drawingId=el('completionDrawing').value,stockId=el('completionStock').value;
      if(!wsCuts.some(job=>job.id===pending.id&&job.version===pending.version&&!job.completed)){el('cutCompletionStatus').textContent='This job changed. Close this window and select Mark done again.';return;}
      if(!wsDrawingFiles.some(file=>file.id===drawingId)||!wsRawMaterials.some(stock=>stock.id===stockId&&stock.quantity>0)){el('cutCompletionStatus').textContent='Select an available drawing and stock piece.';return;}
      dialog.close();wsCompletionJob={...pending,drawingId,stockOriginal:{id:stockId,version:wsRawMaterials.find(stock=>stock.id===stockId).version}};betaStockId=stockId;betaOutline=null;el('betaDrawing').value='';wsGo('placement');el('betaExistingDrawing').value=drawingId;
      const context=el('placementJobContext');context.hidden=false;context.replaceChildren(wsNode('strong','Completing: '+pending.title+' · Quantity: '+pending.quantity),wsNode('p','Position the drawing, then record the cut to finish this job.','hint'),wsButton('Cancel job completion',()=>{wsClearCutCompletion();betaRender();}));
      el('betaExistingDrawing').disabled=true;el('betaDrawing').disabled=true;el('betaStock').disabled=true;await betaLoad();
    });
  }
  el('cutCompletionSubject').textContent=item.title+' · Quantity: '+item.quantity;
  const drawings=wsDrawingFiles.filter(file=>/\.(dwg|dxf|svg)$/i.test(file.name)).sort((a,b)=>Number(item.drawingIds?.includes(b.id))-Number(item.drawingIds?.includes(a.id)));
  el('completionDrawing').replaceChildren(new Option('Select drawing',''));for(const file of drawings)el('completionDrawing').append(new Option(file.name+(item.drawingIds?.includes(file.id)?' · attached to this job':''),file.id));
  const stock=wsRawMaterials.filter(piece=>piece.quantity>0);el('completionStock').replaceChildren(new Option('Select stock piece',''));for(const piece of stock)el('completionStock').append(new Option(piece.material+' · '+piece.length+' × '+piece.width+' inch · '+piece.quantity+' available'+(piece.cutouts?.length?' · remnant':''),piece.id));
  el('cutCompletionStatus').textContent=!drawings.length?'Attach a DWG, DXF or SVG drawing to a Job Queue job before recording completion.':!stock.length?'No stock is available. Ask an admin to add material stock.':'';
  el('continueCutCompletion').disabled=!drawings.length||!stock.length;dialog.showModal();el('completionDrawing').focus();
}
