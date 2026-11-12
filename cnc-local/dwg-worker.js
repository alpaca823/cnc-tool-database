// GPL-3.0-or-later: isolated LibreDWG file-to-file converter worker.
// The build prepends the unmodified module glue, apart from its ESM wrapper.
self.onmessage=async event=>{
  try{
    const {bytes,wasmGzip}=event.data;
    const zipped=Uint8Array.from(atob(wasmGzip),c=>c.charCodeAt(0));
    const wasmBinary=new Uint8Array(await new Response(new Blob([zipped]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
    const module=await createModule({wasmBinary,locateFile:()=>'embedded.wasm',print:()=>{},printErr:()=>{}});
    module.FS.writeFile('outline.dwg',new Uint8Array(bytes));
    const error=module.dwg_write_dxf('outline.dwg','outline.dxf');
    if(error!==0)throw Error('This DWG could not be decoded. Export it as an ASCII DXF and try again.');
    const dxf=module.FS.readFile('outline.dxf');
    if(dxf.byteLength>8388608)throw Error('The decoded drawing is too large. Export only the closed outline.');
    self.postMessage({dxf:new TextDecoder().decode(dxf)});
  }catch(error){self.postMessage({error:error?.message||'Could not decode this DWG.'});}
};
