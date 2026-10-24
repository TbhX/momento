import {test} from 'node:test';
import assert from 'node:assert/strict';
import {withExternalAuth,externalAuthConfiguration} from '../worker/external-auth.mjs';

const origin='https://momento.example',url='https://abcdefghijklmnopqrst.supabase.co';
const id='00000000-0000-4000-8000-000000000001',sid='00000000-0000-4000-8000-000000000002';
const pub='sb_publishable_fixture_key_only_123456',secret='sb_secret_fixture_server_key_only_123456';
const user={id,aud:'authenticated',role:'authenticated',email:'member@example.invalid',email_confirmed_at:'2026-10-20T08:00:00Z',app_metadata:{},user_metadata:{role:'admin'}};
const env=()=>({SUPABASE_URL:url,SUPABASE_PUBLISHABLE_KEY:pub,SUPABASE_SECRET_KEY:secret,SUPABASE_DATA_ENABLED:'true',MOMENTO_APP_ORIGIN:origin,AUTH_COOKIE_SECRET:'fixture-cookie-secret-at-least-32-characters',AUTH_EMAIL_ENABLED:'true'});
const legacy={fetch(){throw Error('Legacy D1/R2 backend must not receive this request');}};
function browser(){const cookies=new Map();return{header(){return [...cookies].map(([k,v])=>k+'='+v).join('; ')},apply(response){for(const value of response.headers.getSetCookie()){const item=value.split(';')[0],split=item.indexOf('=');if(/Max-Age=0(?:;|$)/.test(value))cookies.delete(item.slice(0,split));else cookies.set(item.slice(0,split),item.slice(split+1));}},get size(){return cookies.size;}};}
function req(path,{method='GET',body,cookie='',headers={}}={}){return new Request(origin+path,{method,headers:{...(method==='GET'?{}:{Origin:origin,'X-Momento-Request':'1','Content-Type':'application/json'}),...(cookie?{Cookie:cookie}:{}),...headers},...(body===undefined?{}:{body:typeof body==='string'||body instanceof Uint8Array?body:JSON.stringify(body)})});}
function fixture(){
 const f={calls:[],active:true,profile:null,media:[],background:'none',counter:0,authCounters:new Map(),tooMany:false,deleted:false,storage:[],exportRows:null,sessionFailures:0,settings:{external:{email:true,google:false,phone:false},mailer_autoconfirm:false,disable_signup:false}};
 const token={access_token:['eyJhbGciOiJIUzI1NiJ9',Buffer.from(JSON.stringify({sub:id,exp:Math.floor(Date.now()/1000)+3600,session_id:sid})).toString('base64url'),'fixture'].join('.'),refresh_token:'fixture-refresh',expires_in:3600,token_type:'bearer',user};
 f.fetch=async(input,init={})=>{
  const u=new URL(typeof input==='string'?input:input.url),headers=new Headers(init.headers),method=init.method||'GET';
  let body=null;if(typeof init.body==='string'&&headers.get('content-type')?.includes('json'))body=JSON.parse(init.body);
  f.calls.push({path:u.pathname,query:u.searchParams,method,body,apikey:headers.get('apikey'),authorization:headers.get('authorization')});
  const json=value=>Response.json(value,{headers:{'X-Supabase-Api-Version':'2024-01-01'}});
  if(u.pathname==='/auth/v1/settings')return f.settingsResponse?.()??json(f.settings);
  if(u.pathname==='/auth/v1/token')return json(token);
  if(u.pathname==='/auth/v1/signup')return json(token);
  if(u.pathname==='/auth/v1/user')return f.deleted?new Response('{}',{status:401}):json(user);
  if(u.pathname==='/auth/v1/logout'){f.active=false;return new Response(null,{status:204});}
  if(u.pathname==='/auth/v1/admin/users/'+id&&method==='DELETE'){f.deleted=true;return json({user});}
  if(u.pathname.startsWith('/rest/v1/rpc/')){
   switch(u.pathname.split('/').at(-1)){
    case 'server_auth_attempt':{f.counter++;const count=(f.authCounters.get(body.p_key)||0)+1;f.authCounters.set(body.p_key,count);return json(f.tooMany?100:count);}
    case 'server_session_active':if(f.sessionFailures-->0)return Response.json({message:'temporarily unavailable'},{status:503});return json(f.active);
    case 'server_begin_account_deletion':if(f.profile)f.profile.status='deleted';return json(null);
    case 'save_profile':f.profile={id,display_name:body.p_name,age:body.p_age,city:body.p_city,status:'active',created_at:'2026-10-20T08:00:00Z',profession:'',bio:'',gender:'unspecified'};return json(f.profile);
    case 'commit_profile_media':{const old=f.media.find(m=>m.kind===body.p_kind)?.object_path??null;f.media=f.media.filter(m=>m.kind!==body.p_kind);if(body.p_path)f.media.push({kind:body.p_kind,object_path:body.p_path,updated_at:'2026-10-20T09:00:00Z'});return json(old);}
    case 'account_status':return json({premium:false,admin:false,unlimited:false,dailyLimit:1,used:0,bookingLimit:1});
    case 'export_hosted_rooms':return json({owned:[],registrations:[]});
    case 'export_call_extensions':return json([{id:'fixture-extension',outgoing:true,status:'declined',chargedCredits:0}]);
    default:throw Error('Unexpected RPC '+u.pathname);
   }
  }
  if(u.pathname==='/rest/v1/profiles'){if(method==='PATCH'){if(f.denyProfilePatch)return json(null);f.profile.gender=body.gender;return json({gender:f.profile.gender})}return json(f.profile);}
  if(u.pathname==='/rest/v1/profile_media')return json(f.media);
  if(u.pathname==='/rest/v1/preferences'){
   if(method==='PATCH'){f.background=body.video_background;return new Response(null,{status:204});}
   return json({video_background:f.background});
  }
  if(u.pathname.startsWith('/rest/v1/'))return json(f.exportRows??[]);
  if(u.pathname==='/storage/v1/object/list/momento-media')return json(f.storage.map(name=>({name}))); 
  if(u.pathname==='/storage/v1/object/momento-media'&&method==='DELETE'){f.storage=[];return json([]);}
  if(u.pathname.startsWith('/storage/v1/object/momento-media/'))return method==='POST'?json({Key:'fixture'}):new Response(new Uint8Array([255,216,255,217]),{headers:{'content-type':'image/jpeg'}});
  throw Error('Unexpected request '+u.pathname);
 };
 return f;
}
async function run(fn,{codec}={}){const original=globalThis.fetch,f=fixture(),worker=withExternalAuth(legacy,{mediaCodec:codec}),e=env(),b=browser();globalThis.fetch=f.fetch;try{
 const signin=await worker.fetch(req('/api/auth/email/signin',{method:'POST',body:{email:user.email,password:'A test password 2026'}}),e);
 assert.equal(signin.status,200,await signin.clone().text());b.apply(signin);await fn({f,worker,e,b});
}finally{globalThis.fetch=original;}}
const registered=async({worker,e,b})=>worker.fetch(req('/api/me',{method:'POST',cookie:b.header(),body:{name:'Alice',age:28,city:'Paris',adultConfirmed:true,storageConsent:true}}),e);

test('Supabase backend requires a server key and supports guarded email without D1',()=>{
 const e=env();assert.equal(externalAuthConfiguration(e).email,true);assert.equal(externalAuthConfiguration(e).configured,true);
 delete e.SUPABASE_SECRET_KEY;assert.equal(externalAuthConfiguration(e).configured,false);assert.equal(externalAuthConfiguration(e).email,false);
});
test('native Supabase email settings control the target despite an old disabled hosting switch',async()=>run(async c=>{
 c.e.AUTH_EMAIL_ENABLED='false';c.e.AUTH_OAUTH_PROVIDERS='';
 assert.equal(externalAuthConfiguration(c.e).emailSource,'supabase');
 let response=await c.worker.fetch(req('/api/auth/config'),c.e),config=await response.json();
 assert.equal(config.email,true);assert.equal(config.emailSignup,true);assert.deepEqual(config.providers,[]);
 assert.match(response.headers.get('cache-control'),/no-store/);
 c.f.settings.external.email=false;
 config=await(await c.worker.fetch(req('/api/auth/config'),c.e)).json();assert.equal(config.email,false);assert.equal(config.emailSignup,false);
 c.f.calls=[];
 const denied=await c.worker.fetch(req('/api/auth/email/signin',{method:'POST',body:{email:user.email,password:'A test password 2026'}}),c.e);
 assert.equal(denied.status,409);assert.equal(c.f.calls.some(call=>call.path==='/auth/v1/token'),false);
 assert.ok(c.f.calls.every(call=>call.apikey===pub));
 c.f.settings.external.email=true;delete c.e.AUTH_EMAIL_ENABLED;
 assert.equal((await(await c.worker.fetch(req('/api/auth/config'),c.e)).json()).emailSignup,true);
}));
test('closing native signups blocks creation before counters while existing members can still sign in',async()=>run(async c=>{
 c.f.settings.disable_signup=true;c.f.calls=[];
 const config=await(await c.worker.fetch(req('/api/auth/config'),c.e)).json();assert.equal(config.email,true);assert.equal(config.emailSignup,false);
 const response=await c.worker.fetch(req('/api/auth/email/signup',{method:'POST',body:{email:user.email,password:'A test password 2026',disable_signup:false,role:'admin'}}),c.e);
 assert.equal(response.status,409);assert.deepEqual(await response.json(),{error:'signup_closed'});
 assert.equal(c.f.calls.some(call=>call.path==='/auth/v1/signup'||call.path.endsWith('/server_auth_attempt')),false);
 const signin=await c.worker.fetch(req('/api/auth/email/signin',{method:'POST',body:{email:user.email,password:'A test password 2026'}}),c.e);assert.equal(signin.status,200);
 assert.doesNotMatch(await signin.text(),/access_token|refresh_token/);
 assert.equal((await c.worker.fetch(req('/api/me',{cookie:c.b.header()}),c.e)).status,200);
}));
test('unknown signup settings fail closed and a mode mismatch never sends credentials upstream',async()=>run(async c=>{
 for(const value of [undefined,null,'false',0]){
  c.f.settings.disable_signup=value;
  const config=await(await c.worker.fetch(req('/api/auth/config'),c.e)).json();assert.equal(config.email,true);assert.equal(config.emailSignup,false);
  assert.equal((await c.worker.fetch(req('/api/auth/email/signup',{method:'POST',body:{email:user.email,password:'A test password 2026'}}),c.e)).status,409);
 }
 c.f.settings.disable_signup=false;c.f.settings.mailer_autoconfirm=true;
 const config=await(await c.worker.fetch(req('/api/auth/config'),c.e)).json();assert.equal(config.email,false);assert.equal(config.emailSignup,false);
 assert.equal(c.f.calls.some(call=>call.path==='/auth/v1/signup'),false);
}));
test('Supabase basic signup works with the stale hosting flag and keeps credentials in HttpOnly cookies',async()=>run(async c=>{
 c.e.AUTH_EMAIL_ENABLED='false';c.e.AUTH_EMAIL_MODE='basic';c.e.AUTH_OAUTH_PROVIDERS='';c.f.settings.mailer_autoconfirm=true;c.f.calls=[];
 const response=await c.worker.fetch(req('/api/auth/email/signup',{method:'POST',body:{email:user.email,password:'A test password 2026',role:'admin',premium:true}}),c.e);
 assert.equal(response.status,200);assert.deepEqual(await response.json(),{authenticated:true,next:'profile',emailVerified:false});
 assert.ok(response.headers.getSetCookie().some(value=>/HttpOnly/.test(value)&&/Secure/.test(value)&&/SameSite=lax/i.test(value)));
 const signup=c.f.calls.find(call=>call.path==='/auth/v1/signup');assert.equal(signup.apikey,pub);assert.equal(signup.body.code_challenge??null,null);assert.deepEqual(signup.body.data,{});
 assert.equal(c.f.calls.some(call=>/recover|resend/.test(call.path)),false);
}));
test('basic signups use a separate daily budget, retain abuse limits and publish Retry-After',async()=>run(async c=>{
 c.e.AUTH_EMAIL_MODE='basic';c.e.AUTH_BASIC_SIGNUP_DAILY_BUDGET='1';c.f.settings.mailer_autoconfirm=true;
 const signup=email=>req('/api/auth/email/signup',{method:'POST',body:{email,password:'A test password 2026'}});
 const first=await c.worker.fetch(signup('first@example.invalid'),c.e);assert.equal(first.status,200);
 const second=await c.worker.fetch(signup('next@example.invalid'),c.e);assert.equal(second.status,429);assert.ok(Number(second.headers.get('Retry-After'))>0);
 assert.equal(c.f.calls.filter(x=>x.path==='/auth/v1/signup').length,1);
 const keys=[...c.f.authCounters.keys()];assert.ok(keys.some(k=>k.startsWith('auth:basic-signup-budget:')));assert.equal(keys.some(k=>k.startsWith('auth:email-send-budget:')),false);assert.doesNotMatch(keys.join(' '),/first@|next@/);
}));
test('unavailable, malformed or oversized native settings cannot enable signup or expose diagnostics',async()=>run(async c=>{
 for(const response of [()=>Response.json({detail:'private upstream detail'},{status:503}),()=>new Response('{oops',{headers:{'Content-Type':'application/json'}}),()=>Response.json([]),()=>new Response(' '.repeat(32769),{headers:{'Content-Type':'application/json'}})]){
  c.f.settingsResponse=response;c.f.calls=[];
  const config=await c.worker.fetch(req('/api/auth/config'),c.e);assert.equal(config.status,503);assert.deepEqual(await config.json(),{error:'auth_provider_unavailable'});
  const signup=await c.worker.fetch(req('/api/auth/email/signup',{method:'POST',body:{email:user.email,password:'A test password 2026'}}),c.e);assert.equal(signup.status,503);
  assert.equal(c.f.calls.some(call=>call.path==='/auth/v1/signup'||call.path.endsWith('/server_auth_attempt')),false);
 }
}));
test('profile writes use the member JWT, ignore supplied roles/ids and never fall back to legacy storage',async()=>run(async c=>{
 const result=await c.worker.fetch(req('/api/me',{method:'POST',cookie:c.b.header(),headers:{'oai-authenticated-user-id':'forged'},body:{name:'Alice',age:28,city:'Paris',adultConfirmed:true,storageConsent:true,id:sid,role:'admin',premium:true}}),c.e);
 assert.equal(result.status,200);assert.equal((await result.json()).profile.name,'Alice');
 const save=c.f.calls.find(call=>call.path.endsWith('/save_profile'));assert.equal(save.apikey,pub);assert.ok(save.authorization.startsWith('Bearer eyJ'));assert.deepEqual(Object.keys(save.body).sort(),['p_adult','p_age','p_city','p_name','p_storage']);
 const own=await c.worker.fetch(req('/api/me',{cookie:c.b.header()}),c.e),data=await own.json();assert.equal(data.persistence,'supabase');assert.equal(data.accountRef,'supabase:'+id);assert.doesNotMatch(JSON.stringify(data),/sb_secret_|access_token|refresh_token|session_id/);
}));
test('revoked sessions fail closed before accessing profile data',async()=>run(async c=>{
 c.f.active=false;const result=await c.worker.fetch(req('/api/me',{cookie:c.b.header()}),c.e);assert.equal(result.status,401);
 assert.equal(c.f.calls.some(call=>call.path==='/rest/v1/profiles'),false);
 const session=c.f.calls.find(call=>call.path.endsWith('/server_session_active'));assert.equal(session.apikey,secret);assert.deepEqual(session.body,{p_user:id,p_session:sid});
}));
test('Postgres counters keep email/IP hashed and stop sign-in attempts before Auth',async()=>run(async c=>{
 c.f.calls=[];c.f.tooMany=true;
 const result=await c.worker.fetch(req('/api/auth/email/signin',{method:'POST',headers:{'CF-Connecting-IP':'192.0.2.1'},body:{email:user.email,password:'A test password 2026'}}),c.e);assert.equal(result.status,429);
 assert.equal(c.f.calls.some(call=>call.path==='/auth/v1/token'),false);
 const counters=c.f.calls.filter(call=>call.path.endsWith('/server_auth_attempt'));assert.ok(counters.length);assert.doesNotMatch(JSON.stringify(counters.map(call=>call.body)),/member@|192\.0\.2\.1/);assert.equal(counters[0].apikey,secret);
}));
test('only a temporary read-only session lookup is retried, without replaying counters',async()=>run(async c=>{
 c.f.sessionFailures=1;const response=await c.worker.fetch(req('/api/me',{cookie:c.b.header()}),c.e);assert.equal(response.status,200);
 assert.equal(c.f.calls.filter(call=>call.path.endsWith('/server_session_active')).length,2);
 assert.equal(c.f.calls.filter(call=>call.path.endsWith('/server_auth_attempt')).length,2);
}));
test('profile validation and same-origin protection reject invalid or cross-site changes',async()=>run(async c=>{
 for(const age of [17,101,1.5])assert.equal((await c.worker.fetch(req('/api/me',{method:'POST',cookie:c.b.header(),body:{name:'Alice',age,city:'Paris',adultConfirmed:true,storageConsent:true}}),c.e)).status,400);
 assert.equal((await c.worker.fetch(req('/api/me',{method:'DELETE',cookie:c.b.header(),headers:{Origin:'https://evil.invalid'}}),c.e)).status,403);
 assert.equal(c.f.calls.some(call=>call.path.endsWith('/server_begin_account_deletion')),false);
}));
test('private media uploads use the server key and commit an owner-scoped reference through the member',async()=>run(async c=>{
 assert.equal((await registered(c)).status,200);
 const result=await c.worker.fetch(req('/api/me/photo',{method:'POST',cookie:c.b.header(),body:new Uint8Array([255,216,255,217]),headers:{'Content-Type':'image/jpeg'}}),c.e);assert.equal(result.status,200,await result.clone().text());
 const upload=c.f.calls.find(call=>call.path.startsWith('/storage/v1/object/momento-media/')&&call.method==='POST');assert.equal(upload.apikey,secret);assert.match(upload.path,new RegExp('/'+id+'/avatar-[0-9a-f-]+\\.jpg$'));
 const commit=c.f.calls.find(call=>call.path.endsWith('/commit_profile_media'));assert.equal(commit.apikey,pub);assert.equal(commit.body.p_kind,'avatar');
 const image=await c.worker.fetch(req('/api/me/photo',{cookie:c.b.header()}),c.e);assert.equal(image.status,200);assert.match(image.headers.get('cache-control'),/no-store/);
 const download=c.f.calls.findLast(call=>call.path.includes('/storage/v1/object/')&&call.method==='GET');assert.equal(download.apikey,secret);
},{codec:{boundedMediaBytes:async stream=>new Uint8Array(await new Response(stream).arrayBuffer()),cleanProfileJPEG:bytes=>bytes}}));
test('account deletion closes the profile, removes owned storage and deletes Auth before clearing cookies',async()=>run(async c=>{
 await registered(c);c.f.storage=['avatar-00000000-0000-4000-8000-000000000099.jpg'];
 const result=await c.worker.fetch(req('/api/me',{method:'DELETE',cookie:c.b.header()}),c.e);assert.equal(result.status,200,await result.clone().text());assert.equal((await result.json()).identityDeleted,true);c.b.apply(result);assert.equal(c.b.size,0);
 const paths=c.f.calls.map(call=>call.path);assert.ok(paths.indexOf('/rest/v1/rpc/server_begin_account_deletion')<paths.indexOf('/auth/v1/admin/users/'+id));
 const deletion=c.f.calls.find(call=>call.path==='/auth/v1/admin/users/'+id);assert.equal(deletion.apikey,secret);
}));
test('real-session actions stay closed and account status comes from Postgres',async()=>run(async c=>{
 await registered(c);const status=await c.worker.fetch(req('/api/service/status',{cookie:c.b.header()}),c.e);const data=await status.json();assert.equal(data.realSessions,false);assert.equal(data.readiness.enabled,false);
 assert.equal((await c.worker.fetch(req('/api/service/events',{cookie:c.b.header()}),c.e)).status,503);
}));

test('conditional extension endpoints cannot bypass an expired Auth session or closed admissions',async()=>run(async c=>{
 await registered(c);c.f.calls=[];
 const path='/api/service/extensions/propose',body={encounter:id,requestId:sid,maxCredits:1};
 let response=await c.worker.fetch(req(path,{method:'POST',cookie:c.b.header(),body}),c.e);
 assert.equal(response.status,503);assert.deepEqual(await response.json(),{error:'call_extensions_disabled'});
 c.f.active=false;response=await c.worker.fetch(req(path,{method:'POST',cookie:c.b.header(),body}),c.e);assert.equal(response.status,401);
 assert.equal(c.f.calls.some(x=>x.path.endsWith('/propose_call_extension')),false);
}));

test('personal exports include conditional call consent through the member RPC',async()=>run(async c=>{
 await registered(c);c.f.calls=[];
 const response=await c.worker.fetch(req('/api/me/export',{cookie:c.b.header()}),c.e);assert.equal(response.status,200);
 const data=await response.json();assert.deepEqual(data.data.call_extensions,[{id:'fixture-extension',outgoing:true,status:'declined',chargedCredits:0}]);
 const call=c.f.calls.find(x=>x.path.endsWith('/export_call_extensions'));assert.equal(call.apikey,pub);assert.notEqual(call.authorization,'Bearer '+secret);
 assert.match(response.headers.get('cache-control'),/no-store/);
}));

test('optional gender changes update only the authenticated active profile through the member client',async()=>run(async c=>{
 await registered(c);c.f.calls=[];
 const response=await c.worker.fetch(req('/api/me',{method:'PATCH',cookie:c.b.header(),body:{gender:'woman'}}),c.e);assert.equal(response.status,200);assert.deepEqual(await response.json(),{gender:'woman'});
 const patch=c.f.calls.find(call=>call.path==='/rest/v1/profiles'&&call.method==='PATCH');assert.deepEqual(patch.body,{gender:'woman'});assert.equal(patch.query.get('id'),'eq.'+id);assert.equal(patch.query.get('status'),'eq.active');assert.equal(patch.query.get('select'),'gender');assert.equal(patch.apikey,pub);assert.notEqual(patch.authorization,'Bearer '+secret);
 const profile=await(await c.worker.fetch(req('/api/me',{cookie:c.b.header()}),c.e)).json();assert.equal(profile.profile.gender,'woman');
}));
test('gender changes reject unknown values, extra identity fields, cross-origin writes and missing profiles',async()=>run(async c=>{
 let response=await c.worker.fetch(req('/api/me',{method:'PATCH',cookie:c.b.header(),body:{gender:'man'}}),c.e);assert.equal(response.status,403);
 await registered(c);c.f.calls=[];
 for(const body of [{gender:'invalid'},{gender:null},{gender:'man',id:'00000000-0000-4000-8000-000000000099'},{gender:'woman',role:'admin'},{gender:'man',premium:true}]){response=await c.worker.fetch(req('/api/me',{method:'PATCH',cookie:c.b.header(),body}),c.e);assert.equal(response.status,400)}
 response=await c.worker.fetch(req('/api/me',{method:'PATCH',cookie:c.b.header(),body:{gender:'man'},headers:{Origin:'https://other.example'}}),c.e);assert.equal(response.status,403);assert.equal(c.f.calls.some(call=>call.method==='PATCH'),false);
}));
test('a suspended profile or a concurrent denied profile update cannot report a successful gender change',async()=>run(async c=>{
 await registered(c);c.f.profile.status='suspended';assert.equal((await c.worker.fetch(req('/api/me',{method:'PATCH',cookie:c.b.header(),body:{gender:'man'}}),c.e)).status,403);
 c.f.profile.status='active';c.f.denyProfilePatch=true;const response=await c.worker.fetch(req('/api/me',{method:'PATCH',cookie:c.b.header(),body:{gender:'man'}}),c.e);assert.equal(response.status,403);assert.equal(c.f.profile.gender,'unspecified');
}));
