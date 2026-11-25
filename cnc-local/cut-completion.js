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
  if(!dialog){dialog=wsNode('dialog');dialog.id='cutCompletionDialog';dialog.className='report-dialog';dialog.setAttribute('aria-labelledby','cutCompletionTitle');dialog.innerHTML='<h2 id="cutCompletionTitle">Record this job’s cut</h2><p id="cutCompletionSubject"></p><form id="cutCompletionForm"><label id="completionDrawingLabel" for="completionDrawing">Drawing used</label><select id="completionDrawing" required></select><label for="completionStock">Material / stock piece used</label><select id="completionStock" required></select><p class="hint">Next, position the drawing where you cut it. The job stays pending until you record the cut. Recording consumes one stock piece and saves its remaining shape.</p><p id="cutCompletionStatus" class="status" role="status"></p><div class="actions"><button id="continueCutCompletion" type="submit">Continue to placement</button><button id="adminSkipCompletion" type="button" class="secondary" hidden>Mark done without selections (admin)</button><button id="cancelCutCompletion" class="secondary" type="button">Cancel</button></div></form>';document.body.append(dialog);
    el('adminSkipCompletion').addEventListener('click',async()=>{if(!token||adminBusy||!wsCompletionPending)return;setBusy(true);try{await rpc('adminCompleteJob',token,{id:wsCompletionPending.id,version:wsCompletionPending.version},el('completionDrawing').value||null);dialog.close();await refreshWorkspaceData();el('adminStatus').textContent='Job marked done. Inventory unchanged.';}catch(error){el('cutCompletionStatus').textContent=message(error);}finally{setBusy(false);}});
    el('cancelCutCompletion').addEventListener('click',()=>dialog.close());dialog.addEventListener('close',()=>{wsCompletionPending=null;});
    el('cutCompletionForm').addEventListener('submit',async event=>{
      event.preventDefault();if(adminBusy||!wsCompletionPending)return;
      const pending=wsCompletionPending,drawingId=el('completionDrawing').value,stockId=el('completionStock').value;
      if(!wsCuts.some(job=>job.id===pending.id&&job.version===pending.version&&!job.completed)){el('cutCompletionStatus').textContent='This job changed. Close this window and select Mark done again.';return;}
      const job=wsCuts.find(job=>job.id===pending.id),attached=wsDrawingFiles.filter(file=>job.drawingIds.includes(file.id)),drawing=attached.find(file=>file.id===drawingId);
      if((attached.length&&!drawing)||!wsRawMaterials.some(stock=>stock.id===stockId&&stock.quantity>0)){el('cutCompletionStatus').textContent='Select this job’s drawing and an available stock piece.';return;}
      if(!drawing||!['image/vnd.dwg','application/dxf','image/svg+xml'].includes(drawing.type)){
        if(!window.confirm('Use one whole selected stock piece and mark this job done? No remnant will be created.'))return;
        setBusy(true);try{const stock=wsRawMaterials.find(stock=>stock.id===stockId);await rpc('reportCompletedStockJob',{id:pending.id,version:pending.version},{id:stock.id,version:stock.version},drawing?.id||null,{});dialog.close();await refreshWorkspaceData();el('adminStatus').textContent='Job completed and one whole stock piece recorded.';}catch(error){el('cutCompletionStatus').textContent=message(error);}finally{setBusy(false);}return;
      }
      dialog.close();wsCompletionJob={...pending,drawingId,stockOriginal:{id:stockId,version:wsRawMaterials.find(stock=>stock.id===stockId).version}};betaStockId=stockId;betaOutline=null;el('betaDrawing').value='';wsGo('placement');el('betaExistingDrawing').value=drawingId;
      const context=el('placementJobContext');context.hidden=false;context.replaceChildren(wsNode('strong','Completing: '+pending.title+' · Quantity: '+pending.quantity),wsNode('p','Position the drawing, then record the cut to finish this job.','hint'),wsButton('Cancel job completion',()=>{wsClearCutCompletion();betaRender();}));
      el('betaExistingDrawing').disabled=true;el('betaDrawing').disabled=true;el('betaStock').disabled=true;await betaLoad();
    });
  }
  el('cutCompletionSubject').textContent=item.title+' · Quantity: '+item.quantity;
  const drawings=wsDrawingFiles.filter(file=>item.drawingIds?.includes(file.id));
  el('completionDrawing').replaceChildren(new Option('Select drawing',''));for(const file of drawings)el('completionDrawing').append(new Option(file.name,file.id));
  el('completionDrawing').required=!!drawings.length;el('completionDrawing').hidden=!drawings.length;el('completionDrawingLabel').hidden=!drawings.length;
  const stock=wsRawMaterials.filter(piece=>piece.quantity>0);el('completionStock').replaceChildren(new Option('Select stock piece',''));for(const piece of stock)el('completionStock').append(new Option(piece.material+' · '+piece.length+' × '+piece.width+' inch · '+piece.quantity+' available',piece.id));
  const update=()=>{const drawing=drawings.find(file=>file.id===el('completionDrawing').value),cad=drawing&&['image/vnd.dwg','application/dxf','image/svg+xml'].includes(drawing.type);el('continueCutCompletion').textContent=cad?'Continue to placement':'Use whole piece and mark done';el('cutCompletionStatus').textContent=!stock.length?'No stock available. An admin can add stock or mark this job done without selections.':!drawings.length?'No drawing attached. Drawing selection is skipped. Recording uses one whole stock piece without creating a remnant.':drawing&&!cad?'This drawing cannot define a CAD footprint. Recording uses one whole stock piece.':'';};
  el('completionDrawing').onchange=update;el('adminSkipCompletion').hidden=!token;el('continueCutCompletion').disabled=!stock.length;update();dialog.showModal();el(drawings.length?'completionDrawing':'completionStock').focus();
}
