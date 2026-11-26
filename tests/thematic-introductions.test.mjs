import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createSupabaseFixture} from './helpers/supabase-fixture.mjs';
import {fixture,own,A,B,ROOM,CALL,id} from './helpers/readiness-pair.mjs';
import {themeWindow,recordVerifiedStart,planWithIntroductionHistory} from '../development/thematic/rotation.mjs';

test('the hourly label changes on the boundary without creating any encounter',()=>{
 const t=Date.UTC(2026,10,26,20);
 assert.equal(themeWindow('music',t-1).closesAt,themeWindow('music',t).opensAt);
 assert.equal(themeWindow('music',t).key,themeWindow('music',t+3599999).key);
 assert.notEqual(themeWindow('music',t).key,themeWindow('travel',t).key);
 assert.throws(()=>themeWindow('private',t));
});
test('a started pair is excluded across themes and hours; expiry or an unstarted reservation is not an introduction',async()=>{
 const db=await createSupabaseFixture();
 try {
  await db.exec(await readFile('development/thematic/introduced-pairs.sql','utf8'));await fixture(db);await own(db);
  const now=Date.now(),person=(id,gender)=>({id,gender,age:29,checkedInAt:now,preferencesConfirmed:true,sessionActive:true,confirmed:true,active:true,lastMatchedRound:-1,unavailableUntil:0,preferences:{genders:['woman','man'],minAge:18,maxAge:100,intentions:['love'],modes:['audio']}});
  const snapshot={participants:[person(B,'woman'),person(A,'man')],eventId:ROOM,opensAt:now,closesAt:now+3600000,now,capacity:20,roundIndex:0,blockedPairs:[],seenPairs:[]};
  assert.equal((await planWithIntroductionHistory(db,snapshot)).pairs.length,1);
  await db.query("update public.encounters set status='scheduled' where id=$1",[CALL]);
  assert.equal(await recordVerifiedStart(db,CALL),'refused');
  await db.query("update public.encounters set status='live' where id=$1",[CALL]);
  assert.equal(await recordVerifiedStart(db,CALL),'recorded');
  const later=now+3600000,plan=await planWithIntroductionHistory(db,{...snapshot,eventId:id(44),theme:'travel',opensAt:later,closesAt:later+3600000,now:later,participants:snapshot.participants.map(p=>({...p,checkedInAt:later}))});
  assert.equal(plan.pairs.length,0);assert.deepEqual(plan.waiting.map(w=>w.reason),['all_met','all_met']);
  await db.query("insert into public.rooms(id,title,opens_at,closes_at,status) select $1,'Other',opens_at,closes_at,status from public.rooms where id=$2",[id(44),ROOM]);
  await db.query("insert into public.encounters(id,room_id,round_number,user_a,user_b,starts_at,ends_at,status) select $1,$2,0,user_a,user_b,starts_at,ends_at,status from public.encounters where id=$3",[id(45),id(44),CALL]);
  assert.equal(await recordVerifiedStart(db,id(45)),'refused');
  await db.query("update public.encounters set status='ended' where id=$1",[CALL]);
  assert.equal(await recordVerifiedStart(db,CALL),'already_recorded');
  assert.equal((await db.query('select count(*)::int as n from private.introduced_pairs')).rows[0].n,1);
 }finally{await db.close()}
});
