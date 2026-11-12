// The conversion program runs on demand in a disposable worker, without uploads.
let betaDwgActive=null;
function betaCancelDwg(){if(betaDwgActive){betaDwgActive.cancel();betaDwgActive=null;}}
function betaDwgToDxf(file){
  betaCancelDwg();
  return new Promise(async(resolve,reject)=>{
    let worker,url,timer,done=false;
    const finish=(error,value)=>{if(done)return;done=true;clearTimeout(timer);worker?.terminate();if(url)URL.revokeObjectURL(url);if(betaDwgActive?.cancel===cancel)betaDwgActive=null;error?reject(error):resolve(value);};
    const cancel=()=>finish(Error('DWG conversion cancelled.'));betaDwgActive={cancel};
    try{
      if(!window.Worker||!window.DecompressionStream)throw Error('DWG import needs a current browser such as Chrome or Edge.');
      const bytes=await file.arrayBuffer(),signature=new TextDecoder().decode(bytes.slice(0,6));
      if(!/^AC10\d\d$/.test(signature))throw Error('This file is not a recognized DWG drawing.');
      if(done)return;
      url=URL.createObjectURL(new Blob([window.cncDwgRuntime.code],{type:'text/javascript'}));worker=new Worker(url);
      worker.onmessage=e=>e.data.error?finish(Error(e.data.error)):finish(null,e.data.dxf);
      worker.onerror=()=>finish(Error('DWG conversion failed. Export a simplified ASCII DXF and try again.'));
      timer=setTimeout(()=>finish(Error('DWG conversion timed out. Export only the outline as DXF.')),30000);
      worker.postMessage({bytes,wasmGzip:window.cncDwgRuntime.wasmGzip},[bytes]);
    }catch(error){finish(error);}
  });
}
