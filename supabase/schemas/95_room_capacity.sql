-- Aggregate, Auth-bound indicators. No participant identity or subscription is returned.
create function private.room_seat_snapshots(p_rooms uuid[]) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 perform private.community_read_limit();
 if p_rooms is null or cardinality(p_rooms)>12 or array_ndims(p_rooms)>1 or array_position(p_rooms,null) is not null then
  raise exception 'invalid_request' using errcode='22023';
 end if;
 select coalesce(jsonb_agg(jsonb_build_object(
  'id',r.id,'capacity',r.capacity,'balanced',h.room_id is not null,
  'women',case when h.room_id is not null then reservations.women else null end,
  'men',case when h.room_id is not null then reservations.men else null end,
  'waiting',case when h.room_id is not null then reservations.waiting else null end,
  'present',presence.total,'womenPresent',presence.women,'menPresent',presence.men,
  'expected',case when h.room_id is not null then greatest(0,reservations.women+reservations.men-presence.total) else null end,
  'checkedAt',now()) order by r.id),'[]'::jsonb) into result
 from public.rooms r left join private.hosted_rooms h on h.room_id=r.id
 cross join lateral (
  select count(*) filter(where b.status='confirmed' and b.category='woman') as women,
   count(*) filter(where b.status='confirmed' and b.category='man') as men,
   count(*) filter(where b.status='waiting') as waiting
  from private.hosted_room_registrations b where b.room_id=r.id
 ) reservations
 cross join lateral (
  select count(*) as total,count(*) filter(where p.gender='woman') as women,count(*) filter(where p.gender='man') as men
  from public.room_presence s join public.profiles p on p.id=s.user_id
  where s.room_id=r.id and s.active and s.expires_at>now() and p.status='active'
   and (h.room_id is null or exists(select 1 from private.hosted_room_registrations b where b.room_id=r.id and b.user_id=p.id and b.status='confirmed' and b.category=p.gender))
 ) presence
 where r.id=any(p_rooms) and r.status in ('published','live') and r.closes_at>now() and private.can_discover_room(r.id);
 return result;
end $$;
create function public.room_seat_snapshots(p_rooms uuid[]) returns jsonb language sql security invoker set search_path='' as $$ select private.room_seat_snapshots(p_rooms); $$;
revoke all on function private.room_seat_snapshots(uuid[]),public.room_seat_snapshots(uuid[]) from public,anon,authenticated;
grant execute on function private.room_seat_snapshots(uuid[]),public.room_seat_snapshots(uuid[]) to authenticated;
