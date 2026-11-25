let jobSize=null,jobSizePromise=Promise.resolve(),jobSizeError='',jobSizeRevision=0,wsJobSizingName='';
function jobRefreshSizing(){
 const select=el('jobSizingDrawing'),selected=select.value,files=[...wsDrawingIds.map(id=>({key:'id:'+id,...wsDrawingFiles.find(f=>f.id===id)})),...wsNewDrawingFiles.map((f,i)=>({...f,key:'new:'+i}))].filter(f=>/\.(dwg|dxf|svg)$/i.test(f.name||''));
 select.replaceChildren();if(!files.length)select.append(new Option('No CAD drawing selected',''));for(const f of files)select.append(new Option(f.name,f.key));if(files.some(f=>f.key===selected))select.value=selected;else if(wsJobSizingName&&files.some(f=>f.name===wsJobSizingName))select.value=files.find(f=>f.name===wsJobSizingName).key;
 select.required=files.length>0;jobSizePromise=jobCalculateSize();
}
async function jobCalculateSize(){
 const revision=++jobSizeRevision;jobSize=null;jobSizeError='';const key=el('jobSizingDrawing').value;
 if(!key){el('jobDrawingSize').textContent=el('cutLength').value&&el('cutWidth').value?'Existing size: '+el('cutLength').value+' × '+el('cutWidth').value+' inch. Attach CAD to recalculate.':'Attach DWG/DXF/SVG to calculate length and width.';return;}
 el('jobDrawingSize').textContent='Reading CAD dimensions…';
 try{
  let file=key.startsWith('id:')?await rpc('getCutDrawing',key.slice(3)):wsNewDrawingFiles[Number(key.slice(4))];if(!file)throw Error('Select an attached drawing.');
  const bytes=Uint8Array.from(atob(file.data),c=>c.charCodeAt(0)),ext=file.name.split('.').pop().toLowerCase(),text=ext==='dwg'?await betaDwgToDxf(new File([bytes],file.name)):new TextDecoder().decode(bytes),rings=betaParse(text,ext==='dwg'?'dxf':ext),points=rings.flat();
  const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]),length=Math.max(...xs)-Math.min(...xs),width=Math.max(...ys)-Math.min(...ys);if(!Number.isFinite(length)||!Number.isFinite(width)||length<=0||width<=0)throw Error('The drawing needs a nonzero length and width.');
  if(revision!==jobSizeRevision)return;jobSize={length,width,reference:key};const factor=el('jobDrawingUnits').value==='mm'?1/25.4:1,L=Math.ceil(Number((length*factor).toPrecision(12))),W=Math.ceil(Number((width*factor).toPrecision(12)));el('cutLength').value=String(L);el('cutWidth').value=String(W);el('jobDrawingSize').textContent='Required size: '+L+' × '+W+' inch (rounded up from '+(length*factor).toFixed(4)+' × '+(width*factor).toFixed(4)+' inch).';
 }catch(error){if(revision!==jobSizeRevision)return;jobSizeError=error.message;el('jobDrawingSize').textContent='Cannot size this drawing: '+error.message;}
}
async function jobEnsureSize(){await jobSizePromise;if(jobSizeError)throw Error(jobSizeError);}
el('jobSizingDrawing').addEventListener('change',()=>{jobSizePromise=jobCalculateSize();});el('jobDrawingUnits').addEventListener('change',()=>{jobSizePromise=jobCalculateSize();});

el('viewDrawingExample').addEventListener('click',()=>el('drawingExampleDialog').showModal());el('closeDrawingExample').addEventListener('click',()=>el('drawingExampleDialog').close());
