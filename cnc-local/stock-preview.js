// Public, read-only previews of saved stock footprints.
let wsStockPreviewId=null;
function wsStockShape(item,thumbnail=false){
  const l=Number(item.length),w=Number(item.width),pad=Math.max(l,w)*.035,ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');
  svg.setAttribute('viewBox',[-pad,-w-pad,l+pad*2,w+pad*2].join(' '));svg.setAttribute('role','img');svg.setAttribute('aria-label',(item.cutouts?.length?'Remaining shaped stock':'Full rectangular sheet')+' · '+item.length+' by '+item.width+' inches');svg.classList.add(thumbnail?'stock-shape-thumb':'stock-shape-large');
  const shape=document.createElementNS(ns,'path');shape.setAttribute('d',window.cncStockGeometry.path([[0,0],[l,0],[l,w],[0,w]])+(item.cutouts||[]).map(window.cncStockGeometry.path).join(''));shape.setAttribute('fill-rule','evenodd');shape.setAttribute('transform','scale(1,-1)');shape.setAttribute('fill','var(--stock-shape-fill)');svg.append(shape);return svg;
}
function wsStockPreviewButton(item){
  const button=wsButton('',()=>wsOpenStockPreview(item.id),'secondary stock-shape-preview');button.dataset.stockId=item.id;button.setAttribute('aria-label','Preview stock shape for '+item.material+' · '+item.length+' by '+item.width+' inches');
  button.append(wsStockShape(item,true),wsNode('span','Preview shape'));return button;
}
function wsOpenStockPreview(id){
  if(!wsRawMaterials.some(row=>row.id===id))return;
  let dialog=el('stockShapeDialog');
  if(!dialog){dialog=wsNode('dialog');dialog.id='stockShapeDialog';dialog.className='stock-shape-dialog';dialog.setAttribute('aria-labelledby','stockShapeTitle');
    const bar=wsNode('div',null,'toolbar'),title=wsNode('h2','Stock shape preview');title.id='stockShapeTitle';bar.append(title,wsButton('Close',()=>dialog.close()));const body=wsNode('div');body.id='stockShapeBody';dialog.append(bar,body);document.body.append(dialog);
    dialog.addEventListener('close',()=>{wsStockPreviewId=null;});
  }
  wsStockPreviewId=id;wsRefreshStockPreview();if(!dialog.open)dialog.showModal();
}
function wsRefreshStockPreview(){
  const dialog=el('stockShapeDialog');if(!dialog)return;
  const item=wsRawMaterials.find(row=>row.id===wsStockPreviewId);
  if(!item){if(dialog.open)dialog.close();dialog.remove();wsStockPreviewId=null;return;}
  const body=el('stockShapeBody'),area=Number(item.length)*Number(item.width)-(item.cutouts||[]).reduce((n,p)=>n+window.cncStockGeometry.area(p),0);body.replaceChildren();
  body.append(wsNode('h3',item.material),wsStockShape(item),wsNode('p',item.length+' × '+item.width+' inch bounds'+(item.thickness?' · '+item.thickness+' inch thick':'')+' · '+item.quantity+' on hand','hint'),wsNode('p',area.toLocaleString(undefined,{maximumFractionDigits:2})+' square inches remaining per piece','stock-shape-area'));
  const legend=wsNode('div',null,'stock-shape-legend');legend.append(wsNode('span','■ Remaining material','stock-shape-key'),wsNode('span','▧ Empty / removed area'));body.append(legend,wsNode('p',item.cutouts?.length?item.cutouts.length+' recorded cutout(s). Dimensions describe the original bounds; only the shaded area remains.':'Full rectangular sheet. No shaped cutouts have been recorded.','hint'));
}
