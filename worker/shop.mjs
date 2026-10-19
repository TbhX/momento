// Sandbox shop. Never writes members.premium_until or production credit balances.
const SHOP_TEST_CATALOG={
 entry:{name:'Momento · une entrée supplémentaire',cents:99,kind:'entry',quantity:1},
 entries:{name:'Momento · trois entrées supplémentaires',cents:249,kind:'entry',quantity:3},
 video:{name:'Momento · un accès audio / vidéo privé',cents:190,kind:'video',quantity:1},
 week:{name:'Momento Premium · découverte 7 jours',cents:190,kind:'premium',days:7},
 month:{name:'Momento Premium',cents:990,kind:'premium',interval:'month'},
 year:{name:'Momento Premium',cents:6990,kind:'premium',interval:'year'}
};
function shopTestReceipt(order){const p=SHOP_TEST_CATALOG[order.sku];return{id:order.id,sku:order.sku,persona:order.persona,state:order.state,at:order.paid_at||order.created_at,cents:p.cents,quantity:p.quantity||0,kind:p.kind,periodEnd:order.period_end,renew:!!(p.interval&&!order.cancel_at_end),refundedCents:order.refunded_cents,immediate:!!order.immediate,acknowledged:!!order.acknowledged}}
async function syncShopTestOrder(env,order){
 if(!order.session_id){if(order.checkout_until<Date.now()){await execute(env.DB,"UPDATE shop_test_orders SET state='expired' WHERE id=?",order.id);order={...order,state:'expired'}}return shopTestReceipt(order)}
 if(order.state==='refund_pending')return shopTestReceipt(order);
 const token=crypto.randomUUID();await execute(env.DB,'UPDATE shop_test_orders SET sync_token=? WHERE id=?',token,order.id);
 const p=SHOP_TEST_CATALOG[order.sku],owner=await one(env.DB,'SELECT * FROM billing_test WHERE user_id=?',order.user_id);
 const session=await stripeTest(env,'checkout/sessions/'+encodeURIComponent(order.session_id)+'?expand[]=line_items&expand[]=payment_intent.latest_charge&expand[]=subscription.latest_invoice');
 if(session.livemode!==false||session.metadata?.momento_shop_order!==order.id||stripeObjectId(session.customer)!==owner?.customer_id)throw fail('stripe_account_mismatch',403);
 const items=session.line_items?.data||[],item=items[0],price=item?.price;
 if(items.length!==1||session.line_items.has_more||item.quantity!==1||price?.unit_amount!==p.cents||price.currency!=='eur'||session.currency!=='eur'||session.amount_total!==p.cents||session.mode!==(p.interval?'subscription':'payment')||(p.interval?price.recurring?.interval!==p.interval||price.recurring.interval_count!==1:!!price.recurring))throw fail('shop_price_mismatch',409);
 let state=session.status==='expired'?'expired':'pending',until=0,subId=null,cancel=false,refunded=0,paidAt=order.paid_at;
 if(session.status==='complete'&&session.payment_status==='paid'){
  paidAt=paidAt||Number(session.payment_intent?.latest_charge?.created||session.subscription?.latest_invoice?.status_transitions?.paid_at||Math.floor(Date.now()/1000))*1000;
  if(p.interval){
   const sub=session.subscription;if(!sub||typeof sub!=='object'||sub.livemode!==false||stripeObjectId(sub.customer)!==owner.customer_id)throw fail('stripe_account_mismatch',403);
   subId=sub.id;cancel=!!sub.cancel_at_period_end;
   const line=sub.items?.data?.[0];if(sub.items?.data?.length!==1||line.price?.unit_amount!==p.cents||line.price.currency!=='eur'||line.price.recurring?.interval!==p.interval||line.price.recurring.interval_count!==1)throw fail('shop_price_mismatch',409);
   until=Number(line.current_period_end||0)*1000;state=sub.status==='active'&&sub.latest_invoice?.status==='paid'&&until>Date.now()?'active':'inactive';
  }else{
   const pi=session.payment_intent,charge=pi?.latest_charge;
   if(pi?.status!=='succeeded'||!charge||typeof charge!=='object')state='processing';
   else{refunded=Number(charge.amount_refunded||0);state=charge.disputed||charge.refunded||refunded>0?'reversed':'paid';until=p.days?paidAt+p.days*86400000:0;if(p.days&&until<=Date.now()&&state==='paid')state='expired';}
  }
 }
 // A refund or dispute notification suspends all test rights pending review.
 if(owner.payment_hold)state='held';
 if(order.refunded_cents>refunded){refunded=order.refunded_cents;state='reversed'}
 await execute(env.DB,'UPDATE shop_test_orders SET state=?,paid_at=?,period_end=?,subscription_id=?,cancel_at_end=?,refunded_cents=?,updated_at=? WHERE id=? AND sync_token=?',state,paidAt,until,subId,cancel?1:0,refunded,Date.now(),order.id,token);
 return shopTestReceipt(await one(env.DB,'SELECT * FROM shop_test_orders WHERE id=?',order.id));
}
async function syncShopTestOrders(env,id){const orders=await rows(env.DB,'SELECT * FROM shop_test_orders WHERE user_id=? ORDER BY created_at DESC LIMIT 30',id),out=[];for(const o of orders)out.push(await syncShopTestOrder(env,o));return out}
async function shopTestAPI(req,env,id,action){
 if(!adminRequest(req,env))throw fail('admin_required',403);if(!stripeTestConfigured(env))throw fail('stripe_test_not_configured',503);
 if(action==='status'&&req.method==='GET')return{mode:'test',orders:await syncShopTestOrders(env,id)};
 if(req.method!=='POST')throw fail('method_not_allowed',405);
 const body=await bodyJSON(req);if(action==='checkout')return shopTestCheckout(req,env,id,body);
 if(!['cancel','withdraw'].includes(action)||typeof body.orderId!=='string')throw fail('not_found',404);
 let order=await one(env.DB,'SELECT * FROM shop_test_orders WHERE id=? AND user_id=?',body.orderId,id);if(!order)throw fail('not_found',404);
 await syncShopTestOrder(env,order);order=await one(env.DB,'SELECT * FROM shop_test_orders WHERE id=? AND user_id=?',body.orderId,id);
 const p=SHOP_TEST_CATALOG[order.sku];if(p.kind!=='premium')throw fail('shop_refund_review_required',409);
 if(action==='cancel'){
  if(!order.subscription_id||order.state!=='active')throw fail('shop_subscription_inactive',409);
  await stripeTest(env,'subscriptions/'+encodeURIComponent(order.subscription_id),'POST',{cancel_at_period_end:'true'},'momento-shop-cancel-'+order.id);
  return{mode:'test',order:await syncShopTestOrder(env,order)};
 }
 if(order.state==='reversed')return{mode:'test',order:shopTestReceipt(order),duplicate:true};
 const age=Date.now()-(order.paid_at||order.created_at);if(order.state!=='refund_pending'&&(p.interval?age>15*86400000:order.state!=='paid'||age>=7*86400000||!order.immediate||!order.acknowledged))throw fail('shop_refund_review_required',409);
 if(!['active','paid','inactive','refund_pending'].includes(order.state))throw fail('shop_subscription_inactive',409);
 const session=await stripeTest(env,'checkout/sessions/'+encodeURIComponent(order.session_id)+'?expand[]=payment_intent&expand[]=invoice');
 let paymentIntent=stripeObjectId(session.payment_intent),invoiceId=stripeObjectId(session.invoice);
 if(!paymentIntent&&invoiceId){const payments=await stripeTest(env,'invoice_payments?invoice='+encodeURIComponent(invoiceId)+'&limit=10');paymentIntent=stripeObjectId(payments.data?.find(x=>x.status==='paid'&&x.payment?.type==='payment_intent')?.payment?.payment_intent)}
 if(!paymentIntent)throw fail('shop_refund_review_required',409);
 const amount=order.state==='refund_pending'?order.refunded_cents:p.interval?p.cents:Math.max(0,Math.round(p.cents*(order.period_end-Date.now())/(7*86400000)));
 await execute(env.DB,"UPDATE shop_test_orders SET state='refund_pending',refunded_cents=?,updated_at=? WHERE id=? AND user_id=?",amount,Date.now(),order.id,id);
 if(amount>0)await stripeTest(env,'refunds','POST',{payment_intent:paymentIntent,amount:String(amount)},'momento-shop-refund-'+order.id);
 if(order.subscription_id){const sub=await stripeTest(env,'subscriptions/'+encodeURIComponent(order.subscription_id));if(sub.status!=='canceled')await stripeTest(env,'subscriptions/'+encodeURIComponent(order.subscription_id),'DELETE')}
 await execute(env.DB,"UPDATE shop_test_orders SET state='reversed',refunded_cents=?,cancel_at_end=1,updated_at=? WHERE id=? AND user_id=?",amount,Date.now(),order.id,id);
 return{mode:'test',order:shopTestReceipt(await one(env.DB,'SELECT * FROM shop_test_orders WHERE id=?',order.id))};
}
async function shopTestCheckout(req,env,id,body){
 const p=typeof body.sku==='string'&&Object.hasOwn(SHOP_TEST_CATALOG,body.sku)?SHOP_TEST_CATALOG[body.sku]:null;if(!p||!['free','premium','admin'].includes(body.persona)||!/^[-a-f0-9]{36}$/.test(body.orderId||''))throw fail('invalid_shop_order',400);
 if(body.terms!==true||p.kind==='premium'&&(body.immediate!==true||body.sku==='week'&&body.acknowledged!==true))throw fail('shop_consent_required',400);
 const owner=await ensureTestCustomer(env,id),db=env.DB;
 let order=await one(db,'SELECT * FROM shop_test_orders WHERE id=?',body.orderId);
 if(!order)order=await one(db,"SELECT * FROM shop_test_orders WHERE user_id=? AND sku=? AND persona=? AND state='pending' AND checkout_until>? ORDER BY created_at DESC LIMIT 1",id,body.sku,body.persona,Date.now());
 if(order&&(order.user_id!==id||order.sku!==body.sku||order.persona!==body.persona))throw fail('stripe_account_mismatch',403);
 if(order?.session_id){const existing=await stripeTest(env,'checkout/sessions/'+encodeURIComponent(order.session_id));if(existing.status==='open')return{mode:'test',url:checkedStripeURL(existing.url,'checkout.stripe.com')};throw fail('shop_order_closed',409)}
 if(p.kind==='premium'){
  const subs=await stripeTest(env,'subscriptions?customer='+encodeURIComponent(owner.customer_id)+'&status=all&limit=100');if(subs.data.some(s=>!['canceled','incomplete_expired'].includes(s.status)))throw fail('test_subscription_exists',409);
  const shop=await syncShopTestOrders(env,id);if(shop.some(o=>o.kind==='premium'&&['active','paid','pending'].includes(o.state)&&(!order||o.id!==order.id)))throw fail('test_subscription_exists',409);
  if(body.sku==='week'&&await one(db,"SELECT id FROM shop_test_orders WHERE user_id=? AND sku='week' AND paid_at IS NOT NULL LIMIT 1",id))throw fail('shop_trial_used',409);
 }
 const now=Date.now();if(!order){await execute(db,'INSERT OR IGNORE INTO shop_test_orders(id,user_id,persona,sku,created_at,checkout_until,immediate,acknowledged,updated_at) VALUES(?,?,?,?,?,?,?,?,?)',body.orderId,id,body.persona,body.sku,now,Math.floor(now/1000)*1000+3600000,body.immediate===true?1:0,body.acknowledged===true?1:0,now);order=await one(db,'SELECT * FROM shop_test_orders WHERE id=?',body.orderId)}
 if(order.checkout_until<Date.now()+1800000)throw fail('shop_order_closed',409);
 const origin=new URL(req.url).origin,params={mode:p.interval?'subscription':'payment',customer:owner.customer_id,locale:'fr',integration_identifier:'momento_shop_'+order.id.slice(0,8).replace(/[0-9]/g,n=>String.fromCharCode(103+Number(n))),'line_items[0][quantity]':'1','metadata[momento_shop_order]':order.id,expires_at:String(order.checkout_until/1000),success_url:origin+'/?shopOrder='+encodeURIComponent(order.id),cancel_url:origin+'/?shopOrder='+encodeURIComponent(order.id)+'&cancelled=1'};
 if(body.sku==='month'){await validateStripeTestPrice(env);params['line_items[0][price]']=env.STRIPE_TEST_PRICE_ID}
 else{if(body.sku==='year'){const monthly=await validateStripeTestPrice(env);params['line_items[0][price_data][product]']=stripeObjectId(monthly.product)}else params['line_items[0][price_data][product_data][name]']=p.name;params['line_items[0][price_data][currency]']='eur';params['line_items[0][price_data][unit_amount]']=String(p.cents);if(p.interval)params['line_items[0][price_data][recurring][interval]']=p.interval;}
 const session=await stripeTest(env,'checkout/sessions','POST',params,'momento-shop-checkout-'+order.id);await execute(db,'UPDATE shop_test_orders SET session_id=?,updated_at=? WHERE id=? AND user_id=?',session.id,Date.now(),order.id,id);
 return{mode:'test',url:checkedStripeURL(session.url,'checkout.stripe.com')};
}
