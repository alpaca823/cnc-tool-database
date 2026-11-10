/* GitHub Pages transport. Shop data and password checks live in the shared API. */
(()=>{
 'use strict';
 const config=window.CNC_CONFIG||{},url=String(config.supabaseUrl||'').replace(/\/$/,''),key=config.publicKey||'';
 let queue=Promise.resolve(),cached=null,expires=0,pending=null;
 const configured=/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url)&&!!key;
 const ready=configured?Promise.resolve():Promise.reject(new Error('The shared inventory database has not been connected yet. The site owner needs to finish setup.'));
 ready.catch(()=>{});
 if(!configured){
  const note=document.createElement('aside');note.className='mentor-notice';
  const text=document.createElement('span');text.textContent='Prototype available. The shared database is not connected yet. ';
  const link=document.createElement('a');link.href='preview.html';link.textContent='Open browser-only prototype';note.append(text,link);
  document.querySelector('.app-main').prepend(note);
 }
 async function invoke(name,args,attempt=0){
  const response=await fetch(url+'/functions/v1/cnc-api',{method:'POST',headers:{'content-type':'application/json',apikey:key},body:JSON.stringify({name,args})});
  let result;try{result=await response.json();}catch(_){throw new Error('The inventory service could not respond. Please try again.');}
  if(!result?.ok){if(result?.retryable===true&&attempt<2){await new Promise(resolve=>setTimeout(resolve,250*(attempt+1)));return invoke(name,args,attempt+1);}throw new Error(result?.error||'The inventory service could not complete this request.');}
  return result.value;
 }
 function enqueue(name,args){const next=queue.then(()=>invoke(name,args));queue=next.catch(()=>{});return next;}
 window.cncLocal=Object.freeze({
  kind:'shared',ready,
  async call(name,...args){await ready;const value=await enqueue(name,args);if(name.startsWith('admin')&&!['adminLogin','adminLogout','adminListSettings','adminListMaterials','adminListPasswords','adminExportBackup','adminPortableData'].includes(name)){cached=null;expires=0;}return value;},
  workspaceData(){
   if(cached&&Date.now()<expires)return Promise.resolve(cached);
   if(!pending)pending=ready.then(()=>enqueue('getWorkspaceData',[])).then(value=>{cached=value;expires=Date.now()+5000;return value;}).finally(()=>{pending=null;});
   return pending;
  },
  offlineTemplate(){return JSON.parse(document.getElementById('cncOfflineTemplate').textContent);}
 });
})();
