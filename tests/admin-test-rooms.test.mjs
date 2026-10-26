import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createSupabaseFixture} from './helpers/supabase-fixture.mjs';
const uid=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
for(const kind of ['schemas','migrations'])test('admin test publication is private, free and cannot admit real calls using '+kind,async()=>{
 const db=await createSupabaseFixture(kind);
 const scalar=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0]??{})[0];
 async function actor(n,sql,args=[]){await db.exec('begin');try{const id=uid(n);await db.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)",[id,JSON.stringify({sub:id,session_id:id,role:'authenticated',aal:'aal2',user_metadata:{role:'admin'}})]);await db.exec('set local role authenticated');const r=await scalar(sql,args);await db.exec('commit');return r}catch(e){await db.exec('rollback');throw e}}
 const save=n=>actor(n,'select public.save_hosted_room($1,$2)',[{title:'Un salon de test',theme:'music',city:'Paris',capacity:20,minAge:18,maxAge:100,opensAt:new Date(Date.now()+86400000).toISOString(),modes:['audio','video'],color:'duo',visibility:'public'},crypto.randomUUID()]);
 const publish=(n,id)=>actor(n,'select public.admin_publish_test_room($1)',[id]);
 try{
  for(let n=1;n<=4;n++){await db.query('insert into auth.users(id) values($1)',[uid(n)]);await db.query('insert into auth.sessions(id,user_id) values($1,$1)',[uid(n)]);await db.query("insert into public.profiles(id,display_name,age,city,gender,terms_version,privacy_version) values($1,'Personne fictive',30,'Paris',$2,'test','test')",[uid(n),n%2?'woman':'man'])}
  await db.query("insert into private.admin_roles(user_id,role) values($1,'admin'),($2,'moderator')",[uid(1),uid(2)]);
  await db.query("insert into auth.mfa_factors(id,user_id,status) values($1,$1,'verified'),($2,$2,'verified')",[uid(1),uid(2)]);
  const room=await save(1),other=await save(3);
  assert.equal((await actor(1,'select public.hosted_room_dashboard()')).adminTestPublishing,true);
  for(const n of [2,3])await assert.rejects(publish(n,other.id),/admin_required/);
  await assert.rejects(publish(1,other.id),/room_unavailable/);
  await db.exec("update private.runtime_settings set billing_environment='live'");await assert.rejects(publish(1,room.id),/test_environment_required/);await db.exec("update private.runtime_settings set billing_environment='test'");
  await db.query('update private.admin_roles set setup_required=true where user_id=$1',[uid(1)]);await assert.rejects(publish(1,room.id),/admin_required/);await db.query('update private.admin_roles set setup_required=false where user_id=$1',[uid(1)]);
  await db.query('delete from auth.sessions where user_id=$1',[uid(1)]);await assert.rejects(publish(1,room.id),/admin_required/);await db.query('insert into auth.sessions(id,user_id) values($1,$1)',[uid(1)]);
  const published=await publish(1,room.id);assert.equal(published.isTest,true);assert.equal(published.visibility,'link');assert.equal(published.chargedCredits,0);assert.equal((await publish(1,room.id)).reused,true);
  assert.equal(await scalar('select count(*)::int from public.credit_ledger'),0);assert.equal(await scalar('select admissions_enabled from private.runtime_settings'),false);assert.equal(await scalar('select enabled from private.hosting_settings'),false);
  await assert.rejects(actor(3,'select public.hosted_room_action($1,\'publish\',4)',[other.id]),/hosting_disabled/);
  await db.exec('set role service_role');const card=await scalar('select public.server_shared_room($1)',[published.shareCode]);await db.exec('reset role');assert.equal(card.isTest,true);assert.doesNotMatch(JSON.stringify(card),/owner_id|user_id|shareCode/);
  for(const n of [3,4]){await actor(n,"select public.register_hosted_room(null,'resolve',$1)",[published.shareCode]);await actor(n,"select public.register_hosted_room($1,'reserve',null)",[room.id])}
  assert.equal((await actor(3,"select public.register_hosted_room($1,'inspect',null)",[room.id])).registration,'confirmed');
  await db.exec("update private.runtime_settings set admissions_enabled=true;update private.hosting_settings set enabled=true");
  assert.equal(await actor(3,'select private.hosted_room_admission($1)',[room.id]),false);assert.equal(await scalar('select count(*)::int from public.room_entries'),0);
  await db.query("insert into public.entitlements(user_id,environment,kind,ends_at) values($1,'test','premium',now()+interval '1 day')",[uid(1)]);assert.equal((await actor(1,'select public.hosted_room_dashboard()')).includedAvailable,true);
  await db.query('delete from private.admin_roles where user_id=$1',[uid(1)]);await db.exec('set role service_role');assert.equal(await scalar('select public.server_shared_room($1)',[published.shareCode]),null);await db.exec('reset role');await assert.rejects(actor(4,"select public.register_hosted_room(null,'resolve',$1)",[published.shareCode]),/room_unavailable/);
  assert.equal(await scalar("select count(*)::int from private.admin_audit where action='test_room_published'"),1);
 }finally{await db.close()}
});
