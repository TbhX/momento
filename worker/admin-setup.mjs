import {accountFailure,serverClient,serverRPC,usesSupabaseData} from './supabase-server.mjs';
export async function activateAdministrator(env,{token,password}){
 if(!usesSupabaseData(env))throw accountFailure('feature_not_ready');
 if(typeof token!=='string'||! /^[a-f0-9]{64}$/.test(token))throw accountFailure('admin_setup_invalid',401);
 // Only the hash is stored remotely. A lease prevents concurrent password
 // updates, and is released only after a confirmed native Auth rejection.
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token))),n=>n.toString(16).padStart(2,'0')).join('');
 const lease=crypto.randomUUID(),user=await serverRPC(env,'server_admin_setup_begin',{p_hash:hash,p_lease:lease});
 if(typeof user!=='string'||! /^[0-9a-f-]{36}$/i.test(user))throw accountFailure('admin_setup_invalid',401);
 const {error}=await serverClient(env).auth.admin.updateUserById(user,{password});
 if(error){
  await serverRPC(env,'server_admin_setup_finish',{p_hash:hash,p_lease:lease,p_release:true});
  throw accountFailure(['weak_password','same_password'].includes(error.code)?'invalid_password':'admin_setup_unavailable',error.status===429?429:400);
 }
 if(await serverRPC(env,'server_admin_setup_finish',{p_hash:hash,p_lease:lease,p_release:false})!==true)throw accountFailure('admin_setup_unavailable');
 return{activated:true,next:'signin'};
}
