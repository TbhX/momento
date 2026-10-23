import {accountFailure} from './supabase-server.mjs';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const knownErrors={registration_required:403,peer_unavailable:403,request_unavailable:409,request_cooldown:429,invitation_limit:409,rate_limit:429,invalid_request:400,admissions_disabled:503,room_unavailable:409,media_mode_unavailable:409,age_not_eligible:403,already_in_room:409,already_in_private_call:409,room_full:409,daily_limit_reached:403,request_conflict:409};
async function rpc(client,name,args={}){
 const {data,error}=await client.rpc(name,args);
 if(error)throw accountFailure(Object.hasOwn(knownErrors,error.message)?error.message:'community_unavailable',knownErrors[error.message]??503);
 return data;
}
function mutation(request,origin){
 if(request.method!=='POST')throw accountFailure('method_not_allowed',405);
 if(request.headers.get('Origin')!==origin||request.headers.get('X-Momento-Request')!=='1'||request.headers.get('Sec-Fetch-Site')==='cross-site')throw accountFailure('invalid_origin',403);
}
function identifier(value){if(typeof value!=='string'||!UUID.test(value))throw accountFailure('invalid_request',400);return value;}
export async function supabaseCommunityAPI(request,env,{context,origin,readJSON}){
 const path=new URL(request.url).pathname.slice('/api/service'.length);
 if(path==='/community'){
  if(request.method!=='GET')throw accountFailure('method_not_allowed',405);
  const value=await rpc(context.supabase,'community_snapshot');
  return Response.json({...value,admissionsEnabled:value.admissionsEnabled===true&&env.LIVE_EVENTS_ENABLED==='true'&&env.VIDEO_VALIDATED==='true'&&env.LEGAL_VALIDATED==='true',callsEnabled:false});
 }
 const preview=path.match(/^\/rooms\/([0-9a-f-]+)\/preview$/i);
 if(preview){
  if(request.method!=='GET')throw accountFailure('method_not_allowed',405);
  return Response.json({people:await rpc(context.supabase,'room_preview',{p_room:identifier(preview[1])})});
 }
 if(!['/friends/action','/invitations/action','/community/block','/rooms/enter','/rooms/leave','/rooms/heartbeat'].includes(path))return null;
 mutation(request,origin);const body=await readJSON(request);let value;
 if(path==='/friends/action')value=await rpc(context.supabase,'friend_action',{p_target:identifier(body.target),p_action:body.action});
 if(path==='/invitations/action')value=await rpc(context.supabase,'invitation_action',{p_target:identifier(body.target),p_action:body.action,p_mode:body.mode??'video'});
 if(path==='/community/block')value=await rpc(context.supabase,'block_peer',{p_target:identifier(body.target),p_reason:body.reason??null});
 if(path==='/rooms/enter'){
  if(env.LIVE_EVENTS_ENABLED!=='true'||env.VIDEO_VALIDATED!=='true'||env.LEGAL_VALIDATED!=='true')throw accountFailure('admissions_disabled',503);
  value=await rpc(context.supabase,'enter_room',{p_room:identifier(body.room),p_mode:body.mode,p_request:identifier(body.requestId)});
 }
 if(path==='/rooms/leave'){await rpc(context.supabase,'leave_room');value={left:true};}
 if(path==='/rooms/heartbeat')value={active:await rpc(context.supabase,'heartbeat_room',{p_entry:identifier(body.entry)})};
 return Response.json(value);
}
