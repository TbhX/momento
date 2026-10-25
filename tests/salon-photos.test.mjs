import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createSupabaseFixture} from './helpers/supabase-fixture.mjs';
const uid=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
for(const kind of ['schemas','migrations'])test('salon photos require native Premium, visible room and active unblocked presence using '+kind,async()=>{
 const db=await createSupabaseFixture(kind),scalar=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0]??{})[0];
 async function actor(n,sql,args=[]){await db.exec('begin');try{await db.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)",[uid(n),JSON.stringify({sub:uid(n),session_id:uid(n),role:'authenticated',user_metadata:{premium:true,role:'admin'}})]);await db.exec('set local role authenticated');const v=await scalar(sql,args);await db.exec('commit');return v}catch(e){await db.exec('rollback');throw e}}
 try{
  for(let n=1;n<=3;n++){await db.query('insert into auth.users(id) values($1)',[uid(n)]);await db.query('insert into auth.sessions(id,user_id) values($1,$1)',[uid(n)]);await db.query("insert into public.profiles(id,display_name,age,city,terms_version,privacy_version) values($1,'Profil fictif',30,'Paris','test','test')",[uid(n)])}
  const room=await scalar("insert into public.rooms(title,city,theme_slug,opens_at,closes_at,status) values('Salon local','Paris','music',now()-interval '1 hour',now()+interval '1 hour','published') returning id");
  const entry=await scalar("insert into public.room_entries(user_id,room_id,request_id,quota_day,admission_type,media_mode) values($1,$2,gen_random_uuid(),current_date,'free','audio') returning id",[uid(2),room]);await db.query("insert into public.room_presence(user_id,room_id,entry_id,expires_at) values($1,$2,$3,now()+interval '30 minutes')",[uid(2),room,entry]);
  const path=uid(2)+'/avatar-'+uid(99)+'.jpg';await db.query("insert into public.profile_media(user_id,kind,object_path) values($1,'avatar',$2)",[uid(2),path]);
  const photo=()=>actor(1,'select public.room_photo_path($1,$2)',[room,uid(2)]);
  assert.equal(await photo(),null);assert.equal(await scalar("select has_function_privilege('anon','public.room_photo_path(uuid,uuid)','execute')"),false);
  await db.query("insert into public.entitlements(user_id,environment,kind,ends_at) values($1,'test','premium',now()+interval '1 day')",[uid(1)]);assert.equal(await photo(),path);
  await db.query("update public.entitlements set starts_at=now()-interval '2 days',ends_at=now()-interval '1 second' where user_id=$1",[uid(1)]);assert.equal(await photo(),null);await db.query("update public.entitlements set ends_at=now()+interval '1 day',revoked_at=now() where user_id=$1",[uid(1)]);assert.equal(await photo(),null);await db.exec('update public.entitlements set revoked_at=null');
  await db.query('insert into public.blocks(actor_id,target_id) values($1,$2)',[uid(2),uid(1)]);assert.equal(await photo(),null);await db.exec('delete from public.blocks');
  await db.query("update public.room_presence set active=false where user_id=$1",[uid(2)]);assert.equal(await photo(),null);await db.exec('update public.room_presence set active=true');
  await db.query("update public.profiles set status='suspended' where id=$1",[uid(2)]);assert.equal(await photo(),null);await db.exec("update public.profiles set status='active'");
  await db.query("insert into private.hosted_rooms(room_id,owner_id,draft_key,visibility) values($1,$2,gen_random_uuid(),'link')",[room,uid(3)]);assert.equal(await photo(),null);
  await db.exec('delete from private.hosted_rooms');await db.query('delete from auth.sessions where user_id=$1',[uid(1)]);await assert.rejects(photo(),/registration_required/);
 }finally{await db.close()}
});
