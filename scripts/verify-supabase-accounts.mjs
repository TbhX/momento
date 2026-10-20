import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {randomBytes,randomUUID} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {createServerClient,parseCookieHeader} from '@supabase/ssr';

// Explicit opt-in. Only identities created by this process are ever removed.
// No confirmation/recovery email, SMS, video or payment is sent by this test.
if(!process.argv.includes('--allow-disposable-accounts'))throw Error('Pass --allow-disposable-accounts to run this live integration test.');
const index=process.argv.indexOf('--env-file');
if(index<0||!process.argv[index+1])throw Error('A private JSON environment file is required.');
const supplied=JSON.parse(await readFile(process.argv[index+1],'utf8'));
if(supplied.SUPABASE_URL!=='https://yhtngbkjqffkhfjadjzp.supabase.co')throw Error('This verifier is scoped to the dedicated Momento project.');
const env={...supplied,SUPABASE_DATA_ENABLED:'true',AUTH_EMAIL_ENABLED:'true',AUTH_SMS_ENABLED:'false'};
const transportFetch=globalThis.fetch;
globalThis.fetch=async(input,init)=>{
 const path=new URL(typeof input==='string'?input:input.url).pathname;
 try{
  const response=await transportFetch(input,init);
  if(response.status>=400){let code;try{const value=await response.clone().json();code=value.code??value.error_code??null;}catch{}
   console.error(JSON.stringify({diagnostic:'upstream response',path,status:response.status,code}));}
  return response;
 }catch(error){console.error(JSON.stringify({diagnostic:'upstream transport',path,errorType:error.name,causeCode:error.cause?.code??null}));throw error;}
};
const origin=env.MOMENTO_APP_ORIGIN;
const worker=(await import('../pages-dist/_worker.js')).default;
const admin=createClient(env.SUPABASE_URL,env.SUPABASE_SECRET_KEY,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(input,init={})=>fetch(input,{...init,signal:AbortSignal.timeout(10000)})}});
const ids=[],checks=[];let stage='create fixtures',failed=false,cleanupOk=true;
function browser(){const jar=new Map();return{header(){return [...jar].map(([k,v])=>k+'='+v).join('; ')},apply(response){for(const value of response.headers.getSetCookie()){const s=value.split(';')[0],n=s.indexOf('=');if(/Max-Age=0(?:;|$)/.test(value))jar.delete(s.slice(0,n));else jar.set(s.slice(0,n),s.slice(n+1));}}};}
async function call(b,path,{method='GET',body,type='application/json',cookie}={}){
 const headers={Cookie:cookie??b.header(),'CF-Connecting-IP':'192.0.2.193'};
 if(method!=='GET')Object.assign(headers,{Origin:origin,'X-Momento-Request':'1','Content-Type':type});
 const request=new Request(origin+path,{method,headers,...(body===undefined?{}:{body:body instanceof Uint8Array?body:JSON.stringify(body)})});
 const response=await worker.fetch(request,env,{});b.apply(response);return response;
}
async function signIn(b,email,password){const response=await call(b,'/api/auth/email/signin',{method:'POST',body:{email,password}});assert.equal(response.status,200);}
async function memberClient(b){
 const cookie=createServerClient(env.SUPABASE_URL,env.SUPABASE_PUBLISHABLE_KEY,{cookieOptions:{name:'__Host-momento-auth',path:'/',secure:true,httpOnly:true,sameSite:'lax'},cookies:{getAll:()=>parseCookieHeader(b.header()),setAll(){}}});
 const {data,error}=await cookie.auth.getSession();assert.equal(error,null);assert.ok(data.session?.access_token);
 return createClient(env.SUPABASE_URL,env.SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:'Bearer '+data.session.access_token},fetch:(input,init={})=>fetch(input,{...init,signal:AbortSignal.timeout(10000)})}});
}
async function provision(){
 const email='qa-'+randomUUID()+'@momento.invalid',password=randomBytes(30).toString('base64url');
 const {data,error}=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{role:'admin'}});assert.equal(error,null);ids.push(data.user.id);await writeFile(process.argv[index+1]+'.fixtures',JSON.stringify(ids),{mode:0o600});return{id:data.user.id,email,password,browser:browser()};
}
async function cleanup(id){
 for(;;){const listed=await admin.storage.from('momento-media').list(id,{limit:100});if(listed.error)throw Error('Storage cleanup failed');if(!listed.data.length)break;const result=await admin.storage.from('momento-media').remove(listed.data.map(file=>id+'/'+file.name));if(result.error)throw Error('Storage cleanup failed');}
 const {error}=await admin.auth.admin.deleteUser(id,false);if(error&&error.status!==404&&error.code!=='user_not_found')throw Error('Auth cleanup failed');
}
try{
 const a=await provision(),b=await provision();
 stage='sign in to real Auth';await signIn(a.browser,a.email,a.password);await signIn(b.browser,b.email,b.password);checks.push('two confirmed disposable Auth identities, no email sent');
 stage='persist profiles';
 for(const [member,name] of [[a,'QA Alice'],[b,'QA Bob']]){
  const first=await call(member.browser,'/api/me');assert.equal(first.status,200,'initial profile read: '+first.status);assert.equal((await first.json()).profile,null);
  const saved=await call(member.browser,'/api/me',{method:'POST',body:{name,age:28,city:'Paris',adultConfirmed:true,storageConsent:true,role:'admin',premium:true}});assert.equal(saved.status,200,'profile save: '+saved.status);assert.equal((await saved.json()).profile.name,name);
 }
 const ac=await memberClient(a.browser),bc=await memberClient(b.browser);
 const visible=await bc.from('profiles').select('id');assert.equal(visible.error,null);assert.deepEqual(visible.data.map(row=>row.id),[b.id]);
 const status=await (await call(a.browser,'/api/service/status')).json();assert.equal(status.admin,false);assert.equal(status.premium,false);assert.equal(status.realSessions,false);checks.push('profile persistence, account isolation and no metadata-based privileges');
 stage='private JPEG storage';const jpeg=new Uint8Array(await readFile(new URL('../tests/fixtures/avatar.jpg',import.meta.url)));
 const photo=await call(a.browser,'/api/me/photo',{method:'POST',type:'image/jpeg',body:jpeg});assert.equal(photo.status,200);
 const own=await call(a.browser,'/api/me/photo');assert.equal(own.status,200);assert.equal(own.headers.get('content-type'),'image/jpeg');assert.ok((await own.arrayBuffer()).byteLength>0);
 const records=await ac.from('profile_media').select('object_path');assert.equal(records.error,null);assert.equal(records.data.length,1);const path=records.data[0].object_path;
 const directOwner=await ac.storage.from('momento-media').download(path);assert.ok(directOwner.error);
 const foreign=await bc.storage.from('momento-media').download(path);assert.ok(foreign.error);
 const directUpload=await bc.storage.from('momento-media').upload(b.id+'/avatar-forged.jpg',jpeg,{contentType:'image/jpeg'});assert.ok(directUpload.error);checks.push('JPEG round-trip, private media and direct-upload denial');
 stage='private background';const background=await call(a.browser,'/api/me/background',{method:'POST',type:'image/jpeg',body:jpeg});assert.equal(background.status,200);assert.equal((await background.json()).videoBackground,'custom');
 const natural=await call(a.browser,'/api/me/media',{method:'POST',body:{videoBackground:'none'}});assert.equal(natural.status,200);assert.equal((await natural.json()).videoBackground,'none');checks.push('private background and persisted video preference');
 stage='own data export';const exportResponse=await call(b.browser,'/api/me/export');assert.equal(exportResponse.status,200);const exported=await exportResponse.json();assert.deepEqual(exported.data.profiles.map(row=>row.id),[b.id]);checks.push('RLS-based export of owned data');
 stage='revoke copied JWT';const oldCookie=a.browser.header();assert.equal((await call(a.browser,'/api/auth/logout',{method:'POST',body:{}})).status,200);
 assert.equal((await call(a.browser,'/api/me',{cookie:oldCookie})).status,401);
 const staleRead=await ac.from('profiles').select('id');assert.equal(staleRead.error,null);assert.deepEqual(staleRead.data,[]);
 const staleWrite=await ac.rpc('save_profile',{p_name:'Forged',p_age:28,p_city:'Paris',p_adult:true,p_storage:true});assert.ok(staleWrite.error);
 const stalePhoto=await ac.storage.from('momento-media').download(path);assert.ok(stalePhoto.error);checks.push('revoked JWT denied by Worker, Data API, RPC and Storage');
 stage='delete account and Auth identity';
 await signIn(a.browser,a.email,a.password);
 for(const member of [a,b]){const response=await call(member.browser,'/api/me',{method:'DELETE'});assert.equal(response.status,200);assert.equal((await response.json()).identityDeleted,true);}
 const remaining=await admin.from('profiles').select('id').in('id',ids);assert.equal(remaining.error,null);assert.deepEqual(remaining.data,[]);checks.push('full profile, private media and Auth identity deletion');
}catch(error){failed=true;console.error(JSON.stringify({ok:false,stage,errorType:error.name,errorCode:error.code??null,assertion:error.name==='AssertionError'?error.message.split('\n')[0]:undefined}));}
finally{
 for(const id of ids)try{await cleanup(id);}catch{failed=true;cleanupOk=false;console.error(JSON.stringify({ok:false,stage:'disposable fixture cleanup'}));}
 globalThis.fetch=transportFetch;
}
console.log(JSON.stringify({ok:!failed,transport:'local compiled Worker to real Supabase Auth/Postgres/Storage',checks,disposableAccounts:ids.length,emailsSent:0,smsSent:0,fixturesCleanup:cleanupOk},null,2));
if(failed)process.exitCode=1;
