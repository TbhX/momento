/* Rehearsal ledger only. Real payment entitlements must come from the server. */
(function(root){
 const DAY=86400000;
 const catalog={
  entry:{name:'Encore un bonjour',kind:'entry',cents:99,quantity:1},
  entries:{name:'Trois nouvelles entrées',kind:'entry',cents:249,quantity:3},
  video:{name:'Un moment vidéo',kind:'video',cents:190,quantity:1},
  week:{name:'Premium · semaine découverte',kind:'premium',cents:190,days:7,recurring:false},
  month:{name:'Premium mensuel',kind:'premium',cents:990,months:1,recurring:true},
  year:{name:'Premium annuel',kind:'premium',cents:6990,months:12,recurring:true}
 };
 function create(){return{version:1,entryCredits:0,videoCredits:0,trialUsed:false,subscription:null,orders:[],requests:[]}}
 function count(x){return Number.isSafeInteger(x)&&x>=0?x:0}
 function clean(raw){
  const s=create();if(!raw||raw.version!==1)return s;s.entryCredits=count(raw.entryCredits);s.videoCredits=count(raw.videoCredits);s.trialUsed=raw.trialUsed===true;
  s.orders=(Array.isArray(raw.orders)?raw.orders:[]).filter(o=>o&&typeof o.id==='string'&&Object.hasOwn(catalog,o.sku)&&Number.isFinite(o.at)).slice(-100).map(o=>({id:o.id,sku:o.sku,at:o.at,cents:catalog[o.sku].cents,refundedCents:Math.min(catalog[o.sku].cents,count(o.refundedCents)),immediate:o.immediate===true,acknowledged:o.acknowledged===true,source:o.source==='stripe-test'?'stripe-test':'local',stripeId:typeof o.stripeId==='string'?o.stripeId:null,credited:o.credited===true,revoked:o.revoked===true}));
  const sub=raw.subscription;if(sub&&['week','month','year'].includes(sub.plan)&&typeof sub.orderId==='string'&&Number.isFinite(sub.startedAt)&&Number.isFinite(sub.endsAt)&&sub.endsAt>sub.startedAt)s.subscription={plan:sub.plan,orderId:sub.orderId,startedAt:sub.startedAt,endsAt:sub.endsAt,renew:sub.plan!=='week'&&sub.renew===true,refunded:sub.refunded===true};
  s.requests=(Array.isArray(raw.requests)?raw.requests:[]).filter(r=>r&&typeof r.id==='string'&&/^demo-\d+$/.test(r.personId)&&['pending','accepted','declined','cancelled','done'].includes(r.status)&&Number.isFinite(r.at)).slice(-40).map(r=>({id:r.id,personId:r.personId,status:r.status,at:r.at,consumed:r.consumed===true,startedAt:Number.isFinite(r.startedAt)?r.startedAt:null}));return s;
 }
 function active(s,now=Date.now()){return!!(s.subscription&&!s.subscription.refunded&&s.subscription.startedAt<=now&&s.subscription.endsAt>now)}
 function calendarEnd(now,months){const d=new Date(now),day=d.getUTCDate();d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+months);const last=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();d.setUTCDate(Math.min(day,last));return d.getTime()}
 function buy(s,sku,{now=Date.now(),id,immediate=false,acknowledged=false}={}){
  const product=Object.hasOwn(catalog,sku)?catalog[sku]:null;if(!product||!id||typeof id!=='string')return{error:'Produit indisponible.'};if(s.orders.some(o=>o.id===id))return{ok:true,duplicate:true};
  if(product.kind==='premium'){
   if(active(s,now))return{error:'Une formule Premium est déjà active. Gérez-la avant d’en choisir une autre.'};
   if(sku==='week'&&s.trialUsed)return{error:'La semaine découverte est réservée à un premier essai par compte.'};
   if(!immediate||sku==='week'&&!acknowledged)return{error:'Confirmez le démarrage du service et les informations de rétractation.'};
   s.subscription={plan:sku,orderId:id,startedAt:now,endsAt:product.days?now+product.days*DAY:calendarEnd(now,product.months),renew:product.recurring,refunded:false};if(sku==='week')s.trialUsed=true;
  }else if(product.kind==='entry')s.entryCredits+=product.quantity;else s.videoCredits+=product.quantity;
  const order={id,sku,at:now,cents:product.cents,refundedCents:0,immediate,acknowledged};s.orders.push(order);return{ok:true,order};
 }
 function cancel(s,now=Date.now()){if(!active(s,now))return false;s.subscription.renew=false;return true}
 function withdrawal(s,now=Date.now()){
  const sub=s.subscription,order=s.orders.find(o=>o.id===sub?.orderId);if(!sub||!order||sub.refunded)return{error:'Aucun achat Premium à rembourser dans cette répétition.'};
  // A commercial guarantee supplements statutory rights; edge cases remain reviewable.
  if(sub.plan!=='week'&&now<=sub.startedAt+15*DAY)return{automatic:true,cents:order.cents};
  if(sub.plan==='week'&&now<sub.endsAt&&now<=sub.startedAt+14*DAY){const unused=Math.max(0,sub.endsAt-now)/(sub.endsAt-sub.startedAt);return{automatic:true,cents:order.immediate?Math.round(order.cents*unused):order.cents,proRata:order.immediate};}
  return{review:true,message:sub.plan==='week'?'Semaine achevée : les consentements et les droits légaux doivent être examinés avant de décider du remboursement.':'Garantie commerciale dépassée : vos éventuels droits légaux restent à examiner.'};
 }
 function withdraw(s,now=Date.now()){const result=withdrawal(s,now);if(!result.automatic)return result;const sub=s.subscription,order=s.orders.find(o=>o.id===sub.orderId);order.refundedCents=result.cents;sub.refunded=true;sub.renew=false;return{...result,ok:true}}
 function invite(s,personId,now=Date.now()){
  if(!/^demo-\d+$/.test(personId))return{error:'Profil indisponible.'};if(s.requests.some(r=>r.personId===personId&&['pending','accepted'].includes(r.status)))return{error:'Une invitation vidéo existe déjà avec ce profil.'};
  if(s.requests.filter(r=>['pending','accepted'].includes(r.status)).length>=3)return{error:'Trois invitations actives au maximum, pour toutes les offres.'};
  const request={id:'video-'+now+'-'+s.requests.length,personId,status:'pending',at:now,consumed:false,startedAt:null};s.requests.push(request);return{ok:true,request};
 }
 function reply(s,id,action){const r=s.requests.find(r=>r.id===id);if(!r)return false;if(action==='accept'&&r.status==='pending')r.status='accepted';else if(action==='decline'&&r.status==='pending')r.status='declined';else if(action==='cancel'&&['pending','accepted'].includes(r.status))r.status='cancelled';else if(action==='finish'&&r.status==='accepted')r.status='done';else return false;return true}
 function startVideo(s,id,{premium=false,bothPresent=false,now=Date.now()}={}){const r=s.requests.find(r=>r.id===id);if(!r||r.status!=='accepted')return{error:'Une invitation acceptée est nécessaire.'};if(!bothPresent)return{error:'La présence des deux personnes est nécessaire.'};if(r.consumed)return r.startedAt!==null&&now<r.startedAt+15*60000?{ok:true}:{error:'Cette conversation est terminée. Envoyez une nouvelle invitation.'};if(!premium&&s.videoCredits<1)return{creditRequired:true};if(!premium)s.videoCredits--;r.consumed=true;r.startedAt=now;return{ok:true}}
 function reconcile(s,r){
  if(!r||typeof r.id!=='string'||!Object.hasOwn(catalog,r.sku))return;const p=catalog[r.sku],id='stripe:'+r.id;let order=s.orders.find(o=>o.id===id);
  if(!order){order={id,sku:r.sku,at:r.at,cents:p.cents,refundedCents:0,source:'stripe-test',stripeId:r.id,immediate:r.immediate===true,acknowledged:r.acknowledged===true,credited:false,revoked:false};s.orders.push(order)}
  order.refundedCents=r.refundedCents||0;
  if(p.kind==='premium'){
   if(r.sku==='week'&&['paid','expired','reversed'].includes(r.state))s.trialUsed=true;
   if(['paid','active'].includes(r.state))s.subscription={plan:r.sku,orderId:id,startedAt:r.at,endsAt:r.periodEnd,renew:r.renew===true,refunded:false};
   else if(s.subscription?.orderId===id){s.subscription.renew=false;s.subscription.endsAt=Math.min(s.subscription.endsAt,Date.now());s.subscription.refunded=['reversed','held','refund_pending'].includes(r.state)}
  }else{
   const key=p.kind==='entry'?'entryCredits':'videoCredits';if(r.state==='paid'&&!order.credited){s[key]+=p.quantity;order.credited=true}
   if(['reversed','held','refund_pending'].includes(r.state)&&order.credited&&!order.revoked){s[key]=Math.max(0,s[key]-p.quantity);order.revoked=true}
  }
 }
 const api={catalog,create,clean,active,calendarEnd,buy,cancel,withdrawal,withdraw,invite,reply,startVideo,reconcile};if(typeof module!=='undefined')module.exports=api;else root.MomentoShop=api;
})(typeof globalThis!=='undefined'?globalThis:this);
