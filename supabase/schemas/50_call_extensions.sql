-- Conditional call extensions. Disabled until real scheduling, media and billing
-- have been validated. No card purchase, media token or friendship is created here.
create table private.call_extension_settings (
 singleton boolean primary key default true check(singleton),
 enabled boolean not null default false
);
create table private.call_extensions (
 id uuid primary key default gen_random_uuid(),
 encounter_id uuid not null references public.encounters(id) on delete cascade,
 requester_id uuid not null references public.profiles(id) on delete cascade,
 recipient_id uuid not null references public.profiles(id) on delete cascade,
 requester_session uuid not null,
 request_key uuid not null,
 environment text not null check(environment in ('test','live')),
 quoted_credits smallint not null check(quoted_credits in (0,1)),
 authorized_at timestamptz not null,
 expires_at timestamptz not null check(expires_at>authorized_at),
 status text not null default 'pending' check(status in ('pending','accepted','declined','cancelled','expired')),
 decided_at timestamptz,
 charged_credits smallint not null default 0 check(charged_credits in (0,1)),
 debit_id uuid unique references public.credit_ledger(id) on delete set null,
 unique(requester_id,request_key),
 check(requester_id<>recipient_id),
 check((status='pending')=(decided_at is null)),
 check(charged_credits<=quoted_credits and (charged_credits=0 or status='accepted'))
);
create unique index call_extensions_one_pending on private.call_extensions(encounter_id) where status='pending';
create unique index call_extensions_one_accepted on private.call_extensions(encounter_id) where status='accepted';
create index call_extensions_requester on private.call_extensions(requester_id,authorized_at);
create index call_extensions_recipient on private.call_extensions(recipient_id,authorized_at);
create index call_extensions_encounter on private.call_extensions(encounter_id,authorized_at desc,id desc);
create table private.extended_calls (
 id uuid primary key default gen_random_uuid(),
 extension_id uuid not null unique references private.call_extensions(id) on delete cascade,
 encounter_id uuid not null unique references public.encounters(id) on delete cascade,
 user_a uuid not null references public.profiles(id) on delete cascade,
 user_b uuid not null references public.profiles(id) on delete cascade,
 starts_at timestamptz not null,
 ends_at timestamptz not null check(ends_at=starts_at+interval '3 minutes'),
 closed_at timestamptz,
 check(user_a<user_b)
);
create index extended_calls_a on private.extended_calls(user_a,ends_at);
create index extended_calls_b on private.extended_calls(user_b,ends_at);
alter table private.call_extension_settings enable row level security;
alter table private.call_extensions enable row level security;
alter table private.extended_calls enable row level security;
revoke all on private.call_extension_settings,private.call_extensions,private.extended_calls from public,anon,authenticated;
grant all on private.call_extension_settings,private.call_extensions,private.extended_calls to service_role;

-- Internal helpers are deliberately not executable by members. Only the six
-- Auth-bound operations below are exposed through SECURITY INVOKER wrappers.
create function private.call_extensions_enabled() returns boolean language sql stable security definer set search_path='' as $$
 select coalesce((select e.enabled and r.admissions_enabled from private.call_extension_settings e cross join private.runtime_settings r where e.singleton and r.singleton),false);
$$;
create function private.extension_receipt(p_item private.call_extensions) returns jsonb language sql security invoker set search_path='' as $$
 select jsonb_build_object('id',p_item.id,'encounterId',p_item.encounter_id,'requesterId',p_item.requester_id,'recipientId',p_item.recipient_id,
 'outgoing',p_item.requester_id=auth.uid(),'status',case when p_item.status='pending' and p_item.expires_at<=clock_timestamp() then 'expired' else p_item.status end,
 'quotedCredits',p_item.quoted_credits,'chargedCredits',p_item.charged_credits,'authorizedAt',p_item.authorized_at,'expiresAt',p_item.expires_at,'decidedAt',p_item.decided_at);
$$;
create function private.lock_call_encounter(p_encounter uuid) returns public.encounters
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); item public.encounters; room public.rooms; moment timestamptz;
begin
 if not private.is_active_member() then raise exception 'registration_required' using errcode='42501'; end if;
 if not private.call_extensions_enabled() then raise exception 'call_extensions_disabled' using errcode='42501'; end if;
 select * into item from public.encounters where id=p_encounter and actor in (user_a,user_b);
 if not found then raise exception 'encounter_unavailable' using errcode='42501'; end if;
 -- Same pair lock order as friendships/blocking. Presence is locked BEFORE a
 -- request, so a concurrent departure can cancel without a reversed lock order.
 perform id from public.profiles where id in (item.user_a,item.user_b) order by id for update;
 if (select count(*) from public.profiles where id in (item.user_a,item.user_b) and status='active')<>2
 or private.is_blocked(case when actor=item.user_a then item.user_b else item.user_a end) then raise exception 'peer_unavailable' using errcode='42501'; end if;
 -- Keep closure and billing environment stable through settlement. Take these
 -- locks after the pair locks in every operation, including replies.
 perform singleton from private.call_extension_settings where singleton and enabled for share;
 if not found then raise exception 'call_extensions_disabled' using errcode='42501'; end if;
 perform singleton from private.runtime_settings where singleton and admissions_enabled for share;
 if not found then raise exception 'call_extensions_disabled' using errcode='42501'; end if;
 select * into room from public.rooms where id=item.room_id for share;
 select * into item from public.encounters where id=p_encounter for update;
 perform user_id from public.room_presence where user_id in (item.user_a,item.user_b) order by user_id for update;
 moment:=clock_timestamp();
 if item.status<>'live' or item.starts_at>moment or item.ends_at+interval '30 seconds'<=moment
 or room.status not in ('published','live') or room.opens_at>moment or room.closes_at<=moment then raise exception 'encounter_unavailable' using errcode='22023'; end if;
 if (select count(*) from public.room_presence where user_id in (item.user_a,item.user_b) and room_id=item.room_id and active and expires_at>moment)<>2
 then raise exception 'peer_unavailable' using errcode='42501'; end if;
 if exists(select 1 from public.encounters e where e.id<>item.id and (e.user_a in (item.user_a,item.user_b) or e.user_b in (item.user_a,item.user_b)) and e.status='live' and e.starts_at>item.starts_at and e.starts_at<=moment)
 or exists(select 1 from private.extended_calls c where (c.user_a in (item.user_a,item.user_b) or c.user_b in (item.user_a,item.user_b)) and c.closed_at is null and c.ends_at>moment)
 then raise exception 'encounter_unavailable' using errcode='22023'; end if;
 return item;
end $$;

create function private.vote_encounter(p_encounter uuid,p_interested boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare item public.encounters; matched boolean;
begin
 if p_interested is null then raise exception 'invalid_request' using errcode='22023'; end if;
 item:=private.lock_call_encounter(p_encounter);
 insert into public.encounter_votes(encounter_id,user_id,interested) values(item.id,auth.uid(),p_interested)
 on conflict(encounter_id,user_id) do update set interested=excluded.interested,created_at=clock_timestamp();
 matched:=(select count(*)=2 from public.encounter_votes where encounter_id=item.id and user_id in (item.user_a,item.user_b) and interested);
 if matched then
  insert into public.matches(encounter_id,user_a,user_b) values(item.id,item.user_a,item.user_b) on conflict(encounter_id) do nothing;
 else
  delete from public.matches where encounter_id=item.id;
  update private.call_extensions set status='cancelled',decided_at=clock_timestamp() where encounter_id=item.id and status='pending';
 end if;
 -- A single yes stays private; only a mutual match is returned.
 return jsonb_build_object('interested',p_interested,'matched',matched);
end $$;

create function private.propose_call_extension(p_encounter uuid,p_request uuid,p_max_credits integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); item public.encounters; offer private.call_extensions; billing_env text; cost smallint; moment timestamptz; session_id uuid;
begin
 if p_request is null or p_max_credits is null or p_max_credits not in (0,1) then raise exception 'invalid_request' using errcode='22023'; end if;
 if not private.is_active_member() then raise exception 'registration_required' using errcode='42501'; end if;
 -- A retry keeps the original authorization and cannot send or settle again.
 select * into offer from private.call_extensions where requester_id=actor and request_key=p_request;
 if found then
  if offer.encounter_id<>p_encounter or offer.quoted_credits>p_max_credits then raise exception 'request_conflict' using errcode='22023'; end if;
  return private.extension_receipt(offer)||jsonb_build_object('reused',true);
 end if;
 item:=private.lock_call_encounter(p_encounter); moment:=clock_timestamp();
 -- Re-read after the pair locks: concurrent retries may have inserted it.
 select * into offer from private.call_extensions where requester_id=actor and request_key=p_request;
 if found then
  if offer.encounter_id<>p_encounter or offer.quoted_credits>p_max_credits then raise exception 'request_conflict' using errcode='22023'; end if;
  return private.extension_receipt(offer)||jsonb_build_object('reused',true);
 end if;
 if not exists(select 1 from public.matches where encounter_id=item.id and user_a=item.user_a and user_b=item.user_b and (expires_at is null or expires_at>moment))
 or (select count(*) from public.encounter_votes where encounter_id=item.id and user_id in (item.user_a,item.user_b) and interested)<>2 then raise exception 'match_required' using errcode='42501'; end if;
 update private.call_extensions set status='expired',decided_at=moment where encounter_id=item.id and status='pending' and expires_at<=moment;
 if exists(select 1 from private.call_extensions where encounter_id=item.id and status in ('pending','accepted')) then raise exception 'request_conflict' using errcode='22023'; end if;
 select billing_environment into billing_env from private.runtime_settings where singleton;
 cost:=case when exists(select 1 from public.entitlements where user_id=actor and environment=billing_env and starts_at<=moment and ends_at>moment and revoked_at is null) then 0 else 1 end;
 if cost>p_max_credits then raise exception 'authorization_required' using errcode='42501'; end if;
 if cost=1 and (select coalesce(sum(amount),0) from public.credit_ledger where user_id=actor and environment=billing_env and unit='video_call')<1 then raise exception 'credit_required' using errcode='42501'; end if;
 session_id:=(auth.jwt()->>'session_id')::uuid;
 perform private.community_limit('extension',30);
 insert into private.call_extensions(encounter_id,requester_id,recipient_id,requester_session,request_key,environment,quoted_credits,authorized_at,expires_at)
 values(item.id,actor,case when actor=item.user_a then item.user_b else item.user_a end,session_id,p_request,billing_env,cost,moment,least(moment+interval '30 seconds',item.ends_at+interval '30 seconds')) returning * into offer;
 return private.extension_receipt(offer)||jsonb_build_object('reused',false);
end $$;

create function private.answer_call_extension(p_request uuid,p_action text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); offer private.call_extensions; item public.encounters; moment timestamptz; billing_env text; cost smallint; debit uuid; call_id uuid; invalid_reason text;
begin
 if not private.is_active_member() then raise exception 'registration_required' using errcode='42501'; end if;
 if p_action is null or p_action not in ('accept','decline','cancel') then raise exception 'invalid_request' using errcode='22023'; end if;
 select * into offer from private.call_extensions where id=p_request and actor in (requester_id,recipient_id);
 if not found or (p_action='cancel' and actor<>offer.requester_id) or (p_action<>'cancel' and actor<>offer.recipient_id) then raise exception 'request_unavailable' using errcode='42501'; end if;
 perform id from public.profiles where id in (offer.requester_id,offer.recipient_id) order by id for update;
 if not private.is_active_member() then raise exception 'registration_required' using errcode='42501'; end if;
 if p_action='accept' then
  -- Validation failures are persisted as a terminal state, not thrown after an
  -- update (which would roll it back). No purchase or fallback payer is allowed.
  begin item:=private.lock_call_encounter(offer.encounter_id);
  exception when sqlstate '42501' or sqlstate '22023' then invalid_reason:=sqlerrm; end;
 end if;
 select * into offer from private.call_extensions where id=p_request for update;
 if offer.status<>'pending' then
  if offer.status=(case p_action when 'accept' then 'accepted' when 'decline' then 'declined' else 'cancelled' end)
  then
   if offer.status='accepted' then
    return private.extension_receipt(offer)||(select jsonb_build_object('callId',c.id,'endsAt',c.ends_at,'reused',true,'mediaEnabled',false) from private.extended_calls c where c.extension_id=offer.id);
   end if;
   return private.extension_receipt(offer)||jsonb_build_object('reused',true);
  end if;
  return private.extension_receipt(offer)||jsonb_build_object('reused',true,'reason','request_unavailable');
 end if;
 moment:=clock_timestamp();
 if offer.expires_at<=moment then invalid_reason:='request_expired'; end if;
 if p_action='accept' and invalid_reason is null then
  select billing_environment into billing_env from private.runtime_settings where singleton;
  if offer.environment<>billing_env then invalid_reason:='environment_changed';
  elsif not exists(select 1 from auth.sessions where id=offer.requester_session and user_id=offer.requester_id and (not_after is null or not_after>moment)) then invalid_reason:='peer_unavailable';
  elsif not exists(select 1 from public.matches where encounter_id=item.id and user_a=item.user_a and user_b=item.user_b and (expires_at is null or expires_at>moment))
    or (select count(*) from public.encounter_votes where encounter_id=item.id and user_id in (item.user_a,item.user_b) and interested)<>2 then invalid_reason:='match_required';
  else
   cost:=case when exists(select 1 from public.entitlements where user_id=offer.requester_id and environment=billing_env and starts_at<=moment and ends_at>moment and revoked_at is null) then 0 else 1 end;
   if cost>offer.quoted_credits then invalid_reason:='authorization_required';
   elsif cost=1 and (select coalesce(sum(amount),0) from public.credit_ledger where user_id=offer.requester_id and environment=billing_env and unit='video_call')<1 then invalid_reason:='credit_required'; end if;
  end if;
 end if;
 if invalid_reason is not null then
  update private.call_extensions set status=case when invalid_reason='request_expired' then 'expired' else 'cancelled' end,decided_at=moment where id=offer.id returning * into offer;
  return private.extension_receipt(offer)||jsonb_build_object('reason',invalid_reason,'reused',false);
 end if;
 if p_action<>'accept' then
  update private.call_extensions set status=case p_action when 'decline' then 'declined' else 'cancelled' end,decided_at=moment where id=offer.id returning * into offer;
  return private.extension_receipt(offer)||jsonb_build_object('reused',false);
 end if;
 if cost=1 then
  insert into public.credit_ledger(user_id,unit,amount,environment,reason,idempotency_key)
  values(offer.requester_id,'video_call',-1,billing_env,'consume','call-extension:'||offer.id::text) returning id into debit;
 end if;
 update private.call_extensions set status='accepted',decided_at=moment,charged_credits=cost,debit_id=debit where id=offer.id returning * into offer;
 insert into private.extended_calls(extension_id,encounter_id,user_a,user_b,starts_at,ends_at)
 values(offer.id,item.id,item.user_a,item.user_b,moment,moment+interval '3 minutes') returning id into call_id;
 -- Both members leave the collective rotation; its original deadline is kept.
 update public.room_presence set active=false where user_id in (item.user_a,item.user_b);
 return private.extension_receipt(offer)||jsonb_build_object('callId',call_id,'endsAt',moment+interval '3 minutes','reused',false,'mediaEnabled',false);
end $$;

create function private.call_extension_state(p_encounter uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); item public.encounters; offer private.call_extensions; call_record private.extended_calls;
begin
 if not private.is_active_member() then raise exception 'registration_required' using errcode='42501'; end if;
 select * into item from public.encounters where id=p_encounter and actor in (user_a,user_b);
 if not found or private.is_blocked(case when actor=item.user_a then item.user_b else item.user_a end) then raise exception 'encounter_unavailable' using errcode='42501'; end if;
 select * into offer from private.call_extensions where encounter_id=item.id order by authorized_at desc,id desc limit 1;
 select * into call_record from private.extended_calls where encounter_id=item.id;
 return jsonb_build_object('encounterId',item.id,'enabled',private.call_extensions_enabled(),'mediaEnabled',false,
 'request',case when offer.id is null then null else private.extension_receipt(offer) end,
 'call',case when call_record.id is null then null else jsonb_build_object('id',call_record.id,'startsAt',call_record.starts_at,'endsAt',call_record.ends_at,'active',call_record.closed_at is null and call_record.ends_at>clock_timestamp()) end);
end $$;
create function private.close_extended_call(p_call uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare item private.extended_calls;
begin
 if not private.is_active_member() then raise exception 'registration_required' using errcode='42501'; end if;
 select * into item from private.extended_calls where id=p_call and auth.uid() in (user_a,user_b);
 if not found then raise exception 'request_unavailable' using errcode='42501'; end if;
 perform id from public.profiles where id in (item.user_a,item.user_b) order by id for update;
 update private.extended_calls set closed_at=coalesce(closed_at,clock_timestamp()) where id=item.id;
 return jsonb_build_object('closed',true,'id',item.id);
end $$;
create function private.export_call_extensions() returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if not private.has_active_session() then raise exception 'registration_required' using errcode='42501'; end if;
 if (select count(*) from private.call_extensions where auth.uid() in (requester_id,recipient_id))>=500 then raise exception 'export_too_large' using errcode='22023'; end if;
 return coalesce((select jsonb_agg(private.extension_receipt(q) order by q.authorized_at,q.id) from private.call_extensions q where auth.uid() in (q.requester_id,q.recipient_id)),'[]'::jsonb);
end $$;

-- Invalidate pending consent immediately on departure/block/suspension. Expired
-- leases and session revocation are rechecked before acceptance, using DB time.
create function private.invalidate_call_extensions() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_table_name='room_presence' then
  if new.active and new.expires_at>clock_timestamp() and new.room_id=old.room_id and new.entry_id=old.entry_id then return new; end if;
  update private.call_extensions set status='cancelled',decided_at=clock_timestamp() where status='pending' and (requester_id=old.user_id or recipient_id=old.user_id);
 elsif tg_table_name='blocks' then
  update private.call_extensions set status='cancelled',decided_at=clock_timestamp() where status='pending' and least(requester_id,recipient_id)=least(new.actor_id,new.target_id) and greatest(requester_id,recipient_id)=greatest(new.actor_id,new.target_id);
  update private.extended_calls set closed_at=coalesce(closed_at,clock_timestamp()) where user_a=least(new.actor_id,new.target_id) and user_b=greatest(new.actor_id,new.target_id) and closed_at is null;
 elsif tg_table_name='profiles' then
  if new.status='active' then return new; end if;
  update private.call_extensions set status='cancelled',decided_at=clock_timestamp() where status='pending' and (requester_id=new.id or recipient_id=new.id);
  update private.extended_calls set closed_at=coalesce(closed_at,clock_timestamp()) where (user_a=new.id or user_b=new.id) and closed_at is null;
 elsif tg_table_name='encounters' then
  if new.status<>'cancelled' then return new; end if;
  update private.call_extensions set status='cancelled',decided_at=clock_timestamp() where encounter_id=new.id and status='pending';
  update private.extended_calls set closed_at=coalesce(closed_at,clock_timestamp()) where encounter_id=new.id and closed_at is null;
 elsif tg_table_name='rooms' then
  if new.status not in ('cancelled','ended') then return new; end if;
  update private.call_extensions q set status='cancelled',decided_at=clock_timestamp() from public.encounters e where e.id=q.encounter_id and e.room_id=new.id and q.status='pending';
  if new.status='cancelled' then
   update private.extended_calls c set closed_at=coalesce(c.closed_at,clock_timestamp()) from public.encounters e where e.id=c.encounter_id and e.room_id=new.id and c.closed_at is null;
  end if;
 end if;
 return new;
end $$;
create trigger call_extensions_presence after update on public.room_presence for each row execute function private.invalidate_call_extensions();
create trigger call_extensions_block after insert on public.blocks for each row execute function private.invalidate_call_extensions();
create trigger call_extensions_profile after update of status on public.profiles for each row execute function private.invalidate_call_extensions();
create trigger call_extensions_encounter after update of status on public.encounters for each row execute function private.invalidate_call_extensions();
create trigger call_extensions_room after update of status on public.rooms for each row execute function private.invalidate_call_extensions();

create function private.guard_extended_call_presence() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.active and exists(select 1 from private.extended_calls where new.user_id in (user_a,user_b) and closed_at is null and ends_at>clock_timestamp()) then
  raise exception 'already_in_private_call' using errcode='22023';
 end if;
 return new;
end $$;
create trigger extended_call_presence_guard before insert or update on public.room_presence for each row execute function private.guard_extended_call_presence();

create function public.vote_encounter(p_encounter uuid,p_interested boolean) returns jsonb language sql security invoker set search_path='' as $$ select private.vote_encounter(p_encounter,p_interested); $$;
create function public.propose_call_extension(p_encounter uuid,p_request uuid,p_max_credits integer) returns jsonb language sql security invoker set search_path='' as $$ select private.propose_call_extension(p_encounter,p_request,p_max_credits); $$;
create function public.answer_call_extension(p_request uuid,p_action text) returns jsonb language sql security invoker set search_path='' as $$ select private.answer_call_extension(p_request,p_action); $$;
create function public.call_extension_state(p_encounter uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.call_extension_state(p_encounter); $$;
create function public.close_extended_call(p_call uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.close_extended_call(p_call); $$;
create function public.export_call_extensions() returns jsonb language sql security invoker set search_path='' as $$ select private.export_call_extensions(); $$;
revoke all on function private.call_extensions_enabled(),private.extension_receipt(private.call_extensions),private.lock_call_encounter(uuid),private.invalidate_call_extensions(),private.guard_extended_call_presence() from public,anon,authenticated;
revoke all on function private.vote_encounter(uuid,boolean),private.propose_call_extension(uuid,uuid,integer),private.answer_call_extension(uuid,text),private.call_extension_state(uuid),private.close_extended_call(uuid),private.export_call_extensions() from public,anon,authenticated;
revoke all on function public.vote_encounter(uuid,boolean),public.propose_call_extension(uuid,uuid,integer),public.answer_call_extension(uuid,text),public.call_extension_state(uuid),public.close_extended_call(uuid),public.export_call_extensions() from public,anon,authenticated;
grant execute on function private.vote_encounter(uuid,boolean),private.propose_call_extension(uuid,uuid,integer),private.answer_call_extension(uuid,text),private.call_extension_state(uuid),private.close_extended_call(uuid),private.export_call_extensions() to authenticated;
grant execute on function public.vote_encounter(uuid,boolean),public.propose_call_extension(uuid,uuid,integer),public.answer_call_extension(uuid,text),public.call_extension_state(uuid),public.close_extended_call(uuid),public.export_call_extensions() to authenticated;
