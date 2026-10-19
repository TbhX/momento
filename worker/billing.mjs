// Deliberately sandbox-only. Never grants production Premium rights.
function stripeTestConfiguration(env){const key=String(env.STRIPE_TEST_SECRET_KEY||'').trim(),price=String(env.STRIPE_TEST_PRICE_ID||'').trim();let issue=null;
 if(!key)issue='key_missing';else if(/^[sr]k_live_/.test(key))issue='live_key';else if(/^pk_/.test(key))issue='publishable_key';else if(!/^[sr]k_test_[A-Za-z0-9]+$/.test(key))issue='key_format';else if(!/^price_[A-Za-z0-9]+$/.test(price))issue='price_format';return{configured:!issue,issue}}
function stripeTestConfigured(env){return stripeTestConfiguration(env).configured}
async function stripeTest(env,path,method='GET',params={},key){if(!stripeTestConfigured(env))throw fail('stripe_test_not_configured',503);const r=await fetch('https://api.stripe.com/v1/'+path,{method,headers:{'Stripe-Version':'2026-08-26.dahlia',Authorization:'Bearer '+String(env.STRIPE_TEST_SECRET_KEY).trim(),...(method==='POST'?{'Content-Type':'application/x-www-form-urlencoded'}:{}),...(key?{'Idempotency-Key':key}:{})},...(method==='POST'?{body:new URLSearchParams(params)}:{}),signal:AbortSignal.timeout(15000)});if(!r.ok){if(r.status===401)throw fail('stripe_key_rejected',503);if(r.status===403)throw fail('stripe_permissions_missing',503);if(r.status===404)throw fail('stripe_resource_missing',503);throw fail('stripe_unavailable',503)};const d=await r.json();if(d.livemode===true)throw fail('stripe_live_forbidden',403);return d}
function stripeObjectId(x){return typeof x==='string'?x:x?.id}
function checkedStripeURL(value,host){const u=new URL(value);if(u.protocol!=='https:'||u.hostname!==host)throw fail('invalid_stripe_url',502);return u.href}
async function stripeTestState(env,record){if(!record?.customer_id)return{state:'none',testPremium:false};const list=await stripeTest(env,'subscriptions?customer='+encodeURIComponent(record.customer_id)+'&status=all&limit=100&expand[]=data.latest_invoice');const active=list.data.filter(s=>!['canceled','incomplete_expired'].includes(s.status));if(active.length>1)throw fail('multiple_test_subscriptions',409);const s=active[0];if(!s)return{state:'none',testPremium:false};if(s.livemode||stripeObjectId(s.customer)!==record.customer_id)throw fail('stripe_account_mismatch',403);const item=s.items?.data?.find(x=>x.price?.id===env.STRIPE_TEST_PRICE_ID),until=Number(item?.current_period_end||0)*1000;return{state:s.status,subscriptionId:s.id,testPremium:!!(item&&s.status==='active'&&s.latest_invoice?.status==='paid'&&until>Date.now()),periodEnd:until,cancelAtPeriodEnd:!!s.cancel_at_period_end}}
async function billingTestAPI(req,env,id,action){if(!adminRequest(req,env))throw fail('admin_required',403);env={...env,STRIPE_TEST_SECRET_KEY:String(env.STRIPE_TEST_SECRET_KEY||'').trim(),STRIPE_TEST_PRICE_ID:String(env.STRIPE_TEST_PRICE_ID||'').trim()};const db=env.DB;let record=await one(db,'SELECT * FROM billing_test WHERE user_id=?',id);if(action==='status'){const config=stripeTestConfiguration(env);if(!config.configured)return{...config,mode:'test',state:'not_configured',testPremium:false};await validateStripeTestPrice(env);return{...config,verified:true,mode:'test',...await syncTestSubscription(env,record),secondDate:await syncSecondDateTest(env,id),webhookConfigured:!!env.STRIPE_TEST_WEBHOOK_SECRET}};if(req.method!=='POST')throw fail('method_not_allowed',405);if(!stripeTestConfigured(env))throw fail('stripe_test_not_configured',503);const origin=new URL(req.url).origin;
if(action==='portal'){if(!record?.customer_id)throw fail('no_test_customer',409);const d=await stripeTest(env,'billing_portal/sessions','POST',{customer:record.customer_id,return_url:origin+'/?billing=test-return'});return{url:checkedStripeURL(d.url,'billing.stripe.com'),mode:'test'}}
if(action==='second-date')return secondDateTestCheckout(req,env,id);
if(action!=='checkout')throw fail('not_found',404);
await validateStripeTestPrice(env);
await execute(db,'INSERT OR IGNORE INTO billing_test(user_id,ref,updated_at) VALUES(?,?,?)',id,crypto.randomUUID(),Date.now());record=await one(db,'SELECT * FROM billing_test WHERE user_id=?',id);
if(!record.customer_id){const c=await stripeTest(env,'customers','POST',{'metadata[momento_test_ref]':record.ref},'momento-customer-'+record.ref);await execute(db,'UPDATE billing_test SET customer_id=? WHERE user_id=?',c.id,id);record.customer_id=c.id}
const state=await stripeTestState(env,record);if(state.state!=='none')throw fail('test_subscription_exists',409);
if(record.session_id){const prior=await stripeTest(env,'checkout/sessions/'+encodeURIComponent(record.session_id));if(prior.status==='open')return{url:checkedStripeURL(prior.url,'checkout.stripe.com'),mode:'test'};if(prior.status==='complete'){if(!prior.subscription)throw fail('test_subscription_sync_pending',409);const previous=await stripeTest(env,'subscriptions/'+encodeURIComponent(stripeObjectId(prior.subscription)));if(!['canceled','incomplete_expired'].includes(previous.status))throw fail('test_subscription_sync_pending',409);await execute(db,'UPDATE billing_test SET checkout_until=0 WHERE user_id=?',id)}}
const now=Date.now();await execute(db,'UPDATE billing_test SET attempt=?,checkout_until=?,session_id=NULL,updated_at=? WHERE user_id=? AND checkout_until<?',crypto.randomUUID(),Math.floor(now/1000)*1000+3600000,now,id,now);record=await one(db,'SELECT * FROM billing_test WHERE user_id=?',id);
const session=await stripeTest(env,'checkout/sessions','POST',{integration_identifier:'momento_sandbox_'+record.attempt.slice(0,8).replace(/[0-9]/g,n=>String.fromCharCode(103+Number(n))),mode:'subscription',customer:record.customer_id,'line_items[0][price]':env.STRIPE_TEST_PRICE_ID,'line_items[0][quantity]':'1',locale:'fr',success_url:origin+'/?billing=test-success',cancel_url:origin+'/?billing=test-cancel',expires_at:String(record.checkout_until/1000),'subscription_data[metadata][momento_test_ref]':record.ref,'metadata[momento_test_ref]':record.ref},'momento-checkout-'+record.attempt);
await execute(db,'UPDATE billing_test SET session_id=?,updated_at=? WHERE user_id=? AND attempt=?',session.id,Date.now(),id,record.attempt);return{url:checkedStripeURL(session.url,'checkout.stripe.com'),mode:'test'}}

async function validateStripeTestPrice(env){const price=await stripeTest(env,'prices/'+encodeURIComponent(env.STRIPE_TEST_PRICE_ID));if(price.livemode!==false||!price.active||price.currency!=='eur'||price.unit_amount!==990||price.recurring?.interval!=='month'||price.recurring.interval_count!==1)throw fail('invalid_test_price',409);return price;}

// Temporary, read-only support check. Protected by an expiring, server-only credential.
async function stripeHealth(env){const config=stripeTestConfiguration(env);if(!config.configured)return config;
 const check=async path=>{try{const r=await fetch('https://api.stripe.com/v1/'+path,{headers:{'Stripe-Version':'2026-08-26.dahlia',Authorization:'Bearer '+String(env.STRIPE_TEST_SECRET_KEY).trim()},signal:AbortSignal.timeout(12000)});let d;try{d=await r.json()}catch{return{status:r.status,json:false,requestId:r.headers.get('request-id')}};return{status:r.status,requestId:r.headers.get('request-id'),errorType:d.error?.type,errorCode:d.error?.code,param:d.error?.param,id:d.id,livemode:d.livemode,priceIds:Array.isArray(d.data)?d.data.map(x=>({id:x.id,lookupKey:x.lookup_key,amount:x.unit_amount,currency:x.currency})):undefined}}catch{return{error:'network_failure'}}};
 return{config,account:await check('account'),price:await check('prices/'+encodeURIComponent(String(env.STRIPE_TEST_PRICE_ID).trim())),catalogue:await check('prices?limit=10')};}

// Sandbox entitlements are deliberately separate from members.premium_until.
async function syncTestSubscription(env,record){
 if(!record)return{state:'none',testPremium:false};
 const token=crypto.randomUUID();await execute(env.DB,'UPDATE billing_test SET sync_token=? WHERE user_id=?',token,record.user_id);
 const state=await stripeTestState(env,record);
 await execute(env.DB,'UPDATE billing_test SET test_state=?,test_premium_until=?,subscription_id=?,synced_at=? WHERE user_id=? AND sync_token=?',state.state,state.testPremium?state.periodEnd:0,state.subscriptionId||null,Date.now(),record.user_id,token);
 const saved=await one(env.DB,'SELECT * FROM billing_test WHERE user_id=?',record.user_id);
 return{state:saved?.test_state||'none',testPremium:!!(saved&&!saved.payment_hold&&saved.test_premium_until>Date.now()),periodEnd:saved?.test_premium_until||0,cancelAtPeriodEnd:!!state.cancelAtPeriodEnd,paymentHold:!!saved?.payment_hold,syncedAt:saved?.synced_at||0};
}
async function validateSecondDateTestPrice(env){
 const id=String(env.STRIPE_TEST_SECOND_DATE_PRICE_ID||'').trim();if(!/^price_[A-Za-z0-9]+$/.test(id))throw fail('second_date_not_configured',503);
 const p=await stripeTest(env,'prices/'+encodeURIComponent(id));if(p.livemode!==false||!p.active||p.currency!=='eur'||p.unit_amount!==290||p.recurring)throw fail('invalid_second_date_price',409);return p;
}
async function ensureTestCustomer(env,id){
 await execute(env.DB,'INSERT OR IGNORE INTO billing_test(user_id,ref,updated_at) VALUES(?,?,?)',id,crypto.randomUUID(),Date.now());
 let r=await one(env.DB,'SELECT * FROM billing_test WHERE user_id=?',id);
 if(!r.customer_id){const c=await stripeTest(env,'customers','POST',{'metadata[momento_test_ref]':r.ref},'momento-customer-'+r.ref);await execute(env.DB,'UPDATE billing_test SET customer_id=? WHERE user_id=?',c.id,id);r.customer_id=c.id}return r;
}
async function syncSecondDateTest(env,id){
 const db=env.DB,r=await one(db,'SELECT * FROM second_date_test WHERE user_id=?',id);if(!r?.session_id)return{state:r?'pending':'none',testCredit:0};
 const token=crypto.randomUUID();await execute(db,'UPDATE second_date_test SET sync_token=? WHERE user_id=?',token,id);
 const s=await stripeTest(env,'checkout/sessions/'+encodeURIComponent(r.session_id)+'?expand[]=line_items&expand[]=payment_intent.latest_charge');
 const owner=await one(db,'SELECT * FROM billing_test WHERE user_id=?',id),items=s.line_items?.data||[];
 if(s.livemode!==false||s.mode!=='payment'||stripeObjectId(s.customer)!==owner?.customer_id||s.metadata?.momento_test_order!==r.ref)throw fail('stripe_account_mismatch',403);
 const valid=items.length===1&&!s.line_items.has_more&&stripeObjectId(items[0].price)===String(env.STRIPE_TEST_SECOND_DATE_PRICE_ID).trim()&&items[0].quantity===1&&s.currency==='eur'&&s.amount_total===290;
 const pi=s.payment_intent,charge=pi&&typeof pi==='object'?pi.latest_charge:null;
 const reversed=!!(charge&&typeof charge==='object'&&(charge.disputed||charge.refunded||charge.amount_refunded>0));
 const credit=!!(valid&&s.status==='complete'&&s.payment_status==='paid'&&pi?.status==='succeeded'&&charge&&typeof charge==='object'&&!reversed&&!owner.payment_hold);
 const state=reversed?'reversed':credit?'paid':s.status==='expired'?'expired':s.status==='open'?'pending':'processing';
 await execute(db,'UPDATE second_date_test SET state=?,credit=?,updated_at=? WHERE user_id=? AND sync_token=?',state,credit?1:0,Date.now(),id,token);
 const saved=await one(db,'SELECT state,credit,updated_at FROM second_date_test WHERE user_id=?',id);return{state:saved?.state||'none',testCredit:saved?.credit||0,syncedAt:saved?.updated_at||0};
}
async function secondDateTestCheckout(req,env,id){
 const price=await validateSecondDateTestPrice(env),owner=await ensureTestCustomer(env,id),db=env.DB;
 let order=await one(db,'SELECT * FROM second_date_test WHERE user_id=?',id);
 if(order?.session_id){const status=await syncSecondDateTest(env,id);if(!['pending','expired'].includes(status.state))throw fail('second_date_test_exists',409);
 const existing=await stripeTest(env,'checkout/sessions/'+encodeURIComponent(order.session_id));if(existing.status==='open')return{url:checkedStripeURL(existing.url,'checkout.stripe.com'),mode:'test'};
 if(existing.status!=='expired')throw fail('test_payment_pending',409);
 await execute(db,'DELETE FROM second_date_test WHERE user_id=? AND session_id=? AND state=?',id,order.session_id,'expired');order=null;
 }
 const now=Date.now();await execute(db,"INSERT OR IGNORE INTO second_date_test(user_id,ref,expires_at,updated_at) VALUES(?,?,?,?)",id,crypto.randomUUID(),Math.floor(now/1000)*1000+3600000,now);
 order=await one(db,'SELECT * FROM second_date_test WHERE user_id=?',id);
 if(order.expires_at<now+1800000&&!order.session_id)throw fail('test_payment_pending',409);
 const origin=new URL(req.url).origin,s=await stripeTest(env,'checkout/sessions','POST',{
 integration_identifier:'momento_second_'+order.ref.slice(0,8).replace(/[0-9]/g,n=>String.fromCharCode(103+Number(n))),mode:'payment',customer:owner.customer_id,
 'line_items[0][price]':price.id,'line_items[0][quantity]':'1',locale:'fr',expires_at:String(order.expires_at/1000),
 'metadata[momento_test_order]':order.ref,'payment_intent_data[metadata][momento_test_order]':order.ref,
 success_url:origin+'/?billing=second-test-return',cancel_url:origin+'/?billing=second-test-cancel'},'momento-second-'+order.ref);
 await execute(db,'UPDATE second_date_test SET session_id=?,updated_at=? WHERE user_id=? AND ref=?',s.id,Date.now(),id,order.ref);
 return{url:checkedStripeURL(s.url,'checkout.stripe.com'),mode:'test'};
}
async function verifyStripeTestSignature(raw,header,secret,now=Date.now()){
 if(!secret||!secret.startsWith('whsec_'))throw fail('webhook_not_configured',503);
 const parts=String(header||'').split(',').map(x=>x.split('=')),timestamps=parts.filter(x=>x[0]==='t');
 if(timestamps.length!==1||!/^\d+$/.test(timestamps[0][1]))throw fail('invalid_signature',400);
 const timestamp=Number(timestamps[0][1]);if(Math.abs(now/1000-timestamp)>300)throw fail('invalid_signature',400);
 const encoder=new TextEncoder(),key=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['verify']);
 for(const [,hex] of parts.filter(x=>x[0]==='v1'&&/^[a-f0-9]{64}$/.test(x[1]))){const bytes=Uint8Array.from(hex.match(/../g),x=>parseInt(x,16));if(await crypto.subtle.verify('HMAC',key,bytes,encoder.encode(timestamp+'.'+raw)))return}
 throw fail('invalid_signature',400);
}
async function stripeTestWebhook(req,env){
 if(req.method!=='POST')throw fail('method_not_allowed',405);
 const raw=await req.text();if(raw.length>262144)throw fail('too_large',413);
 await verifyStripeTestSignature(raw,req.headers.get('stripe-signature'),env.STRIPE_TEST_WEBHOOK_SECRET);
 let event;try{event=JSON.parse(raw)}catch{throw fail('invalid_json')}
 if(event.livemode!==false)throw fail('stripe_live_forbidden',403);
 if(typeof event.id!=='string'||!event.id.startsWith('evt_')||!event.data?.object)throw fail('invalid_event');
 if(await one(env.DB,'SELECT id FROM stripe_test_events WHERE id=?',event.id))return{received:true,duplicate:true};
 const supported=['checkout.session.completed','checkout.session.async_payment_succeeded','checkout.session.async_payment_failed','checkout.session.expired','customer.subscription.created','customer.subscription.updated','customer.subscription.deleted','invoice.paid','invoice.payment_failed','charge.refunded','charge.dispute.created'];
 if(!supported.includes(event.type))return{received:true,ignored:true};
 let obj=event.data.object,customer=stripeObjectId(obj.customer);
 if(event.type==='charge.dispute.created'){obj=await stripeTest(env,'charges/'+encodeURIComponent(stripeObjectId(obj.charge)));customer=stripeObjectId(obj.customer)}
 const record=customer?await one(env.DB,'SELECT * FROM billing_test WHERE customer_id=?',customer):null;
 if(!record)return{received:true,ignored:true};
 if(['charge.refunded','charge.dispute.created'].includes(event.type)){
 await execute(env.DB,'UPDATE billing_test SET payment_hold=1,test_premium_until=0 WHERE user_id=?',record.user_id);
 await execute(env.DB,"UPDATE second_date_test SET credit=0,state='reversed' WHERE user_id=?",record.user_id);
 }
 await syncTestSubscription(env,record);await syncSecondDateTest(env,record.user_id);await syncShopTestOrders(env,record.user_id);
 await execute(env.DB,'INSERT OR IGNORE INTO stripe_test_events(id,processed_at) VALUES(?,?)',event.id,Date.now());
 return{received:true};
}
