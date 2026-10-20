import {createClient} from '@supabase/supabase-js';

export const usesSupabaseData=env=>env.SUPABASE_DATA_ENABLED==='true';
export const hasServerKey=env=>/^sb_secret_[A-Za-z0-9_-]{12,}$/.test(env.SUPABASE_SECRET_KEY||'');
export const accountFailure=(code,status=503)=>Object.assign(new Error(code),{momentoAuthError:true,status});

// This client is separate from the cookie client: a member session must never
// replace its server authorization. No client or request state is shared globally.
export function serverClient(env){
 if(!hasServerKey(env))throw accountFailure('account_not_configured');
 return createClient(env.SUPABASE_URL,env.SUPABASE_SECRET_KEY,{
  auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
  global:{fetch:(input,init={})=>fetch(input,{...init,signal:AbortSignal.timeout(10000)})}
 });
}

export async function serverRPC(env,name,args){
 const client=serverClient(env);
 let result=await client.rpc(name,args);
 // A session lookup is read-only. Retry one temporary transport failure;
 // counters, recovery claims and account writes must never be replayed here.
 if(name==='server_session_active'&&result.error&&[0,502,503,504].includes(result.status))result=await client.rpc(name,args);
 const {data,error}=result;
 if(error)throw accountFailure('account_service_unavailable');
 return data;
}

export function accessSessionId(session){
 try{
  const payload=JSON.parse(atob(session.access_token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(payload.session_id||'')?payload.session_id:null;
 }catch{return null;}
}

// Call only after auth.getUser() verified this request's access token. Revoked
// sessions are rejected immediately, even while a copied JWT has not expired.
export async function requireActiveSession(env,context,userId){
 if(!usesSupabaseData(env))return;
 const {data,error}=await context.supabase.auth.getSession();
 const session=accessSessionId(data?.session);
 if(error||!session||await serverRPC(env,'server_session_active',{p_user:userId,p_session:session})!==true)
  throw accountFailure('authentication_required',401);
}

export async function reserveRecovery(env,key,expires,release=false){
 if(usesSupabaseData(env))return serverRPC(env,'server_recovery_claim',{p_key:key,p_expires_at:new Date(expires).toISOString(),p_release:release});
 if(release){await env.DB.prepare('DELETE FROM rate_limits WHERE key=?').bind(key).run();return true;}
 return !!await env.DB.prepare('INSERT INTO rate_limits(key,count,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO NOTHING RETURNING key').bind(key,expires).first();
}
