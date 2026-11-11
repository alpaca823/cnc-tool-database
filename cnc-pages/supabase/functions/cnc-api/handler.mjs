// Shared data/auth rules are generated from the canonical offline backend.
export function createHandler(env,{createDatabase,fetchImpl=fetch,cryptoImpl=crypto,now=()=>Date.now()}={}) {
  const actions=new Set(['adminSetCutPriority','adminMoveCut','getCuts','adminSaveCut','adminSetCutCompleted','adminDeleteCut','adminSetNotePinned','adminCutRawMaterial','getNotes','adminSaveNote','adminDeleteNote','getWorkspaceData','getMills','getMaterials','getRawMaterials','getDashboard','getOptions','getSettings','adminLogin','adminLogout','adminListSettings','adminListMaterials','adminListPasswords','adminAddPassword','adminUpdatePassword','adminDeletePassword','adminChangePassword','adminSaveMill','adminDeleteMill','adminSetInventory','adminSaveMaterial','adminDeleteMaterial','adminSaveRawMaterial','adminDeleteRawMaterial','adminSaveSetting','adminDeleteSetting','adminExportBackup','adminPortableData','adminImportBackup']);
  return async request=>{
    const origin=request.headers.get('origin')||'';
    const allowed=new Set(String(env.origins||'').split(',').map(s=>s.trim()).filter(Boolean));
    const cors={'content-type':'application/json','cache-control':'no-store','vary':'Origin','access-control-allow-headers':'content-type,apikey','access-control-allow-methods':'POST,OPTIONS'};
    if(allowed.has(origin))cors['access-control-allow-origin']=origin;
    const reply=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:cors});
    if(origin&&!allowed.has(origin))return reply({ok:false,error:'This website is not allowed to use this database.'},403);
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
    if(request.method!=='POST')return reply({ok:false,error:'Use POST for database requests.'},405);
    if(!env.url||!env.serviceKey)return reply({ok:false,error:'The shared database service is not configured.'},503);
    try {
      if(Number(request.headers.get('content-length')||0)>32*1024*1024)throw new Error('This request is too large.');
      const body=await request.text();if(body.length>32*1024*1024)throw new Error('This request is too large.');
      let input;try{input=JSON.parse(body);}catch(_){throw new Error('Invalid database request.');}
      const {name,args}=input||{};
      if(!actions.has(name)||!Array.isArray(args)||args.length>10)throw new Error('Unknown or invalid database action.');
      const rest=async(path,options={})=>{
        const result=await fetchImpl(env.url.replace(/\/$/,'')+'/rest/v1/'+path,{...options,headers:{apikey:env.serviceKey,Authorization:'Bearer '+env.serviceKey,'content-type':'application/json',...options.headers}});
        if(!result.ok)throw new Error('The database service could not complete the request. Please try again.');
        const text=await result.text();return text?JSON.parse(text):null;
      };
      const rows=await rest('cnc_state?id=eq.main&select=revision,data');
      if(!rows?.length)throw new Error('Run the supplied schema.sql in Supabase before opening the app.');
      const saved=rows[0],sessions=new Map();
      const token=typeof args[0]==='string'&&/^[a-f0-9]{48}$/.test(args[0])?args[0]:null;
      const digest=async text=>Array.from(new Uint8Array(await cryptoImpl.subtle.digest('SHA-256',new TextEncoder().encode(text))),b=>b.toString(16).padStart(2,'0')).join('');
      const tokenHash=token?await digest(token):null;
      if(tokenHash){
        const result=await rest('cnc_sessions?token_hash=eq.'+tokenHash+'&select=data,expires_at');
        if(result?.[0]&&Date.parse(result[0].expires_at)>now())sessions.set(token,result[0].data);
      }
      let storage=saved.data==null?null:JSON.stringify(saved.data),changed=false;
      const database=createDatabase({crypto:cryptoImpl,sessions,read:()=>storage,write:value=>{storage=value;changed=true;}});
      await database.ready;
      let value;
      if(name==='getWorkspaceData') {
        const [mills,materials,dashboard,rawMaterials,notes,cuts]=await Promise.all(['getMills','getMaterials','getDashboard','getRawMaterials','getNotes','getCuts'].map(action=>database.call(action)));
        value={mills,materials,dashboard,rawMaterials,notes,cuts};
      } else value=await database.call(name,...args);
      if(changed){
        const updated=await rest('cnc_state?id=eq.main&revision=eq.'+saved.revision,{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({revision:saved.revision+1,data:JSON.parse(storage)})});
        if(!updated?.length)return reply({ok:false,retryable:true,error:'Another editor saved a change. Refresh and try again.'});
      }
      if(name==='adminLogin'){
        const session=sessions.get(value.token);
        await rest('cnc_sessions',{method:'POST',headers:{Prefer:'resolution=merge-duplicates'},body:JSON.stringify({token_hash:await digest(value.token),data:session,expires_at:new Date(session.expiresAt).toISOString()})});
      }
      if(tokenHash&&!sessions.has(token))await rest('cnc_sessions?token_hash=eq.'+tokenHash,{method:'DELETE'});
      return reply({ok:true,value});
    } catch(error){return reply({ok:false,error:error?.message||'The database request failed.'});}
  };
}
