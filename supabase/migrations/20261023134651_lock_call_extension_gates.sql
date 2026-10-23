-- Generated from the revised lock_call_encounter declaration.
-- Keep service closure and the billing environment stable through settlement.
create or replace function private.lock_call_encounter(p_encounter uuid) returns public.encounters
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
