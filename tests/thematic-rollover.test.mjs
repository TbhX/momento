import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createSupabaseFixture} from './helpers/supabase-fixture.mjs';
import {fixture,own,A,B,C,ROOM,CALL,scalar} from './helpers/readiness-pair.mjs';
import {recordVerifiedStart} from '../development/thematic/rotation.mjs';
import {readThematicVisit} from '../development/thematic/visit.mjs';

test('a running pair and waiting visitor keep their admission across the Paris 21:00 boundary',async()=>{
 const db=await createSupabaseFixture();
 try{
  await fixture(db);await own(db);await db.exec(await readFile('development/thematic/introduced-pairs.sql','utf8'));
  // Simulate the trusted transport acknowledgement while the fixture encounter is live.
  assert.equal(await recordVerifiedStart(db,CALL),'recorded');
  const hour=Date.parse('2026-11-26T21:00:00+01:00'),at=delta=>new Date(hour+delta);
  await db.query("update public.rooms set theme_slug='music',opens_at=$1,closes_at=$2 where id=$3",[at(-3600000),at(3600000),ROOM]);
  await db.query("insert into public.room_entries(id,user_id,room_id,request_id,quota_day,admission_type,media_mode) values($1,$1,$2,$1,current_date,'free','audio')",[C,ROOM]);
  await db.query('update public.room_entries set created_at=$1',[at(-90000)]);
  await db.query('insert into public.room_presence(user_id,room_id,entry_id,expires_at) values($1,$2,$1,$3)',[C,ROOM,at(30000)]);
  await db.query('update public.room_presence set expires_at=$1',[at(30000)]);
  await db.query('update public.encounters set starts_at=$1,ends_at=$2 where id=$3',[at(-60000),at(240000),CALL]);
  for(const [user,position,encounter] of [[A,null,CALL],[B,null,CALL],[C,1,null]]){
   const read=now=>readThematicVisit(db,{entryId:user,roomId:ROOM,now});
   const before=await read(hour-1),after=await read(hour);
   assert.notEqual(before.window.key,after.window.key);
   for(const v of [before,after]){assert.equal(v.entryId,user);assert.equal(v.encounterId,encounter);assert.equal(v.queuePosition,position);assert.equal(v.endsAt,encounter?hour+240000:null)}
   assert.equal(await read(hour+30000),null,'expired presence is never renewed by the rollover');
  }
  const readA=()=>readThematicVisit(db,{entryId:A,roomId:ROOM,now:hour});
  await db.query('update public.room_presence set active=false where user_id=$1',[B]);
  assert.equal((await readA()).encounterId,null);
  assert.equal((await readA()).queuePosition,1);
  await db.query('update public.room_presence set active=true,expires_at=$2 where user_id=$1',[B,at(0)]);
  assert.equal((await readA()).encounterId,null,'peer heartbeat expired');
  await db.query('update public.room_presence set expires_at=$2 where user_id=$1',[B,at(30000)]);
  for(const pair of [[A,B],[B,A]]){
   await db.query('insert into public.blocks(actor_id,target_id) values($1,$2)',pair);
   assert.equal((await readA()).encounterId,null);
   await db.query('delete from public.blocks where actor_id=$1 and target_id=$2',pair);
  }
  assert.equal(Number(await scalar(db,'select count(*) from private.introduced_pairs')),1);
  assert.equal(Number(await scalar(db,'select count(*) from public.room_entries')),3);
  assert.equal(Number(await scalar(db,'select count(*) from public.credit_ledger')),0);
 }finally{await db.close()}
});
