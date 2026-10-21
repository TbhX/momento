import {createServerClient,parseCookieHeader,serializeCookieHeader} from '@supabase/ssr';
import {createClient} from '@supabase/supabase-js';
import {usesSupabaseData,hasServerKey,serverRPC,requireActiveSession,reserveRecovery} from './supabase-server.mjs';
import {supabaseAccountAPI} from './supabase-account.mjs';

// Only the standalone build imports this adapter. Sites keeps its platform identity.
const OAUTH_PROVIDERS=['google','apple','facebook'];
const AUTH_COOKIE='__Host-momento-auth';
const PHONE_COOKIE='__Host-momento-phone';
const EMAIL_FLOW_COOKIE='__Host-momento-email-flow';
const RECOVERY_COOKIE='__Host-momento-recovery';
const COOKIE_OPTIONS={path:'/',secure:true,httpOnly:true,sameSite:'lax'};
const AUTH_HEADERS={'Cache-Control':'private, no-store','Pragma':'no-cache','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Vary':'Cookie','Strict-Transport-Security':'max-age=31536000'};
const authFailure=(code,status=400)=>Object.assign(new Error(code),{status,momentoAuthError:true});
const responseJSON=(data,status=200)=>Response.json(data,{status,headers:AUTH_HEADERS});

export function externalAuthConfiguration(env){
 let supabaseURL,origin;const issues=[];
 try{supabaseURL=new URL(env.SUPABASE_URL);if(supabaseURL.protocol!=='https:'||!/^https:\/\/[a-z0-9]{20}\.supabase\.co\/$/.test(supabaseURL.href))throw 0}catch{issues.push('supabase_url')}
 if(!/^sb_publishable_[A-Za-z0-9_-]{12,}$/.test(env.SUPABASE_PUBLISHABLE_KEY||''))issues.push('publishable_key');
 if(usesSupabaseData(env)&&!hasServerKey(env))issues.push('server_key');
 try{origin=new URL(env.MOMENTO_APP_ORIGIN);if(origin.protocol!=='https:'||origin.origin!==env.MOMENTO_APP_ORIGIN||origin.username||origin.password)throw 0}catch{issues.push('app_origin')}
 const providers=String(env.AUTH_OAUTH_PROVIDERS??'google').split(',').map(s=>s.trim()).filter((p,i,a)=>OAUTH_PROVIDERS.includes(p)&&a.indexOf(p)===i);
 const dailyBudget=Number(env.AUTH_SMS_DAILY_BUDGET||20);
 const guarded=(usesSupabaseData(env)?hasServerKey(env):!!env.DB)&&String(env.AUTH_COOKIE_SECRET||'').length>=32;
 const sms=env.AUTH_SMS_ENABLED==='true'&&guarded&&Number.isInteger(dailyBudget)&&dailyBudget>=1&&dailyBudget<=500;
 const emailBudget=Number(env.AUTH_EMAIL_DAILY_BUDGET||20);
 const emailMode=env.AUTH_EMAIL_MODE||'confirmed';
 if(!['confirmed','basic'].includes(emailMode))issues.push('email_mode');
 // The Supabase-backed target follows the native email provider switch. The
 // old environment switch remains limited to the legacy D1 adapter.
 const emailSource=usesSupabaseData(env)?'supabase':'environment';
 const email=(emailSource==='supabase'||env.AUTH_EMAIL_ENABLED==='true')&&guarded&&Number.isInteger(emailBudget)&&emailBudget>=1&&emailBudget<=500;
 return{configured:issues.length===0,issues,url:supabaseURL?.origin,origin:origin?.origin,providers,sms,dailyBudget,email,emailBudget,emailMode,emailSource};
}

function cookieContext(request,config){
 const jar=new Map(parseCookieHeader(request.headers.get('Cookie')||'').map(c=>[c.name,c.value]));
 const outgoing=new Map();
 const put=(name,value,options={})=>{jar.set(name,value);outgoing.set(name,serializeCookieHeader(name,value,{...options,...COOKIE_OPTIONS,...(options.maxAge===0?{maxAge:0,expires:new Date(0)}:{})}))};
 const supabase=createServerClient(config.url,config.key,{
  db:{retry:false},
  cookieOptions:{name:AUTH_COOKIE,...COOKIE_OPTIONS},
  global:{fetch:(input,init={})=>fetch(input,{...init,signal:AbortSignal.timeout(10000)})},
  cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll(cookies){for(const c of cookies)put(c.name,c.value,{...c.options,...(c.name.includes('code-verifier')&&c.options?.maxAge!==0?{maxAge:600}:{})})}}
 });
 return{supabase,jar,put,finish(response){const headers=new Headers(response.headers);for(const value of outgoing.values())headers.append('Set-Cookie',value);for(const [key,value] of Object.entries(AUTH_HEADERS))headers.set(key,value);return new Response(response.body,{status:response.status,statusText:response.statusText,headers})}};
}

async function limitedJSON(request,limit=4096){
 if(!request.headers.get('Content-Type')?.startsWith('application/json'))throw authFailure('json_required',415);
 const reader=request.body?.getReader();let bytes=0,parts=[];
 if(reader)try{for(;;){const {value,done}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>limit){await reader.cancel();throw authFailure('body_too_large',413)}parts.push(value)}}finally{reader.releaseLock()}
 try{const buffer=new Uint8Array(bytes);let pos=0;for(const part of parts){buffer.set(part,pos);pos+=part.length}const value=JSON.parse(new TextDecoder().decode(buffer));if(!value||typeof value!=='object'||Array.isArray(value))throw 0;return value}catch{throw authFailure('invalid_json')}
}
function checkMutation(request,origin){if(request.method!=='POST')throw authFailure('method_not_allowed',405);if(request.headers.get('Origin')!==origin||request.headers.get('X-Momento-Request')!=='1'||request.headers.get('Sec-Fetch-Site')==='cross-site')throw authFailure('invalid_origin',403)}
const b64=bytes=>btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
async function hmac(secret,value){const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);return b64(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(value)))}
async function signedEmailRecord(env,data){const payload=b64(new TextEncoder().encode(JSON.stringify(data)));return payload+'.'+await hmac(env.AUTH_COOKIE_SECRET,'email:'+payload)}
async function readEmailRecord(env,value,kind,lifetime){
 if(typeof value!=='string'||value.length>2048)throw authFailure('recovery_expired',401);
 const [payload,signature,...rest]=value.split('.');const expected=await hmac(env.AUTH_COOKIE_SECRET,'email:'+payload);
 if(rest.length||!signature||signature.length!==expected.length)throw authFailure('recovery_expired',401);
 let diff=0;for(let i=0;i<expected.length;i++)diff|=signature.charCodeAt(i)^expected.charCodeAt(i);if(diff)throw authFailure('recovery_expired',401);
 try{const record=JSON.parse(atob(payload.replace(/-/g,'+').replace(/_/g,'/')));if(record.kind!==kind||!Number.isFinite(record.expires)||record.expires<=Date.now()||record.expires>Date.now()+lifetime||typeof record.nonce!=='string')throw 0;return record}catch{throw authFailure('recovery_expired',401)}
}
function normalizedEmail(value){if(typeof value!=='string')throw authFailure('invalid_email');const email=value.trim().toLowerCase();if(email.length>254||! /^[^\s@\x00-\x1f\x7f]+@[^\s@\x00-\x1f\x7f]+\.[^\s@\x00-\x1f\x7f]+$/.test(email))throw authFailure('invalid_email');return email}
function validPassword(value,{newPassword=false}={}){if(typeof value!=='string'||value.length<1||value.length>1024)throw authFailure('invalid_password');if(newPassword&&([...value].length<12||[...value].length>64||new TextEncoder().encode(value).length>72))throw authFailure('invalid_password');return value}
async function verifierFingerprint(context,env){const values=[...context.jar].filter(([name,value])=>name.startsWith(AUTH_COOKIE)&&name.includes('code-verifier')&&value).sort(([a],[b])=>a.localeCompare(b));if(!values.length)throw authFailure('recovery_expired',401);return hmac(env.AUTH_COOKIE_SECRET,JSON.stringify(values))}
function sessionId(session){try{const payload=JSON.parse(atob(session.access_token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));return typeof payload.session_id==='string'&&/^[0-9a-f-]{36}$/i.test(payload.session_id)?payload.session_id:null}catch{return null}}
function clearIdentityCookies(context){for(const name of context.jar.keys())if(name.startsWith(AUTH_COOKIE)||[PHONE_COOKIE,EMAIL_FLOW_COOKIE,RECOVERY_COOKIE].includes(name))context.put(name,'',{maxAge:0})}
async function recoveryGrant(context,env){
 const grant=await readEmailRecord(env,context.jar.get(RECOVERY_COOKIE),'password',900000);
 const {data,error}=await context.supabase.auth.getUser();if(error||!verifiedIdentity(data?.user)||data.user.id!==grant.user)throw authFailure('recovery_expired',401);
 await requireActiveSession(env,context,data.user.id);
 const {data:session}=await context.supabase.auth.getSession();if(!grant.session||sessionId(session?.session)!==grant.session)throw authFailure('recovery_expired',401);return grant;
}
function emailProviderError(error,{concealAccount=false}={}){if(!error)return;if(concealAccount&&['user_already_exists','email_exists','user_not_found'].includes(error.code))return;if(error.status===429)throw authFailure('too_many_attempts',429);if(error.code==='weak_password'||error.code==='same_password')throw authFailure('invalid_password');throw authFailure('email_unavailable',503)}
async function emailSendLimits(request,env,config,email){await countAttempt(env,'email-send-ip',clientIP(request),5,3600000);await countAttempt(env,'email-send-address',email,3,3600000);await countAttempt(env,'email-send-minute',email,1,60000);await countAttempt(env,'email-send-budget','all',config.emailBudget,86400000)}
async function signedPhone(env,phone){const data=b64(new TextEncoder().encode(JSON.stringify({phone,expires:Date.now()+300000,nonce:crypto.randomUUID()})));return data+'.'+await hmac(env.AUTH_COOKIE_SECRET,data)}
async function readPhone(env,value){
 if(!value||value.length>1024)throw authFailure('phone_challenge_expired',401);
 const [payload,signature,...rest]=value.split('.');const expected=await hmac(env.AUTH_COOKIE_SECRET,payload);
 if(rest.length||!signature||signature.length!==expected.length)throw authFailure('phone_challenge_expired',401);
 let diff=0;for(let i=0;i<expected.length;i++)diff|=expected.charCodeAt(i)^signature.charCodeAt(i);if(diff)throw authFailure('phone_challenge_expired',401);
 try{const data=JSON.parse(atob(payload.replace(/-/g,'+').replace(/_/g,'/')));if(data.expires<=Date.now()||data.expires>Date.now()+300000||!/^\+[1-9]\d{7,14}$/.test(data.phone)||typeof data.nonce!=='string')throw 0;return data}catch{throw authFailure('phone_challenge_expired',401)}
}
async function countAttempt(env,label,subject,limit,period){
 if((usesSupabaseData(env)?!hasServerKey(env):!env.DB)||String(env.AUTH_COOKIE_SECRET||'').length<32)throw authFailure('auth_not_configured',503);
 const now=Date.now(),key='auth:'+label+':'+Math.floor(now/period)+':'+await hmac(env.AUTH_COOKIE_SECRET,subject);
 if(usesSupabaseData(env)){
  const count=await serverRPC(env,'server_auth_attempt',{p_key:key,p_expires_at:new Date(now+period*2).toISOString()});
  if(!Number.isInteger(count)||count>limit)throw authFailure('too_many_attempts',429);
  return;
 }
 const row=await env.DB.prepare('INSERT INTO rate_limits(key,count,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count').bind(key,now+period*2).first();
 if(!row||row.count>limit)throw authFailure('too_many_attempts',429);
 // Expired identifiers are not retained indefinitely on a low-traffic installation.
 await env.DB.prepare('DELETE FROM rate_limits WHERE key LIKE ? AND expires_at<?').bind('auth:%',now).run();
}
const clientIP=request=>request.headers.get('CF-Connecting-IP')||'unknown'; // Trusted on the Cloudflare standalone target; never X-Forwarded-For.
function verifiedIdentity(user){if(!user||user.is_anonymous||(!user.email_confirmed_at&&!user.phone_confirmed_at)||!user.aud||user.aud!=='authenticated'||! /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(user.id))return null;return{id:'supabase:'+user.id,email:user.email_confirmed_at?user.email||'':''}}
async function enabledProviders(config){
 try{
  const r=await fetch(config.url+'/auth/v1/settings',{headers:{apikey:config.key},cache:'no-store',signal:AbortSignal.timeout(10000)});if(!r.ok)throw 0;
  const settings=await limitedJSON(r,32768);
  const email=config.email&&settings.external?.email===true&&settings.mailer_autoconfirm===(config.emailMode==='basic');
  // Closing new signups in Supabase must leave existing members able to sign
  // in. Missing or malformed signup settings never authorize account creation.
  return{providers:config.providers.filter(p=>settings.external?.[p]===true),sms:config.sms&&settings.external?.phone===true,email,emailSignup:email&&settings.disable_signup===false,emailMode:config.emailMode,emailRecovery:email&&config.emailMode==='confirmed'};
 }catch{throw authFailure('auth_provider_unavailable',503)}
}

async function basicSignUp(config,context,env,email,password){
 // SSR forces PKCE, which cannot be combined with autoconfirm. This transient
 // publishable-key client performs only password signup, with no URL redirect,
 // persistence or browser tokens. The SSR client stores the resulting session
 // in the existing HttpOnly cookies and verifies it with the Auth server.
 const client=createClient(config.url,config.key,{auth:{flowType:'implicit',persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:(input,init={})=>fetch(input,{...init,signal:AbortSignal.timeout(10000)})}});
 const {data,error}=await client.auth.signUp({email,password});
 emailProviderError(error,{concealAccount:true});
 if(error)return responseJSON({accepted:true,next:'signin'});
 if(!data?.session||!verifiedIdentity(data.user))throw authFailure('email_unavailable',503);
 const stored=await context.supabase.auth.setSession({access_token:data.session.access_token,refresh_token:data.session.refresh_token});
 if(stored.error||stored.data?.user?.id!==data.user.id){clearIdentityCookies(context);throw authFailure('email_unavailable',503)}
 const checked=await context.supabase.auth.getUser();
 if(checked.error||!verifiedIdentity(checked.data?.user)||checked.data.user.id!==data.user.id){clearIdentityCookies(context);throw authFailure('invalid_credentials',401)}
 await requireActiveSession(env,context,data.user.id);
 return responseJSON({authenticated:true,next:'profile',emailVerified:false});
}

async function authenticationRoute(request,env,config,context){
 const path=new URL(request.url).pathname;
 if(path==='/api/auth/config'&&request.method==='GET'){
  if(!config.configured)return responseJSON({mode:'supabase',configured:false,providers:[],sms:false,email:false,emailSignup:false,emailRecovery:false,recovery:false});
  const providers=await enabledProviders(config);let recovery=false;
  if(providers.emailRecovery&&context.jar.get(RECOVERY_COOKIE))try{await recoveryGrant(context,env);recovery=true}catch{context.put(RECOVERY_COOKIE,'',{maxAge:0})}
  return responseJSON({mode:'supabase',configured:true,...providers,recovery});
 }
 if(!config.configured)throw authFailure('auth_not_configured',503);
 const auth=context.supabase.auth;
 if(path==='/api/auth/recovery/callback'&&request.method==='GET'){
  let flow;
  try{if(!config.email||config.emailMode==='basic'||!(await enabledProviders(config)).emailRecovery)throw 0;flow=await readEmailRecord(env,context.jar.get(EMAIL_FLOW_COOKIE),'recover',600000);if(flow.verifier!==await verifierFingerprint(context,env))throw 0}catch{context.put(EMAIL_FLOW_COOKIE,'',{maxAge:0});return Response.redirect(config.origin+'/?authError=recovery_expired',303)}
  context.put(EMAIL_FLOW_COOKIE,'',{maxAge:0});
  const url=new URL(request.url),code=url.searchParams.get('code'),flowId=url.searchParams.get('sb_flow_id');
  if(!code||code.length>2048)return Response.redirect(config.origin+'/?authError=recovery_expired',303);
  const {data,error}=await auth.exchangeCodeForSession(code,flowId?{flowId}:undefined);
  if(error||data?.redirectType!=='recovery'||!verifiedIdentity(data?.user)||!data.user.email_confirmed_at||!sessionId(data.session)||flow.email!==await hmac(env.AUTH_COOKIE_SECRET,'address:'+normalizedEmail(data.user.email))){clearIdentityCookies(context);return Response.redirect(config.origin+'/?authError=recovery_expired',303)}
  context.put(RECOVERY_COOKIE,await signedEmailRecord(env,{kind:'password',user:data.user.id,session:sessionId(data.session),nonce:crypto.randomUUID(),expires:Date.now()+900000}),{maxAge:900});
  return Response.redirect(config.origin+'/?authFlow=recovery',303);
 }
 if(path==='/api/auth/callback'&&request.method==='GET'){
  const url=new URL(request.url),code=url.searchParams.get('code'),flowId=url.searchParams.get('sb_flow_id');
  if(!code||code.length>2048)return Response.redirect(config.origin+'/?authError=cancelled',303);
  const {data,error}=await auth.exchangeCodeForSession(code,flowId?{flowId}:undefined);
  if(error||!verifiedIdentity(data.user)||data.redirectType==='recovery'){if(data?.redirectType==='recovery')clearIdentityCookies(context);return Response.redirect(config.origin+'/?authError=failed',303)}
  context.put(EMAIL_FLOW_COOKIE,'',{maxAge:0});context.put(RECOVERY_COOKIE,'',{maxAge:0});
  return Response.redirect(config.origin+'/',303);
 }
 checkMutation(request,config.origin);
 if(path.startsWith('/api/auth/email/')){
  const available=await enabledProviders(config);
  if(!available.email)throw authFailure('email_not_enabled',409);
  if(path==='/api/auth/email/signup'&&!available.emailSignup)throw authFailure('signup_closed',409);
  if(config.emailMode==='basic'&&!['/api/auth/email/signup','/api/auth/email/signin'].includes(path))throw authFailure('email_links_not_enabled',409);
  if(path==='/api/auth/email/password'){
   const {password}=await limitedJSON(request);validPassword(password,{newPassword:true});
   await countAttempt(env,'password-ip',clientIP(request),10,900000);
   const grant=await recoveryGrant(context,env),key='auth:recovery-use:'+await hmac(env.AUTH_COOKIE_SECRET,grant.nonce);
   const claim=await reserveRecovery(env,key,grant.expires);
   if(!claim)throw authFailure('recovery_expired',401);
   const {error}=await auth.updateUser({password});
   if(error){if(['weak_password','same_password'].includes(error.code)){await reserveRecovery(env,key,grant.expires,true);throw authFailure('invalid_password')}clearIdentityCookies(context);throw authFailure('recovery_expired',401)}
   let revoked=false;try{const result=await auth.signOut({scope:'global'});revoked=!result.error}catch{}
   clearIdentityCookies(context);return responseJSON({passwordUpdated:true,otherSessionsRevoked:revoked});
  }
  if(!['/api/auth/email/signup','/api/auth/email/signin','/api/auth/email/recover','/api/auth/email/resend'].includes(path))throw authFailure('not_found',404);
  const body=await limitedJSON(request),email=normalizedEmail(body.email);
  if(path==='/api/auth/email/signin'){
   const password=validPassword(body.password);await countAttempt(env,'email-login-ip',clientIP(request),20,900000);await countAttempt(env,'email-login-address',email,10,900000);
   const {data,error}=await auth.signInWithPassword({email,password});
   if(error?.status===429)throw authFailure('too_many_attempts',429);
   if(error&&error.status>=500)throw authFailure('email_unavailable',503);
   if(error||!verifiedIdentity(data?.user)||!data.user.email_confirmed_at){if(data?.session)clearIdentityCookies(context);throw authFailure('invalid_credentials',401)}
   context.put(EMAIL_FLOW_COOKIE,'',{maxAge:0});context.put(RECOVERY_COOKIE,'',{maxAge:0});return responseJSON({authenticated:true});
  }
  if(path==='/api/auth/email/resend'){
   await emailSendLimits(request,env,config,email);context.put(EMAIL_FLOW_COOKIE,'',{maxAge:0});context.put(RECOVERY_COOKIE,'',{maxAge:0});
   const {error}=await auth.resend({type:'signup',email,options:{emailRedirectTo:config.origin+'/api/auth/callback'}});emailProviderError(error,{concealAccount:true});return responseJSON({accepted:true,next:'confirm_email'});
  }
  if(path==='/api/auth/email/signup'){
   const password=validPassword(body.password,{newPassword:true});await emailSendLimits(request,env,config,email);
   context.put(EMAIL_FLOW_COOKIE,'',{maxAge:0});context.put(RECOVERY_COOKIE,'',{maxAge:0});
   if(config.emailMode==='basic')return basicSignUp(config,context,env,email,password);
   const {data,error}=await auth.signUp({email,password,options:{emailRedirectTo:config.origin+'/api/auth/callback'}});emailProviderError(error,{concealAccount:true});
   if(data?.session){try{await auth.signOut({scope:'local'})}finally{clearIdentityCookies(context)}throw authFailure('email_not_enabled',409)}
   return responseJSON({accepted:true,next:'confirm_email'});
  }
  await emailSendLimits(request,env,config,email);context.put(RECOVERY_COOKIE,'',{maxAge:0});
  const {error}=await auth.resetPasswordForEmail(email,{redirectTo:config.origin+'/api/auth/recovery/callback'});emailProviderError(error,{concealAccount:true});
  if(!error)context.put(EMAIL_FLOW_COOKIE,await signedEmailRecord(env,{kind:'recover',nonce:crypto.randomUUID(),email:await hmac(env.AUTH_COOKIE_SECRET,'address:'+email),verifier:await verifierFingerprint(context,env),expires:Date.now()+600000}),{maxAge:600});
  else context.put(EMAIL_FLOW_COOKIE,'',{maxAge:0});
  return responseJSON({accepted:true,next:'recovery_email'});
 }
 if(path==='/api/auth/oauth'){
  const {provider}=await limitedJSON(request);
  if(!config.providers.includes(provider)||!(await enabledProviders(config)).providers.includes(provider))throw authFailure('provider_not_enabled',409);
  const {data,error}=await auth.signInWithOAuth({provider,options:{redirectTo:config.origin+'/api/auth/callback',skipBrowserRedirect:true}});
  if(error||!data.url)throw authFailure('auth_provider_unavailable',503);
  const target=new URL(data.url);if(target.origin!==config.url||target.pathname!=='/auth/v1/authorize')throw authFailure('invalid_redirect',502);
  return responseJSON({url:target.href});
 }
 if(path==='/api/auth/phone/start'){
  if(!config.sms)throw authFailure('phone_not_enabled',409);
  const {phone}=await limitedJSON(request);if(typeof phone!=='string'||!/^\+[1-9]\d{7,14}$/.test(phone))throw authFailure('invalid_phone');
  await countAttempt(env,'sms-ip',clientIP(request),5,3600000);
  await countAttempt(env,'sms-phone',phone,3,3600000);
  await countAttempt(env,'sms-budget','all',config.dailyBudget,86400000);
  const {error}=await auth.signInWithOtp({phone,options:{channel:'sms',shouldCreateUser:true}});
  if(error)throw authFailure(error.status===429?'too_many_attempts':'sms_unavailable',error.status===429?429:503);
  context.put(PHONE_COOKIE,await signedPhone(env,phone),{maxAge:300});
  return responseJSON({sent:true,maskedPhone:phone.slice(0,3)+' •••• '+phone.slice(-2),expiresIn:300});
 }
 if(path==='/api/auth/phone/verify'){
  if(!config.sms)throw authFailure('phone_not_enabled',409);
  const challenge=await readPhone(env,context.jar.get(PHONE_COOKIE)),{code}=await limitedJSON(request);
  if(typeof code!=='string'||!/^\d{6}$/.test(code))throw authFailure('invalid_code');
  await countAttempt(env,'verify-ip',clientIP(request),20,600000);
  await countAttempt(env,'verify-challenge',challenge.nonce,5,600000);
  const {data,error}=await auth.verifyOtp({phone:challenge.phone,token:code,type:'sms'});
  if(error||!verifiedIdentity(data.user))throw authFailure('invalid_code',401);
  context.put(PHONE_COOKIE,'',{maxAge:0});return responseJSON({authenticated:true});
 }
 if(path==='/api/auth/logout'){
  const {error}=await auth.signOut({scope:'local'});if(error&&error.name!=='AuthSessionMissingError'&&error.status!==401&&error.status!==403)throw authFailure('logout_unavailable',503);
  clearIdentityCookies(context);
  return responseJSON({signedOut:true});
 }
 throw authFailure('not_found',404);
}

export function withExternalAuth(application,{staticHeaders={},staticBinding='PUBLIC_ASSETS',mediaCodec}={}){return{async fetch(request,env,ctx){
 const url=new URL(request.url),authPath=url.pathname.startsWith('/api/auth/');
 const headers=new Headers(request.headers);
 // External requests can forge platform headers. Remove them before EVERY route.
 for(const name of [...headers.keys()])if(name.toLowerCase().startsWith('oai-authenticated-'))headers.delete(name);
 const clean=new Request(request,{headers});
 if(['/signin-with-chatgpt','/signout-with-chatgpt','/callback'].includes(url.pathname))return responseJSON({error:'not_found'},404);
 const protectedPath=/^\/api\/(?:me(?:\/|$)|profile-photo\/|service(?:\/|$))/.test(url.pathname);
 if(!authPath&&!protectedPath){const staticAssets=env[staticBinding];const response=!url.pathname.startsWith('/api/')&&staticAssets?await staticAssets.fetch(clean):await application.fetch(clean,{...env,MOMENTO_IDENTITY_PROVIDER:'supabase'},ctx);const h=new Headers(response.headers);for(const [key,value] of Object.entries(staticHeaders))h.set(key,value);h.set('Strict-Transport-Security',AUTH_HEADERS['Strict-Transport-Security']);return new Response(response.body,{status:response.status,headers:h})}
 const config={...externalAuthConfiguration(env),key:env.SUPABASE_PUBLISHABLE_KEY};let context;
 try{
  if(config.configured&&url.origin!==config.origin)throw authFailure('invalid_origin',403);
  if(config.configured)context=cookieContext(clean,config);
  if(authPath){const response=await authenticationRoute(clean,env,config,context);return context?context.finish(response):response}
  if(!config.configured)throw authFailure('auth_not_configured',503);
  const {data,error}=await context.supabase.auth.getUser();const identity=verifiedIdentity(data?.user);
  if(error||!identity)throw authFailure('authentication_required',401);
  await requireActiveSession(env,context,data.user.id);
  if(usesSupabaseData(env)){
   const response=await supabaseAccountAPI(clean,env,context,data.user.id,{readJSON:limitedJSON,mediaCodec,origin:config.origin});
   if(url.pathname==='/api/me'&&clean.method==='DELETE'&&response.ok)clearIdentityCookies(context);
   return context.finish(response);
  }
  headers.set('oai-authenticated-user-id',identity.id);if(identity.email)headers.set('oai-authenticated-user-email',identity.email);
  const authenticated=new Request(clean,{headers});
  return context.finish(await application.fetch(authenticated,{...env,MOMENTO_IDENTITY_PROVIDER:'supabase'},ctx));
 }catch(error){const response=responseJSON({error:error.momentoAuthError?error.message:'authentication_unavailable'},error.momentoAuthError?error.status:503);return context?context.finish(response):response}
}}}
