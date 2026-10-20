-- Desired state for a NEW, dedicated Momento project. Not applied remotely yet.
-- Auth identities belong to auth.users; no password, email or video token here.
create schema if not exists private;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (length(btrim(display_name)) between 1 and 60),
  age smallint not null check (age between 18 and 100),
  city text not null check (length(btrim(city)) between 1 and 100),
  profession text not null default '' check (length(profession) <= 120),
  bio text not null default '' check (length(bio) <= 1000),
  gender text not null default 'unspecified' check (gender in ('woman','man','nonbinary','other','unspecified')),
  status text not null default 'active' check (status in ('active','suspended','deleted')),
  adult_confirmed_at timestamptz not null default now(),
  terms_version text not null check (length(terms_version) between 1 and 64),
  privacy_version text not null check (length(privacy_version) between 1 and 64),
  created_at timestamptz not null default now()
);
create index profiles_discovery on public.profiles(city, age) where status = 'active';

create table public.preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  min_age smallint not null default 18 check (min_age between 18 and 100),
  max_age smallint not null default 100 check (max_age between 18 and 100 and max_age >= min_age),
  cities text[] not null default '{}', professions text[] not null default '{}',
  music_genres text[] not null default '{}', zodiac_signs text[] not null default '{}',
  genders text[] not null default '{}',
  media_mode text not null default 'video' check (media_mode in ('audio','video')),
  video_background text not null default 'none' check (video_background in ('none','blur','rose','night','studio','custom')),
  updated_at timestamptz not null default now(),
  check (cardinality(cities) <= 30 and cardinality(professions) <= 30 and cardinality(music_genres) <= 30 and cardinality(zodiac_signs) <= 12 and cardinality(genders) <= 5)
);
create table public.themes (slug text primary key, label text not null, active boolean not null default true);
create table public.profile_themes (
  user_id uuid not null references public.profiles(id) on delete cascade,
  theme_slug text not null references public.themes(slug), primary key(user_id, theme_slug)
);
create index profile_themes_theme on public.profile_themes(theme_slug, user_id);

create table public.rooms (
  id uuid primary key default gen_random_uuid(), title text not null check (length(title) between 1 and 120),
  theme_slug text references public.themes(slug), city text not null default 'France', profession text,
  min_age smallint not null default 18, max_age smallint not null default 100,
  capacity smallint not null default 20 check (capacity between 2 and 20),
  round_seconds integer not null default 300 check (round_seconds between 60 and 1800),
  break_seconds integer not null default 30 check (break_seconds between 0 and 300),
  allowed_modes text[] not null default array['audio','video']::text[],
  status text not null default 'draft' check (status in ('draft','published','live','ended','cancelled')),
  opens_at timestamptz not null, closes_at timestamptz not null,
  created_at timestamptz not null default now(),
  check (min_age >= 18 and max_age <= 100 and max_age >= min_age and closes_at > opens_at),
  check (cardinality(allowed_modes) > 0 and allowed_modes <@ array['audio','video']::text[])
);
create index rooms_discovery on public.rooms(status, opens_at, city, min_age, max_age);
create index rooms_theme on public.rooms(theme_slug);

create table public.room_entries (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
  room_id uuid not null references public.rooms(id), request_id uuid not null,
  quota_day date not null, admission_type text not null check (admission_type in ('free','credit','premium')),
  media_mode text not null check (media_mode in ('audio','video')), created_at timestamptz not null default now(),
  unique(user_id, request_id), unique(id, user_id, room_id)
);
create unique index room_entries_one_free_daily on public.room_entries(user_id, quota_day) where admission_type = 'free';
create index room_entries_room on public.room_entries(room_id, created_at);
create table public.room_presence (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  room_id uuid not null references public.rooms(id), entry_id uuid not null,
  active boolean not null default true, expires_at timestamptz not null,
  foreign key(entry_id, user_id, room_id) references public.room_entries(id, user_id, room_id) on delete cascade
);
create index room_presence_capacity on public.room_presence(room_id, expires_at) where active;
create index room_presence_entry on public.room_presence(entry_id, user_id, room_id);

create table public.encounters (
  id uuid primary key default gen_random_uuid(), room_id uuid not null references public.rooms(id),
  round_number integer not null check (round_number >= 0),
  user_a uuid not null references public.profiles(id) on delete cascade,
  user_b uuid not null references public.profiles(id) on delete cascade,
  starts_at timestamptz not null, ends_at timestamptz not null,
  status text not null default 'scheduled' check (status in ('scheduled','live','ended','cancelled')),
  check (user_a < user_b and ends_at > starts_at), unique(room_id, user_a, user_b)
);
create index encounters_a on public.encounters(user_a, starts_at);
create index encounters_b on public.encounters(user_b, starts_at);
create table public.encounter_votes (
  encounter_id uuid not null references public.encounters(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  interested boolean not null, created_at timestamptz not null default now(), primary key(encounter_id, user_id)
);
create index encounter_votes_user on public.encounter_votes(user_id);
create table public.matches (
  id uuid primary key default gen_random_uuid(), encounter_id uuid unique references public.encounters(id) on delete cascade,
  user_a uuid not null references public.profiles(id) on delete cascade,
  user_b uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(), expires_at timestamptz, check(user_a < user_b)
);
create index matches_a on public.matches(user_a, created_at);
create index matches_b on public.matches(user_b, created_at);
create table public.friend_requests (
  id uuid primary key default gen_random_uuid(), sender_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check(status in ('pending','accepted','declined','cancelled')),
  created_at timestamptz not null default now(), check(sender_id <> recipient_id)
);
create unique index friend_requests_pending on public.friend_requests(least(sender_id,recipient_id),greatest(sender_id,recipient_id)) where status = 'pending';
create index friend_requests_sender on public.friend_requests(sender_id, created_at);
create index friend_requests_recipient on public.friend_requests(recipient_id, created_at);
create table public.friendships (
  user_a uuid not null references public.profiles(id) on delete cascade,
  user_b uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(), primary key(user_a,user_b), check(user_a < user_b)
);
create index friendships_b on public.friendships(user_b);
create table public.video_requests (
  id uuid primary key default gen_random_uuid(), sender_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  media_mode text not null check(media_mode in ('audio','video')),
  status text not null default 'pending' check(status in ('pending','accepted','declined','cancelled','live','ended')),
  credit_consumed_at timestamptz, starts_at timestamptz, expires_at timestamptz not null,
  created_at timestamptz not null default now(), check(sender_id <> recipient_id)
);
create index video_requests_sender on public.video_requests(sender_id, created_at);
create index video_requests_recipient on public.video_requests(recipient_id, created_at);
create table public.blocks (
  actor_id uuid not null references public.profiles(id) on delete cascade,
  target_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(), primary key(actor_id,target_id), check(actor_id <> target_id)
);
create index blocks_target on public.blocks(target_id, actor_id);
create table public.reports (
  id uuid primary key default gen_random_uuid(), reporter_id uuid references public.profiles(id) on delete set null,
  target_id uuid references public.profiles(id) on delete set null,
  encounter_id uuid references public.encounters(id) on delete set null,
  reason text not null check(length(reason) between 1 and 1000),
  status text not null default 'open' check(status in ('open','reviewing','resolved','dismissed')),
  created_at timestamptz not null default now()
);
create index reports_reporter on public.reports(reporter_id, created_at);
create index reports_target on public.reports(target_id);
create index reports_encounter on public.reports(encounter_id);
create table public.messages (
  id uuid primary key default gen_random_uuid(), match_id uuid not null references public.matches(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check(length(body) between 1 and 2000), created_at timestamptz not null default now()
);
create index messages_match on public.messages(match_id, created_at);
create index messages_sender on public.messages(sender_id);

create table public.products (
  sku text primary key, label text not null, kind text not null check(kind in ('premium','room_entry','video_call')),
  interval_unit text check(interval_unit in ('week','month','year')), price_cents integer not null check(price_cents >= 0),
  currency text not null default 'eur' check(currency = 'eur'), active boolean not null default false,
  check((kind = 'premium') = (interval_unit is not null))
);
create table public.orders (
  id uuid primary key default gen_random_uuid(), user_id uuid references public.profiles(id) on delete set null,
  sku text not null references public.products(sku), environment text not null default 'test' check(environment in ('test','live')),
  amount_cents integer not null check(amount_cents >= 0), currency text not null default 'eur' check(currency = 'eur'),
  stripe_session_id text, state text not null default 'pending' check(state in ('pending','paid','cancelled','refunded','failed')),
  refunded_cents integer not null default 0 check(refunded_cents between 0 and amount_cents),
  created_at timestamptz not null default now(), unique(environment,stripe_session_id)
);
create index orders_user on public.orders(user_id, created_at);
create index orders_sku on public.orders(sku);
create table public.entitlements (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
  environment text not null default 'test' check(environment in ('test','live')),
  kind text not null check(kind = 'premium'), starts_at timestamptz not null default now(), ends_at timestamptz not null,
  revoked_at timestamptz, cancel_at_period_end boolean not null default false,
  order_id uuid references public.orders(id), stripe_subscription_id text,
  check(ends_at > starts_at), unique(environment,stripe_subscription_id)
);
create index entitlements_user on public.entitlements(user_id, environment, ends_at);
create index entitlements_order on public.entitlements(order_id);
create table public.credit_ledger (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
  unit text not null check(unit in ('room_entry','video_call')), amount integer not null check(amount <> 0),
  environment text not null default 'test' check(environment in ('test','live')),
  reason text not null check(reason in ('purchase','consume','refund','promotion')),
  idempotency_key text not null unique, order_id uuid references public.orders(id),
  entry_id uuid references public.room_entries(id), created_at timestamptz not null default now()
);
create index credit_ledger_balance on public.credit_ledger(user_id, environment, unit);
create index credit_ledger_order on public.credit_ledger(order_id);
create index credit_ledger_entry on public.credit_ledger(entry_id);
create table public.profile_media (
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check(kind in ('avatar','video_background')), object_path text not null unique,
  updated_at timestamptz not null default now(), primary key(user_id,kind)
);
create table public.consents (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check(kind in ('terms','privacy','sensitive_matching','marketing')),
  version text not null, given_at timestamptz not null default now(), withdrawn_at timestamptz
);
create index consents_user on public.consents(user_id, kind, given_at);

create table private.admin_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check(role in ('admin','moderator')), granted_at timestamptz not null default now()
);
create table private.payment_events (
  environment text not null check(environment in ('test','live')), stripe_event_id text not null,
  processed_at timestamptz not null default now(), primary key(environment,stripe_event_id)
);
create table private.admin_audit (
  id uuid primary key default gen_random_uuid(), actor_id uuid references auth.users(id) on delete set null,
  action text not null, target_ref text not null, created_at timestamptz not null default now()
);
create index admin_audit_actor on private.admin_audit(actor_id, created_at);
create table private.rate_limits (key_hash text primary key, count integer not null default 0 check(count >= 0), expires_at timestamptz not null);
create index rate_limits_expiry on private.rate_limits(expires_at);
create table private.runtime_settings (
  singleton boolean primary key default true check(singleton),
  billing_environment text not null default 'test' check(billing_environment in ('test','live')),
  admissions_enabled boolean not null default false
);


-- All privileged functions are private, use an empty search_path and derive
-- the actor from auth.uid(). No authorization depends on user_metadata.
create function private.is_active_member() returns boolean language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null and exists(select 1 from public.profiles where id = (select auth.uid()) and status = 'active');
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
  if auth.uid() is null then raise exception 'authentication_required' using errcode = '42501'; end if;
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
