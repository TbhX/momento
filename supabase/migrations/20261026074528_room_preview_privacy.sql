create or replace function private.room_preview(p_room uuid) returns table(user_id uuid,display_name text,age smallint,city text,profession text)
language plpgsql security definer set search_path = '' as $$
begin
  perform private.community_read_limit();
  if not private.can_discover_room(p_room) then raise exception 'room_unavailable' using errcode='42501'; end if;
  -- Keep legacy column types for callers; no demographic details leave this preview.
  return query select p.id,p.display_name,null::smallint,null::text,null::text from public.room_presence s
    join public.rooms r on r.id = s.room_id join public.profiles p on p.id = s.user_id
    where r.id = p_room and r.status in ('published','live') and r.closes_at > now() and s.active and s.expires_at > now()
    and p.status = 'active' and not private.is_blocked(p.id) order by p.id limit 20;
end $$;
