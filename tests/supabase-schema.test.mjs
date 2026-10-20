import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

const migrations=(await readdir('supabase/migrations')).filter(name=>name.endsWith('.sql')).sort().map(name=>'supabase/migrations/'+name);
for(const [label,sources] of [
 ['declarative schema',['supabase/schemas/00_tables.sql','supabase/schemas/10_access.sql']],
 ['versioned migrations',migrations]
])test(`Supabase ${label} enforces ownership, billing isolation, room quotas, credits, Premium and blocking`,async()=>{
 const db=new PGlite();
 try{
  // Emulate only the platform objects used by the application. No real account,
  // credential or external Supabase project is touched by this integration test.
  await db.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
   create schema auth; create table auth.users(id uuid primary key,email text);
   create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid; $$;
   grant usage on schema auth to anon,authenticated,service_role;`);
  assert.ok(sources.length>0,'A reproducible schema source is required');
  for(const path of [...sources,'supabase/seed.sql'])await db.exec(await readFile(path,'utf8'));
  await db.exec(await readFile('supabase/tests/access.sql','utf8'));
  assert.equal((await db.query('select count(*)::int as n from auth.users')).rows[0].n,0);
  assert.equal((await db.query('select admissions_enabled from private.runtime_settings')).rows[0].admissions_enabled,false);
 }finally{await db.close();}
});
