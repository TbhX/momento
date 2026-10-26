import {test} from 'node:test';import assert from 'node:assert/strict';import {readFile,readdir} from 'node:fs/promises';import {createSupabaseFixture} from './helpers/supabase-fixture.mjs';
const id='00000000-0000-4000-8000-000000000001',peer='00000000-0000-4000-8000-000000000002';
for(const kind of ['schemas','migrations'])test('MFA guards direct data, admin RPCs and revoked sessions using '+kind,async()=>{
 const db=await createSupabaseFixture(kind);const value=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0]||{})[0];
 async function actor(aal,sql,args=[],session=id){await db.exec('begin');try{await db.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)",[id,JSON.stringify({sub:id,session_id:session,...(aal?{aal}:{})})]);await db.exec('set local role authenticated');const r=await value(sql,args);await db.exec('commit');return r}catch(e){await db.exec('rollback');throw e}}
 try{
  for(const u of [id,peer]){await db.query('insert into auth.users(id) values($1)',[u]);await db.query('insert into auth.sessions(id,user_id) values($1,$1)',[u]);await db.query("insert into public.profiles(id,display_name,age,city,terms_version,privacy_version) values($1,'Fixture',30,'Paris','test','test')",[u])}
  assert.equal(await actor('aal1','select private.has_active_session()'),true);
  await db.query("insert into private.admin_roles(user_id,role) values($1,'admin')",[id]);
  await assert.rejects(actor('aal2','select public.admin_test_access()'),/mfa_enrollment_required/);
  await db.query("insert into auth.mfa_factors(id,user_id,status) values($1,$1,'unverified')",[id]);assert.equal(await actor('aal1','select private.has_active_session()'),true);
  await db.query("update auth.mfa_factors set status='verified' where user_id=$1",[id]);
  for(const aal of ['aal1',null,'forged']){assert.equal(await actor(aal,'select private.has_active_session()'),false);assert.equal(await actor(aal,'select count(*)::int from public.profiles'),0);await assert.rejects(actor(aal,'select public.admin_test_access()'),/admin_required/);await assert.rejects(actor(aal,"select public.save_profile('Fixture',30,'Paris',true,true)"),/authentication_required/)}
  assert.equal(await actor('aal2','select private.has_active_session()'),true);assert.equal(await actor('aal2','select count(*)::int from public.profiles'),1);assert.equal(await actor('aal2','select public.admin_test_access()'),true);assert.equal(await actor('aal2','select private.has_active_session()',[],peer),false);
  // Delta can be applied twice without changing policies or privileges.
  const delta=await readFile('supabase/migrations/'+(await readdir('supabase/migrations')).find(n=>n.endsWith('_mfa_guards.sql')),'utf8');await db.exec(delta);await db.exec(delta);
  await db.query('delete from auth.sessions where id=$1',[id]);assert.equal(await actor('aal2','select private.has_active_session()'),false);
  assert.equal(await value("select has_function_privilege('anon','public.admin_test_access()','execute')"),false);
 }finally{await db.close()}
});
