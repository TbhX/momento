import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

// Only local platform stand-ins; never connect tests to a hosted database.
export async function createSupabaseFixture(kind='schemas'){
 const db=new PGlite();
 try{
  await db.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
   create schema auth; create table auth.users(id uuid primary key,email text);
   create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id),not_after timestamptz);
   create table auth.mfa_factors(id uuid primary key,user_id uuid references auth.users(id),status text,factor_type text default 'totp');
   create schema storage; create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
   alter table storage.objects enable row level security;
   grant usage on schema storage to anon,authenticated,service_role;
   grant select,insert,update,delete on storage.objects to anon,authenticated,service_role;
   create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid; $$;
   create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb; $$;
   grant usage on schema auth to anon,authenticated,service_role;`);
  for(const file of (await readdir('supabase/'+kind)).filter(x=>x.endsWith('.sql')).sort())await db.exec(await readFile('supabase/'+kind+'/'+file,'utf8'));
  await db.exec(await readFile('supabase/seed.sql','utf8'));
  return db;
 }catch(error){await db.close();throw error;}
}
