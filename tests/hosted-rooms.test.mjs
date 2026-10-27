import {readFile} from 'node:fs/promises';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createSupabaseFixture} from './helpers/supabase-fixture.mjs';
const uid=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const draft=(capacity=20,extra={})=>({title:'Sur la même fréquence',description:'Un bonjour autour de la musique',theme:'music',city:'Paris',profession:'',minAge:18,maxAge:100,capacity,opensAt:new Date(Date.now()+86400000).toISOString(),modes:['audio','video'],color:'duo',visibility:'link',...extra});
for(const kind of ['schemas','migrations'])test('member-hosted events and directory using '+kind,async t=>{
 const db=await createSupabaseFixture(kind);if(kind==='migrations')await db.exec(await readFile('supabase/migrations/20261026151711_room_duration_v2.sql','utf8'));
 const scalar=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0]??{})[0];
 async function actor(n,sql,args=[]){
  await db.exec('begin');try{
   const id=uid(n);await db.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)",[id,JSON.stringify({sub:id,session_id:id,role:'authenticated',user_metadata:{premium:true,role:'admin'}})]);
   await db.exec('set local role authenticated');const result=await scalar(sql,args);await db.exec('commit');return result;
  }catch(error){await db.exec('rollback');throw error}
 }
 const save=(n,data=draft(),key=crypto.randomUUID())=>actor(n,'select public.save_hosted_room($1,$2)',[data,key]);
 const action=(n,id,type,cap=0)=>actor(n,'select public.hosted_room_action($1,$2,$3)',[id,type,cap]);
 const reg=(n,id,type='reserve',code=null)=>actor(n,'select public.register_hosted_room($1,$2,$3)',[id,type,code]);
 const page=(n,filters={},after=null)=>actor(n,"select public.community_page('rooms',$1,$2,$3)",[filters,after?.at??null,after?.id??null]);
 try{
  // Large, entirely local fixture. No hosted project or real identity is used.
  await db.exec(`insert into auth.users(id) select ('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid from generate_series(1,5001) n;
   insert into auth.sessions(id,user_id) select id,id from auth.users;
   insert into public.profiles(id,display_name,age,city,gender,terms_version,privacy_version) select id,'Membre '||row_number() over(order by id),30,'Paris',case when right(id::text,1)::int%2=1 then 'woman' else 'man' end,'test','test' from auth.users;`);
  await t.test('safe defaults, draft ownership, idempotency and validation',async()=>{
   const k=crypto.randomUUID(),r=await save(1,draft(),k);assert.equal(r.capacity,20);assert.equal(r.roundSeconds,330);assert.equal(r.rounds,10);
   assert.equal((await save(1,draft(),k)).id,r.id);assert.equal(await scalar('select count(*)::int from private.hosted_rooms'),1);
   await assert.rejects(save(2,draft(20,{id:r.id})),/room_unavailable/);
   for(const data of [draft(30),draft(20,{minAge:50,maxAge:30}),draft(20,{modes:['video','video']}),draft(20,{opensAt:'infinity'}),draft(20,{owner_id:uid(2)}),draft(20,{theme:'missing'})])await assert.rejects(save(1,data));
   await assert.rejects(action(1,r.id,'publish',4),/hosting_disabled/);
   assert.equal(await scalar("select count(*)::int from public.credit_ledger"),0);
   await db.exec('set role service_role');assert.equal(await scalar('select public.server_shared_room($1)',[r.shareCode]),null);await db.exec('reset role');
   await actor(1,'select public.hosted_room_dashboard()');
   await assert.rejects(actor(2,'select * from private.hosted_rooms'),/permission denied/);
   await assert.rejects(actor(1,'select public.server_shared_room($1)',[r.shareCode]),/permission denied/);
  });
  let event;
  await t.test('native rights, cost consent and atomic publication/cancellation',async()=>{
   await db.exec("update private.hosting_settings set enabled=true;update private.runtime_settings set admissions_enabled=true");
   event=await save(1);await assert.rejects(action(1,event.id,'publish',0),/hosting_price_changed/);
   await assert.rejects(action(1,event.id,'publish',1),/hosting_credit_required/);
   await db.query("insert into public.credit_ledger(user_id,unit,amount,environment,reason,idempotency_key) values($1,'room_host',10,'test','purchase','local-host-credit')",[uid(1)]);
   await db.query("insert into public.credit_ledger(user_id,unit,amount,environment,reason,idempotency_key) values($1,'room_host',100,'live','purchase','local-live-credit')",[uid(2)]);
   const other=await save(2);await assert.rejects(action(2,other.id,'publish',1),/hosting_credit_required/);
   assert.equal((await action(1,event.id,'publish',1)).chargedCredits,1);assert.equal((await action(1,event.id,'publish',1)).reused,true);
   assert.equal(await scalar("select sum(amount)::int from public.credit_ledger where user_id=$1 and unit='room_host' and environment='test'",[uid(1)]),9);
   await assert.rejects(save(1,draft(100,{id:event.id})),/room_locked/);
   assert.equal(await scalar('select count(*)::int from public.room_entries'),0);
  });
  await t.test('private links, safe sharing, pair confirmation and waiting-list recovery',async()=>{
   assert.equal((await page(2)).items.some(r=>r.id===event.id),false);
   await assert.rejects(reg(2,event.id,'inspect'),/room_unavailable/);
   for(const n of [2,3,4,5])await reg(n,null,'resolve',event.shareCode);
   const read=await reg(2,event.id,'inspect');assert.equal(read.registration,null);assert.equal(read.entryConsumed,false);
   assert.equal((await reg(2,event.id)).registration,'waiting');assert.equal((await reg(3,event.id)).registration,'confirmed');
   assert.equal((await reg(2,event.id)).reused,true);
   await reg(4,event.id);await reg(5,event.id);
   let state=await reg(2,event.id,'inspect');assert.equal(state.women,2);assert.equal(state.men,2);
   await reg(3,event.id,'cancel');state=await reg(2,event.id,'inspect');assert.equal(state.women,1);assert.equal(state.men,1);assert.equal(state.waiting,1);
   await reg(3,event.id);state=await reg(2,event.id,'inspect');assert.equal(state.women,2);assert.equal(state.men,2);
   await db.query("update public.profiles set gender='nonbinary' where id=$1",[uid(3)]);
   state=await reg(2,event.id,'inspect');assert.equal(state.women,state.men);await assert.rejects(reg(3,event.id),/balance_profile_required/);
   await db.query("update public.profiles set gender='woman' where id=$1",[uid(3)]);await reg(3,event.id);
   await db.query('insert into public.blocks(actor_id,target_id) values($1,$2)',[uid(1),uid(3)]);
   state=await reg(2,event.id,'inspect');assert.equal(state.women,state.men);await assert.rejects(reg(3,event.id,'inspect'),/room_unavailable/);
   await db.exec('set role service_role');const publicCard=await scalar('select public.server_shared_room($1)',[event.shareCode]);await db.exec('reset role');
   assert.equal(publicCard.title,event.title);assert.doesNotMatch(JSON.stringify(publicCard),/owner_id|user_id|shareCode|session_id|Membre/);
   assert.equal(await scalar('select count(*)::int from public.room_entries'),0);
   const rotated=await action(1,event.id,'rotate');await assert.rejects(reg(6,null,'resolve',event.shareCode),/room_unavailable/);
   assert.equal((await reg(6,null,'resolve',rotated.shareCode)).entryConsumed,false);
   assert.equal((await reg(2,event.id,'inspect')).registration,'confirmed');
   await action(1,event.id,'cancel');await action(1,event.id,'cancel');
   assert.equal(await scalar("select sum(amount)::int from public.credit_ledger where user_id=$1 and unit='room_host' and environment='test'",[uid(1)]),10);
   await assert.rejects(reg(2,event.id,'inspect'),/room_unavailable/);
  });
  await t.test('20, 50 and 100 seats enforce exact capacity and confirmed parity',async()=>{
   await db.exec("delete from private.rate_limits where key_hash like 'social:host-publish:%'");
   for(const cap of [20,50,100]){
    const r=await save(1,draft(cap,{visibility:'public'}));await action(1,r.id,'publish',cap===20?1:cap===50?2:4);
    for(let n=10;n<10+cap+8;n++)await reg(n,r.id);
    const state=await reg(10,r.id,'inspect');assert.equal(state.women,cap/2);assert.equal(state.men,cap/2);assert.equal(state.waiting,8);
    await action(1,r.id,'cancel');
   }
  });
  await t.test('Premium includes one 20-seat publication per 30 days; changed rights never increase an accepted quote',async()=>{
   await db.exec("delete from private.rate_limits where key_hash like 'social:host-publish:%'");
   await db.query("insert into public.entitlements(user_id,environment,kind,ends_at) values($1,'test','premium',now()+interval '31 days')",[uid(1)]);
   assert.equal((await actor(1,'select public.hosted_room_dashboard()')).includedAvailable,true);
   const a=await save(1);await action(1,a.id,'publish',0);
   assert.equal((await actor(1,'select public.hosted_room_dashboard()')).includedAvailable,false);
   const b=await save(1);await assert.rejects(action(1,b.id,'publish',0),/hosting_price_changed/);
   await action(1,a.id,'cancel');assert.equal((await actor(1,'select public.hosted_room_dashboard()')).includedAvailable,true);
   await db.query('update public.entitlements set revoked_at=now() where user_id=$1',[uid(1)]);
   await assert.rejects(action(1,b.id,'publish',0),/hosting_price_changed/);
   const before=await scalar('select count(*)::int from public.credit_ledger');await assert.rejects(action(2,b.id,'publish',4),/room_unavailable/);assert.equal(await scalar('select count(*)::int from public.credit_ledger'),before);
  });
  await t.test('5000-profile catalog finds items beyond the old first 60 and uses stable small pages',async()=>{
   await db.exec(`insert into public.rooms(title,city,theme_slug,opens_at,closes_at,status) select case when n=4999 then 'Étoile tardive' else 'Rencontre '||n end,'Lyon','culture',now()+interval '1 hour',now()+interval '3 hours','published' from generate_series(1,5000) n;`);
   let cursor=null;const ids=new Set();for(let p=0;p<7;p++){const data=await page(1,{city:'Lyon'},cursor);assert.equal(data.items.length,12);assert.equal(data.hasMore,true);for(const r of data.items){assert.equal(ids.has(r.id),false);ids.add(r.id)}cursor=data.next;}
   assert.equal(ids.size,84);const narrow=await page(1,{q:'etoile',city:'lyon',theme:'culture'});assert.equal(narrow.items.length,1);assert.equal(narrow.items[0].title,'Étoile tardive');assert.equal(narrow.hasMore,false);
   await assert.rejects(page(1,{owner_id:uid(1)}),/invalid_request/);
   await db.exec('set role anon');await assert.rejects(scalar("select public.community_page('rooms')"),/permission denied/);await db.exec('reset role');
  });
  await t.test('read budgets and fresh session checks protect member discovery',async()=>{
   await db.exec("delete from private.rate_limits where key_hash like 'community-read:%'");
   for(let n=0;n<90;n++)await actor(5000,'select public.community_overview()');
   await assert.rejects(actor(5000,'select public.community_overview()'),/rate_limit/);
   assert.equal((await actor(5001,'select public.community_overview()')).memberId,uid(5001));
   await db.query('delete from auth.sessions where user_id=$1',[uid(5001)]);
   await assert.rejects(actor(5001,'select public.hosted_room_dashboard()'),/registration_required/);
  });
  await t.test('exports contain only owned drafts and the member’s own registrations',async()=>{
   const data=await actor(2,'select public.export_hosted_rooms()');assert.equal(data.owned.length,1);assert.ok(data.registrations.every(x=>!Object.hasOwn(x,'user_id')));assert.doesNotMatch(JSON.stringify(data),/Membre|owner_id|share_code/);
  });
  await t.test('identity deletion rebalances guests and never leaves a discoverable orphan salon',async()=>{
   const r=await save(3000,draft(20,{visibility:'public'}));await db.query("insert into public.credit_ledger(user_id,unit,amount,environment,reason,idempotency_key) values($1,'room_host',1,'test','purchase','local-delete-test')",[uid(3000)]);await action(3000,r.id,'publish',1);
   for(const n of [3001,3002,3003,3004])await reg(n,r.id);
   await db.query('delete from auth.sessions where user_id=$1',[uid(3001)]);await db.query('delete from auth.users where id=$1',[uid(3001)]);
   const state=await reg(3002,r.id,'inspect');assert.equal(state.women,1);assert.equal(state.men,1);
   await db.query('delete from auth.sessions where user_id=$1',[uid(3000)]);await db.query('delete from auth.users where id=$1',[uid(3000)]);
   assert.equal(await scalar('select status from public.rooms where id=$1',[r.id]),'cancelled');assert.equal((await page(1,{q:'même fréquence'})).items.some(x=>x.id===r.id),false);
  });
 }finally{await db.close()}
});
