import {accountFailure} from './supabase-server.mjs';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const errors={registration_required:403,encounter_unavailable:409,participant_session_changed:409,presence_required:409,preparation_required:409,invalid_request:400,rate_limit:429,export_too_large:413};
const enabled=env=>['CALL_READINESS_ENABLED','LIVE_EVENTS_ENABLED','VIDEO_VALIDATED','LEGAL_VALIDATED'].every(k=>env[k]==='true');
async function rpc(context,name,args={}){const {data,error}=await context.supabase.rpc(name,args);if(error)throw accountFailure(Object.hasOwn(errors,error.message)?error.message:'call_readiness_unavailable',errors[error.message]??503);return data;}
export const exportCallReadiness=context=>rpc(context,'export_call_readiness');
// A database response is not a browser DTO. Keep internal identities and future
// provider credentials out of this boundary, even if a native RPC evolves.
function readinessResponse(value){
 const fail=()=>{throw accountFailure('call_readiness_unavailable',503)};
 if(!value||typeof value!=='object'||Array.isArray(value))return fail();
 const result={state:value.state,mediaEnabled:false};
 if(['disabled','closed','unavailable','ended'].includes(value.state))return result;
 const date=key=>{const raw=value[key];if(typeof raw!=='string'||raw.length>50||!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(raw)||!Number.isFinite(Date.parse(raw)))return fail();return new Date(raw).toISOString()};
 if(value.state==='scheduled')return {...result,startsAt:date('startsAt')};
 if(!['waiting','ready'].includes(value.state)||typeof value.selfReady!=='boolean'||typeof value.bothReady!=='boolean'||![null,'audio','video'].includes(value.mode)||value.leaseSeconds!==45)return fail();
 const startsAt=date('startsAt'),endsAt=date('endsAt'),serverNow=date('serverNow');
 if(endsAt<=startsAt||serverNow>=endsAt||value.bothReady&&(!value.selfReady||value.mode===null)||!value.bothReady&&value.mode!==null||value.state==='ready'&&(!value.bothReady||serverNow<startsAt))return fail();
 return {...result,selfReady:value.selfReady,bothReady:value.bothReady,mode:value.mode,startsAt,endsAt,serverNow,leaseSeconds:45};
}
const reply=value=>Response.json(readinessResponse(value),{headers:{'Cache-Control':'no-store'}});

export async function supabaseCallReadinessAPI(request,env,{context,origin,readJSON}){
 const url=new URL(request.url),match=url.pathname.match(/^\/api\/service\/encounters\/([0-9a-f-]+)\/readiness$/i);
 if(!match)return null;
 if(!UUID.test(match[1])||url.search)throw accountFailure('invalid_request',400);
 if(!['GET','POST'].includes(request.method))throw accountFailure('method_not_allowed',405);
 let action,mode=null;
 if(request.method==='POST'){
  if(request.headers.get('Origin')!==origin||request.headers.get('X-Momento-Request')!=='1'||request.headers.get('Sec-Fetch-Site')==='cross-site')throw accountFailure('invalid_origin',403);
  const body=await readJSON(request);
  if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!['action','mode'].includes(k))||!['prepare','heartbeat','leave'].includes(body.action))throw accountFailure('invalid_request',400);
  action=body.action;mode=body.mode??null;
  if(action==='prepare'&&!['audio','video'].includes(mode)||action!=='prepare'&&Object.hasOwn(body,'mode'))throw accountFailure('invalid_request',400);
 }
 // Withdrawal stays possible after service closure. A prepared state is never a
 // media grant, including with every worker and database setting enabled.
 if(!enabled(env)&&action!=='leave')return reply({state:'disabled'});
 const value=action?await rpc(context,'call_readiness_action',{p_encounter:match[1],p_action:action,p_mode:mode}):await rpc(context,'call_readiness_state',{p_encounter:match[1]});
 return reply(value);
}
