-- Generated from the desired schema. Local schema-diff tooling requires unavailable Docker.
-- Both canonical and full migration replay are tested with isolated Postgres fixtures.


alter table public.rooms drop constraint rooms_capacity_check;
alter table public.rooms add constraint rooms_capacity_check check(capacity between 2 and 100);
alter table public.products drop constraint products_kind_check;
alter table public.products add constraint products_kind_check check(kind in ('premium','room_entry','video_call','room_host'));
alter table public.credit_ledger drop constraint credit_ledger_unit_check;
alter table public.credit_ledger add constraint credit_ledger_unit_check check(unit in ('room_entry','video_call','room_host'));


-- Member-hosted events. Private ownership, invitations and queues are never
-- exposed as a public directory. Publication and media admission stay closed.
create table private.hosting_settings (
 singleton boolean primary key default true check(singleton), enabled boolean not null default false
);
create table private.hosted_rooms (
 room_id uuid primary key references public.rooms(id) on delete cascade,
 owner_id uuid not null references public.profiles(id) on delete cascade,
 draft_key uuid not null, description text not null default '' check(length(description)<=500),
 color text not null default 'duo' check(color in ('duo','rose','blue','lavender')),
 visibility text not null default 'link' check(visibility in ('public','link')),
 share_code uuid not null unique default gen_random_uuid(),
 created_at timestamptz not null default now(), published_at timestamptz,
 environment text not null default 'test' check(environment in ('test','live')),
 charged_credits integer not null default 0 check(charged_credits in (0,1,2,4)), refunded_at timestamptz,
 unique(owner_id,draft_key)
);
create index hosted_rooms_owner on private.hosted_rooms(owner_id,created_at desc);
create table private.hosted_room_invites (
 room_id uuid not null references private.hosted_rooms(room_id) on delete cascade,
 user_id uuid not null references public.profiles(id) on delete cascade,
 created_at timestamptz not null default now(), primary key(room_id,user_id)
);
create index hosted_room_invites_user on private.hosted_room_invites(user_id,room_id);
create table private.hosted_room_registrations (
 room_id uuid not null references private.hosted_rooms(room_id) on delete cascade,
 user_id uuid not null references public.profiles(id) on delete cascade,
 category text not null check(category in ('woman','man')),
 status text not null default 'waiting' check(status in ('waiting','confirmed','cancelled')),
 joined_at timestamptz not null default now(), primary key(room_id,user_id)
);
create index hosted_room_queue on private.hosted_room_registrations(room_id,category,joined_at,user_id) where status='waiting';
create index hosted_room_confirmed on private.hosted_room_registrations(room_id,category) where status='confirmed';
create index hosted_room_member on private.hosted_room_registrations(user_id,room_id);
alter table private.hosting_settings enable row level security;
alter table private.hosted_rooms enable row level security;
alter table private.hosted_room_invites enable row level security;
alter table private.hosted_room_registrations enable row level security;
revoke all on private.hosting_settings,private.hosted_rooms,private.hosted_room_invites,private.hosted_room_registrations from public,anon,authenticated;
grant all on private.hosting_settings,private.hosted_rooms,private.hosted_room_invites,private.hosted_room_registrations to service_role;

create function private.community_read_limit() returns void language plpgsql security definer set search_path='' as $$
declare n integer; k text;
begin
 if not private.is_active_member() then raise exception 'registration_required' using errcode='42501'; end if;
 k:='community-read:'||auth.uid()::text||':'||floor(extract(epoch from now())/60)::text;
 insert into private.rate_limits(key_hash,count,expires_at) values(k,1,now()+interval '2 minutes')
 on conflict(key_hash) do update set count=least(private.rate_limits.count+1,10000) returning count into n;
 if n>90 then raise exception 'rate_limit'; end if;
 delete from private.rate_limits where key_hash in (select key_hash from private.rate_limits where expires_at<now() order by expires_at limit 50);
end $$;

create function private.can_discover_room(p_room uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.is_active_member() and not exists(
  select 1 from private.hosted_rooms h join public.profiles p on p.id=h.owner_id where h.room_id=p_room and
  (p.status<>'active' or private.is_blocked(p.id) or (h.visibility='link' and h.owner_id<>auth.uid()
   and not exists(select 1 from private.hosted_room_invites i where i.room_id=p_room and i.user_id=auth.uid())))
 );
$$;
drop policy rooms_member_read on public.rooms;
create policy rooms_member_read on public.rooms for select to authenticated using(status in ('published','live') and private.can_discover_room(id));

-- A share card has event metadata and aggregate counts only, never identities.
create function private.hosted_room_json(p_room uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',r.id,'title',r.title,'theme',r.theme_slug,'city',r.city,'profession',r.profession,
 'minAge',r.min_age,'maxAge',r.max_age,'capacity',r.capacity,'opensAt',r.opens_at,'closesAt',r.closes_at,
 'modes',r.allowed_modes,'status',r.status,'description',h.description,'color',h.color,'visibility',h.visibility,
 'rounds',10,'roundSeconds',300,'breakSeconds',30,
 'women',(select count(*) from private.hosted_room_registrations b where b.room_id=r.id and b.status='confirmed' and b.category='woman'),
 'men',(select count(*) from private.hosted_room_registrations b where b.room_id=r.id and b.status='confirmed' and b.category='man'),
 'waiting',(select count(*) from private.hosted_room_registrations b where b.room_id=r.id and b.status='waiting'))
 from public.rooms r join private.hosted_rooms h on h.room_id=r.id where r.id=p_room;
$$;

create function private.rebalance_hosted_room(p_room uuid) returns void language plpgsql security definer set search_path='' as $$
declare cap integer; host uuid; w integer; m integer; wi uuid; mi uuid;
begin
 select r.capacity,h.owner_id into cap,host from public.rooms r join private.hosted_rooms h on h.room_id=r.id
 where r.id=p_room and r.status in ('published','live') for update of r;
 if not found then return; end if;
 update private.hosted_room_registrations b set status='cancelled' from public.profiles p,public.rooms r
 where b.room_id=p_room and r.id=b.room_id and p.id=b.user_id and b.status<>'cancelled' and
 (p.status<>'active' or p.gender<>b.category or p.age not between r.min_age and r.max_age or
 exists(select 1 from public.blocks x where (x.actor_id=host and x.target_id=p.id) or (x.target_id=host and x.actor_id=p.id)));
 select count(*) filter(where category='woman'),count(*) filter(where category='man') into w,m
 from private.hosted_room_registrations where room_id=p_room and status='confirmed';
 if w<>m then
  update private.hosted_room_registrations set status='waiting' where (room_id,user_id) in
   (select room_id,user_id from private.hosted_room_registrations where room_id=p_room and status='confirmed'
    and category=case when w>m then 'woman' else 'man' end order by joined_at desc,user_id desc limit abs(w-m));
 end if;
 for n in least(w,m)+1..cap/2 loop
  select user_id into wi from private.hosted_room_registrations where room_id=p_room and status='waiting' and category='woman' order by joined_at,user_id limit 1;
  select user_id into mi from private.hosted_room_registrations where room_id=p_room and status='waiting' and category='man' order by joined_at,user_id limit 1;
  exit when wi is null or mi is null;
  update private.hosted_room_registrations set status='confirmed' where room_id=p_room and user_id in (wi,mi);
 end loop;
 update public.room_presence s set active=false where s.room_id=p_room and s.active and not exists(select 1 from private.hosted_room_registrations b where b.room_id=p_room and b.user_id=s.user_id and b.status='confirmed');
end $$;

create function private.hosting_included() returns boolean language sql stable security definer set search_path='' as $$
 select private.has_premium() and not exists(select 1 from private.hosted_rooms h join private.runtime_settings s on s.billing_environment=h.environment
  where h.owner_id=auth.uid() and h.published_at>now()-interval '30 days' and h.charged_credits=0 and h.refunded_at is null);
$$;
create function private.hosted_room_dashboard() returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform private.community_read_limit();
 return jsonb_build_object('premium',private.has_premium(),'includedAvailable',private.hosting_included(),
 'credits',coalesce((select sum(c.amount) from public.credit_ledger c join private.runtime_settings s on s.billing_environment=c.environment where c.user_id=auth.uid() and c.unit='room_host'),0),
 'publishingEnabled',coalesce((select h.enabled and s.admissions_enabled from private.hosting_settings h cross join private.runtime_settings s where h.singleton and s.singleton),false),
 'rooms',coalesce((select jsonb_agg(private.hosted_room_json(x.room_id)||jsonb_build_object('shareCode',x.share_code,'chargedCredits',x.charged_credits) order by x.created_at desc,x.room_id) from
 (select * from private.hosted_rooms where owner_id=auth.uid() order by created_at desc,room_id limit 30) x),'[]'::jsonb));
end $$;

create function private.save_hosted_room(p_data jsonb,p_key uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); rid uuid; existing private.hosted_rooms; r public.rooms; cap integer; lo integer; hi integer; moment timestamptz; modes text[];
begin
 if not private.is_active_member() then raise exception 'registration_required' using errcode='42501'; end if;
 if p_key is null or jsonb_typeof(p_data)<>'object' or length(p_data::text)>5000 or exists(select 1 from jsonb_object_keys(p_data) k where k not in ('id','title','description','theme','city','profession','minAge','maxAge','capacity','opensAt','modes','color','visibility')) then raise exception 'invalid_request' using errcode='22023'; end if;
 cap:=(p_data->>'capacity')::integer; lo:=(p_data->>'minAge')::integer; hi:=(p_data->>'maxAge')::integer; moment:=(p_data->>'opensAt')::timestamptz;
 select array_agg(x) into modes from jsonb_array_elements_text(p_data->'modes') x;
 if cap is null or cap not in (20,50,100) or lo is null or hi is null or lo<18 or hi>100 or lo>hi or moment is null or not isfinite(moment) or moment<now()+interval '10 minutes' or moment>now()+interval '90 days'
 or length(btrim(coalesce(p_data->>'title',''))) not between 3 and 80 or length(coalesce(p_data->>'description',''))>500
 or length(btrim(coalesce(p_data->>'city',''))) not between 1 and 100 or length(coalesce(p_data->>'profession',''))>120
 or not exists(select 1 from public.themes where slug=p_data->>'theme' and active)
 or coalesce(p_data->>'color','') not in ('duo','rose','blue','lavender') or coalesce(p_data->>'visibility','') not in ('public','link')
 or modes is null or cardinality(modes) not between 1 and 2 or not modes<@array['audio','video']::text[] or cardinality(modes)<>(select count(distinct x) from unnest(modes) x)
 then raise exception 'invalid_request' using errcode='22023'; end if;
 perform 1 from public.profiles where id=actor and status='active' for update;
 if not found then raise exception 'registration_required' using errcode='42501'; end if;
 if p_data->>'id' is not null then select * into existing from private.hosted_rooms where room_id=(p_data->>'id')::uuid and owner_id=actor;
 else select * into existing from private.hosted_rooms where owner_id=actor and draft_key=p_key; end if;
 if existing.room_id is not null then
  select * into r from public.rooms where id=existing.room_id for update;
  if r.status<>'draft' then raise exception 'room_locked'; end if; rid:=r.id;
 elsif p_data->>'id' is not null then raise exception 'room_unavailable';
 else
  if (select count(*) from private.hosted_rooms h join public.rooms catalog_room on catalog_room.id=h.room_id where h.owner_id=actor and catalog_room.status='draft')>=10 then raise exception 'draft_limit'; end if;
  perform private.community_limit('host-draft',20);
  insert into public.rooms(title,opens_at,closes_at) values(btrim(p_data->>'title'),moment,moment+interval '55 minutes') returning id into rid;
  insert into private.hosted_rooms(room_id,owner_id,draft_key) values(rid,actor,p_key);
 end if;
 update public.rooms set title=btrim(p_data->>'title'),theme_slug=p_data->>'theme',city=btrim(p_data->>'city'),profession=nullif(btrim(p_data->>'profession'),''),min_age=lo,max_age=hi,capacity=cap,
  opens_at=moment,closes_at=moment+interval '55 minutes',round_seconds=300,break_seconds=30,allowed_modes=modes where id=rid;
 update private.hosted_rooms set description=coalesce(p_data->>'description',''),color=p_data->>'color',visibility=p_data->>'visibility' where room_id=rid returning * into existing;
 return private.hosted_room_json(rid)||jsonb_build_object('shareCode',existing.share_code);
end $$;

create function private.hosted_room_action(p_room uuid,p_action text,p_max_credits integer default 0) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); h private.hosted_rooms; r public.rooms; cost integer; bill text; gate boolean;
begin
 if not private.is_active_member() then raise exception 'registration_required' using errcode='42501'; end if;
 if p_action is null or p_action not in ('publish','cancel','rotate') or p_max_credits is null or p_max_credits not in (0,1,2,4) then raise exception 'invalid_request' using errcode='22023'; end if;
 perform 1 from public.profiles where id=actor and status='active' for update;
 if not found then raise exception 'registration_required' using errcode='42501'; end if;
 if not exists(select 1 from private.hosted_rooms where room_id=p_room and owner_id=actor) then raise exception 'room_unavailable'; end if;
 if p_action='publish' then
  select enabled into gate from private.hosting_settings where singleton for share;
  select billing_environment,gate and admissions_enabled into bill,gate from private.runtime_settings where singleton for share;
  if gate is distinct from true then raise exception 'hosting_disabled'; end if;
 end if;
 select * into r from public.rooms where id=p_room for update;
 select * into h from private.hosted_rooms where room_id=p_room for update;
 if p_action='publish' then
  if r.status='published' then return private.hosted_room_json(p_room)||jsonb_build_object('reused',true,'chargedCredits',h.charged_credits); end if;
  if r.status<>'draft' or r.opens_at<clock_timestamp()+interval '10 minutes' then raise exception 'room_locked'; end if;
  if (select count(*) from private.hosted_rooms x join public.rooms y on y.id=x.room_id where x.owner_id=actor and y.status in ('published','live') and y.closes_at>now())>=3 then raise exception 'hosting_limit'; end if;
  perform private.community_limit('host-publish',5);
  cost:=case when r.capacity=20 and private.hosting_included() then 0 when r.capacity=20 then 1 when r.capacity=50 then 2 else 4 end;
  if cost>p_max_credits then raise exception 'hosting_price_changed'; end if;
  if cost>coalesce((select sum(amount) from public.credit_ledger where user_id=actor and environment=bill and unit='room_host'),0) then raise exception 'hosting_credit_required'; end if;
  if cost>0 then insert into public.credit_ledger(user_id,unit,amount,environment,reason,idempotency_key) values(actor,'room_host',-cost,bill,'consume','host-publish:'||p_room::text); end if;
  update private.hosted_rooms set published_at=clock_timestamp(),environment=bill,charged_credits=cost where room_id=p_room;
  update public.rooms set status='published' where id=p_room;
 elsif p_action='cancel' then
  if r.status='cancelled' then return jsonb_build_object('status','cancelled','reused',true); end if;
  if r.status not in ('draft','published') or r.opens_at<=clock_timestamp() then raise exception 'room_locked'; end if;
  update public.rooms set status='cancelled' where id=p_room;
  update private.hosted_room_registrations set status='cancelled' where room_id=p_room;
  delete from private.hosted_room_invites where room_id=p_room;
  if h.published_at is not null and h.refunded_at is null then
   if h.charged_credits>0 then insert into public.credit_ledger(user_id,unit,amount,environment,reason,idempotency_key) values(actor,'room_host',h.charged_credits,h.environment,'refund','host-cancel:'||p_room::text); end if;
   update private.hosted_rooms set refunded_at=clock_timestamp() where room_id=p_room;
  end if;
 else
  if r.status not in ('draft','published') then raise exception 'room_locked'; end if;
  perform private.community_limit('host-rotate',10);
  update private.hosted_rooms set share_code=gen_random_uuid() where room_id=p_room returning * into h;
  delete from private.hosted_room_invites i where i.room_id=p_room and not exists(select 1 from private.hosted_room_registrations b where b.room_id=p_room and b.user_id=i.user_id and b.status='confirmed');
 end if;
 return private.hosted_room_json(p_room)||jsonb_build_object('shareCode',h.share_code,'chargedCredits',case when p_action='publish' then cost else h.charged_credits end);
end $$;

create function private.register_hosted_room(p_room uuid,p_action text,p_code uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); h private.hosted_rooms; r public.rooms; p public.profiles; b private.hosted_room_registrations;
begin
 if not private.is_active_member() then raise exception 'registration_required' using errcode='42501'; end if;
 if p_action is null or p_action not in ('resolve','inspect','reserve','cancel') then raise exception 'invalid_request' using errcode='22023'; end if;
 select * into p from public.profiles where id=actor and status='active' for update;
 if not found then raise exception 'registration_required' using errcode='42501'; end if;
 if p_action='resolve' then select * into h from private.hosted_rooms where share_code=p_code; else select * into h from private.hosted_rooms where room_id=p_room; end if;
 if h.room_id is null or private.is_blocked(h.owner_id) or not exists(select 1 from public.profiles where id=h.owner_id and status='active') then raise exception 'room_unavailable'; end if;
 select * into r from public.rooms where id=h.room_id for update;
 if r.status not in ('published','live') or r.closes_at<=clock_timestamp() then raise exception 'room_unavailable'; end if;
 if p_action='resolve' then
  perform private.community_limit('host-resolve',100);
  insert into private.hosted_room_invites(room_id,user_id) values(r.id,actor) on conflict do nothing;
 elsif not private.can_discover_room(r.id) then raise exception 'room_unavailable';
 elsif p_action='reserve' then
  if r.opens_at<=clock_timestamp() then raise exception 'registration_closed'; end if;
  if p.gender not in ('woman','man') then raise exception 'balance_profile_required'; end if;
  if p.age not between r.min_age and r.max_age then raise exception 'age_not_eligible'; end if;
  select * into b from private.hosted_room_registrations where room_id=r.id and user_id=actor;
  if b.status in ('confirmed','waiting') and b.category=p.gender then
   return private.hosted_room_json(r.id)||jsonb_build_object('registration',b.status,'entryConsumed',false,'reused',true);
  end if;
  perform private.community_limit('host-reserve',20);
  insert into private.hosted_room_registrations(room_id,user_id,category) values(r.id,actor,p.gender)
  on conflict(room_id,user_id) do update set category=excluded.category,status='waiting',joined_at=now();
  perform private.rebalance_hosted_room(r.id);
 elsif p_action='cancel' then
  update private.hosted_room_registrations set status='cancelled' where room_id=r.id and user_id=actor;
  perform private.rebalance_hosted_room(r.id);
 else perform private.community_read_limit();
 end if;
 select * into b from private.hosted_room_registrations where room_id=r.id and user_id=actor;
 return private.hosted_room_json(r.id)||jsonb_build_object('registration',b.status,'entryConsumed',false);
end $$;

create function private.hosted_room_admission(p_room uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.can_discover_room(p_room) and (not exists(select 1 from private.hosted_rooms where room_id=p_room) or exists(
  select 1 from private.hosted_room_registrations b join public.profiles p on p.id=b.user_id
  where b.room_id=p_room and b.user_id=auth.uid() and b.status='confirmed' and p.status='active' and p.gender=b.category));
$$;

create function private.hosted_profile_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare rid uuid;
begin
 for rid in select r.id from public.rooms r join private.hosted_rooms h on h.room_id=r.id where r.status in ('published','live') and
 (h.owner_id=new.id or exists(select 1 from private.hosted_room_registrations b where b.room_id=r.id and b.user_id=new.id and b.status<>'cancelled')) order by r.id loop
  perform 1 from public.rooms where id=rid for update;
  if new.status<>'active' and exists(select 1 from private.hosted_rooms where room_id=rid and owner_id=new.id) then
   update public.rooms set status='cancelled' where id=rid;
   update private.hosted_room_registrations set status='cancelled' where room_id=rid;
  else perform private.rebalance_hosted_room(rid); end if;
 end loop;
 return new;
end $$;
create trigger hosted_profile_guard after update of status,gender,age on public.profiles for each row execute function private.hosted_profile_guard();
-- Also cover identity deletion initiated outside the account screen. Otherwise
-- cascading away private ownership could leave an apparently public orphan room.
create function private.hosted_profile_delete_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare rid uuid;
begin
 for rid in select r.id from public.rooms r join private.hosted_rooms h on h.room_id=r.id where r.status in ('published','live') and
 (h.owner_id=old.id or exists(select 1 from private.hosted_room_registrations b where b.room_id=r.id and b.user_id=old.id and b.status<>'cancelled')) order by r.id loop
  perform 1 from public.rooms where id=rid for update;
  if exists(select 1 from private.hosted_rooms where room_id=rid and owner_id=old.id) then
   update public.rooms set status='cancelled' where id=rid;
   update public.room_presence set active=false where room_id=rid;
   update private.hosted_room_registrations set status='cancelled' where room_id=rid;
  else
   update private.hosted_room_registrations set status='cancelled' where room_id=rid and user_id=old.id;
   perform private.rebalance_hosted_room(rid);
  end if;
 end loop;
 return old;
end $$;
create trigger hosted_profile_delete_guard before delete on public.profiles for each row execute function private.hosted_profile_delete_guard();
create function private.hosted_block_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare rid uuid;
begin
 for rid in select h.room_id from private.hosted_rooms h join public.rooms r on r.id=h.room_id where r.status in ('published','live') and h.owner_id in (new.actor_id,new.target_id) order by h.room_id loop
  perform private.rebalance_hosted_room(rid);
 end loop;
 return new;
end $$;
create trigger hosted_block_guard after insert on public.blocks for each row execute function private.hosted_block_guard();

-- Only the server can resolve an anonymous social share card.
create function public.server_shared_room(p_code uuid) returns jsonb language sql security invoker set search_path='' as $$
 select private.hosted_room_json(r.id) from private.hosted_rooms h join public.rooms r on r.id=h.room_id join public.profiles p on p.id=h.owner_id
 where h.share_code=p_code and r.status in ('published','live') and r.closes_at>now() and p.status='active';
$$;
create function private.export_hosted_rooms() returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not private.is_active_member() then raise exception 'registration_required' using errcode='42501'; end if;
 if (select count(*) from private.hosted_rooms where owner_id=auth.uid())>=500 or (select count(*) from private.hosted_room_registrations where user_id=auth.uid())>=500 then raise exception 'export_too_large'; end if;
 return jsonb_build_object('owned',coalesce((select jsonb_agg(private.hosted_room_json(room_id)||jsonb_build_object('chargedCredits',charged_credits,'publishedAt',published_at,'refundedAt',refunded_at)) from private.hosted_rooms where owner_id=auth.uid()),'[]'::jsonb),
 'registrations',coalesce((select jsonb_agg(jsonb_build_object('roomId',room_id,'status',status,'category',category,'joinedAt',joined_at)) from private.hosted_room_registrations where user_id=auth.uid()),'[]'::jsonb));
end $$;

create function public.hosted_room_dashboard() returns jsonb language sql security invoker set search_path='' as $$ select private.hosted_room_dashboard(); $$;
create function public.save_hosted_room(p_data jsonb,p_key uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.save_hosted_room(p_data,p_key); $$;
create function public.hosted_room_action(p_room uuid,p_action text,p_max_credits integer default 0) returns jsonb language sql security invoker set search_path='' as $$ select private.hosted_room_action(p_room,p_action,p_max_credits); $$;
create function public.register_hosted_room(p_room uuid,p_action text,p_code uuid default null) returns jsonb language sql security invoker set search_path='' as $$ select private.register_hosted_room(p_room,p_action,p_code); $$;
create function public.export_hosted_rooms() returns jsonb language sql security invoker set search_path='' as $$ select private.export_hosted_rooms(); $$;
revoke all on function private.community_read_limit(),private.can_discover_room(uuid),private.hosted_room_json(uuid),private.rebalance_hosted_room(uuid),private.hosting_included(),private.hosted_profile_guard(),private.hosted_profile_delete_guard(),private.hosted_block_guard() from public,anon,authenticated;
grant execute on function private.can_discover_room(uuid) to authenticated;
grant execute on function private.hosted_room_json(uuid) to service_role;
revoke all on function public.server_shared_room(uuid) from public,anon,authenticated;
grant execute on function public.server_shared_room(uuid) to service_role;
revoke all on function private.hosted_room_dashboard(),private.save_hosted_room(jsonb,uuid),private.hosted_room_action(uuid,text,integer),private.register_hosted_room(uuid,text,uuid),private.export_hosted_rooms() from public,anon,authenticated;
revoke all on function public.hosted_room_dashboard(),public.save_hosted_room(jsonb,uuid),public.hosted_room_action(uuid,text,integer),public.register_hosted_room(uuid,text,uuid),public.export_hosted_rooms() from public,anon,authenticated;
grant execute on function private.hosted_room_dashboard(),private.save_hosted_room(jsonb,uuid),private.hosted_room_action(uuid,text,integer),private.register_hosted_room(uuid,text,uuid),private.export_hosted_rooms() to authenticated;
grant execute on function public.hosted_room_dashboard(),public.save_hosted_room(jsonb,uuid),public.hosted_room_action(uuid,text,integer),public.register_hosted_room(uuid,text,uuid),public.export_hosted_rooms() to authenticated;


-- Small, cursor-based member directories: no full member export or polling.
create index rooms_directory on public.rooms(opens_at,id) where status in ('published','live');
create index friendships_a_directory on public.friendships(user_a,created_at desc,user_b);
create index friendships_b_directory on public.friendships(user_b,created_at desc,user_a);
create function private.community_fold(p_text text) returns text language sql immutable security invoker set search_path='' as $$
 select translate(lower(btrim(coalesce(p_text,''))),'àâäáãåçéèêëíìîïñóòôöõúùûüýÿ','aaaaaaceeeeiiiinooooouuuuyy');
$$;
create function private.community_overview() returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform private.community_read_limit();
 return jsonb_build_object('memberId',auth.uid(),'callsEnabled',false,
 'admissionsEnabled',coalesce((select admissions_enabled from private.runtime_settings where singleton),false),
 'themes',coalesce((select jsonb_agg(jsonb_build_object('slug',slug,'label',label) order by label) from public.themes where active),'[]'::jsonb),
 'presence',(select jsonb_build_object('roomId',room_id,'entryId',entry_id,'expiresAt',expires_at) from public.room_presence where user_id=auth.uid() and active and expires_at>now()));
end $$;

create function private.community_page(p_kind text,p_filters jsonb default '{}'::jsonb,p_after timestamptz default null,p_after_id uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); rows jsonb; result jsonb; cursor jsonb; q text; city_filter text; job text; theme text; mode text; direction text;
 lo integer; hi integer; eligible boolean; available boolean;
begin
 perform private.community_read_limit();
 if p_kind is null or p_kind not in ('rooms','friends','requests','invitations') or p_filters is null or jsonb_typeof(p_filters)<>'object' or length(p_filters::text)>2000
 or exists(select 1 from jsonb_object_keys(p_filters) k where k not in ('q','city','profession','theme','mode','minAge','maxAge','eligible','available','direction'))
 or (p_after is null)<>(p_after_id is null) or (p_after is not null and not isfinite(p_after)) then raise exception 'invalid_request' using errcode='22023'; end if;
 q:=private.community_fold(p_filters->>'q');city_filter:=private.community_fold(p_filters->>'city');job:=private.community_fold(p_filters->>'profession');theme:=coalesce(p_filters->>'theme','');mode:=coalesce(p_filters->>'mode','');direction:=coalesce(p_filters->>'direction','');
 lo:=coalesce((p_filters->>'minAge')::integer,18);hi:=coalesce((p_filters->>'maxAge')::integer,100);
 eligible:=coalesce((p_filters->>'eligible')::boolean,true);available:=coalesce((p_filters->>'available')::boolean,false);
 if length(q)>60 or length(city_filter)>100 or length(job)>120 or length(theme)>50 or mode not in ('','audio','video') or direction not in ('','incoming','outgoing') or lo<18 or hi>100 or lo>hi then raise exception 'invalid_request' using errcode='22023'; end if;
 if p_kind='rooms' then
  select coalesce(jsonb_agg(to_jsonb(x) order by x.sort_at,x.id),'[]'::jsonb) into rows from (
   select r.id,r.title,r.theme_slug,r.city,r.profession,r.min_age,r.max_age,r.capacity,r.round_seconds,r.allowed_modes,r.opens_at,r.closes_at,r.opens_at as sort_at,
    exists(select 1 from private.hosted_rooms h where h.room_id=r.id) as hosted,
    (select count(*) from public.room_presence s join public.profiles p on p.id=s.user_id where s.room_id=r.id and s.active and s.expires_at>now() and p.status='active' and not private.is_blocked(p.id)) as present
   from public.rooms r where r.status in ('published','live') and r.closes_at>now() and private.can_discover_room(r.id)
    and (q='' or position(q in private.community_fold(r.title))>0) and (city_filter='' or position(city_filter in private.community_fold(r.city))>0)
    and (job='' or coalesce(r.profession,'')='' or position(job in private.community_fold(r.profession))>0) and (theme='' or r.theme_slug=theme)
    and r.max_age>=lo and r.min_age<=hi and (not eligible or exists(select 1 from public.profiles p where p.id=actor and p.age between r.min_age and r.max_age))
    and (mode='' or mode=any(r.allowed_modes))
    and (not available or (select count(*) from public.room_presence s where s.room_id=r.id and s.active and s.expires_at>now())<r.capacity)
    and (p_after is null or (r.opens_at,r.id)>(p_after,p_after_id)) order by r.opens_at,r.id limit 13
  ) x;
 elsif p_kind='friends' then
  select coalesce(jsonb_agg(to_jsonb(x) order by x.sort_at desc,x.id desc),'[]'::jsonb) into rows from (
   select p.id,p.id as peer_id,p.display_name as name,p.age,p.city,p.profession,f.created_at as sort_at
   from public.friendships f join public.profiles p on p.id=case when f.user_a=actor then f.user_b else f.user_a end
   where (f.user_a=actor or f.user_b=actor) and p.status='active' and not private.is_blocked(p.id) and (q='' or position(q in private.community_fold(p.display_name))>0)
   and (p_after is null or (f.created_at,p.id)<(p_after,p_after_id)) order by f.created_at desc,p.id desc limit 13
  ) x;
 elsif p_kind='requests' then
  select coalesce(jsonb_agg(to_jsonb(x) order by x.sort_at desc,x.id desc),'[]'::jsonb) into rows from (
   select f.id,p.id as peer_id,p.display_name as name,p.age,p.city,f.sender_id=actor as outgoing,f.created_at as sort_at
   from public.friend_requests f join public.profiles p on p.id=case when f.sender_id=actor then f.recipient_id else f.sender_id end
   where (f.sender_id=actor or f.recipient_id=actor) and f.status='pending' and p.status='active' and not private.is_blocked(p.id)
    and (direction='' or (direction='outgoing')=(f.sender_id=actor)) and (q='' or position(q in private.community_fold(p.display_name))>0)
    and (p_after is null or (f.created_at,f.id)<(p_after,p_after_id)) order by f.created_at desc,f.id desc limit 13
  ) x;
 else
  select coalesce(jsonb_agg(to_jsonb(x) order by x.sort_at desc,x.id desc),'[]'::jsonb) into rows from (
   select v.id,p.id as peer_id,p.display_name as name,p.age,p.city,v.sender_id=actor as outgoing,v.media_mode,v.status,v.expires_at,v.created_at as sort_at
   from public.video_requests v join public.profiles p on p.id=case when v.sender_id=actor then v.recipient_id else v.sender_id end
   where (v.sender_id=actor or v.recipient_id=actor) and v.status in ('pending','accepted') and v.expires_at>now() and p.status='active' and not private.is_blocked(p.id)
    and exists(select 1 from public.friendships f where f.user_a=least(actor,p.id) and f.user_b=greatest(actor,p.id))
    and (direction='' or (direction='outgoing')=(v.sender_id=actor)) and (q='' or position(q in private.community_fold(p.display_name))>0)
    and (p_after is null or (v.created_at,v.id)<(p_after,p_after_id)) order by v.created_at desc,v.id desc limit 13
  ) x;
 end if;
 select coalesce(jsonb_agg(value order by ord),'[]'::jsonb) into result from jsonb_array_elements(rows) with ordinality t(value,ord) where ord<=12;
 if jsonb_array_length(rows)>12 then cursor:=jsonb_build_object('at',result->11->>'sort_at','id',result->11->>'id'); end if;
 return jsonb_build_object('items',result,'hasMore',jsonb_array_length(rows)>12,'next',cursor);
end $$;
create function public.community_overview() returns jsonb language sql security invoker set search_path='' as $$ select private.community_overview(); $$;
create function public.community_page(p_kind text,p_filters jsonb default '{}'::jsonb,p_after timestamptz default null,p_after_id uuid default null) returns jsonb language sql security invoker set search_path='' as $$ select private.community_page(p_kind,p_filters,p_after,p_after_id); $$;
revoke all on function private.community_fold(text),private.community_overview(),private.community_page(text,jsonb,timestamptz,uuid) from public,anon,authenticated;
revoke all on function public.community_overview(),public.community_page(text,jsonb,timestamptz,uuid) from public,anon,authenticated;
grant execute on function private.community_overview(),private.community_page(text,jsonb,timestamptz,uuid),public.community_overview(),public.community_page(text,jsonb,timestamptz,uuid) to authenticated;


create or replace function private.enter_room(p_room uuid, p_mode text, p_request uuid) returns jsonb
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
  if not private.hosted_room_admission(p_room) then raise exception 'room_unavailable' using errcode='42501'; end if;
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

create or replace function private.heartbeat_room(p_entry uuid) returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not private.is_active_member() then return false; end if;
  update public.room_presence p set expires_at = now()+interval '2 minutes' from public.rooms r
    where p.user_id = auth.uid() and p.entry_id = p_entry and p.active and p.expires_at > now()
    and r.id = p.room_id and r.status in ('published','live') and r.closes_at > now() and private.hosted_room_admission(r.id);
  return found;
end $$;

create or replace function private.room_preview(p_room uuid) returns table(user_id uuid,display_name text,age smallint,city text,profession text)
language plpgsql security definer set search_path = '' as $$
begin
  perform private.community_read_limit();
  if not private.can_discover_room(p_room) then raise exception 'room_unavailable' using errcode='42501'; end if;
  return query select p.id,p.display_name,p.age,p.city,p.profession from public.room_presence s
    join public.rooms r on r.id = s.room_id join public.profiles p on p.id = s.user_id
    where r.id = p_room and r.status in ('published','live') and r.closes_at > now() and s.active and s.expires_at > now()
    and p.status = 'active' and not private.is_blocked(p.id) order by p.id limit 20;
end $$;

create or replace function private.community_snapshot() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare actor uuid:=auth.uid(); result jsonb;
begin
 perform private.community_read_limit();
 select jsonb_build_object(
 'memberId',actor,
 'admissionsEnabled',coalesce((select admissions_enabled from private.runtime_settings where singleton),false),
 'themes',coalesce((select jsonb_agg(jsonb_build_object('slug',slug,'label',label) order by label) from public.themes where active),'[]'::jsonb),
 'rooms',coalesce((select jsonb_agg(to_jsonb(x) order by x.opens_at,x.id) from (
   select r.id,r.title,r.theme_slug,r.city,r.profession,r.min_age,r.max_age,r.capacity,r.round_seconds,r.allowed_modes,r.opens_at,r.closes_at,
    (select count(*) from public.room_presence s join public.profiles p on p.id=s.user_id
      where s.room_id=r.id and s.active and s.expires_at>now() and p.status='active' and not private.is_blocked(p.id)) as present
   from public.rooms r where r.status in ('published','live') and r.closes_at>now() and private.can_discover_room(r.id) order by r.opens_at,r.id limit 60
 ) x),'[]'::jsonb),
 'presence',(select jsonb_build_object('roomId',room_id,'entryId',entry_id,'expiresAt',expires_at) from public.room_presence where user_id=actor and active and expires_at>now()),
 'friends',coalesce((select jsonb_agg(to_jsonb(x) order by x.name,x.id) from (
   select p.id,p.display_name as name,p.age,p.city,p.profession,f.created_at from public.friendships f
   join public.profiles p on p.id=case when f.user_a=actor then f.user_b else f.user_a end
   where (f.user_a=actor or f.user_b=actor) and p.status='active' and not private.is_blocked(p.id)
   order by f.created_at desc,p.id limit 100
 ) x),'[]'::jsonb),
 'requests',coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc,x.id) from (
   select f.id,p.id as peer_id,p.display_name as name,p.age,p.city,f.sender_id=actor as outgoing,f.created_at
   from public.friend_requests f join public.profiles p on p.id=case when f.sender_id=actor then f.recipient_id else f.sender_id end
   where (f.sender_id=actor or f.recipient_id=actor) and f.status='pending' and p.status='active' and not private.is_blocked(p.id)
   order by f.created_at desc,f.id limit 100
 ) x),'[]'::jsonb),
 'invitations',coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc,x.id) from (
   select v.id,p.id as peer_id,p.display_name as name,v.sender_id=actor as outgoing,v.media_mode,v.status,v.created_at,v.expires_at
   from public.video_requests v join public.profiles p on p.id=case when v.sender_id=actor then v.recipient_id else v.sender_id end
   where (v.sender_id=actor or v.recipient_id=actor) and v.status in ('pending','accepted') and v.expires_at>now()
   and p.status='active' and not private.is_blocked(p.id)
   and exists(select 1 from public.friendships f where f.user_a=least(actor,p.id) and f.user_b=greatest(actor,p.id))
   order by v.created_at desc,v.id limit 100
 ) x),'[]'::jsonb)
 ) into result;
 return result;
end $$;

insert into private.hosting_settings(singleton,enabled) values(true,false) on conflict do nothing;
