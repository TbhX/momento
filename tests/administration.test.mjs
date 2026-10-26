import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {withExternalAuth} from '../worker/external-auth.mjs';
import {supabaseAdminAPI} from '../worker/supabase-admin.mjs';
const origin='https://momento.example',id='00000000-0000-4000-8000-000000000001';
const token='a'.repeat(64),password='An entirely private test phrase';
const env={SUPABASE_URL:'https://abcdefghijklmnopqrst.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fixture_only_123456',SUPABASE_SECRET_KEY:'sb_secret_fixture_only_123456',SUPABASE_DATA_ENABLED:'true',MOMENTO_APP_ORIGIN:origin,AUTH_COOKIE_SECRET:'test-only-secret-at-least-32-characters',AUTH_EMAIL_MODE:'basic'};
const req=(path,body,headers={})=>new Request(origin+path,{method:body===undefined?'GET':'POST',headers:body===undefined?headers:{Origin:origin,'X-Momento-Request':'1','Content-Type':'application/json',...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});
test('unlimited test access is checked against the current private admin role and grants no live rights',async()=>{
 let admin=true;const calls=[],context={supabase:{async rpc(name,args){calls.push({name,args});return{data:admin,error:null}}}};
 const invoke=request=>supabaseAdminAPI(request,{}, {context,origin,readJSON:r=>r.json()});
 const response=await invoke(req('/api/service/admin/test-access?premium=true&credits=999'));
 assert.deepEqual(await response.json(),{simulationOnly:true,unlimitedCredits:true,realSessions:false,paymentsEnabled:false});assert.deepEqual(calls,[{name:'admin_test_access',args:{}}]);
 admin=false;await assert.rejects(invoke(req('/api/service/admin/test-access')),e=>e.message==='admin_required'&&e.status===403);
 await assert.rejects(invoke(req('/api/service/admin/test-access',{admin:true})),e=>e.status===405);
});
async function setupFixture(fn){
 const calls=[],state={claimed:false,consumed:false,weak:false,finish:true},original=globalThis.fetch;
 globalThis.fetch=async(input,init={})=>{
  const url=new URL(typeof input==='string'?input:input.url),body=JSON.parse(init.body||'null');calls.push({path:url.pathname,body,authorization:new Headers(init.headers).get('authorization')});
  if(url.pathname.endsWith('/server_auth_attempt'))return Response.json(1);
  if(url.pathname.endsWith('/server_admin_setup_begin')){assert.equal(body.p_hash,createHash('sha256').update(token).digest('hex'));if(state.consumed||state.claimed)return Response.json(null);state.claimed=true;return Response.json(id);}
  if(url.pathname.endsWith('/server_admin_setup_finish')){if(body.p_release){state.claimed=false;return Response.json(true);}state.consumed=state.finish;return Response.json(state.finish);}
  if(url.pathname==='/auth/v1/admin/users/'+id){if(state.weak)return Response.json({message:'Weak password',code:'weak_password'},{status:422});assert.deepEqual(body,{password});return Response.json({id,email:'fixture@momento.invalid'});}
  throw Error('Unexpected path '+url.pathname);
 };
 try{await fn({calls,state,worker:withExternalAuth({fetch(){throw Error('Unexpected legacy adapter');}})});}finally{globalThis.fetch=original;}
}
test('admin activation uses a private one-use code, native Auth and a role-bound server lease',async()=>setupFixture(async({worker,calls,state})=>{
 const response=await worker.fetch(req('/api/auth/admin-setup',{token,password,userId:'forged',role:'admin'}),env);
 assert.equal(response.status,200);assert.deepEqual(await response.json(),{activated:true,next:'signin'});assert.match(response.headers.get('cache-control'),/no-store/);assert.equal(state.consumed,true);
 assert.equal((await worker.fetch(req('/api/auth/admin-setup',{token,password}),env)).status,401);
 assert.equal(calls.filter(c=>c.path.startsWith('/auth/v1/admin/')).length,1);
 assert.ok(calls.filter(c=>c.path.startsWith('/auth/v1/admin/')).every(c=>c.authorization==='Bearer '+env.SUPABASE_SECRET_KEY));
 assert.ok(calls.filter(c=>c.path.endsWith('server_admin_setup_begin')).every(c=>!JSON.stringify(c.body).includes(token)));
}));
test('weak passwords, malformed codes and cross-origin activation stop before privileged Auth calls',async()=>setupFixture(async({worker,calls})=>{
 assert.equal((await worker.fetch(req('/api/auth/admin-setup',{token,password:'adminadmin'}),env)).status,400);
 assert.equal((await worker.fetch(req('/api/auth/admin-setup',{token,password},{Origin:'https://evil.invalid'}),env)).status,403);
 assert.equal((await worker.fetch(req('/api/auth/admin-setup',{token:'short',password}),env)).status,401);
 assert.ok(!calls.some(c=>c.path.startsWith('/auth/v1/admin/')));
}));
test('native password rejection releases a setup lease and failed completion never reports activation',async()=>setupFixture(async({worker,state})=>{
 state.weak=true;assert.equal((await worker.fetch(req('/api/auth/admin-setup',{token,password}),env)).status,400);assert.equal(state.claimed,false);
 state.weak=false;state.finish=false;assert.equal((await worker.fetch(req('/api/auth/admin-setup',{token,password}),env)).status,503);assert.equal(state.consumed,false);
}));
test('admin moderation keeps authorization in member RPCs and passes no forged actor or entitlement',async()=>{
 const calls=[],context={supabase:{async rpc(name,args){calls.push({name,args});return{data:name==='admin_snapshot'?{reports:[],counts:{}}:{updated:true},error:null};}}};
 let r=await supabaseAdminAPI(req('/api/service/admin?status=open'),{}, {context,origin,readJSON:r=>r.json()});assert.equal((await r.json()).simulationOnly,true);
 r=await supabaseAdminAPI(req('/api/service/admin/reports',{id,action:'suspend',expected:'open',actor:'forged',premium:true}),{}, {context,origin,readJSON:r=>r.json()});assert.equal(r.status,200);
 assert.deepEqual(calls,[{name:'admin_snapshot',args:{p_status:'open',p_before:null,p_before_id:null}},{name:'admin_report_action',args:{p_report:id,p_action:'suspend',p_expected:'open'}}]);
 await assert.rejects(supabaseAdminAPI(req('/api/service/admin?beforeId='+id),{}, {context,origin}),e=>e.status===400);
 await assert.rejects(supabaseAdminAPI(req('/api/service/admin/reports',{id,action:'suspend',expected:'open'},{Origin:'https://evil.invalid'}),{}, {context,origin,readJSON:r=>r.json()}),e=>e.status===403);
});
test('moderation denials remain explicit while database diagnostics are private',async()=>{
 const context={supabase:{async rpc(){return{error:{message:'admin_required'}};}}};
 await assert.rejects(supabaseAdminAPI(req('/api/service/admin'),{}, {context,origin}),e=>e.status===403&&e.message==='admin_required');
 context.supabase.rpc=async()=>({error:{message:'private internal diagnostic'}});
 await assert.rejects(supabaseAdminAPI(req('/api/service/admin'),{}, {context,origin}),e=>e.status===503&&e.message==='administration_unavailable');
});
