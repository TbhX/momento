-- Personal reservations, bounded and bound to the current active member.
create or replace function private.joined_rooms_page(p_after timestamptz default null,p_after_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare rows jsonb; items jsonb; last_row jsonb;
begin
 perform private.community_read_limit();
 if (p_after is null)<>(p_after_id is null) or (p_after is not null and not isfinite(p_after)) then
  raise exception 'invalid_request' using errcode='22023';
 end if;
 select coalesce(jsonb_agg(to_jsonb(x) order by x."opensAt",x.id),'[]'::jsonb) into rows from (
  select r.id,r.title,r.opens_at as "opensAt",r.closes_at as "closesAt",r.capacity,r.city,r.theme_slug as theme,
   b.status as registration,h.is_test as "isTest"
  from private.hosted_room_registrations b join public.rooms r on r.id=b.room_id join private.hosted_rooms h on h.room_id=r.id
  where b.user_id=auth.uid() and b.status in ('confirmed','waiting') and r.status in ('published','live')
   and r.closes_at>now() and private.can_discover_room(r.id)
   and (p_after is null or (r.opens_at,r.id)>(p_after,p_after_id))
  order by r.opens_at,r.id limit 13
 ) x;
 select coalesce(jsonb_agg(value order by ord),'[]'::jsonb) into items from jsonb_array_elements(rows) with ordinality as e(value,ord) where ord<=12;
 last_row:=items->(jsonb_array_length(items)-1);
 return jsonb_build_object('items',items,'hasMore',jsonb_array_length(rows)>12,'next',case when jsonb_array_length(rows)>12 then jsonb_build_object('at',last_row->>'opensAt','id',last_row->>'id') else null end);
end $$;
create or replace function public.joined_rooms_page(p_after timestamptz default null,p_after_id uuid default null)
returns jsonb language sql security invoker set search_path='' as $$ select private.joined_rooms_page(p_after,p_after_id); $$;
revoke all on function private.joined_rooms_page(timestamptz,uuid),public.joined_rooms_page(timestamptz,uuid) from public,anon,authenticated;
grant execute on function private.joined_rooms_page(timestamptz,uuid),public.joined_rooms_page(timestamptz,uuid) to authenticated;
