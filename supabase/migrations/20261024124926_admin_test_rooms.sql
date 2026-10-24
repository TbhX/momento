-- Generated from the revised declarative hosted-room schema and admin test API.

alter table private.hosted_rooms add column is_test boolean not null default false;

create or replace function private.can_discover_room(p_room uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.is_active_member() and not exists(
  select 1 from private.hosted_rooms h join public.profiles p on p.id=h.owner_id where h.room_id=p_room and
  (p.status<>'active' or private.is_blocked(p.id) or (h.is_test and not exists(select 1 from private.admin_roles a where a.user_id=h.owner_id and a.role='admin' and not a.setup_required)) or (h.visibility='link' and h.owner_id<>auth.uid()
   and not exists(select 1 from private.hosted_room_invites i where i.room_id=p_room and i.user_id=auth.uid())))
 );
$$;

create or replace function private.hosted_room_json(p_room uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',r.id,'title',r.title,'theme',r.theme_slug,'city',r.city,'profession',r.profession,
 'minAge',r.min_age,'maxAge',r.max_age,'capacity',r.capacity,'opensAt',r.opens_at,'closesAt',r.closes_at,
 'modes',r.allowed_modes,'status',r.status,'description',h.description,'color',h.color,'visibility',h.visibility,
 'isTest',h.is_test,'rounds',10,'roundSeconds',300,'breakSeconds',30,
 'women',(select count(*) from private.hosted_room_registrations b where b.room_id=r.id and b.status='confirmed' and b.category='woman'),
 'men',(select count(*) from private.hosted_room_registrations b where b.room_id=r.id and b.status='confirmed' and b.category='man'),
 'waiting',(select count(*) from private.hosted_room_registrations b where b.room_id=r.id and b.status='waiting'))
 from public.rooms r join private.hosted_rooms h on h.room_id=r.id where r.id=p_room;
$$;

create or replace function private.hosting_included() returns boolean language sql stable security definer set search_path='' as $$
 select private.has_premium() and not exists(select 1 from private.hosted_rooms h join private.runtime_settings s on s.billing_environment=h.environment
  where h.owner_id=auth.uid() and not h.is_test and h.published_at>now()-interval '30 days' and h.charged_credits=0 and h.refunded_at is null);
$$;

create or replace function private.hosted_room_dashboard() returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform private.community_read_limit();
 return jsonb_build_object('adminTestPublishing',exists(select 1 from private.admin_roles a join private.runtime_settings s on s.singleton and s.billing_environment='test' where a.user_id=auth.uid() and a.role='admin' and not a.setup_required),'premium',private.has_premium(),'includedAvailable',private.hosting_included(),
 'credits',coalesce((select sum(c.amount) from public.credit_ledger c join private.runtime_settings s on s.billing_environment=c.environment where c.user_id=auth.uid() and c.unit='room_host'),0),
 'publishingEnabled',coalesce((select h.enabled and s.admissions_enabled from private.hosting_settings h cross join private.runtime_settings s where h.singleton and s.singleton),false),
 'rooms',coalesce((select jsonb_agg(private.hosted_room_json(x.room_id)||jsonb_build_object('shareCode',x.share_code,'chargedCredits',x.charged_credits) order by x.created_at desc,x.room_id) from
 (select * from private.hosted_rooms where owner_id=auth.uid() order by created_at desc,room_id limit 30) x),'[]'::jsonb));
end $$;

create or replace function private.register_hosted_room(p_room uuid,p_action text,p_code uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); h private.hosted_rooms; r public.rooms; p public.profiles; b private.hosted_room_registrations;
begin
 if not private.is_active_member() then raise exception 'registration_required' using errcode='42501'; end if;
 if p_action is null or p_action not in ('resolve','inspect','reserve','cancel') then raise exception 'invalid_request' using errcode='22023'; end if;
 select * into p from public.profiles where id=actor and status='active' for update;
 if not found then raise exception 'registration_required' using errcode='42501'; end if;
 if p_action='resolve' then select * into h from private.hosted_rooms where share_code=p_code; else select * into h from private.hosted_rooms where room_id=p_room; end if;
 if h.room_id is null or (h.is_test and not exists(select 1 from private.admin_roles a where a.user_id=h.owner_id and a.role='admin' and not a.setup_required)) or private.is_blocked(h.owner_id) or not exists(select 1 from public.profiles where id=h.owner_id and status='active') then raise exception 'room_unavailable'; end if;
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

create or replace function private.hosted_room_admission(p_room uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.can_discover_room(p_room) and not exists(select 1 from private.hosted_rooms where room_id=p_room and is_test) and (not exists(select 1 from private.hosted_rooms where room_id=p_room) or exists(
  select 1 from private.hosted_room_registrations b join public.profiles p on p.id=b.user_id
  where b.room_id=p_room and b.user_id=auth.uid() and b.status='confirmed' and p.status='active' and p.gender=b.category));
$$;

create or replace function public.server_shared_room(p_code uuid) returns jsonb language sql security invoker set search_path='' as $$
 select private.hosted_room_json(r.id) from private.hosted_rooms h join public.rooms r on r.id=h.room_id join public.profiles p on p.id=h.owner_id
 where h.share_code=p_code and r.status in ('published','live') and r.closes_at>now() and p.status='active' and (not h.is_test or exists(select 1 from private.admin_roles a where a.user_id=h.owner_id and a.role='admin' and not a.setup_required));
$$;

-- An administrator can publish an explicitly non-live, unlisted test event.
-- No paid entitlement, real admission or media authorization is created.
create function private.admin_publish_test_room(p_room uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); h private.hosted_rooms; r public.rooms; bill text;
begin
 if private.require_administrator()<>'admin' then raise exception 'admin_required' using errcode='42501'; end if;
 perform 1 from public.profiles where id=actor and status='active' for update;
 if not found then raise exception 'admin_required' using errcode='42501'; end if;
 perform 1 from private.admin_roles where user_id=actor and role='admin' and not setup_required for share;
 if not found then raise exception 'admin_required' using errcode='42501'; end if;
 select billing_environment into bill from private.runtime_settings where singleton for share;
 if bill is distinct from 'test' then raise exception 'test_environment_required' using errcode='42501'; end if;
 if not exists(select 1 from private.hosted_rooms where room_id=p_room and owner_id=actor) then raise exception 'room_unavailable'; end if;
 select * into r from public.rooms where id=p_room for update;
 select * into h from private.hosted_rooms where room_id=p_room for update;
 if h.is_test and r.status='published' then return private.hosted_room_json(p_room)||jsonb_build_object('shareCode',h.share_code,'chargedCredits',0,'reused',true); end if;
 if r.status<>'draft' or r.opens_at<clock_timestamp()+interval '10 minutes' then raise exception 'room_locked'; end if;
 if (select count(*) from private.hosted_rooms x join public.rooms y on y.id=x.room_id where x.owner_id=actor and y.status in ('published','live') and y.closes_at>now())>=3 then raise exception 'hosting_limit'; end if;
 perform private.community_limit('admin-test-publish',20);
 update private.hosted_rooms set is_test=true,visibility='link',environment='test',charged_credits=0,published_at=clock_timestamp() where room_id=p_room returning * into h;
 update public.rooms set status='published' where id=p_room;
 insert into private.admin_audit(actor_id,action,target_ref) values(actor,'test_room_published',p_room::text);
 return private.hosted_room_json(p_room)||jsonb_build_object('shareCode',h.share_code,'chargedCredits',0,'reused',false);
end $$;
create function public.admin_publish_test_room(p_room uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.admin_publish_test_room(p_room); $$;
revoke all on function private.admin_publish_test_room(uuid),public.admin_publish_test_room(uuid) from public,anon,authenticated;
grant execute on function private.admin_publish_test_room(uuid),public.admin_publish_test_room(uuid) to authenticated;

