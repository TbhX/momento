import {test} from 'node:test';
import assert from 'node:assert/strict';
import {supabaseCallExtensionsAPI} from '../worker/supabase-call-extensions.mjs';
const origin='https://momento.example',id='00000000-0000-4000-8000-000000000001';
const ready={CALL_EXTENSIONS_ENABLED:'true',LIVE_EVENTS_ENABLED:'true',VIDEO_VALIDATED:'true',LEGAL_VALIDATED:'true'};
function fixture(){const calls=[];let error=null;return{calls,context:{supabase:{async rpc(name,args){calls.push({name,args});return{data:{enabled:true,mediaEnabled:true},error};}}},error(value){error=value;}};}
function invoke(f,path,body,env=ready,headers={}){
 const request=new Request(origin+'/api/service'+path,{method:body===undefined?'GET':'POST',headers:body===undefined?headers:{Origin:origin,'X-Momento-Request':'1',...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});
 return supabaseCallExtensionsAPI(request,env,{context:f.context,origin,readJSON:r=>r.json()});
}
test('extensions require all service gates, even for a caller claiming Premium or admin',async()=>{
 for(const key of Object.keys(ready)){
  const f=fixture();await assert.rejects(invoke(f,'/extensions/propose',{encounter:id,requestId:id,maxCredits:1,premium:true,admin:true},{...ready,[key]:'false'}),e=>e.message==='call_extensions_disabled');assert.deepEqual(f.calls,[]);
 }
});
test('only explicit consent, encounter and idempotency identifiers reach the member RPC',async()=>{
 const f=fixture();const response=await invoke(f,'/extensions/propose',{encounter:id,requestId:id,maxCredits:1,requester:'forged',recipient:'forged',premium:true,wallet:999,price:0,environment:'live'});
 assert.deepEqual(f.calls,[{name:'propose_call_extension',args:{p_encounter:id,p_request:id,p_max_credits:1}}]);
 assert.equal((await response.json()).mediaEnabled,false);
});
test('votes require booleans and never accept a caller-selected actor',async()=>{
 const f=fixture();await assert.rejects(invoke(f,'/encounters/vote',{encounter:id,interested:'true'}),e=>e.status===400);assert.deepEqual(f.calls,[]);
 await invoke(f,'/encounters/vote',{encounter:id,interested:true,user:'forged'});assert.deepEqual(f.calls,[{name:'vote_encounter',args:{p_encounter:id,p_interested:true}}]);
});
test('malformed identifiers, arrays, missing cost consent and cross-origin writes are rejected',async()=>{
 const f=fixture();
 for(const body of [[],null,{encounter:id,requestId:id},{encounter:id,requestId:id,maxCredits:'1'},{encounter:id,requestId:'forged',maxCredits:1}])await assert.rejects(invoke(f,'/extensions/propose',body),e=>e.status===400);
 await assert.rejects(invoke(f,'/extensions/propose',{encounter:id,requestId:id,maxCredits:1},ready,{Origin:'https://evil.invalid'}),e=>e.status===403);
 await assert.rejects(invoke(f,'/extensions/propose',{encounter:id,requestId:id,maxCredits:1},ready,{'Sec-Fetch-Site':'cross-site'}),e=>e.status===403);
 assert.deepEqual(f.calls,[]);
});
test('decline, cancel and close stay available while new requests and acceptance are closed',async()=>{
 const f=fixture();for(const action of ['decline','cancel'])await invoke(f,'/extensions/answer',{requestId:id,action},{});
 await invoke(f,'/extensions/close',{callId:id},{});
 await assert.rejects(invoke(f,'/extensions/answer',{requestId:id,action:'accept'},{}),e=>e.status===503);
 await assert.rejects(invoke(f,'/extensions/answer',{requestId:id,action:'forged'},{}),e=>e.status===400);
 assert.deepEqual(f.calls.map(x=>x.name),['answer_call_extension','answer_call_extension','close_extended_call']);
});
test('read-only state cannot advertise enabled media and combines database and server gates',async()=>{
 const f=fixture();let response=await invoke(f,'/encounters/'+id+'/extension',undefined,{});assert.equal((await response.json()).enabled,false);
 response=await invoke(f,'/encounters/'+id+'/extension');assert.deepEqual(await response.json(),{enabled:true,mediaEnabled:false});
 assert.deepEqual(f.calls[0],{name:'call_extension_state',args:{p_encounter:id}});
});
test('known failures are actionable while database details stay private',async()=>{
 const f=fixture();f.error({message:'credit_required'});await assert.rejects(invoke(f,'/extensions/propose',{encounter:id,requestId:id,maxCredits:1}),e=>e.status===409&&e.message==='credit_required');
 f.error({message:'private diagnostics'});await assert.rejects(invoke(f,'/extensions/propose',{encounter:id,requestId:id,maxCredits:1}),e=>e.status===503&&e.message==='call_extensions_unavailable');
});
