import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createSupabaseFixture} from './helpers/supabase-fixture.mjs';
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const ROOM=id(1000);
const delta=()=>readFile('supabase/migrations/20261117125045_round_assignments.sql','utf8');
const count=async(db,table)=>Number((await db.query('select count(*) as n from '+table)).rows[0].n);
async function setup(db){
 await db.exec(`insert into auth.users(id) select ('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid from generate_series(1,100) n;
 insert into public.profiles(id,display_name,age,city,terms_version,privacy_version) select id,'Local fixture',30,'Paris','test','test' from auth.users;
 insert into public.rooms(id,title,opens_at,closes_at,status) values('${ROOM}','Local only',now(),now()+interval '3 hours','published');`);
}
const add=(db,n,a,b,round=0)=>db.query(`insert into public.encounters(id,room_id,round_number,user_a,user_b,starts_at,ends_at) values($1,$2,$3,$4,$5,now(),now()+interval '5 minutes')`,[id(2000+n),ROOM,round,id(a),id(b)]);
async function rejected(db,fn,pattern){await db.exec('savepoint rejection');try{await assert.rejects(fn,pattern)}finally{await db.exec('rollback to savepoint rejection;release savepoint rejection')}}
for(const kind of ['schemas','migrations'])test('round assignments on '+kind,async t=>{
 const db=await createSupabaseFixture(kind);
 try{
  await setup(db);
  await t.test('capacities 20/50/100 reserve exactly two slots per encounter',async()=>{
   for(const capacity of [20,50,100]){await db.exec('begin');try{for(let n=0;n<capacity/2;n++)await add(db,n,n+1,n+1+capacity/2);assert.equal(await count(db,'private.round_assignments'),capacity)}finally{await db.exec('rollback')}}
  });
  await t.test('overlap on either side fails atomically, cancellation retains slots',async()=>{
   await db.exec('begin');try{
    await add(db,0,2,4);
    for(const [a,b] of [[1,2],[1,4],[2,3],[3,4]])await rejected(db,()=>add(db,1,a,b),/duplicate key/);
    assert.equal(await count(db,'public.encounters'),1);assert.equal(await count(db,'private.round_assignments'),2);
    await db.exec("update public.encounters set status='cancelled'");await rejected(db,()=>add(db,1,1,2),/duplicate key/);
    await add(db,2,1,2,1);assert.equal(await count(db,'private.round_assignments'),4);
    await rejected(db,()=>add(db,3,2,4,2),/duplicate key/); // Event pair history is still unique.
    await rejected(db,()=>db.query('update public.encounters set round_number=3 where id=$1',[id(2000)]),/encounter_assignment_immutable/);
    await rejected(db,()=>db.query('update public.encounters set user_b=$1 where id=$2',[id(5),id(2000)]),/encounter_assignment_immutable/);
    await db.exec('update public.encounters set user_a=user_a');
    await db.exec(await delta());await db.exec(await delta());assert.equal(await count(db,'private.round_assignments'),4);
   }finally{await db.exec('rollback')}
  });
  await t.test('assignment table and trigger function expose no member writer',async()=>{
   for(const role of ['anon','authenticated','service_role']){
    const q=await db.query("select has_table_privilege($1,'private.round_assignments','insert') as ins,has_table_privilege($1,'private.round_assignments','update') as upd,has_table_privilege($1,'private.round_assignments','delete') as del,has_function_privilege($1,'private.reserve_encounter_round()','execute') as run",[role]);assert.deepEqual(q.rows[0],{ins:false,upd:false,del:false,run:false});
   }
   assert.equal((await db.query("select relrowsecurity from pg_class where oid='private.round_assignments'::regclass")).rows[0].relrowsecurity,true);
  });
  await t.test('account deletion removes dependent slots without orphaning encounters',async()=>{
   await db.exec('begin');try{await add(db,0,1,2);await db.query('delete from public.profiles where id=$1',[id(1)]);assert.equal(await count(db,'private.round_assignments'),0);assert.equal(await count(db,'public.encounters'),0)}finally{await db.exec('rollback')}
  });
 }finally{await db.close()}
});
test('migration backfills valid history and refuses conflicting historical assignments',async()=>{
 const db=await createSupabaseFixture('migrations');try{
  await db.exec('drop trigger reserve_encounter_round on public.encounters;drop table private.round_assignments');
  await setup(db);await add(db,0,1,2);
  await db.exec('begin');try{await db.exec(await delta());assert.equal(await count(db,'private.round_assignments'),2);await db.exec(await delta());assert.equal(await count(db,'private.round_assignments'),2)}finally{await db.exec('rollback')}
  await add(db,1,2,3);await db.exec('begin');await assert.rejects(db.exec(await delta()),/duplicate key/);await db.exec('rollback');
  assert.equal((await db.query("select to_regclass('private.round_assignments') as t")).rows[0].t,null);assert.equal(await count(db,'public.encounters'),2);
 }finally{await db.close()}
});
