-- Persistent community data. The caller is always the verified Auth member.
-- Public wrappers have no user/role/entitlement parameter and never mint media tokens.
create function private.community_limit(p_kind text,p_max integer) returns void
language plpgsql security definer set search_path = '' as $$
declare n integer; k text;
begin
 k := 'social:' || p_kind || ':' || auth.uid()::text || ':' || (now() at time zone 'Europe/Paris')::date::text;
 insert into private.rate_limits(key_hash,count,expires_at) values(k,1,now()+interval '2 days')
 on conflict(key_hash) do update set count=private.rate_limits.count+1 returning count into n;
 if n>p_max then raise exception 'rate_limit' using errcode='P0001'; end if;
end $$;

create function private.community_snapshot() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare actor uuid:=auth.uid(); result jsonb;
begin
 if not private.is_active_member() then raise exception 'registration_required' using errcode='42501'; end if;
 select jsonb_build_object(
 'memberId',actor,
 'admissionsEnabled',coalesce((select admissions_enabled from private.runtime_settings where singleton),false),
 'themes',coalesce((select jsonb_agg(jsonb_build_object('slug',slug,'label',label) order by label) from public.themes where active),'[]'::jsonb),
 'rooms',coalesce((select jsonb_agg(to_jsonb(x) order by x.opens_at,x.id) from (
   select r.id,r.title,r.theme_slug,r.city,r.profession,r.min_age,r.max_age,r.capacity,r.round_seconds,r.allowed_modes,r.opens_at,r.closes_at,
    (select count(*) from public.room_presence s join public.profiles p on p.id=s.user_id
      where s.room_id=r.id and s.active and s.expires_at>now() and p.status='active' and not private.is_blocked(p.id)) as present
   from public.rooms r where r.status in ('published','live') and r.closes_at>now() order by r.opens_at,r.id limit 60
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

create function private.friend_action(p_target uuid,p_action text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare actor uuid:=auth.uid(); item public.friend_requests;
begin
 if not private.is_active_member() then raise exception 'registration_required' using errcode='42501'; end if;
 if p_target is null or p_target=actor or p_action is null or p_action not in ('request','accept','decline','cancel','remove') then raise exception 'invalid_request' using errcode='22023'; end if;
 -- All pair operations take the same deterministic profile locks, including blocking.
 perform id from public.profiles where id in (actor,p_target) order by id for update;
 if not exists(select 1 from public.profiles where id=actor and status='active') then raise exception 'registration_required' using errcode='42501'; end if;
 if not exists(select 1 from public.profiles where id=p_target and status='active') or private.is_blocked(p_target) then raise exception 'peer_unavailable' using errcode='42501'; end if;
 if p_action='remove' then
   delete from public.friendships where user_a=least(actor,p_target) and user_b=greatest(actor,p_target);
   update public.video_requests set status='cancelled' where ((sender_id=actor and recipient_id=p_target) or (sender_id=p_target and recipient_id=actor)) and status in ('pending','accepted');
   return jsonb_build_object('status','removed');
 end if;
 select * into item from public.friend_requests where ((sender_id=actor and recipient_id=p_target) or (sender_id=p_target and recipient_id=actor)) and status='pending' for update;
 if p_action='request' then
   if exists(select 1 from public.friendships where user_a=least(actor,p_target) and user_b=greatest(actor,p_target)) then return jsonb_build_object('status','friends'); end if;
   if item.id is not null then return jsonb_build_object('status','pending','outgoing',item.sender_id=actor); end if;
   if not exists(select 1 from public.encounters where user_a=least(actor,p_target) and user_b=greatest(actor,p_target) and status in ('live','ended') and starts_at>now()-interval '30 days' and starts_at<=now())
   and not exists(select 1 from public.room_presence a join public.room_presence b on a.room_id=b.room_id join public.rooms r on r.id=a.room_id
     where a.user_id=actor and b.user_id=p_target and a.active and b.active and a.expires_at>now() and b.expires_at>now() and r.status in ('published','live') and r.opens_at<=now() and r.closes_at>now())
   then raise exception 'peer_unavailable' using errcode='42501'; end if;
   if exists(select 1 from public.friend_requests where ((sender_id=actor and recipient_id=p_target) or (sender_id=p_target and recipient_id=actor)) and created_at>now()-interval '7 days') then raise exception 'request_cooldown' using errcode='P0001'; end if;
   perform private.community_limit('friend',20);
   insert into public.friend_requests(sender_id,recipient_id) values(actor,p_target) returning * into item;
   return jsonb_build_object('status','pending','id',item.id,'outgoing',true);
 end if;
 if item.id is null then raise exception 'request_unavailable' using errcode='22023'; end if;
 if (p_action in ('accept','decline') and item.recipient_id<>actor) or (p_action='cancel' and item.sender_id<>actor) then raise exception 'request_unavailable' using errcode='42501'; end if;
 update public.friend_requests set status=case p_action when 'accept' then 'accepted' when 'decline' then 'declined' else 'cancelled' end where id=item.id;
 if p_action='accept' then insert into public.friendships(user_a,user_b) values(least(actor,p_target),greatest(actor,p_target)) on conflict do nothing; end if;
 return jsonb_build_object('status',case p_action when 'accept' then 'friends' when 'decline' then 'declined' else 'cancelled' end);
end $$;

create function private.invitation_action(p_target uuid,p_action text,p_mode text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare actor uuid:=auth.uid(); item public.video_requests;
begin
 if not private.is_active_member() then raise exception 'registration_required' using errcode='42501'; end if;
 if p_target is null or p_target=actor or p_action is null or p_action not in ('request','accept','decline','cancel') or p_mode is null or p_mode not in ('audio','video') then raise exception 'invalid_request' using errcode='22023'; end if;
 perform id from public.profiles where id in (actor,p_target) order by id for update;
 if not exists(select 1 from public.profiles where id=actor and status='active') then raise exception 'registration_required' using errcode='42501'; end if;
 if not exists(select 1 from public.profiles where id=p_target and status='active') or private.is_blocked(p_target)
 or not exists(select 1 from public.friendships where user_a=least(actor,p_target) and user_b=greatest(actor,p_target)) then raise exception 'peer_unavailable' using errcode='42501'; end if;
 select * into item from public.video_requests where ((sender_id=actor and recipient_id=p_target) or (sender_id=p_target and recipient_id=actor)) and status in ('pending','accepted') and expires_at>now() order by created_at desc limit 1 for update;
 if p_action='request' then
   if item.id is not null then return jsonb_build_object('status',item.status,'id',item.id,'outgoing',item.sender_id=actor); end if;
   if (select count(*) from public.video_requests where sender_id=actor and status in ('pending','accepted') and expires_at>now())>=3 then raise exception 'invitation_limit' using errcode='P0001'; end if;
   perform private.community_limit('invitation',10);
   insert into public.video_requests(sender_id,recipient_id,media_mode,expires_at) values(actor,p_target,p_mode,now()+interval '24 hours') returning * into item;
   return jsonb_build_object('status','pending','id',item.id,'outgoing',true);
 end if;
 if item.id is null then raise exception 'request_unavailable' using errcode='22023'; end if;
 if (p_action in ('accept','decline') and item.recipient_id<>actor) or (p_action='cancel' and item.sender_id<>actor) then raise exception 'request_unavailable' using errcode='42501'; end if;
 if item.status='accepted' and p_action='accept' then return jsonb_build_object('status','accepted','id',item.id); end if;
 update public.video_requests set status=case p_action when 'accept' then 'accepted' when 'decline' then 'declined' else 'cancelled' end where id=item.id;
 return jsonb_build_object('status',case p_action when 'accept' then 'accepted' when 'decline' then 'declined' else 'cancelled' end,'callEnabled',false,'charged',false);
end $$;

create function private.block_peer(p_target uuid,p_reason text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare actor uuid:=auth.uid(); known boolean;
begin
 if not private.is_active_member() then raise exception 'registration_required' using errcode='42501'; end if;
 if p_target is null or p_target=actor or (p_reason is not null and (length(trim(p_reason))<1 or length(p_reason)>1000)) then raise exception 'invalid_request' using errcode='22023'; end if;
 perform id from public.profiles where id in (actor,p_target) order by id for update;
 if not exists(select 1 from public.profiles where id=actor and status='active') then raise exception 'registration_required' using errcode='42501'; end if;
 known:=exists(select 1 from public.friendships where user_a=least(actor,p_target) and user_b=greatest(actor,p_target))
 or exists(select 1 from public.friend_requests where ((sender_id=actor and recipient_id=p_target) or (sender_id=p_target and recipient_id=actor)))
 or exists(select 1 from public.encounters where user_a=least(actor,p_target) and user_b=greatest(actor,p_target))
 or exists(select 1 from public.matches where user_a=least(actor,p_target) and user_b=greatest(actor,p_target))
 or exists(select 1 from public.blocks where actor_id=actor and target_id=p_target);
 if not known then raise exception 'peer_unavailable' using errcode='42501'; end if;
 insert into public.blocks(actor_id,target_id) values(actor,p_target) on conflict do nothing;
 delete from public.friendships where user_a=least(actor,p_target) and user_b=greatest(actor,p_target);
 update public.friend_requests set status='cancelled' where ((sender_id=actor and recipient_id=p_target) or (sender_id=p_target and recipient_id=actor)) and status='pending';
 update public.video_requests set status='cancelled' where ((sender_id=actor and recipient_id=p_target) or (sender_id=p_target and recipient_id=actor)) and status in ('pending','accepted');
 if p_reason is not null then
   perform private.community_limit('report',10);
   insert into public.reports(reporter_id,target_id,reason) values(actor,p_target,trim(p_reason));
 end if;
 return jsonb_build_object('blocked',true,'reported',p_reason is not null);
end $$;

create function public.community_snapshot() returns jsonb language sql security invoker set search_path='' as $$ select private.community_snapshot(); $$;
create function public.friend_action(p_target uuid,p_action text) returns jsonb language sql security invoker set search_path='' as $$ select private.friend_action(p_target,p_action); $$;
create function public.invitation_action(p_target uuid,p_action text,p_mode text) returns jsonb language sql security invoker set search_path='' as $$ select private.invitation_action(p_target,p_action,p_mode); $$;
create function public.block_peer(p_target uuid,p_reason text default null) returns jsonb language sql security invoker set search_path='' as $$ select private.block_peer(p_target,p_reason); $$;
revoke all on function private.community_limit(text,integer) from public,anon,authenticated;
revoke all on function private.community_snapshot(),private.friend_action(uuid,text),private.invitation_action(uuid,text,text),private.block_peer(uuid,text) from public,anon,authenticated;
revoke all on function public.community_snapshot(),public.friend_action(uuid,text),public.invitation_action(uuid,text,text),public.block_peer(uuid,text) from public,anon,authenticated;
grant execute on function private.community_snapshot(),private.friend_action(uuid,text),private.invitation_action(uuid,text,text),private.block_peer(uuid,text) to authenticated;
grant execute on function public.community_snapshot(),public.friend_action(uuid,text),public.invitation_action(uuid,text,text),public.block_peer(uuid,text) to authenticated;
-- Blocking is atomic with request cancellation; direct table writes cannot skip it.
revoke insert,delete on public.blocks from authenticated;
