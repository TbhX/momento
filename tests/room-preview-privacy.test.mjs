import {test} from 'node:test';import assert from 'node:assert/strict';import {readFile,readdir} from 'node:fs/promises';import {createSupabaseFixture} from './helpers/supabase-fixture.mjs';import {supabaseCommunityAPI} from '../worker/supabase-community.mjs';
const uid=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
for(const kind of ['schemas','migrations'])test('room preview excludes demographics even through the direct RPC using '+kind,async()=>{
 const db=await createSupabaseFixture(kind),scalar=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0]??{})[0];
 async function preview(){await db.exec('begin');try{await db.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)",[uid(1),JSON.stringify({sub:uid(1),session_id:uid(1)})]);await db.exec('set local role authenticated');const rows=(await db.query('select * from public.room_preview($1)',[uid(50)])).rows;await db.exec('commit');return rows}catch(e){await db.exec('rollback');throw e}}
 try{
  for(let n=1;n<=2;n++){await db.query('insert into auth.users(id) values($1)',[uid(n)]);await db.query('insert into auth.sessions(id,user_id) values($1,$1)',[uid(n)]);await db.query("insert into public.profiles(id,display_name,age,city,profession,terms_version,privacy_version) values($1,'Prénom <test>',37,'Ville privée','Métier privé','test','test')",[uid(n)])}
  await db.query("insert into public.rooms(id,title,city,theme_slug,opens_at,closes_at,status) values($1,'Test local','Paris','music',now()-interval '1 hour',now()+interval '1 hour','published')",[uid(50)]);
  const entry=await scalar("insert into public.room_entries(user_id,room_id,request_id,quota_day,admission_type,media_mode) values($1,$2,gen_random_uuid(),current_date,'free','audio') returning id",[uid(2),uid(50)]);await db.query("insert into public.room_presence(user_id,room_id,entry_id,expires_at) values($1,$2,$3,now()+interval '30 minutes')",[uid(2),uid(50),entry]);
  const expected=[{user_id:uid(2),display_name:'Prénom <test>',age:null,city:null,profession:null}];assert.deepEqual(await preview(),expected);
  const delta=await readFile('supabase/migrations/'+(await readdir('supabase/migrations')).find(n=>n.endsWith('_room_preview_privacy.sql')),'utf8');await db.exec(delta);await db.exec(delta);assert.deepEqual(await preview(),expected);
  await db.query('insert into public.blocks(actor_id,target_id) values($1,$2)',[uid(2),uid(1)]);assert.deepEqual(await preview(),[]);await db.exec('delete from public.blocks');
  await db.exec("update public.room_presence set expires_at=now()-interval '1 second'");assert.deepEqual(await preview(),[]);await db.exec("update public.room_presence set expires_at=now()+interval '30 minutes'");
  await db.query('delete from auth.sessions where user_id=$1',[uid(1)]);await assert.rejects(preview(),/registration_required/);
  assert.equal(await scalar("select has_function_privilege('anon','public.room_preview(uuid)','execute')"),false);
 }finally{await db.close()}
});
test('the Worker also allowlists preview fields instead of forwarding unexpected profile data',async()=>{
 const result=await supabaseCommunityAPI(new Request('https://momento.example/api/service/rooms/'+uid(50)+'/preview'),{}, {context:{supabase:{rpc:async()=>({data:[{user_id:uid(2),display_name:'Prénom',age:37,city:'Private',profession:'Private',email:'private',photo:'private'}]})}}});assert.deepEqual(await result.json(),{people:[{user_id:uid(2),display_name:'Prénom'}]});
});
