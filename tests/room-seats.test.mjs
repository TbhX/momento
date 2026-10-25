import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createSupabaseFixture} from './helpers/supabase-fixture.mjs';
const uid=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
for(const kind of ['schemas','migrations'])test('aggregate seats distinguish reservations, presence and waiting using '+kind,async()=>{
 const db=await createSupabaseFixture(kind),scalar=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0]??{})[0];
 async function actor(sql,args=[]){await db.exec('begin');try{await db.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)",[uid(1),JSON.stringify({sub:uid(1),session_id:uid(1),role:'authenticated'})]);await db.exec('set local role authenticated');const v=await scalar(sql,args);await db.exec('commit');return v}catch(e){await db.exec('rollback');throw e}}
 try{
  const delta=(await readFile(new URL('../supabase/schemas/95_room_capacity.sql',import.meta.url),'utf8')).replaceAll('create function','create or replace function');
  await db.exec(delta);await db.exec(delta); // Local replay only; hosted migrations are never replayed.
  for(let n=1;n<=6;n++){await db.query('insert into auth.users(id) values($1)',[uid(n)]);await db.query('insert into auth.sessions(id,user_id) values($1,$1)',[uid(n)]);await db.query("insert into public.profiles(id,display_name,age,city,gender,terms_version,privacy_version) values($1,'Fictif',30,'Paris',$2,'test','test')",[uid(n),n%2?'woman':'man'])}
  for(const capacity of [20,50,100]){
   const room=await scalar("insert into public.rooms(title,city,theme_slug,capacity,opens_at,closes_at,status) values('Table locale','Paris','music',$1,now()-interval '1 minute',now()+interval '1 hour','published') returning id",[capacity]);
   await db.query("insert into private.hosted_rooms(room_id,owner_id,draft_key,visibility) values($1,$2,gen_random_uuid(),'public')",[room,uid(2)]);
   for(const n of [3,4,5])await db.query("insert into private.hosted_room_registrations(room_id,user_id,category,status) values($1,$2,$3,$4)",[room,uid(n),n%2?'woman':'man',n===5?'waiting':'confirmed']);
   let [s]=await actor('select public.room_seat_snapshots($1)',[[room]]);assert.equal(s.capacity,capacity);assert.equal(s.women,1);assert.equal(s.men,1);assert.equal(s.expected,2);assert.equal(s.present,0);assert.equal(s.waiting,1);assert.equal(s.balanced,true);assert.equal(capacity/2-s.women,capacity/2-1);
   const entry=await scalar("insert into public.room_entries(user_id,room_id,request_id,quota_day,admission_type,media_mode) values($1,$2,gen_random_uuid(),current_date,'free','audio') returning id",[uid(3),room]);
   await db.query("insert into public.room_presence(user_id,room_id,entry_id,expires_at) values($1,$2,$3,now()+interval '1 minute')",[uid(3),room,entry]);
   [s]=await actor('select public.room_seat_snapshots($1)',[[room]]);assert.equal(s.present,1);assert.equal(s.womenPresent,1);assert.equal(s.expected,1);assert.equal(s.women,1,'presence does not consume another reserved seat');
   await db.query("update public.room_presence set expires_at=now()-interval '1 second' where room_id=$1",[room]);
   [s]=await actor('select public.room_seat_snapshots($1)',[[room]]);assert.equal(s.present,0);assert.equal(s.expected,2);assert.equal(s.women,1,'disconnection does not cancel reservation');
   await db.query("update private.hosted_room_registrations set status='cancelled' where room_id=$1 and user_id=$2",[room,uid(3)]);
   [s]=await actor('select public.room_seat_snapshots($1)',[[room]]);assert.equal(s.women,0);assert.equal(s.expected,1);
   await db.query("update private.hosted_rooms set visibility='link' where room_id=$1",[room]);assert.deepEqual(await actor('select public.room_seat_snapshots($1)',[[room]]),[]);
   await db.query('delete from public.room_presence where room_id=$1',[room]);await db.query('delete from public.room_entries where room_id=$1',[room]);
  }
  const legacy=await scalar("insert into public.rooms(title,city,theme_slug,opens_at,closes_at,status) values('Ancien format','Paris','music',now(),now()+interval '1 hour','published') returning id");
  const [old]=await actor('select public.room_seat_snapshots($1)',[[legacy]]);assert.equal(old.balanced,false);assert.equal(old.women,null);assert.equal(old.expected,null);
  await assert.rejects(actor('select public.room_seat_snapshots($1)',[Array(13).fill(legacy)]),/invalid_request/);
  assert.equal(await scalar("select has_function_privilege('anon','public.room_seat_snapshots(uuid[])','execute')"),false);
  assert.ok(!JSON.stringify(old).match(/user_id|owner_id|display_name|session/));
  await db.query('delete from auth.sessions where user_id=$1',[uid(1)]);await assert.rejects(actor('select public.room_seat_snapshots($1)',[[legacy]]),/registration_required/);
 }finally{await db.close()}
});
