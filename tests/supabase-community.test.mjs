import {test} from 'node:test';
import assert from 'node:assert/strict';
import {supabaseCommunityAPI} from '../worker/supabase-community.mjs';
const origin='https://momento.example',id='00000000-0000-4000-8000-000000000001';
function fixture(){const calls=[];let error=null;const context={supabase:{async rpc(name,args){calls.push({name,args});return{data:name==='community_snapshot'?{rooms:[],friends:[],admissionsEnabled:true}:[],error};}}};return{calls,context,setError(value){error=value;}};}
const request=(path,body,headers={})=>new Request(origin+'/api/service'+path,{method:body?'POST':'GET',headers:body?{Origin:origin,'X-Momento-Request':'1',...headers}:headers,...(body?{body:JSON.stringify(body)}:{})});
async function invoke(f,path,body,env={},headers={}){const req=request(path,body,headers);return supabaseCommunityAPI(req,env,{context:f.context,origin,readJSON:r=>r.json()});}
test('community data uses the member RPC and never advertises admissions or calls before every gate is ready',async()=>{
 const f=fixture();const response=await invoke(f,'/community');const data=await response.json();assert.equal(data.admissionsEnabled,false);assert.equal(data.callsEnabled,false);assert.deepEqual(f.calls,[{name:'community_snapshot',args:{}}]);
 const ready=await invoke(f,'/community',undefined,{LIVE_EVENTS_ENABLED:'true',VIDEO_VALIDATED:'true',LEGAL_VALIDATED:'true'});assert.equal((await ready.json()).admissionsEnabled,true);
});
test('closed admissions, invalid UUID and cross-origin actions do not call business RPCs',async()=>{
 const f=fixture();await assert.rejects(invoke(f,'/rooms/enter',{room:id,requestId:id,mode:'audio'}),e=>e.message==='admissions_disabled');
 await assert.rejects(invoke(f,'/friends/action',{target:id,action:'accept'},{},{Origin:'https://evil.invalid'}),e=>e.status===403);
 await assert.rejects(invoke(f,'/friends/action',{target:'injected',action:'request'}),e=>e.status===400);assert.equal(f.calls.length,0);
});
test('friend and invitation operations send no caller-selected user, role, credit or payment authorization',async()=>{
 const f=fixture();await invoke(f,'/friends/action',{target:id,action:'request',user:'forged',role:'admin'});await invoke(f,'/invitations/action',{target:id,action:'accept',mode:'audio',premium:true});
 assert.deepEqual(f.calls,[{name:'friend_action',args:{p_target:id,p_action:'request'}},{name:'invitation_action',args:{p_target:id,p_action:'accept',p_mode:'audio'}}]);
});
test('expected denial codes reach the UI while database diagnostics remain private',async()=>{
 const f=fixture();f.setError({message:'peer_unavailable',code:'42501'});await assert.rejects(invoke(f,'/friends/action',{target:id,action:'request'}),e=>e.message==='peer_unavailable'&&e.status===403);
 f.setError({message:'sensitive internal database detail',code:'XX000'});await assert.rejects(invoke(f,'/community'),e=>e.message==='community_unavailable'&&e.status===503);
});
