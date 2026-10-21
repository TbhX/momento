import {accountFailure} from './supabase-server.mjs';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const states=['all','open','reviewing','resolved','dismissed'];
const actions=['reviewing','resolved','dismissed','suspend','restore'];
const expectedErrors={admin_required:403,protected_account:403,report_changed:409,invalid_request:400,rate_limit:429};
async function rpc(client,name,args){
 const {data,error}=await client.rpc(name,args);
 if(error)throw accountFailure(Object.hasOwn(expectedErrors,error.message)?error.message:'administration_unavailable',expectedErrors[error.message]??503);
 return data;
}
export async function supabaseAdminAPI(request,env,{context,origin,readJSON}){
 const url=new URL(request.url),path=url.pathname;
 if(path==='/api/service/admin'){
  if(request.method!=='GET')throw accountFailure('method_not_allowed',405);
  const status=url.searchParams.get('status')??'open',before=url.searchParams.get('before'),id=url.searchParams.get('beforeId');
  if(!states.includes(status)||((before===null)!==(id===null))||(before!==null&&(!/^\d{4}-\d{2}-\d{2}T[0-9:.+-]+Z?$/.test(before)||!Number.isFinite(Date.parse(before))||!UUID.test(id))))throw accountFailure('invalid_request',400);
  const value=await rpc(context.supabase,'admin_snapshot',{p_status:status,p_before:before,p_before_id:id});
  return Response.json({...value,realSessions:false,paymentsEnabled:false,simulationOnly:true});
 }
 if(path!=='/api/service/admin/reports')return null;
 if(request.method!=='POST')throw accountFailure('method_not_allowed',405);
 if(request.headers.get('Origin')!==origin||request.headers.get('X-Momento-Request')!=='1'||request.headers.get('Sec-Fetch-Site')==='cross-site')throw accountFailure('invalid_origin',403);
 const body=await readJSON(request);
 if(typeof body.id!=='string'||!UUID.test(body.id)||!actions.includes(body.action)||!states.slice(1).includes(body.expected))throw accountFailure('invalid_request',400);
 return Response.json(await rpc(context.supabase,'admin_report_action',{p_report:body.id,p_action:body.action,p_expected:body.expected}));
}
