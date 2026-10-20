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
const admin=createClient(env.SUPABASE_URL,env.SUPABASE_SECRET_KEY,{db:{retry:false},auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(input,init={})=>fetch(input,{...init,signal:AbortSignal.timeout(10000)})}});
const ids=[],checks=[],roomIds=[],reportIds=[];let stage='create fixtures',failed=false,cleanupOk=true;
const basicSignup=process.argv.includes('--basic-signup');
if(basicSignup&&env.AUTH_EMAIL_MODE!=='basic')throw Error('Basic signup requires AUTH_EMAIL_MODE=basic.');
function browser(){const jar=new Map();return{header(){return [...jar].map(([k,v])=>k+'='+v).join('; ')},apply(response){for(const value of response.headers.getSetCookie()){const s=value.split(';')[0],n=s.indexOf('=');if(/Max-Age=0(?:;|$)/.test(value))jar.delete(s.slice(0,n));else jar.set(s.slice(0,n),s.slice(n+1));}}};}
async function call(b,path,{method='GET',body,type='application/json',cookie}={}){
 console.log(JSON.stringify({qaRequest:method+' '+path}));
 const headers={Cookie:cookie??b.header(),'CF-Connecting-IP':'192.0.2.193'};
 if(method!=='GET')Object.assign(headers,{Origin:origin,'X-Momento-Request':'1','Content-Type':type});
 const request=new Request(origin+path,{method,headers,...(body===undefined?{}:{body:body instanceof Uint8Array?body:JSON.stringify(body)})});
 const response=await worker.fetch(request,env,{});b.apply(response);return response;
}
async function signIn(b,email,password){const response=await call(b,'/api/auth/email/signin',{method:'POST',body:{email,password}});assert.equal(response.status,200);}
async function memberClient(b){
 const cookie=createServerClient(env.SUPABASE_URL,env.SUPABASE_PUBLISHABLE_KEY,{cookieOptions:{name:'__Host-momento-auth',path:'/',secure:true,httpOnly:true,sameSite:'lax'},cookies:{getAll:()=>parseCookieHeader(b.header()),setAll(){}}});
 const {data,error}=await cookie.auth.getSession();assert.equal(error,null);assert.ok(data.session?.access_token);
 return createClient(env.SUPABASE_URL,env.SUPABASE_PUBLISHABLE_KEY,{db:{retry:false},auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:'Bearer '+data.session.access_token},fetch:(input,init={})=>fetch(input,{...init,signal:AbortSignal.timeout(10000)})}});
}
async function provision(){
 const email='qa-'+randomUUID()+'@momento.invalid',password=randomBytes(30).toString('base64url');
 if(basicSignup){
  const b=browser(),response=await call(b,'/api/auth/email/signup',{method:'POST',body:{email,password,acceptedTerms:true,adultConfirmed:true}});
  assert.equal(response.status,200,'basic signup: '+response.status);const value=await response.json();assert.equal(value.authenticated,true);assert.equal(value.emailVerified,false);
  const member=await memberClient(b),user=await member.auth.getUser();assert.equal(user.error,null);assert.ok(user.data.user?.id);ids.push(user.data.user.id);
  await writeFile(process.argv[index+1]+'.fixtures',JSON.stringify(ids),{mode:0o600});return{id:user.data.user.id,email,password,browser:b};
 }
 const {data,error}=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{role:'admin'}});assert.equal(error,null);ids.push(data.user.id);await writeFile(process.argv[index+1]+'.fixtures',JSON.stringify(ids),{mode:0o600});return{id:data.user.id,email,password,browser:browser()};
}
async function cleanup(id){
 for(;;){const listed=await admin.storage.from('momento-media').list(id,{limit:100});if(listed.error)throw Error('Storage cleanup failed');if(!listed.data.length)break;const result=await admin.storage.from('momento-media').remove(listed.data.map(file=>id+'/'+file.name));if(result.error)throw Error('Storage cleanup failed');}
 const {error}=await admin.auth.admin.deleteUser(id,false);if(error&&error.status!==404&&error.code!=='user_not_found')throw Error('Auth cleanup failed');
}
try{
 const a=await provision(),b=await provision();
 stage='sign in to real Auth';if(!basicSignup){await signIn(a.browser,a.email,a.password);await signIn(b.browser,b.email,b.password);}checks.push(basicSignup?'two immediate password signups through the Worker, no verification email':'two confirmed disposable Auth identities, no email sent');
 stage='persist profiles';
 for(const [member,name] of [[a,'QA Alice'],[b,'QA Bob']]){
  const first=await call(member.browser,'/api/me');assert.equal(first.status,200,'initial profile read: '+first.status);assert.equal((await first.json()).profile,null);
  const saved=await call(member.browser,'/api/me',{method:'POST',body:{name,age:28,city:'Paris',adultConfirmed:true,storageConsent:true,role:'admin',premium:true}});assert.equal(saved.status,200,'profile save: '+saved.status);assert.equal((await saved.json()).profile.name,name);
 }
 const ac=await memberClient(a.browser),bc=await memberClient(b.browser);
 const visible=await bc.from('profiles').select('id');assert.equal(visible.error,null);assert.deepEqual(visible.data.map(row=>row.id),[b.id]);
 const status=await (await call(a.browser,'/api/service/status')).json();assert.equal(status.admin,false);assert.equal(status.premium,false);assert.equal(status.realSessions,false);checks.push('profile persistence, account isolation and no metadata-based privileges');
 if(process.argv.includes('--community')){
  stage='persistent community';const room=randomUUID();roomIds.push(room);
  assert.equal((await admin.from('rooms').insert({id:room,title:'Private disposable QA',status:'draft',opens_at:new Date(Date.now()-600000).toISOString(),closes_at:new Date(Date.now()+600000).toISOString()})).error,null);
  const [user_a,user_b]=[a.id,b.id].sort();assert.equal((await admin.from('encounters').insert({room_id:room,user_a,user_b,round_number:0,status:'ended',starts_at:new Date(Date.now()-600000).toISOString(),ends_at:new Date(Date.now()-300000).toISOString()})).error,null);
  const before=await (await call(a.browser,'/api/service/community')).json();assert.equal(before.admissionsEnabled,false);assert.equal(before.rooms.some(r=>r.id===room),false);assert.deepEqual(before.friends,[]);
  const action=async(member,kind,body)=>{const r=await call(member.browser,'/api/service/'+kind+'/action',{method:'POST',body});assert.equal(r.status,200,kind+' action: '+r.status);return r.json();};
  await action(a,'friends',{target:b.id,action:'request'});
  assert.equal((await (await call(b.browser,'/api/service/community')).json()).requests[0].peer_id,a.id);
  await action(b,'friends',{target:a.id,action:'accept'});
  assert.equal((await (await call(a.browser,'/api/service/community')).json()).friends[0].id,b.id);
  await action(a,'invitations',{target:b.id,action:'request',mode:'audio'});
  const accepted=await action(b,'invitations',{target:a.id,action:'accept',mode:'audio'});assert.equal(accepted.callEnabled,false);assert.equal(accepted.charged,false);
  const invitations=(await (await call(a.browser,'/api/service/community')).json()).invitations;assert.equal(invitations[0].status,'accepted');
  const blocked=await call(b.browser,'/api/service/community/block',{method:'POST',body:{target:a.id,reason:'Synthetic private QA report'}});assert.equal(blocked.status,200);const reports=await admin.from('reports').select('id').eq('reporter_id',b.id).eq('target_id',a.id);assert.equal(reports.error,null);reportIds.push(...reports.data.map(r=>r.id));
  const after=await (await call(a.browser,'/api/service/community')).json();assert.deepEqual(after.friends,[]);assert.deepEqual(after.invitations,[]);
  const closed=await call(a.browser,'/api/service/rooms/enter',{method:'POST',body:{room,mode:'audio',requestId:randomUUID()}});assert.equal(closed.status,503);
  assert.equal((await ac.from('room_entries').select('id')).data.length,0);
  checks.push('shared friend consent, persistent audio invitation, blocking/report and closed admissions without quota consumption');
 }
 if(!process.argv.includes('--community-only')){
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
 }
 stage='delete account and Auth identity';
 if(!process.argv.includes('--community-only'))await signIn(a.browser,a.email,a.password);
 for(const member of [a,b]){const response=await call(member.browser,'/api/me',{method:'DELETE'});assert.equal(response.status,200);assert.equal((await response.json()).identityDeleted,true);}
 const remaining=await admin.from('profiles').select('id').in('id',ids);assert.equal(remaining.error,null);assert.deepEqual(remaining.data,[]);checks.push('full profile, private media and Auth identity deletion');
}catch(error){failed=true;console.error(JSON.stringify({ok:false,stage,errorType:error.name,errorCode:error.code??null,assertion:error.name==='AssertionError'?error.message.split('\n')[0]:undefined}));}
finally{
 try{if(reportIds.length){const removed=await admin.from('reports').delete().in('id',reportIds);if(removed.error)throw Error();}if(ids.length){const removed=await admin.from('reports').delete().in('reporter_id',ids);if(removed.error)throw Error();}}catch{failed=true;cleanupOk=false;console.error(JSON.stringify({ok:false,stage:'disposable report cleanup'}));}
 for(const room of roomIds)try{const encounters=await admin.from('encounters').delete().eq('room_id',room);if(encounters.error)throw Error();const removed=await admin.from('rooms').delete().eq('id',room);if(removed.error)throw Error();}catch{failed=true;cleanupOk=false;console.error(JSON.stringify({ok:false,stage:'disposable room cleanup'}));}
 for(const id of ids)try{await cleanup(id);}catch{failed=true;cleanupOk=false;console.error(JSON.stringify({ok:false,stage:'disposable fixture cleanup'}));}
 globalThis.fetch=transportFetch;
}
console.log(JSON.stringify({ok:!failed,transport:'local compiled Worker to real Supabase Auth/Postgres/Storage',checks,disposableAccounts:ids.length,emailsSent:0,smsSent:0,fixturesCleanup:cleanupOk},null,2));
if(failed)process.exitCode=1;
