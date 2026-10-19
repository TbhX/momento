import {createServerClient,parseCookieHeader,serializeCookieHeader} from '@supabase/ssr';

// Only the standalone build imports this adapter. Sites keeps its platform identity.
const OAUTH_PROVIDERS=['google','apple','facebook'];
const AUTH_COOKIE='__Host-momento-auth';
const PHONE_COOKIE='__Host-momento-phone';
const COOKIE_OPTIONS={path:'/',secure:true,httpOnly:true,sameSite:'lax'};
const AUTH_HEADERS={'Cache-Control':'private, no-store','Pragma':'no-cache','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Vary':'Cookie','Strict-Transport-Security':'max-age=31536000'};
const authFailure=(code,status=400)=>Object.assign(new Error(code),{status,momentoAuthError:true});
const responseJSON=(data,status=200)=>Response.json(data,{status,headers:AUTH_HEADERS});

export function externalAuthConfiguration(env){
 let supabaseURL,origin;const issues=[];
 try{supabaseURL=new URL(env.SUPABASE_URL);if(supabaseURL.protocol!=='https:'||!/^https:\/\/[a-z0-9]{20}\.supabase\.co\/$/.test(supabaseURL.href))throw 0}catch{issues.push('supabase_url')}
 if(!/^sb_publishable_[A-Za-z0-9_-]{12,}$/.test(env.SUPABASE_PUBLISHABLE_KEY||''))issues.push('publishable_key');
 try{origin=new URL(env.MOMENTO_APP_ORIGIN);if(origin.protocol!=='https:'||origin.origin!==env.MOMENTO_APP_ORIGIN||origin.username||origin.password)throw 0}catch{issues.push('app_origin')}
 const providers=String(env.AUTH_OAUTH_PROVIDERS||'google').split(',').map(s=>s.trim()).filter((p,i,a)=>OAUTH_PROVIDERS.includes(p)&&a.indexOf(p)===i);
 const dailyBudget=Number(env.AUTH_SMS_DAILY_BUDGET||20);
 const sms=env.AUTH_SMS_ENABLED==='true'&&!!env.DB&&String(env.AUTH_COOKIE_SECRET||'').length>=32&&Number.isInteger(dailyBudget)&&dailyBudget>=1&&dailyBudget<=500;
 return{configured:issues.length===0,issues,url:supabaseURL?.origin,origin:origin?.origin,providers,sms,dailyBudget};
}

function cookieContext(request,config){
 const jar=new Map(parseCookieHeader(request.headers.get('Cookie')||'').map(c=>[c.name,c.value]));
 const outgoing=new Map();
 const put=(name,value,options={})=>{jar.set(name,value);outgoing.set(name,serializeCookieHeader(name,value,{...options,...COOKIE_OPTIONS,...(options.maxAge===0?{maxAge:0,expires:new Date(0)}:{})}))};
 const supabase=createServerClient(config.url,config.key,{
  cookieOptions:{name:AUTH_COOKIE,...COOKIE_OPTIONS},
  global:{fetch:(input,init={})=>fetch(input,{...init,signal:AbortSignal.timeout(10000)})},
  cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll(cookies){for(const c of cookies)put(c.name,c.value,{...c.options,...(c.name.includes('code-verifier')&&c.options?.maxAge!==0?{maxAge:600}:{})})}}
 });
 return{supabase,jar,put,finish(response){const headers=new Headers(response.headers);for(const value of outgoing.values())headers.append('Set-Cookie',value);for(const [key,value] of Object.entries(AUTH_HEADERS))headers.set(key,value);return new Response(response.body,{status:response.status,statusText:response.statusText,headers})}};
}

async function limitedJSON(request){
 if(!request.headers.get('Content-Type')?.startsWith('application/json'))throw authFailure('json_required',415);
 const reader=request.body?.getReader();let bytes=0,parts=[];
 if(reader)try{for(;;){const {value,done}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>4096){await reader.cancel();throw authFailure('body_too_large',413)}parts.push(value)}}finally{reader.releaseLock()}
 try{const buffer=new Uint8Array(bytes);let pos=0;for(const part of parts){buffer.set(part,pos);pos+=part.length}const value=JSON.parse(new TextDecoder().decode(buffer));if(!value||typeof value!=='object'||Array.isArray(value))throw 0;return value}catch{throw authFailure('invalid_json')}
}
function checkMutation(request,origin){if(request.method!=='POST')throw authFailure('method_not_allowed',405);if(request.headers.get('Origin')!==origin||request.headers.get('X-Momento-Request')!=='1'||request.headers.get('Sec-Fetch-Site')==='cross-site')throw authFailure('invalid_origin',403)}
const b64=bytes=>btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
async function hmac(secret,value){const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);return b64(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(value)))}
async function signedPhone(env,phone){const data=b64(new TextEncoder().encode(JSON.stringify({phone,expires:Date.now()+300000,nonce:crypto.randomUUID()})));return data+'.'+await hmac(env.AUTH_COOKIE_SECRET,data)}
async function readPhone(env,value){
 if(!value||value.length>1024)throw authFailure('phone_challenge_expired',401);
 const [payload,signature,...rest]=value.split('.');const expected=await hmac(env.AUTH_COOKIE_SECRET,payload);
 if(rest.length||!signature||signature.length!==expected.length)throw authFailure('phone_challenge_expired',401);
 let diff=0;for(let i=0;i<expected.length;i++)diff|=expected.charCodeAt(i)^signature.charCodeAt(i);if(diff)throw authFailure('phone_challenge_expired',401);
 try{const data=JSON.parse(atob(payload.replace(/-/g,'+').replace(/_/g,'/')));if(data.expires<=Date.now()||data.expires>Date.now()+300000||!/^\+[1-9]\d{7,14}$/.test(data.phone)||typeof data.nonce!=='string')throw 0;return data}catch{throw authFailure('phone_challenge_expired',401)}
}
async function countAttempt(env,label,subject,limit,period){
 if(!env.DB||String(env.AUTH_COOKIE_SECRET||'').length<32)throw authFailure('auth_not_configured',503);
 const now=Date.now(),key='auth:'+label+':'+Math.floor(now/period)+':'+await hmac(env.AUTH_COOKIE_SECRET,subject);
 const row=await env.DB.prepare('INSERT INTO rate_limits(key,count,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count').bind(key,now+period*2).first();
 if(!row||row.count>limit)throw authFailure('too_many_attempts',429);
 // Expired identifiers are not retained indefinitely on a low-traffic installation.
 await env.DB.prepare('DELETE FROM rate_limits WHERE key LIKE ? AND expires_at<?').bind('auth:%',now).run();
}
const clientIP=request=>request.headers.get('CF-Connecting-IP')||'unknown'; // Trusted on the Cloudflare standalone target; never X-Forwarded-For.
function verifiedIdentity(user){if(!user||user.is_anonymous||!user.aud||user.aud!=='authenticated'||! /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(user.id))return null;return{id:'supabase:'+user.id,email:user.email_confirmed_at?user.email||'':''}}
async function enabledProviders(config){
 try{const r=await fetch(config.url+'/auth/v1/settings',{headers:{apikey:config.key},signal:AbortSignal.timeout(10000)});if(!r.ok)throw 0;const settings=await r.json();return{providers:config.providers.filter(p=>settings.external?.[p]===true),sms:config.sms&&settings.external?.phone===true}}catch{throw authFailure('auth_provider_unavailable',503)}
}

async function authenticationRoute(request,env,config,context){
 const path=new URL(request.url).pathname;
 if(path==='/api/auth/config'&&request.method==='GET'){
  if(!config.configured)return responseJSON({mode:'supabase',configured:false,providers:[],sms:false});
  return responseJSON({mode:'supabase',configured:true,...await enabledProviders(config)});
 }
 if(!config.configured)throw authFailure('auth_not_configured',503);
 const auth=context.supabase.auth;
 if(path==='/api/auth/callback'&&request.method==='GET'){
  const code=new URL(request.url).searchParams.get('code');
  if(!code||code.length>2048)return Response.redirect(config.origin+'/?authError=cancelled',303);
  const {data,error}=await auth.exchangeCodeForSession(code);
  if(error||!verifiedIdentity(data.user))return Response.redirect(config.origin+'/?authError=failed',303);
  return Response.redirect(config.origin+'/',303);
 }
 checkMutation(request,config.origin);
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
  for(const name of context.jar.keys())if(name===PHONE_COOKIE||name.startsWith(AUTH_COOKIE))context.put(name,'',{maxAge:0});
  return responseJSON({signedOut:true});
 }
 throw authFailure('not_found',404);
}

export function withExternalAuth(application,{staticHeaders={},staticBinding='PUBLIC_ASSETS'}={}){return{async fetch(request,env,ctx){
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
  headers.set('oai-authenticated-user-id',identity.id);if(identity.email)headers.set('oai-authenticated-user-email',identity.email);
  const authenticated=new Request(clean,{headers});
  return context.finish(await application.fetch(authenticated,{...env,MOMENTO_IDENTITY_PROVIDER:'supabase'},ctx));
 }catch(error){const response=responseJSON({error:error.momentoAuthError?error.message:'authentication_unavailable'},error.momentoAuthError?error.status:503);return context?context.finish(response):response}
}}}
