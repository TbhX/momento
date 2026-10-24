import {test} from 'node:test';
import assert from 'node:assert/strict';
import {hostedRoomsAPI,publicHostedRoom} from '../worker/supabase-hosted.mjs';
import {communityPageArguments} from '../worker/supabase-community.mjs';
const origin='https://momento.example',id='00000000-0000-4000-8000-000000000001';
const ready={HOSTED_ROOMS_ENABLED:'true',LIVE_EVENTS_ENABLED:'true',VIDEO_VALIDATED:'true',LEGAL_VALIDATED:'true'};
function fixture(){const calls=[];let error=null;return{calls,context:{supabase:{async rpc(name,args){calls.push({name,args});return{data:{publishingEnabled:true},error}}}},fail(e){error=e}}}
function invoke(f,path,body,env=ready,headers={}){const r=new Request(origin+'/api/service'+path,{method:body===undefined?'GET':'POST',headers:body===undefined?headers:{Origin:origin,'X-Momento-Request':'1',...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});return hostedRoomsAPI(r,env,{context:f.context,origin,readJSON:r=>r.json()})}
test('host publication needs every service gate and ignores forged roles, balances and owners',async()=>{
 for(const key of Object.keys(ready)){const f=fixture();await assert.rejects(invoke(f,'/hosted/action',{room:id,action:'publish',maxCredits:4,premium:true,owner:'forged'},{...ready,[key]:'false'}),e=>e.status===503);assert.equal(f.calls.length,0)}
 const f=fixture();await invoke(f,'/hosted/action',{room:id,action:'publish',maxCredits:2,premium:true,owner:'forged',environment:'live'});assert.deepEqual(f.calls,[{name:'hosted_room_action',args:{p_room:id,p_action:'publish',p_max_credits:2}}]);
 const response=await invoke(f,'/hosted',undefined,{});assert.deepEqual(await response.json(),{publishingEnabled:false,callsEnabled:false});
});
test('drafts, reservations and cancellation remain available without enabling media or banking',async()=>{
 const f=fixture();await invoke(f,'/hosted/save',{data:{title:'Une idée'},requestId:id},{});await invoke(f,'/hosted/registration',{action:'inspect',room:id},{});await invoke(f,'/hosted/action',{room:id,action:'cancel'},{});
 assert.deepEqual(f.calls.map(x=>x.name),['save_hosted_room','register_hosted_room','hosted_room_action']);
 assert.deepEqual(f.calls[1].args,{p_room:id,p_action:'inspect',p_code:null});
});
test('hosted write validation and origin checks fail before RPC',async()=>{
 const f=fixture();for(const body of [null,[],{}, {room:'bad',action:'cancel'},{room:id,action:'publish',maxCredits:'1'}])await assert.rejects(invoke(f,'/hosted/action',body),e=>e.status===400);
 await assert.rejects(invoke(f,'/hosted/action',{room:id,action:'cancel'},ready,{Origin:'https://evil.invalid'}),e=>e.status===403);
 await assert.rejects(invoke(f,'/hosted/registration',{action:'reserve',room:id},ready,{'Sec-Fetch-Site':'cross-site'}),e=>e.status===403);assert.equal(f.calls.length,0);
 f.fail({message:'internal infrastructure detail',code:'XX000'});await assert.rejects(invoke(f,'/hosted'),e=>e.status===503&&e.message==='hosting_unavailable');
});
test('directory arguments are typed, bounded and reject cursor or page-size tampering',()=>{
 const parse=x=>communityPageArguments(new URLSearchParams(x));assert.deepEqual(parse('kind=rooms&city=Lyon&minAge=25&eligible=false'),{p_kind:'rooms',p_filters:{city:'Lyon',minAge:25,eligible:false},p_after:null,p_after_id:null});
 for(const value of ['kind=members','kind=rooms&limit=5000','kind=rooms&q=a&q=b','kind=rooms&eligible=yes','kind=rooms&minAge=17','kind=rooms&minAge=50&maxAge=30','kind=rooms&after=infinity&afterId='+id,'kind=rooms&after=2026-10-23T10:00:00Z','kind=rooms&afterId='+id,'kind=rooms&q='+'a'.repeat(61)])assert.throws(()=>parse(value),e=>e.status===400);
 const result=parse('kind=friends&after=2026-10-23T10%3A00%3A00Z&afterId='+id);assert.equal(result.p_after_id,id);
});
test('social cards escape event content and never embed a member list or an executable script',async()=>{
 const previous=globalThis.fetch;const calls=[];
 globalThis.fetch=async(input,options)=>{calls.push({path:new URL(input).pathname,key:new Headers(options.headers).get('apikey')});return Response.json({id,title:'<img src=x onerror=alert(1)>',description:'"/><script>alert(2)</script>',city:'Paris',capacity:100,minAge:18,maxAge:100,opensAt:'2026-12-01T18:00:00Z'})};
 try{
  const env={MOMENTO_APP_ORIGIN:origin,SUPABASE_URL:'https://example.supabase.co',SUPABASE_SECRET_KEY:'sb_secret_fixture_server_key_123456'};
  const response=await publicHostedRoom(new Request(origin+'/salon/'+id),env);assert.equal(response.status,200);const html=await response.text();assert.match(html,/&lt;img/);assert.doesNotMatch(html,/<script|<img src=x|owner_id|session_id/);assert.match(html,/og:title/);assert.match(html,/salon-invite/);assert.equal(response.headers.get('Cache-Control'),'no-store');assert.match(response.headers.get('Content-Security-Policy'),/default-src 'none'/);
  assert.deepEqual(calls.map(c=>c.path),['/rest/v1/rpc/server_shared_room']);assert.ok(calls[0].key.startsWith('sb_secret_'));
  assert.equal((await publicHostedRoom(new Request(origin+'/salon/invalid/extra'),env)).status,404);assert.equal(calls.length,1);
  const head=await publicHostedRoom(new Request(origin+'/salon/'+id,{method:'HEAD'}),env);assert.equal(await head.text(),'');
 }finally{globalThis.fetch=previous}
});
test('admin test publication uses a dedicated Auth-bound RPC, no credit or live gate bypass',async()=>{
 const f=fixture();await invoke(f,'/hosted/publish-test',{room:id,role:'admin',owner:'forged',credits:999,environment:'live'},{});assert.deepEqual(f.calls,[{name:'admin_publish_test_room',args:{p_room:id}}]);
 await assert.rejects(invoke(f,'/hosted/publish-test',{room:'invalid'},{}),e=>e.status===400);
 await assert.rejects(invoke(f,'/hosted/publish-test',{room:id},{},{Origin:'https://evil.invalid'}),e=>e.status===403);
 f.fail({message:'admin_required',code:'42501'});await assert.rejects(invoke(f,'/hosted/publish-test',{room:id},{}),e=>e.status===403);
});
