-- Desired schema for the dedicated Momento project; see migrations for applied history.
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
