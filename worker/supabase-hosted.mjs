import {accountFailure,serverRPC} from './supabase-server.mjs';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const faults={admin_required:403,test_environment_required:409,registration_required:403,room_unavailable:404,invalid_request:400,rate_limit:429,draft_limit:409,room_locked:409,hosting_limit:409,hosting_disabled:503,hosting_credit_required:403,hosting_price_changed:409,registration_closed:409,balance_profile_required:409,age_not_eligible:403,export_too_large:413};
const enabled=env=>['HOSTED_ROOMS_ENABLED','LIVE_EVENTS_ENABLED','VIDEO_VALIDATED','LEGAL_VALIDATED'].every(k=>env[k]==='true');
const uuid=value=>{if(typeof value!=='string'||!UUID.test(value))throw accountFailure('invalid_request',400);return value};
async function rpc(context,name,args={}){
 const {data,error}=await context.supabase.rpc(name,args);
 if(error){const code=Object.hasOwn(faults,error.message)?error.message:['22P02','22007','22008','22023','23514'].includes(error.code)?'invalid_request':'hosting_unavailable';throw accountFailure(code,faults[code]??503)}
 return data;
}
export async function hostedRoomsAPI(request,env,{context,origin,readJSON}){
 const path=new URL(request.url).pathname.slice('/api/service'.length);
 if(path==='/hosted'){
  if(request.method!=='GET')throw accountFailure('method_not_allowed',405);
  const value=await rpc(context,'hosted_room_dashboard');
  return Response.json({...value,publishingEnabled:value.publishingEnabled===true&&enabled(env),callsEnabled:false});
 }
 if(!['/hosted/save','/hosted/action','/hosted/registration','/hosted/publish-test'].includes(path))return null;
 if(request.method!=='POST')throw accountFailure('method_not_allowed',405);
 if(request.headers.get('Origin')!==origin||request.headers.get('X-Momento-Request')!=='1'||request.headers.get('Sec-Fetch-Site')==='cross-site')throw accountFailure('invalid_origin',403);
 const body=await readJSON(request);let result;
 if(!body||typeof body!=='object'||Array.isArray(body))throw accountFailure('invalid_request',400);
 if(path==='/hosted/publish-test')result=await rpc(context,'admin_publish_test_room',{p_room:uuid(body.room)});
 if(path==='/hosted/save'){
  if(!body.data||typeof body.data!=='object'||Array.isArray(body.data))throw accountFailure('invalid_request',400);
  result=await rpc(context,'save_hosted_room',{p_data:body.data,p_key:uuid(body.requestId)});
 }
 if(path==='/hosted/action'){
  if(!['publish','cancel','rotate'].includes(body.action)||![0,1,2,4].includes(body.maxCredits??0))throw accountFailure('invalid_request',400);
  if(body.action==='publish'&&!enabled(env))throw accountFailure('hosting_disabled',503);
  result=await rpc(context,'hosted_room_action',{p_room:uuid(body.room),p_action:body.action,p_max_credits:body.maxCredits??0});
 }
 if(path==='/hosted/registration'){
  if(!['resolve','inspect','reserve','cancel'].includes(body.action))throw accountFailure('invalid_request',400);
  result=await rpc(context,'register_hosted_room',{p_room:body.action==='resolve'?null:uuid(body.room),p_action:body.action,p_code:body.action==='resolve'?uuid(body.code):null});
 }
 return Response.json({...result,callsEnabled:false});
}
export const exportHostedRooms=context=>rpc(context,'export_hosted_rooms');
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const publicHeaders={
 'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow',
 'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Strict-Transport-Security':'max-age=31536000',
 'Content-Security-Policy':"default-src 'none'; style-src 'self'; img-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
};
export async function publicHostedRoom(request,env){
 const code=new URL(request.url).pathname.match(/^\/salon\/([0-9a-f-]{36})$/i)?.[1];
 const respond=(body,status=200)=>new Response(request.method==='HEAD'?null:body,{status,headers:publicHeaders});
 if(!['GET','HEAD'].includes(request.method))return respond('Méthode indisponible.',405);
 if(!code||!UUID.test(code))return respond('Ce lien de salon est indisponible.',404);
 let origin;try{const url=new URL(env.MOMENTO_APP_ORIGIN);if(url.protocol!=='https:'||url.origin!==env.MOMENTO_APP_ORIGIN)throw 0;origin=url.origin}catch{return respond('Le salon est momentanément indisponible.',503)}
 let room;try{room=await serverRPC(env,'server_shared_room',{p_code:code})}catch{return respond('Le salon est momentanément indisponible.',503)}
 if(!room)return respond('Ce salon est privé, terminé ou son lien a changé.',404);
 const title=escape((room.isTest?'[Salon de test] ':'')+room.title),description=escape(String(room.description||'Une soirée pour faire connaissance.').slice(0,500));
 const link=origin+'/?salon='+code+'#salon-invite',canonical=origin+'/salon/'+code;
 const date=escape(new Date(room.opensAt).toLocaleString('fr-FR',{timeZone:'Europe/Paris',dateStyle:'full',timeStyle:'short'}));
 return respond(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} · Momento</title><meta name="description" content="${description}"><meta property="og:title" content="${title} · Momento"><meta property="og:description" content="${description}"><meta property="og:type" content="website"><meta property="og:url" content="${escape(canonical)}"><meta property="og:image" content="${escape(origin)}/icon-512.png"><meta name="twitter:card" content="summary"><link rel="canonical" href="${escape(canonical)}"><link rel="stylesheet" href="/hosted-rooms.css"></head><body class="shared-salon"><main class="shared-card"><a class="hosted-brand" href="/">momento ♡</a><p class="hosted-eyebrow">UNE INVITATION À FAIRE CONNAISSANCE</p><h1>${title}</h1><p>${description}</p><p>${date} · heure de Paris</p><p>${escape(room.city)} · ${Number(room.minAge)}–${Number(room.maxAge)} ans · ${Number(room.capacity)} places</p><p>${Number(room.capacity)/2} femmes et ${Number(room.capacity)/2} hommes maximum. Confirmation par paires, puis liste d’attente.</p><p>Jusqu’à 10 tête-à-tête de 5 minutes, avec 30 secondes entre les tours. Audio et/ou vidéo.</p>${room.isTest?'<p class="hosted-notice">Salon de test publié par l’organisateur. Aucun appel ni paiement réel.</p>':''}${enabled(env)?'':'<p class="hosted-notice">Les rencontres réelles sont encore en préparation.</p>'}<a class="hosted-link" href="${escape(link)}">Voir l’invitation ↗</a><p class="hosted-fine">Un compte et un profil complet sont nécessaires. La réservation ne consomme aucune entrée ; les conditions d’accès s’appliquent au démarrage.</p></main></body></html>`);
}
