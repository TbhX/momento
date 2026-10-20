-- A signed access JWT alone is insufficient after logout/deletion. This helper
-- checks the actual session, binding its id to the authenticated user's id.
create function private.has_active_session() returns boolean language sql stable security definer set search_path = '' as $$
 select (select auth.uid()) is not null and exists(select 1 from auth.sessions s
  where s.user_id=(select auth.uid()) and s.id=case
   when (select auth.jwt()->>'session_id') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
   then (select auth.jwt()->>'session_id')::uuid else null end
  and (s.not_after is null or s.not_after>now()));
$$;
revoke execute on function private.has_active_session() from public,anon,authenticated;


create or replace function private.is_active_member() returns boolean language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null and private.has_active_session() and exists(select 1 from public.profiles where id = (select auth.uid()) and status = 'active');
$$;

create or replace function private.leave_room() returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not private.has_active_session() then raise exception 'authentication_required' using errcode = '42501'; end if;
  update public.room_presence set active = false where user_id = auth.uid();
end $$;

-- Service-only RPCs run as the invoker. Neither anon nor members can call them.
-- The application server uses a separate modern secret key, never a user cookie.
grant usage on schema auth to service_role;
grant select(id,user_id,not_after) on auth.sessions to service_role;

create function public.server_session_active(p_user uuid,p_session uuid) returns boolean
language sql stable security invoker set search_path = '' as $$
 select exists(select 1 from auth.sessions s where s.id=p_session and s.user_id=p_user
  and (s.not_after is null or s.not_after>now()));
$$;

create function public.server_auth_attempt(p_key text,p_expires_at timestamptz) returns integer
language plpgsql security invoker set search_path = '' as $$
declare attempts integer;
begin
 if p_key is null or p_key not like 'auth:%' or length(p_key)>256 or p_expires_at is null
  or p_expires_at<=now() or p_expires_at>now()+interval '3 days' then
  raise exception 'invalid_counter' using errcode='22023';
 end if;
 insert into private.rate_limits(key_hash,count,expires_at) values(p_key,1,p_expires_at)
 on conflict(key_hash) do update set count=least(private.rate_limits.count+1,1000000)
 returning count into attempts;
 delete from private.rate_limits where key_hash in
  (select key_hash from private.rate_limits where expires_at<now() order by expires_at limit 500);
 return attempts;
end $$;

create function public.server_recovery_claim(p_key text,p_expires_at timestamptz,p_release boolean default false) returns boolean
language plpgsql security invoker set search_path = '' as $$
begin
 if p_key is null or p_key not like 'auth:recovery-use:%' or length(p_key)>256 or p_expires_at is null
  or p_expires_at<=now() or p_expires_at>now()+interval '16 minutes' then
  raise exception 'invalid_claim' using errcode='22023';
 end if;
 if p_release then delete from private.rate_limits where key_hash=p_key; return true; end if;
 insert into private.rate_limits(key_hash,count,expires_at) values(p_key,1,p_expires_at) on conflict do nothing;
 return found;
end $$;

create function public.server_begin_account_deletion(p_user uuid) returns void
language plpgsql security invoker set search_path = '' as $$
begin
 update public.profiles set status='deleted' where id=p_user;
 update public.room_presence set active=false where user_id=p_user;
end $$;

revoke execute on function public.server_session_active(uuid,uuid),public.server_auth_attempt(text,timestamptz),
 public.server_recovery_claim(text,timestamptz,boolean),public.server_begin_account_deletion(uuid) from public,anon,authenticated;
grant execute on function public.server_session_active(uuid,uuid),public.server_auth_attempt(text,timestamptz),
 public.server_recovery_claim(text,timestamptz,boolean),public.server_begin_account_deletion(uuid) to service_role;

create function private.save_profile(p_name text,p_age integer,p_city text,p_adult boolean,p_storage boolean) returns public.profiles
language plpgsql security definer set search_path = '' as $$
declare actor uuid:=auth.uid(); saved public.profiles;
begin
 if actor is null or not private.has_active_session() then raise exception 'authentication_required' using errcode='42501'; end if;
 if p_adult is distinct from true or p_storage is distinct from true or p_name is null or p_city is null
  or length(btrim(p_name)) not between 1 and 30 or length(btrim(p_city)) not between 1 and 70
  or p_age is null or p_age not between 18 and 100 then
  raise exception 'invalid_registration' using errcode='22023';
 end if;
 insert into public.profiles(id,display_name,age,city,terms_version,privacy_version)
 values(actor,btrim(p_name),p_age,btrim(p_city),'beta-rules-2026-10-20','2026-10-20')
 on conflict(id) do update set display_name=excluded.display_name,age=excluded.age,city=excluded.city
 where profiles.status='active' returning * into saved;
 if not found then raise exception 'account_suspended' using errcode='42501'; end if;
 insert into public.preferences(user_id) values(actor) on conflict do nothing;
 if not exists(select 1 from public.consents where user_id=actor and kind='privacy' and version='2026-10-20' and withdrawn_at is null) then
  insert into public.consents(user_id,kind,version) values(actor,'privacy','2026-10-20');
 end if;
 return saved;
end $$;

create function private.commit_profile_media(p_kind text,p_path text) returns text
language plpgsql security definer set search_path = '' as $$
declare actor uuid:=auth.uid(); previous_path text;
begin
 if actor is null or not private.has_active_session() then raise exception 'authentication_required' using errcode='42501'; end if;
 perform 1 from public.profiles where id=actor and status='active' for update;
 if not found then raise exception 'registration_required' using errcode='42501'; end if;
 if p_kind is null or p_kind not in ('avatar','video_background') or
  (p_path is not null and p_path !~ ('^'||actor::text||'/'||p_kind||'-[0-9a-f-]{36}\.jpg$')) then
  raise exception 'invalid_media_path' using errcode='22023';
 end if;
 select object_path into previous_path from public.profile_media where user_id=actor and kind=p_kind;
 if p_path is null then delete from public.profile_media where user_id=actor and kind=p_kind;
 else insert into public.profile_media(user_id,kind,object_path,updated_at) values(actor,p_kind,p_path,clock_timestamp())
  on conflict(user_id,kind) do update set object_path=excluded.object_path,updated_at=excluded.updated_at;
 end if;
 if p_kind='video_background' then
  update public.preferences set video_background=case when p_path is not null then 'custom' when video_background='custom' then 'none' else video_background end,
   updated_at=clock_timestamp() where user_id=actor;
 end if;
 return previous_path;
end $$;

create function private.peer_photo_path(p_encounter uuid) returns text
language plpgsql stable security definer set search_path = '' as $$
declare actor uuid:=auth.uid(); peer uuid; encounter public.encounters; path text;
begin
 if actor is null or not private.is_active_member() then raise exception 'registration_required' using errcode='42501'; end if;
 select * into encounter from public.encounters where id=p_encounter and (user_a=actor or user_b=actor);
 if not found or encounter.status='cancelled' then return null; end if;
 peer:=case when encounter.user_a=actor then encounter.user_b else encounter.user_a end;
 if private.is_blocked(peer) or not exists(select 1 from public.profiles where id=peer and status='active') then return null; end if;
 if not(encounter.status='live' and encounter.starts_at<=now() and encounter.ends_at>now()) and not exists
  (select 1 from public.matches where encounter_id=p_encounter and user_a=encounter.user_a and user_b=encounter.user_b and (expires_at is null or expires_at>now())) then return null; end if;
 select object_path into path from public.profile_media where user_id=peer and kind='avatar';
 return path;
end $$;

create function private.account_status() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare actor uuid:=auth.uid(); premium boolean;
begin
 if actor is null or not private.is_active_member() then raise exception 'registration_required' using errcode='42501'; end if;
 premium:=private.has_premium();
 return jsonb_build_object('admin',exists(select 1 from private.admin_roles where user_id=actor and role='admin'),
  'premium',premium,'unlimited',premium,'dailyLimit',case when premium then null else 1 end,
  'used',(select count(*) from public.room_entries where user_id=actor and admission_type='free' and quota_day=(now() at time zone 'Europe/Paris')::date),
  'bookingLimit',case when premium then 3 else 1 end,
  'premiumUntil',(select max(e.ends_at) from public.entitlements e join private.runtime_settings s on e.environment=s.billing_environment where e.user_id=actor and e.revoked_at is null and e.starts_at<=now() and e.ends_at>now()),
  'serverNow',floor(extract(epoch from now())*1000),'dataSource','supabase');
end $$;

create function public.save_profile(p_name text,p_age integer,p_city text,p_adult boolean,p_storage boolean) returns public.profiles
language sql security invoker set search_path = '' as $$ select private.save_profile(p_name,p_age,p_city,p_adult,p_storage); $$;
create function public.commit_profile_media(p_kind text,p_path text) returns text
language sql security invoker set search_path = '' as $$ select private.commit_profile_media(p_kind,p_path); $$;
create function public.peer_photo_path(p_encounter uuid) returns text
language sql stable security invoker set search_path = '' as $$ select private.peer_photo_path(p_encounter); $$;
create function public.account_status() returns jsonb language sql stable security invoker set search_path = '' as $$ select private.account_status(); $$;
revoke execute on function private.save_profile(text,integer,text,boolean,boolean),private.commit_profile_media(text,text),private.peer_photo_path(uuid),
 private.account_status(),public.save_profile(text,integer,text,boolean,boolean),public.commit_profile_media(text,text),public.peer_photo_path(uuid),public.account_status() from public,anon,authenticated;
grant execute on function private.save_profile(text,integer,text,boolean,boolean),private.commit_profile_media(text,text),private.peer_photo_path(uuid),
 private.account_status(),public.save_profile(text,integer,text,boolean,boolean),public.commit_profile_media(text,text),public.peer_photo_path(uuid),public.account_status() to authenticated;

grant execute on function private.has_active_session() to authenticated;
-- Restrictive policies also protect direct Data API calls with a copied JWT.
-- Existing ownership policies continue to decide which rows a member may see.
do $$ declare t record; begin
 for t in select tablename from pg_tables where schemaname='public' loop
  execute format('create policy active_session_required on public.%I as restrictive for all to authenticated using ((select private.has_active_session())) with check ((select private.has_active_session()))',t.tablename);
 end loop;
end $$;

-- Uploads/deletions use the application server after JPEG cleaning; members
-- may download only their current referenced files, never abandoned uploads.
create policy momento_media_own_read on storage.objects for select to authenticated using(
 bucket_id='momento-media' and (select private.is_active_member()) and exists
 (select 1 from public.profile_media m where m.user_id=(select auth.uid()) and m.object_path=name));
