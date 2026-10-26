/* The caller has verified getUser() and the native session before this module. */
import {accountFailure} from './supabase-server.mjs';
const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
export const ownFactors=user=>(Array.isArray(user.factors)?user.factors:[]).filter(f=>uuid(f.id)&&f.factor_type==='totp'&&['verified','unverified'].includes(f.status));
export async function mfaLevel(context){const {data,error}=await context.supabase.auth.getSession();if(error||!data?.session)throw accountFailure('authentication_required',401);try{return JSON.parse(atob(data.session.access_token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))).aal==='aal2'?'aal2':'aal1'}catch{throw accountFailure('authentication_required',401)}}
export async function requireMFA(context,user){if((user.factors||[]).some(f=>f.status==='verified')&&await mfaLevel(context)!=='aal2')throw accountFailure('mfa_required',403)}
const providerError=error=>{if(error)throw accountFailure(error.status===429?'too_many_attempts':'mfa_unavailable',error.status===429?429:503)};
export async function mfaRoute(request,{context,user,origin,readJSON,limit,verifyPassword}){
 const path=new URL(request.url).pathname,auth=context.supabase.auth,factors=ownFactors(user);
 if(path==='/api/auth/mfa'&&request.method==='GET'){
  await limit('mfa-read',user.id,30,60000);
  return Response.json({enabled:(user.factors||[]).some(f=>f.status==='verified'),level:await mfaLevel(context),factors:factors.map(f=>({id:f.id,status:f.status,name:String(f.friendly_name||'Application d’authentification').slice(0,80)}))});
 }
 if(!['/api/auth/mfa/enroll','/api/auth/mfa/verify','/api/auth/mfa/cancel','/api/auth/mfa/remove'].includes(path))throw accountFailure('not_found',404);
 if(request.method!=='POST')throw accountFailure('method_not_allowed',405);
 if(request.headers.get('Origin')!==origin||request.headers.get('X-Momento-Request')!=='1'||request.headers.get('Sec-Fetch-Site')==='cross-site')throw accountFailure('invalid_origin',403);
 const body=await readJSON(request);
 await limit('mfa-write',user.id,10,900000);await limit('mfa-write-ip',request.headers.get('CF-Connecting-IP')||'unknown',30,900000);
 if(path.endsWith('/enroll')){
  await requireMFA(context,user);
  if(factors.length>=2)throw accountFailure('mfa_factor_limit',409);
  if(typeof body.password!=='string'||!body.password||body.password.length>1024)throw accountFailure('invalid_password',400);
  await verifyPassword(user,body.password);
  const {data,error}=await auth.mfa.enroll({factorType:'totp',friendlyName:'Momento · '+crypto.randomUUID().slice(0,8),issuer:'Momento'});providerError(error);
  if(!uuid(data?.id)||typeof data?.totp?.secret!=='string'||typeof data?.totp?.qr_code!=='string')throw accountFailure('mfa_unavailable');
  return Response.json({factorId:data.id,secret:data.totp.secret,qr:data.totp.qr_code});
 }
 const factor=factors.find(f=>f.id===body.factorId);if(!factor)throw accountFailure('mfa_factor_unavailable',404);
 if(path.endsWith('/cancel')){
  if(factor.status!=='unverified')throw accountFailure('mfa_required',403);
  const {error}=await auth.mfa.unenroll({factorId:factor.id});providerError(error);return Response.json({cancelled:true});
 }
 if(path.endsWith('/remove')&&factor.status!=='verified')throw accountFailure('mfa_factor_unavailable',404);
 if(typeof body.code!=='string'||!/^\d{6}$/.test(body.code))throw accountFailure('invalid_code',400);
 // Native Auth checks factor ownership, one-time code and challenge expiration.
 const result=await auth.mfa.challengeAndVerify({factorId:factor.id,code:body.code});
 if(result.error)throw accountFailure(result.error.status===429?'too_many_attempts':'invalid_code',result.error.status===429?429:401);
 if(await mfaLevel(context)!=='aal2')throw accountFailure('mfa_required',403);
 if(path.endsWith('/remove')){
  if(factor.status!=='verified')throw accountFailure('mfa_factor_unavailable',404);
  const {error}=await auth.mfa.unenroll({factorId:factor.id});providerError(error);return Response.json({removed:true});
 }
 // Never return access/refresh tokens, challenge identifiers or the Auth user.
 return Response.json({verified:true});
}
