import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createSupabaseFixture} from './helpers/supabase-fixture.mjs';

const uuid=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const A=uuid(1),B=uuid(2),C=uuid(3),ROOM=uuid(10),ENCOUNTER=uuid(20),KEY=uuid(30);
const owner=db=>db.exec('reset role');
async function member(db,id){await owner(db);await db.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)",[id,JSON.stringify({sub:id,session_id:id,role:'authenticated',user_metadata:{premium:true,role:'admin'}})]);await db.exec('set local role authenticated');}
const scalar=async(db,sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
const rpc=(db,name,args=[])=>scalar(db,'select public.'+name+'('+args.map((_,i)=>'$'+(i+1)).join(',')+')',args);
async function fixture(db){
 await db.exec('begin');
 await db.exec(`insert into auth.users(id) values('${A}'),('${B}'),('${C}');
  insert into auth.sessions(id,user_id,not_after) select id,id,clock_timestamp()+interval '1 hour' from auth.users;
  insert into public.profiles(id,display_name,age,city,terms_version,privacy_version) select id,'Fixture',28,'Paris','test','test' from auth.users;
  update private.runtime_settings set admissions_enabled=true;
  update private.call_extension_settings set enabled=true;
  insert into public.rooms(id,title,opens_at,closes_at,status) values('${ROOM}','Local test',clock_timestamp()-interval '1 hour',clock_timestamp()+interval '1 hour','live');
  insert into public.room_entries(id,user_id,room_id,request_id,quota_day,admission_type,media_mode)
    select id,id,'${ROOM}',id,current_date,'free','video' from auth.users where id in ('${A}','${B}');
  insert into public.room_presence(user_id,room_id,entry_id,expires_at) select id,'${ROOM}',id,clock_timestamp()+interval '2 minutes' from auth.users where id in ('${A}','${B}');
  insert into public.encounters(id,room_id,round_number,user_a,user_b,starts_at,ends_at,status)
    values('${ENCOUNTER}','${ROOM}',0,'${A}','${B}',clock_timestamp()-interval '4 minutes',clock_timestamp()+interval '1 minute','live');
  insert into public.credit_ledger(user_id,unit,amount,reason,idempotency_key) values('${A}','video_call',2,'promotion','fixture-a'),('${B}','video_call',2,'promotion','fixture-b');`);
 await member(db,A);await rpc(db,'vote_encounter',[ENCOUNTER,true]);
 await member(db,B);assert.equal((await rpc(db,'vote_encounter',[ENCOUNTER,true])).matched,true);
 await member(db,A);
}
const propose=(db,key=KEY,max=1)=>rpc(db,'propose_call_extension',[ENCOUNTER,key,max]);
const answer=(db,q,action='accept')=>rpc(db,'answer_call_extension',[q.id,action]);
const balance=async(db,id)=>{await owner(db);return Number(await scalar(db,"select coalesce(sum(amount),0) from public.credit_ledger where user_id=$1 and unit='video_call' and environment='test'",[id]));};
async function denied(db,fn,message){
 await db.exec('savepoint denied');
 try{await assert.rejects(fn,e=>e.message===message);}finally{await db.exec('rollback to savepoint denied; release savepoint denied');}
}

const cases=[
 ['a single yes stays private and no match or paid request can be forged',async db=>{
  await member(db,B);assert.deepEqual(await rpc(db,'vote_encounter',[ENCOUNTER,false]),{interested:false,matched:false});
  await member(db,A);await denied(db,()=>propose(db),'match_required');
  await member(db,C);await denied(db,()=>rpc(db,'vote_encounter',[ENCOUNTER,true]),'encounter_unavailable');
  await owner(db);assert.equal(Number(await scalar(db,'select count(*) from private.call_extensions')),0);
 }],
 ['only the requester spends once after acceptance, with a separate three minute call',async db=>{
  const before=await scalar(db,'select ends_at from public.encounters where id=$1',[ENCOUNTER]);
  const q=await propose(db);assert.equal(q.status,'pending');assert.equal(q.chargedCredits,0);
  assert.equal(await balance(db,A),2);assert.equal(await balance(db,B),2);
  await member(db,A);assert.equal((await propose(db)).id,q.id);
  await denied(db,()=>answer(db,q),'request_unavailable');
  await member(db,B);const accepted=await answer(db,q);assert.equal(accepted.status,'accepted');assert.equal(accepted.chargedCredits,1);assert.equal(accepted.mediaEnabled,false);
  const repeat=await answer(db,q);assert.equal(repeat.status,'accepted');assert.equal(repeat.reused,true);assert.equal(repeat.callId,accepted.callId);assert.equal(repeat.endsAt,accepted.endsAt);
  assert.equal(await balance(db,A),1);assert.equal(await balance(db,B),2);
  assert.deepEqual(await scalar(db,'select ends_at from public.encounters where id=$1',[ENCOUNTER]),before);
  assert.equal(Number(await scalar(db,'select count(*) from public.room_presence where active')),0);
  assert.equal(Number(await scalar(db,'select count(*) from private.extended_calls')),1);
  assert.equal(Number(await scalar(db,'select extract(epoch from ends_at-starts_at) from private.extended_calls')),180);
  assert.equal(Number(await scalar(db,"select count(*) from public.credit_ledger where reason='consume'")),1);
  await db.query("insert into public.credit_ledger(user_id,unit,amount,reason,idempotency_key) values($1,'room_entry',1,'promotion','fixture-entry-b')",[B]);
  await member(db,B);await denied(db,()=>rpc(db,'enter_room',[ROOM,'video',uuid(70)]),'already_in_private_call');
  await rpc(db,'close_extended_call',[accepted.callId]);await rpc(db,'close_extended_call',[accepted.callId]);
  assert.equal((await rpc(db,'call_extension_state',[ENCOUNTER])).call.active,false);
 }],
 ['reverse offers debit their own payer and never the invited account',async db=>{
  await member(db,B);const q=await propose(db);await member(db,A);await answer(db,q);
  assert.equal(await balance(db,B),1);assert.equal(await balance(db,A),2);
 }],
 ['decline, cancellation and opposite simultaneous offers cannot settle',async db=>{
  const q=await propose(db);await member(db,B);
  await denied(db,()=>propose(db,uuid(31)),'request_conflict');
  await denied(db,()=>answer(db,q,'cancel'),'request_unavailable');
  assert.equal((await answer(db,q,'decline')).status,'declined');
  assert.equal((await answer(db,q)).status,'declined');
  await member(db,A);const again=await propose(db,uuid(31));assert.equal((await answer(db,again,'cancel')).status,'cancelled');
  assert.equal(await balance(db,A),2);assert.equal(await balance(db,B),2);
 }],
 ['an expired response is terminal and never consumes a credit',async db=>{
  const q=await propose(db);await owner(db);
  await db.query("update private.call_extensions set authorized_at=clock_timestamp()-interval '40 seconds',expires_at=clock_timestamp()-interval '1 second' where id=$1",[q.id]);
  await member(db,B);assert.equal((await rpc(db,'call_extension_state',[ENCOUNTER])).request.status,'expired');
  const result=await answer(db,q);assert.equal(result.status,'expired');assert.equal(result.chargedCredits,0);
  assert.equal(await balance(db,A),2);
 }],
 ['Premium is checked for the payer and its loss cannot increase an authorized cost',async db=>{
  await owner(db);await db.query("insert into public.entitlements(user_id,kind,ends_at) values($1,'premium',clock_timestamp()+interval '1 day')",[A]);
  await member(db,A);const q=await propose(db,KEY,0);assert.equal(q.quotedCredits,0);
  await owner(db);await db.query('update public.entitlements set revoked_at=clock_timestamp() where user_id=$1',[A]);
  await member(db,B);const result=await answer(db,q);assert.equal(result.status,'cancelled');assert.equal(result.reason,'authorization_required');
  assert.equal(await balance(db,A),2);
 }],
 ['Premium acceptance is free for both and does not extend the collective round',async db=>{
  await owner(db);await db.query("insert into public.entitlements(user_id,kind,ends_at) values($1,'premium',clock_timestamp()+interval '1 day')",[B]);
  await member(db,B);const q=await propose(db,KEY,0);await member(db,A);assert.equal((await answer(db,q)).chargedCredits,0);
  assert.equal(await balance(db,A),2);assert.equal(await balance(db,B),2);
 }],
 ['a lost credit cannot trigger a purchase or use the invited balance',async db=>{
  const q=await propose(db);await owner(db);await db.query('delete from public.credit_ledger where user_id=$1',[A]);
  await member(db,B);const result=await answer(db,q);assert.equal(result.reason,'credit_required');assert.equal(result.status,'cancelled');
  assert.equal(await balance(db,A),0);assert.equal(await balance(db,B),2);
  assert.equal(Number(await scalar(db,'select count(*) from public.orders')),0);
  assert.equal(Number(await scalar(db,'select count(*) from private.extended_calls')),0);
 }],
 ['departure cancels pending consent and blocks stale acceptance',async db=>{
  const q=await propose(db);await rpc(db,'leave_room');await member(db,B);
  assert.equal((await answer(db,q)).status,'cancelled');assert.equal(await balance(db,A),2);
 }],
 ['presence expiry and requester logout are rechecked before settlement',async db=>{
  const q=await propose(db);await owner(db);await db.query('delete from auth.sessions where user_id=$1',[A]);
  await member(db,B);const result=await answer(db,q);assert.equal(result.status,'cancelled');assert.equal(result.reason,'peer_unavailable');assert.equal(await balance(db,A),2);
 }],
 ['a dead presence lease cannot be renewed into an authorized extension',async db=>{
  const q=await propose(db);await owner(db);await db.query("update public.room_presence set expires_at=clock_timestamp()-interval '1 second' where user_id=$1",[A]);
  await member(db,B);assert.equal((await answer(db,q)).status,'cancelled');assert.equal(await balance(db,A),2);
 }],
 ['blocking and suspension close pending offers without spending',async db=>{
  const q=await propose(db);await member(db,B);await rpc(db,'block_peer',[A,null]);assert.equal((await answer(db,q)).status,'cancelled');
  assert.equal(await balance(db,A),2);
  await db.exec('delete from public.blocks');await member(db,A);const again=await propose(db,uuid(31));
  await owner(db);await db.query("update public.profiles set status='suspended' where id=$1",[A]);
  await member(db,B);assert.equal((await answer(db,again)).status,'cancelled');assert.equal(await balance(db,A),2);
 }],
 ['accepted calls stop when a participant is blocked',async db=>{
  const q=await propose(db);await member(db,B);await answer(db,q);await rpc(db,'block_peer',[A,null]);
  await owner(db);assert.ok(await scalar(db,'select closed_at is not null from private.extended_calls'));
  assert.equal(await balance(db,A),1);
 }],
 ['a changed billing environment cannot spend credits from either environment',async db=>{
  const q=await propose(db);await owner(db);await db.exec("update private.runtime_settings set billing_environment='live'");
  await member(db,B);assert.equal((await answer(db,q)).reason,'environment_changed');assert.equal(await balance(db,A),2);
 }],
 ['closed service gates cannot be bypassed by calling the database directly',async db=>{
  await owner(db);await db.exec('update private.call_extension_settings set enabled=false');await member(db,A);
  await denied(db,()=>propose(db),'call_extensions_disabled');
  await owner(db);await db.exec('update private.call_extension_settings set enabled=true; update private.runtime_settings set admissions_enabled=false');await member(db,A);
  await denied(db,()=>propose(db),'call_extensions_disabled');
 }],
 ['closing the service while an offer waits cancels acceptance without a debit',async db=>{
  const q=await propose(db);await owner(db);await db.exec('update private.call_extension_settings set enabled=false');
  await member(db,B);const result=await answer(db,q);assert.equal(result.status,'cancelled');assert.equal(result.reason,'call_extensions_disabled');
  assert.equal(await balance(db,A),2);assert.equal(await balance(db,B),2);
 }],
 ['private tables, helper functions and other encounters are inaccessible',async db=>{
  const q=await propose(db);
  await denied(db,()=>db.query('select * from private.call_extensions'),'permission denied for table call_extensions');
  await denied(db,()=>db.query('select private.lock_call_encounter($1)',[ENCOUNTER]),'permission denied for function lock_call_encounter');
  await member(db,C);await denied(db,()=>answer(db,q),'request_unavailable');
  await denied(db,()=>rpc(db,'call_extension_state',[ENCOUNTER]),'encounter_unavailable');
  assert.deepEqual(await rpc(db,'export_call_extensions'),[]);
  await member(db,A);const exported=await rpc(db,'export_call_extensions');assert.equal(exported.length,1);assert.doesNotMatch(JSON.stringify(exported),/requester_session|session_id|request_key/);
  await db.exec('set local role anon');await denied(db,()=>propose(db),'permission denied for function propose_call_extension');
 }],
 ['no-match, stale-round and withdrawn votes cannot authorize an extension',async db=>{
  const q=await propose(db);await member(db,B);await rpc(db,'vote_encounter',[ENCOUNTER,false]);assert.equal((await answer(db,q)).status,'cancelled');
  await owner(db);await db.exec("update public.encounters set status='cancelled'");await member(db,A);
  await denied(db,()=>propose(db,uuid(31)),'encounter_unavailable');assert.equal(await balance(db,A),2);
 }],
 ['the response window is capped by rotation and stale deadlines cannot settle',async db=>{
  await owner(db);await db.exec("update public.encounters set ends_at=clock_timestamp()-interval '25 seconds'");
  await member(db,A);const q=await propose(db);const responseMs=new Date(q.expiresAt)-new Date(q.authorizedAt);assert.ok(responseMs>0&&responseMs<=5000);
  await owner(db);await db.exec("update public.encounters set ends_at=clock_timestamp()-interval '31 seconds'");
  await member(db,B);assert.equal((await answer(db,q)).status,'cancelled');assert.equal(await balance(db,A),2);
 }],
 ['a newer rotation invalidates a request for the previous participant',async db=>{
  const q=await propose(db);await owner(db);
  await db.exec(`insert into public.encounters(room_id,round_number,user_a,user_b,starts_at,ends_at,status) values('${ROOM}',1,'${A}','${C}',clock_timestamp()-interval '1 second',clock_timestamp()+interval '5 minutes','live')`);
  await member(db,B);assert.equal((await answer(db,q)).status,'cancelled');assert.equal(await balance(db,A),2);
 }],
 ['cancelling a room ends an accepted private call without a second charge',async db=>{
  const q=await propose(db);await member(db,B);await answer(db,q);await owner(db);await db.exec("update public.rooms set status='cancelled'");
  assert.ok(await scalar(db,'select closed_at is not null from private.extended_calls'));assert.equal(await balance(db,A),1);
 }]
];

for(const kind of ['schemas','migrations'])test('conditional call extensions using '+kind,async t=>{
 const db=await createSupabaseFixture(kind);
 try{for(const [name,run] of cases)await t.test(name,async()=>{
  await fixture(db);try{await run(db);}finally{await db.exec('rollback');}
 });}finally{await db.close();}
});
