-- A readiness receipt is not a media grant. All gates remain closed by default.
create table if not exists private.call_readiness_settings (
 singleton boolean primary key default true check(singleton), enabled boolean not null default false
);
create table if not exists private.call_participants (
 encounter_id uuid not null references public.encounters(id) on delete cascade,
 user_id uuid not null references public.profiles(id) on delete cascade,
 session_id uuid not null, entry_id uuid not null references public.room_entries(id) on delete cascade,
 environment text not null check(environment in ('test','live')),
 assurance text not null check(assurance in ('aal1','aal2')),
 mode text not null check(mode in ('audio','video')),
 prepared_at timestamptz not null, checked_at timestamptz not null, left_at timestamptz,
 primary key(encounter_id,user_id)
);
create index if not exists call_participants_user on private.call_participants(user_id,encounter_id);
create index if not exists call_participants_open on private.call_participants(encounter_id,user_id) where left_at is null;
alter table private.call_readiness_settings enable row level security;
alter table private.call_participants enable row level security;
revoke all on private.call_readiness_settings,private.call_participants from public,anon,authenticated;
grant all on private.call_readiness_settings,private.call_participants to service_role;

-- Never callable by a member with an arbitrary actor. This helper is internal.
create or replace function private.call_participant_valid(p_encounter uuid,p_user uuid,p_now timestamptz,p_env text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.call_participants c
 join public.profiles p on p.id=c.user_id and p.status='active'
 join auth.sessions a on a.id=c.session_id and a.user_id=c.user_id
 join public.encounters e on e.id=c.encounter_id
 join public.room_presence s on s.user_id=c.user_id and s.room_id=e.room_id and s.entry_id=c.entry_id
 join public.room_entries n on n.id=s.entry_id and n.user_id=s.user_id and n.room_id=s.room_id
 where c.encounter_id=p_encounter and c.user_id=p_user and c.left_at is null and c.environment=p_env
 and c.checked_at<=p_now and c.checked_at>p_now-interval '45 seconds'
 and (c.mode='audio' or n.media_mode='video') and (a.not_after is null or a.not_after>p_now) and s.active and s.expires_at>p_now
 and (c.assurance='aal2' or not exists(select 1 from auth.mfa_factors f where f.user_id=p_user and f.status='verified'))
 and (n.admission_type<>'premium' or exists(select 1 from public.entitlements t where t.user_id=p_user and t.environment=p_env and t.kind='premium' and t.starts_at<=p_now and t.ends_at>p_now and t.revoked_at is null)));
$$;

create or replace function private.call_readiness(p_encounter uuid,p_action text,p_mode text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); item public.encounters; room public.rooms; lease private.call_participants;
 sid uuid; bill text; moment timestamptz; entry uuid; n integer; ready boolean; mode text;
begin
 perform private.community_read_limit();
 if p_action is null or p_action not in ('state','prepare','heartbeat','leave') or (p_action='prepare' and (p_mode is null or p_mode not in ('audio','video'))) or (p_action<>'prepare' and p_mode is not null) then raise exception 'invalid_request'; end if;
 select * into item from public.encounters where id=p_encounter and actor in (user_a,user_b);
 if not found then raise exception 'encounter_unavailable'; end if;
 -- Same ordered financial/consent profile locks, then settings, room, encounter,
 -- presences and readiness rows. No token provider is contacted in this transaction.
 perform id from public.profiles where id in (item.user_a,item.user_b) order by id for update;
 perform singleton from private.call_readiness_settings where singleton for share;
 perform singleton from private.runtime_settings where singleton for share;
 select billing_environment into bill from private.runtime_settings where singleton;
 select * into room from public.rooms where id=item.room_id for share;
 select * into item from public.encounters where id=p_encounter for update;
 perform user_id from public.room_presence where user_id in (item.user_a,item.user_b) order by user_id for update;
 perform user_id from private.call_participants where encounter_id=item.id order by user_id for update;
 moment:=clock_timestamp();sid:=(auth.jwt()->>'session_id')::uuid;
 if p_action='leave' then
  update private.call_participants set left_at=coalesce(left_at,moment) where encounter_id=item.id;
  update public.encounters set status='cancelled' where id=item.id and status<>'cancelled';
  return jsonb_build_object('state','closed','mediaEnabled',false);
 end if;
 if not coalesce((select enabled from private.call_readiness_settings where singleton),false) or not coalesce((select admissions_enabled from private.runtime_settings where singleton),false) then return jsonb_build_object('state','disabled','mediaEnabled',false); end if;
 if item.status not in ('scheduled','live') or item.ends_at<=moment or room.status not in ('published','live') or room.opens_at>moment or room.closes_at<=moment
 or item.starts_at<room.opens_at or item.ends_at>room.closes_at then return jsonb_build_object('state','ended','mediaEnabled',false); end if;
 if (select count(*) from public.profiles where id in (item.user_a,item.user_b) and status='active')<>2 or private.is_blocked(case when actor=item.user_a then item.user_b else item.user_a end)
 or exists(select 1 from private.hosted_rooms h join public.profiles host on host.id=h.owner_id where h.room_id=room.id and
  (h.is_test or host.status<>'active' or exists(select 1 from public.blocks b where (b.actor_id=h.owner_id and b.target_id in (item.user_a,item.user_b)) or (b.target_id=h.owner_id and b.actor_id in (item.user_a,item.user_b)))
  or (select count(*) from private.hosted_room_registrations b join public.profiles p on p.id=b.user_id where b.room_id=h.room_id and b.user_id in (item.user_a,item.user_b) and b.status='confirmed' and p.gender=b.category)<>2
  or h.visibility='link' and exists(select 1 from (values(item.user_a),(item.user_b)) m(id) where m.id<>h.owner_id and not exists(select 1 from private.hosted_room_invites i where i.room_id=h.room_id and i.user_id=m.id))))
 or exists(select 1 from public.encounters e where e.id<>item.id and e.status='live' and e.starts_at<=moment and e.ends_at>moment and (e.user_a in (item.user_a,item.user_b) or e.user_b in (item.user_a,item.user_b)))
 or exists(select 1 from private.extended_calls c where c.closed_at is null and c.ends_at>moment and (c.user_a in (item.user_a,item.user_b) or c.user_b in (item.user_a,item.user_b))) then
  update private.call_participants set left_at=coalesce(left_at,moment) where encounter_id=item.id;
  return jsonb_build_object('state','unavailable','mediaEnabled',false);
 end if;
 if exists(select 1 from private.call_participants where encounter_id=item.id and left_at is not null) then return jsonb_build_object('state','closed','mediaEnabled',false); end if;
 if item.starts_at>moment+interval '30 seconds' then return jsonb_build_object('state','scheduled','startsAt',item.starts_at,'mediaEnabled',false); end if;
 select * into lease from private.call_participants where encounter_id=item.id and user_id=actor;
 if lease.session_id is not null and lease.session_id<>sid then raise exception 'participant_session_changed'; end if;
 if p_action='prepare' then
  select s.entry_id into entry from public.room_presence s join public.room_entries e on e.id=s.entry_id and e.user_id=s.user_id and e.room_id=s.room_id
   where s.user_id=actor and s.room_id=item.room_id and s.active and s.expires_at>moment and (p_mode='audio' or e.media_mode='video');
  if entry is null then raise exception 'presence_required'; end if;
  insert into private.call_participants(encounter_id,user_id,session_id,entry_id,environment,assurance,mode,prepared_at,checked_at)
  values(item.id,actor,sid,entry,bill,case when auth.jwt()->>'aal'='aal2' then 'aal2' else 'aal1' end,p_mode,moment,moment)
  on conflict(encounter_id,user_id) do update set checked_at=excluded.checked_at,mode=excluded.mode,assurance=excluded.assurance;
  if not private.call_participant_valid(item.id,actor,moment,bill) then raise exception 'preparation_required'; end if;
 elsif p_action='heartbeat' then
  if not private.call_participant_valid(item.id,actor,moment,bill) then raise exception 'preparation_required'; end if;
  update private.call_participants set checked_at=moment where encounter_id=item.id and user_id=actor;
 end if;
 ready:=private.call_participant_valid(item.id,item.user_a,moment,bill) and private.call_participant_valid(item.id,item.user_b,moment,bill);
 if ready then select min(c.mode) into mode from private.call_participants c where c.encounter_id=item.id having count(distinct c.mode)=1; end if;
 return jsonb_build_object('state',case when ready and mode is not null and item.status='live' and item.starts_at<=moment then 'ready' else 'waiting' end,
 'selfReady',private.call_participant_valid(item.id,actor,moment,bill),'bothReady',ready and mode is not null,
 'mode',case when ready then mode else null end,'startsAt',item.starts_at,'endsAt',item.ends_at,'serverNow',moment,'leaseSeconds',45,'mediaEnabled',false);
end $$;

-- Persist withdrawal so removing a block or restoring a profile does not revive
-- an old preparation. These triggers only touch readiness rows, never acquire a
-- profile/room/encounter lock in reverse order.
create or replace function private.invalidate_call_readiness() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_table_name='call_readiness_settings' or tg_table_name='runtime_settings' then
  if tg_table_name='call_readiness_settings' then if new.enabled then return null; end if;
  else if new.admissions_enabled and new.billing_environment=old.billing_environment then return null; end if; end if;
  perform encounter_id from private.call_participants where left_at is null order by encounter_id,user_id for update;
  update private.call_participants set left_at=clock_timestamp() where left_at is null;
 elsif tg_table_name='room_presence' then
  if tg_op='UPDATE' then if new.active and new.expires_at>clock_timestamp() and new.room_id=old.room_id and new.entry_id=old.entry_id then return new; end if; end if;
  update private.call_participants set left_at=coalesce(left_at,clock_timestamp()) where user_id=old.user_id;
 elsif tg_table_name='blocks' then
  update private.call_participants c set left_at=coalesce(c.left_at,clock_timestamp()) from public.encounters e where e.id=c.encounter_id and
   ((new.actor_id in (e.user_a,e.user_b) and new.target_id in (e.user_a,e.user_b)) or exists(select 1 from private.hosted_rooms h where h.room_id=e.room_id and
    ((h.owner_id=new.actor_id and new.target_id in (e.user_a,e.user_b)) or (h.owner_id=new.target_id and new.actor_id in (e.user_a,e.user_b)))));
 elsif tg_table_name='encounters' then
  if new.status not in ('cancelled','ended') then return null; end if;
  update private.call_participants set left_at=coalesce(left_at,clock_timestamp()) where encounter_id=new.id;
 elsif tg_table_name='rooms' then
  if new.status not in ('cancelled','ended') then return null; end if;
  update private.call_participants c set left_at=coalesce(c.left_at,clock_timestamp()) from public.encounters e where e.id=c.encounter_id and e.room_id=new.id;
 elsif tg_table_name='profiles' then
  if new.status='active' then return new; end if;
  update private.call_participants c set left_at=coalesce(c.left_at,clock_timestamp()) from public.encounters e where e.id=c.encounter_id and
   (new.id in (e.user_a,e.user_b) or exists(select 1 from private.hosted_rooms h where h.room_id=e.room_id and h.owner_id=new.id));
 end if;
 return null;
end $$;
drop trigger if exists call_readiness_presence on public.room_presence;
create trigger call_readiness_presence after update or delete on public.room_presence for each row execute function private.invalidate_call_readiness();
drop trigger if exists call_readiness_block on public.blocks;
create trigger call_readiness_block after insert on public.blocks for each row execute function private.invalidate_call_readiness();
drop trigger if exists call_readiness_encounter on public.encounters;
create trigger call_readiness_encounter after update of status on public.encounters for each row execute function private.invalidate_call_readiness();
drop trigger if exists call_readiness_room on public.rooms;
create trigger call_readiness_room after update of status on public.rooms for each row execute function private.invalidate_call_readiness();
drop trigger if exists call_readiness_profile on public.profiles;
create trigger call_readiness_profile after update of status on public.profiles for each row execute function private.invalidate_call_readiness();
drop trigger if exists call_readiness_gate on private.call_readiness_settings;
create trigger call_readiness_gate after update of enabled on private.call_readiness_settings for each row execute function private.invalidate_call_readiness();
drop trigger if exists call_readiness_runtime on private.runtime_settings;
create trigger call_readiness_runtime after update of admissions_enabled,billing_environment on private.runtime_settings for each row execute function private.invalidate_call_readiness();
create or replace function public.call_readiness_state(p_encounter uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.call_readiness(p_encounter,'state',null); $$;
create or replace function public.call_readiness_action(p_encounter uuid,p_action text,p_mode text default null) returns jsonb language sql security invoker set search_path='' as $$ select private.call_readiness(p_encounter,p_action,p_mode); $$;
create or replace function private.export_call_readiness() returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not private.is_active_member() then raise exception 'registration_required'; end if;
 if (select count(*) from private.call_participants where user_id=auth.uid())>500 then raise exception 'export_too_large'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('encounterId',c.encounter_id,'mode',c.mode,'preparedAt',c.prepared_at,'checkedAt',c.checked_at,'leftAt',c.left_at) order by c.prepared_at,c.encounter_id) from private.call_participants c where c.user_id=auth.uid()),'[]'::jsonb);
end $$;
create or replace function public.export_call_readiness() returns jsonb language sql security invoker set search_path='' as $$ select private.export_call_readiness(); $$;
revoke all on function private.call_participant_valid(uuid,uuid,timestamptz,text),private.invalidate_call_readiness(),private.call_readiness(uuid,text,text),private.export_call_readiness() from public,anon,authenticated;
revoke all on function public.call_readiness_state(uuid),public.call_readiness_action(uuid,text,text),public.export_call_readiness() from public,anon,authenticated;
grant execute on function private.call_readiness(uuid,text,text),private.export_call_readiness(),public.call_readiness_state(uuid),public.call_readiness_action(uuid,text,text),public.export_call_readiness() to authenticated;

insert into private.call_readiness_settings(singleton,enabled) values(true,false) on conflict(singleton) do nothing;
