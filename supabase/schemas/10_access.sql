-- All privileged functions are private, use an empty search_path and derive
-- the actor from auth.uid(). No authorization depends on user_metadata.
create function private.is_active_member() returns boolean language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null and private.has_active_session() and exists(select 1 from public.profiles where id = (select auth.uid()) and status = 'active');
$$;
create function private.is_blocked(other_id uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null and exists(select 1 from public.blocks where
    (actor_id = (select auth.uid()) and target_id = other_id) or (target_id = (select auth.uid()) and actor_id = other_id));
$$;
create function private.has_premium() returns boolean language sql stable security definer set search_path = '' as $$
  select private.is_active_member() and exists(select 1 from public.entitlements e join private.runtime_settings s
    on s.billing_environment = e.environment where e.user_id = (select auth.uid()) and e.kind = 'premium'
    and e.starts_at <= now() and e.ends_at > now() and e.revoked_at is null);
$$;

-- Generate RLS and explicit grants for these dedicated application schemas.
-- PUBLIC/anon/authenticated never receive a default privilege on new objects.
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke execute on functions from public, anon, authenticated;
alter default privileges for role postgres in schema private revoke all on tables from public, anon, authenticated;
alter default privileges for role postgres in schema private revoke execute on functions from public, anon, authenticated;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated, service_role;
grant usage on schema public to authenticated, service_role;
do $$ declare t record; begin
  for t in select schemaname, tablename from pg_tables where schemaname in ('public','private') loop
    execute format('alter table %I.%I enable row level security', t.schemaname, t.tablename);
    execute format('revoke all on table %I.%I from public, anon, authenticated', t.schemaname, t.tablename);
    execute format('grant all on table %I.%I to service_role', t.schemaname, t.tablename);
  end loop;
end $$;
revoke execute on all functions in schema private from public, anon, authenticated;
grant execute on function private.is_active_member(), private.is_blocked(uuid), private.has_premium() to authenticated;

create policy profile_own_read on public.profiles for select to authenticated using(id = (select auth.uid()));
create policy profile_own_insert on public.profiles for insert to authenticated with check(id = (select auth.uid()) and status = 'active' and adult_confirmed_at <= now());
create policy profile_own_update on public.profiles for update to authenticated using(id = (select auth.uid()) and status = 'active') with check(id = (select auth.uid()) and status = 'active');
grant select on public.profiles to authenticated;
grant insert(id,display_name,age,city,profession,bio,gender,terms_version,privacy_version) on public.profiles to authenticated;
grant update(display_name,age,city,profession,bio,gender) on public.profiles to authenticated;
create policy preferences_own_read on public.preferences for select to authenticated using(user_id = (select auth.uid()));
create policy preferences_own_insert on public.preferences for insert to authenticated with check(user_id = (select auth.uid()) and (select private.is_active_member()));
create policy preferences_own_update on public.preferences for update to authenticated using(user_id = (select auth.uid()) and (select private.is_active_member())) with check(user_id = (select auth.uid()) and (select private.is_active_member()));
grant select,insert,update on public.preferences to authenticated;
create policy themes_member_read on public.themes for select to authenticated using(active and (select private.is_active_member()));
grant select on public.themes to authenticated;
create policy profile_themes_own on public.profile_themes for all to authenticated using(user_id = (select auth.uid()) and (select private.is_active_member())) with check(user_id = (select auth.uid()) and (select private.is_active_member()));
grant select,insert,delete on public.profile_themes to authenticated;
create policy rooms_member_read on public.rooms for select to authenticated using(status in ('published','live') and (select private.is_active_member()));
grant select on public.rooms to authenticated;
create policy blocks_own_read on public.blocks for select to authenticated using(actor_id = (select auth.uid()));
create policy blocks_own_insert on public.blocks for insert to authenticated with check(actor_id = (select auth.uid()) and (select private.is_active_member()));
create policy blocks_own_delete on public.blocks for delete to authenticated using(actor_id = (select auth.uid()) and (select private.is_active_member()));
grant select,delete on public.blocks to authenticated;
grant insert(actor_id,target_id) on public.blocks to authenticated;

-- Writes involving quotas, money, scheduling or moderation go through a
-- validated server operation. A browser cannot mint Premium, credits or matches.
create policy entries_own_read on public.room_entries for select to authenticated using(user_id = (select auth.uid()));
create policy presence_own_read on public.room_presence for select to authenticated using(user_id = (select auth.uid()));
create policy votes_own_read on public.encounter_votes for select to authenticated using(user_id = (select auth.uid()));
create policy orders_own_read on public.orders for select to authenticated using(user_id = (select auth.uid()));
create policy entitlements_own_read on public.entitlements for select to authenticated using(user_id = (select auth.uid()));
create policy credits_own_read on public.credit_ledger for select to authenticated using(user_id = (select auth.uid()));
create policy media_own_read on public.profile_media for select to authenticated using(user_id = (select auth.uid()));
create policy consents_own_read on public.consents for select to authenticated using(user_id = (select auth.uid()));
create policy reports_own_read on public.reports for select to authenticated using(reporter_id = (select auth.uid()));
create policy products_member_read on public.products for select to authenticated using(active and (select private.is_active_member()));
grant select on public.room_entries,public.room_presence,public.encounter_votes,public.orders,public.entitlements,public.credit_ledger,public.profile_media,public.consents,public.reports,public.products to authenticated;

create policy encounters_participant_read on public.encounters for select to authenticated using(
  (select private.is_active_member()) and status <> 'cancelled' and
  (((select auth.uid()) = user_a and not private.is_blocked(user_b)) or ((select auth.uid()) = user_b and not private.is_blocked(user_a))));
create policy matches_participant_read on public.matches for select to authenticated using(
  (select private.is_active_member()) and (expires_at is null or expires_at > now()) and
  (((select auth.uid()) = user_a and not private.is_blocked(user_b)) or ((select auth.uid()) = user_b and not private.is_blocked(user_a))));
create policy friendships_participant_read on public.friendships for select to authenticated using(
  (select private.is_active_member()) and (((select auth.uid()) = user_a and not private.is_blocked(user_b)) or ((select auth.uid()) = user_b and not private.is_blocked(user_a))));
create policy friend_requests_participant_read on public.friend_requests for select to authenticated using(
  (select private.is_active_member()) and (((select auth.uid()) = sender_id and not private.is_blocked(recipient_id)) or ((select auth.uid()) = recipient_id and not private.is_blocked(sender_id))));
create policy video_requests_participant_read on public.video_requests for select to authenticated using(
  (select private.is_active_member()) and (((select auth.uid()) = sender_id and not private.is_blocked(recipient_id)) or ((select auth.uid()) = recipient_id and not private.is_blocked(sender_id))));
create policy messages_match_read on public.messages for select to authenticated using(exists(
  select 1 from public.matches m where m.id = match_id));
grant select on public.encounters,public.matches,public.friendships,public.friend_requests,public.video_requests,public.messages to authenticated;

create function private.enter_room(p_room uuid, p_mode text, p_request uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); room public.rooms; prior public.room_entries; entry public.room_entries;
  today date := (now() at time zone 'Europe/Paris')::date; kind text; billing_env text; enabled boolean; balance bigint;
begin
  if actor is null or not private.is_active_member() then raise exception 'registration_required' using errcode = '42501'; end if;
  if p_request is null or p_mode not in ('audio','video') or p_mode is null then raise exception 'invalid_request' using errcode = '22023'; end if;
  -- Lock the member before every quota/balance check; concurrent requests serialize.
  perform 1 from public.profiles where id = actor and status = 'active' for update;
  if not found then raise exception 'registration_required' using errcode = '42501'; end if;
  select * into prior from public.room_entries where user_id = actor and request_id = p_request;
  if found then
    if prior.room_id <> p_room or prior.media_mode <> p_mode then raise exception 'request_conflict' using errcode = '22023'; end if;
    return jsonb_build_object('entry_id',prior.id,'admission_type',prior.admission_type,'reused',true);
  end if;
  select billing_environment,admissions_enabled into billing_env,enabled from private.runtime_settings where singleton;
  if enabled is distinct from true then raise exception 'admissions_disabled' using errcode = '42501'; end if;
  select * into room from public.rooms where id = p_room for update;
  if not found or room.status not in ('published','live') or room.opens_at > now() or room.closes_at <= now() then raise exception 'room_unavailable' using errcode = '22023'; end if;
  if not p_mode = any(room.allowed_modes) then raise exception 'media_mode_unavailable' using errcode = '22023'; end if;
  if not exists(select 1 from public.profiles where id = actor and age between room.min_age and room.max_age) then raise exception 'age_not_eligible' using errcode = '42501'; end if;
  if exists(select 1 from public.room_presence where user_id = actor and active and expires_at > now()) then raise exception 'already_in_room' using errcode = '22023'; end if;
  if (select count(*) from public.room_presence where room_id = p_room and active and expires_at > now()) >= room.capacity then raise exception 'room_full' using errcode = '22023'; end if;
  if private.has_premium() then kind := 'premium';
  elsif not exists(select 1 from public.room_entries where user_id = actor and quota_day = today and admission_type = 'free') then kind := 'free';
  else
    select coalesce(sum(amount),0) into balance from public.credit_ledger where user_id = actor and unit = 'room_entry' and credit_ledger.environment = billing_env;
    if balance <= 0 then raise exception 'daily_limit_reached' using errcode = '42501'; end if;
    kind := 'credit';
  end if;
  insert into public.room_entries(user_id,room_id,request_id,quota_day,admission_type,media_mode)
    values(actor,p_room,p_request,today,kind,p_mode) returning * into entry;
  if kind = 'credit' then
    insert into public.credit_ledger(user_id,unit,amount,environment,reason,idempotency_key,entry_id)
    values(actor,'room_entry',-1,billing_env,'consume','entry:'||entry.id::text,entry.id);
  end if;
  insert into public.room_presence(user_id,room_id,entry_id,active,expires_at) values(actor,p_room,entry.id,true,now()+interval '2 minutes')
    on conflict(user_id) do update set room_id = excluded.room_id, entry_id = excluded.entry_id, active = true, expires_at = excluded.expires_at;
  return jsonb_build_object('entry_id',entry.id,'admission_type',kind,'reused',false);
end $$;
create function private.leave_room() returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not private.has_active_session() then raise exception 'authentication_required' using errcode = '42501'; end if;
  update public.room_presence set active = false where user_id = auth.uid();
end $$;
create function private.heartbeat_room(p_entry uuid) returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not private.is_active_member() then return false; end if;
  update public.room_presence p set expires_at = now()+interval '2 minutes' from public.rooms r
    where p.user_id = auth.uid() and p.entry_id = p_entry and p.active and p.expires_at > now()
    and r.id = p.room_id and r.status in ('published','live') and r.closes_at > now();
  return found;
end $$;
create function private.room_preview(p_room uuid) returns table(user_id uuid,display_name text,age smallint,city text,profession text)
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not private.is_active_member() then raise exception 'registration_required' using errcode = '42501'; end if;
  return query select p.id,p.display_name,p.age,p.city,p.profession from public.room_presence s
    join public.rooms r on r.id = s.room_id join public.profiles p on p.id = s.user_id
    where r.id = p_room and r.status in ('published','live') and r.closes_at > now() and s.active and s.expires_at > now()
    and p.status = 'active' and not private.is_blocked(p.id) order by p.id limit 20;
end $$;

-- Public wrappers are SECURITY INVOKER. The private implementations enforce
-- caller identity and own no caller-supplied administrator/user_id parameter.
create function public.enter_room(p_room uuid,p_mode text,p_request uuid) returns jsonb language sql security invoker set search_path = '' as $$ select private.enter_room(p_room,p_mode,p_request); $$;
create function public.leave_room() returns void language sql security invoker set search_path = '' as $$ select private.leave_room(); $$;
create function public.heartbeat_room(p_entry uuid) returns boolean language sql security invoker set search_path = '' as $$ select private.heartbeat_room(p_entry); $$;
create function public.room_preview(p_room uuid) returns table(user_id uuid,display_name text,age smallint,city text,profession text) language sql security invoker set search_path = '' as $$ select * from private.room_preview(p_room); $$;
revoke execute on function private.enter_room(uuid,text,uuid),private.leave_room(),private.heartbeat_room(uuid),private.room_preview(uuid) from public,anon,authenticated;
revoke execute on function public.enter_room(uuid,text,uuid),public.leave_room(),public.heartbeat_room(uuid),public.room_preview(uuid) from public,anon,authenticated;
grant execute on function private.enter_room(uuid,text,uuid),private.leave_room(),private.heartbeat_room(uuid),private.room_preview(uuid) to authenticated;
grant execute on function public.enter_room(uuid,text,uuid),public.leave_room(),public.heartbeat_room(uuid),public.room_preview(uuid) to authenticated;
