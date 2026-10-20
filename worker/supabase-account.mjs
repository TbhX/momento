import {accountFailure,serverClient,serverRPC} from './supabase-server.mjs';

const BUCKET='momento-media';
const BACKGROUNDS=['none','blur','rose','night','studio','custom'];
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ownPath=(id,path)=>typeof path==='string'&&new RegExp('^'+id+'/(avatar|video_background)-[0-9a-f-]{36}\\.jpg$').test(path);
const reply=(data,status=200)=>Response.json(data,{status});

function mutation(request,origin,methods){
 if(!methods.includes(request.method))throw accountFailure('method_not_allowed',405);
 if(request.headers.get('Origin')!==origin||request.headers.get('X-Momento-Request')!=='1'||request.headers.get('Sec-Fetch-Site')==='cross-site')throw accountFailure('invalid_origin',403);
}
async function userRPC(client,name,args={}){
 const {data,error}=await client.rpc(name,args);
 if(error){
  if(error.code==='22023'||error.code==='23514')throw accountFailure('invalid_registration',400);
  if(error.code==='42501')throw accountFailure('account_unavailable',403);
  throw accountFailure('account_service_unavailable');
 }
 return data;
}
async function readAccount(client,id,{allowDeleted=false}={}){
 const results=await Promise.all([
  client.from('profiles').select('id,display_name,age,city,profession,bio,gender,status,created_at').eq('id',id).maybeSingle(),
  client.from('profile_media').select('kind,object_path,updated_at').eq('user_id',id),
  client.from('preferences').select('video_background').eq('user_id',id).maybeSingle()
 ]);
 if(results.some(r=>r.error))throw accountFailure('account_service_unavailable');
 const row=results[0].data,media=results[1].data??[],background=results[2].data?.video_background??'none';
 if(row&&row.status!=='active'&&!allowDeleted)throw accountFailure(row.status==='deleted'?'account_deletion_pending':'account_suspended',403);
 const avatar=media.find(m=>m.kind==='avatar'),decor=media.find(m=>m.kind==='video_background');
 const settings={photoVersion:avatar?.updated_at??null,backgroundVersion:decor?.updated_at??null,videoBackground:background};
 return{row,media,settings,profile:row?{name:row.display_name,age:row.age,city:row.city,profession:row.profession,bio:row.bio,gender:row.gender,...settings}:null};
}

async function downloadImage(client,path){
 const {data,error}=await client.storage.from(BUCKET).download(path);
 if(error||!data)throw accountFailure('not_found',404);
 if(data.size>1048576)throw accountFailure('invalid_image',503);
 return new Response(data.stream(),{headers:{'Content-Type':'image/jpeg','Content-Disposition':'inline','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
}
async function removeImage(client,id,path){
 if(!ownPath(id,path))throw accountFailure('invalid_media_path');
 const {error}=await client.storage.from(BUCKET).remove([path]);
 if(error)throw accountFailure('media_cleanup_pending');
}

async function profileMedia(request,env,context,userId,path,origin,readJSON,codec){
 const account=await readAccount(context.supabase,userId);
 if(!account.profile)throw accountFailure('registration_required',403);
 const kind=path.split('/').at(-1),isAvatar=kind==='photo',mediaKind=isAvatar?'avatar':'video_background';
 if(!['photo','background','media'].includes(kind))throw accountFailure('not_found',404);
 if(request.method==='GET'){
  if(kind==='media')return reply(account.settings);
  const record=account.media.find(m=>m.kind===mediaKind);
  if(!record||!ownPath(userId,record.object_path))throw accountFailure('not_found',404);
  return downloadImage(serverClient(env),record.object_path);
 }
 mutation(request,origin,kind==='media'?['POST']:['POST','DELETE']);
 if(kind==='media'){
  const {videoBackground}=await readJSON(request);
  if(!BACKGROUNDS.includes(videoBackground)||(videoBackground==='custom'&&!account.settings.backgroundVersion))throw accountFailure('invalid_background',400);
  const {error}=await context.supabase.from('preferences').update({video_background:videoBackground,updated_at:new Date().toISOString()}).eq('user_id',userId);
  if(error)throw accountFailure('account_service_unavailable');
 }else{
  const admin=serverClient(env);let nextPath=null;
  if(request.method==='POST'){
   if(request.headers.get('Content-Type')!=='image/jpeg')throw accountFailure('image_type',415);
   const limit=isAvatar?524288:1048576;
   if(Number(request.headers.get('Content-Length')||0)>limit)throw accountFailure('image_too_large',413);
   if(!codec?.boundedMediaBytes||!codec?.cleanProfileJPEG)throw accountFailure('media_not_configured');
   let bytes;
   try{bytes=codec.cleanProfileJPEG(await codec.boundedMediaBytes(request.body,limit),isAvatar?1024:1920,isAvatar?1024:1080);}
   catch(error){throw accountFailure(error.status?error.message:'invalid_image',error.status||400);}
   nextPath=userId+'/'+mediaKind+'-'+crypto.randomUUID()+'.jpg';
   const {error}=await admin.storage.from(BUCKET).upload(nextPath,bytes,{contentType:'image/jpeg',cacheControl:'0',upsert:false});
   if(error)throw accountFailure('media_unavailable');
  }
  let previous;
  try{previous=await userRPC(context.supabase,'commit_profile_media',{p_kind:mediaKind,p_path:nextPath});}
  catch(error){if(nextPath)await removeImage(admin,userId,nextPath);throw error;}
  if(previous&&previous!==nextPath)await removeImage(admin,userId,previous);
 }
 return reply((await readAccount(context.supabase,userId)).settings);
}

async function exportAccount(context,userId){
 const tables=['profiles','preferences','profile_themes','room_entries','room_presence','encounters','encounter_votes','matches','friend_requests','friendships','video_requests','blocks','reports','messages','orders','entitlements','credit_ledger','profile_media','consents'];
 // Every read uses the member's RLS client. Refuse an oversized export rather
 // than silently truncate it or accumulate unbounded personal data in memory.
 const records={};
 for(const table of tables){
  const {data,error}=await context.supabase.from(table).select('*').limit(500);
  if(error)throw accountFailure('export_unavailable');
  if(data.length>=500)throw accountFailure('export_too_large',413);
  records[table]=data;
 }
 const body=JSON.stringify({exportedAt:new Date().toISOString(),accountId:userId,data:records});
 if(new TextEncoder().encode(body).length>2097152)throw accountFailure('export_too_large',413);
 return new Response(body,{headers:{'Content-Type':'application/json','Content-Disposition':'attachment; filename="mes-donnees-momento.json"'}});
}

async function deleteAccount(env,context,userId){
 const admin=serverClient(env);
 await serverRPC(env,'server_begin_account_deletion',{p_user:userId});
 // The profile is now closed: ongoing uploads cannot commit a new reference.
 // Keep Auth until storage deletion succeeds so a failed request can be retried.
 let removed=0;
 for(;;){
  const {data,error}=await admin.storage.from(BUCKET).list(userId,{limit:100,offset:0});
  if(error)throw accountFailure('account_deletion_pending');
  if(!data.length)break;
  const paths=data.map(item=>userId+'/'+item.name);
  if(paths.some(path=>!ownPath(userId,path))||removed+paths.length>1000)throw accountFailure('account_deletion_pending');
  const result=await admin.storage.from(BUCKET).remove(paths);
  if(result.error)throw accountFailure('account_deletion_pending');
  removed+=paths.length;
 }
 const {error}=await admin.auth.admin.deleteUser(userId,false);
 if(error)throw accountFailure('account_deletion_pending');
 return reply({deleted:true,identityDeleted:true});
}

export async function supabaseAccountAPI(request,env,context,userId,{readJSON,mediaCodec,origin}){
 if(!UUID.test(userId))throw accountFailure('authentication_required',401);
 const path=new URL(request.url).pathname;
 if(path==='/api/me'){
  if(request.method==='GET'){
   const account=await readAccount(context.supabase,userId,{allowDeleted:true});
   if(account.row?.status==='suspended')throw accountFailure('account_suspended',403);
   const deletionPending=account.row?.status==='deleted';
   return reply({authenticated:true,persistence:'supabase',deletionPending,accountRef:'supabase:'+userId,profile:deletionPending?null:account.profile,registeredAt:account.row?.created_at??null});
  }
  mutation(request,origin,['POST','DELETE']);
  if(request.method==='DELETE')return deleteAccount(env,context,userId);
  const data=await readJSON(request),age=Number(data.age);
  if(!Number.isInteger(age)||age<18||age>100||typeof data.name!=='string'||typeof data.city!=='string'||data.adultConfirmed!==true||data.storageConsent!==true)throw accountFailure('invalid_registration',400);
  await userRPC(context.supabase,'save_profile',{p_name:data.name,p_age:age,p_city:data.city,p_adult:true,p_storage:true});
  const saved=await readAccount(context.supabase,userId);
  return reply({persistence:'supabase',profile:saved.profile,registeredAt:saved.row.created_at});
 }
 if(path==='/api/me/export'||path==='/api/service/export'){
  if(request.method!=='GET')throw accountFailure('method_not_allowed',405);
  return exportAccount(context,userId);
 }
 if(path.startsWith('/api/me/'))return profileMedia(request,env,context,userId,path,origin,readJSON,mediaCodec);
 if(path.startsWith('/api/profile-photo/')){
  if(request.method!=='GET')throw accountFailure('method_not_allowed',405);
  const encounter=path.slice('/api/profile-photo/'.length);
  if(!UUID.test(encounter))throw accountFailure('not_found',404);
  const image=await userRPC(context.supabase,'peer_photo_path',{p_encounter:encounter});
  if(!image)throw accountFailure('not_found',404);
  return downloadImage(serverClient(env),image);
 }
 if(path==='/api/service/status'){
  if(request.method!=='GET')throw accountFailure('method_not_allowed',405);
  const status=await userRPC(context.supabase,'account_status');
  return reply({...status,readiness:{video:false,payments:false,legal:false,enabled:false},realSessions:false});
 }
 if(path.startsWith('/api/service/'))throw accountFailure('feature_not_ready');
 return reply({error:'not_found'},404);
}
