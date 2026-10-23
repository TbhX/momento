import {accountFailure} from './supabase-server.mjs';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const errors={registration_required:403,call_extensions_disabled:503,encounter_unavailable:409,peer_unavailable:409,match_required:409,authorization_required:409,credit_required:409,request_conflict:409,request_unavailable:409,invalid_request:400,rate_limit:429,export_too_large:413};
const enabled=env=>env.CALL_EXTENSIONS_ENABLED==='true'&&env.LIVE_EVENTS_ENABLED==='true'&&env.VIDEO_VALIDATED==='true'&&env.LEGAL_VALIDATED==='true';
function identifier(value){if(typeof value!=='string'||!UUID.test(value))throw accountFailure('invalid_request',400);return value;}
async function rpc(context,name,args={}){
 const {data,error}=await context.supabase.rpc(name,args);
 if(error)throw accountFailure(Object.hasOwn(errors,error.message)?error.message:'call_extensions_unavailable',errors[error.message]??503);
 return data;
}
export async function exportCallExtensions(context){return rpc(context,'export_call_extensions');}

// Uses the verified member client (and its revoked-session check) established by
// external-auth. Never use a service-role client or a browser-selected payer here.
export async function supabaseCallExtensionsAPI(request,env,{context,origin,readJSON}){
 const path=new URL(request.url).pathname;
 const state=path.match(/^\/api\/service\/encounters\/([0-9a-f-]+)\/extension$/i);
 if(state){
  if(request.method!=='GET')throw accountFailure('method_not_allowed',405);
  const value=await rpc(context,'call_extension_state',{p_encounter:identifier(state[1])});
  return Response.json({...value,enabled:value.enabled===true&&enabled(env),mediaEnabled:false});
 }
 if(!['/api/service/encounters/vote','/api/service/extensions/propose','/api/service/extensions/answer','/api/service/extensions/close'].includes(path))return null;
 if(request.method!=='POST')throw accountFailure('method_not_allowed',405);
 if(request.headers.get('Origin')!==origin||request.headers.get('X-Momento-Request')!=='1'||request.headers.get('Sec-Fetch-Site')==='cross-site')throw accountFailure('invalid_origin',403);
 const body=await readJSON(request);
 if(!body||typeof body!=='object'||Array.isArray(body))throw accountFailure('invalid_request',400);
 if(path.endsWith('/answer')&&!['accept','decline','cancel'].includes(body.action))throw accountFailure('invalid_request',400);
 // Refusing/cancelling/closing must remain possible when admissions are closed.
 if(!enabled(env)&&(!path.endsWith('/close')&&!(path.endsWith('/answer')&&body.action!=='accept')))throw accountFailure('call_extensions_disabled',503);
 let value;
 if(path.endsWith('/vote')){
  if(typeof body.interested!=='boolean')throw accountFailure('invalid_request',400);
  value=await rpc(context,'vote_encounter',{p_encounter:identifier(body.encounter),p_interested:body.interested});
 }else if(path.endsWith('/propose')){
  if(!Number.isInteger(body.maxCredits)||![0,1].includes(body.maxCredits))throw accountFailure('invalid_request',400);
  value=await rpc(context,'propose_call_extension',{p_encounter:identifier(body.encounter),p_request:identifier(body.requestId),p_max_credits:body.maxCredits});
 }else if(path.endsWith('/answer'))value=await rpc(context,'answer_call_extension',{p_request:identifier(body.requestId),p_action:body.action});
 else value=await rpc(context,'close_extended_call',{p_call:identifier(body.callId)});
 return Response.json({...value,mediaEnabled:false});
}
