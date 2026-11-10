const assert=require('node:assert/strict');
const {webcrypto}=require('node:crypto');
const load=()=>Promise.all([import('../supabase/functions/cnc-api/engine.mjs'),import('../supabase/functions/cnc-api/handler.mjs')]);
async function fixture(){
 const [{createDatabase},{createHandler}]=await load();let state={revision:0,data:null};const sessions=new Map();let conflict=false;
 const fetchImpl=async(url,options={})=>{
  const u=new URL(url),method=options.method||'GET';
  if(u.pathname.endsWith('/cnc_state')){
   if(method==='GET')return Response.json([structuredClone(state)]);
   if(method==='PATCH'){
    if(conflict){conflict=false;return Response.json([]);}
    if(u.searchParams.get('revision')!=='eq.'+state.revision)return Response.json([]);
    state=JSON.parse(options.body);return Response.json([{id:'main',...state}]);
   }
  }
  if(u.pathname.endsWith('/cnc_sessions')){
   const key=u.searchParams.get('token_hash')?.slice(3);
   if(method==='GET')return Response.json(sessions.has(key)?[sessions.get(key)]:[]);
   if(method==='POST'){const data=JSON.parse(options.body);sessions.set(data.token_hash,data);return new Response(null,{status:201});}
   if(method==='DELETE'){sessions.delete(key);return new Response(null,{status:204});}
  }
  throw new Error('Unexpected backend request '+url);
 };
 const env={url:'https://project.supabase.co',serviceKey:'server-key-test',origins:'https://alpaca823.github.io'};
 const handler=()=>createHandler(env,{createDatabase,fetchImpl,cryptoImpl:webcrypto});
 const call=async(name,...args)=>{const response=await handler()(new Request('https://project.supabase.co/functions/v1/cnc-api',{method:'POST',headers:{origin:env.origins,'content-type':'application/json'},body:JSON.stringify({name,args})}));return response.json();};
 const ok=async(name,...args)=>{const r=await call(name,...args);assert.equal(r.ok,true,r.error);return r.value;};
 return {call,ok,handler,env,getState:()=>state,conflict:()=>{conflict=true;}};
}

module.exports={fixture};
