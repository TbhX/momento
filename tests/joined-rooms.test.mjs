import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createSupabaseFixture} from './helpers/supabase-fixture.mjs';
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
for(const kind of ['schemas','migrations'])test('joined rooms are personal, paginated and revocable on '+kind,async()=>{
 const db=await createSupabaseFixture(kind);
 const scalar=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
 async function actor(n,after=null,afterId=null){await db.exec('begin');try{await db.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)",[id(n),JSON.stringify({sub:id(n),session_id:id(n),role:'authenticated'})]);await db.exec('set local role authenticated');const r=await scalar('select public.joined_rooms_page($1,$2)',[after,afterId]);await db.exec('commit');return r}catch(e){await db.exec('rollback');throw e}}
 try{
  const delta=await readFile('supabase/schemas/98_joined_rooms.sql','utf8');await db.exec(delta);await db.exec(delta);
  await db.exec(`insert into auth.users(id) values('${id(1)}'),('${id(2)}'),('${id(3)}');insert into auth.sessions(id,user_id) select id,id from auth.users;
  insert into public.profiles(id,display_name,age,city,terms_version,privacy_version) select id,'Local',30,'Paris','test','test' from auth.users;
  insert into public.rooms(id,title,opens_at,closes_at,status) select ('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'Local room '||n,now()+interval '1 day',now()+interval '2 days','published' from generate_series(100,113) n;
  insert into private.hosted_rooms(room_id,owner_id,draft_key) select id,'${id(3)}',id from public.rooms where title like 'Local room%';
  insert into private.hosted_room_registrations(room_id,user_id,category,status) select room_id,'${id(1)}','woman','confirmed' from private.hosted_rooms where owner_id='${id(3)}';
  insert into private.hosted_room_invites(room_id,user_id) select room_id,'${id(1)}' from private.hosted_rooms where owner_id='${id(3)}';`);
  const first=await actor(1);assert.equal(first.items.length,12);assert.equal(first.hasMore,true);assert.deepEqual(Object.keys(first.items[0]).sort(),['capacity','city','closesAt','id','isTest','opensAt','registration','theme','title'].sort());
  const second=await actor(1,first.next.at,first.next.id);assert.equal(second.items.length,2);assert.equal(second.hasMore,false);assert.equal(new Set([...first.items,...second.items].map(r=>r.id)).size,14);assert.equal((await actor(2)).items.length,0);
  await db.exec(`update private.hosted_room_registrations set status='waiting' where room_id='${id(100)}';update private.hosted_room_registrations set status='cancelled' where room_id='${id(101)}';delete from private.hosted_room_invites where room_id='${id(102)}';update public.rooms set status='cancelled' where id='${id(103)}';`);
  const changed=await actor(1);assert.equal(changed.items.length,11);assert.equal(changed.items[0].registration,'waiting');
  await assert.rejects(actor(1,'infinity',id(100)),/invalid_request/);
  assert.equal(await scalar("select has_function_privilege('anon','public.joined_rooms_page(timestamptz,uuid)','execute')"),false);
  await db.exec(`delete from auth.sessions where user_id='${id(1)}'`);await assert.rejects(actor(1),/registration_required/);
 }finally{await db.close()}
});
