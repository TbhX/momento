-- Additive delta generated from schemas/90_salon_photos.sql.
-- Salon photos are an additional Premium view; never a public Storage URL.
create function private.room_photo_path(p_room uuid,p_peer uuid) returns text
language plpgsql security definer set search_path='' as $$
declare result text;
begin
 if not private.is_active_member() then raise exception 'registration_required' using errcode='42501'; end if;
 perform private.community_read_limit();
 if not private.has_premium() or not private.can_discover_room(p_room) or private.is_blocked(p_peer) then return null; end if;
 select m.object_path into result from public.profile_media m
 join public.profiles p on p.id=m.user_id and p.status='active'
 join public.room_presence s on s.user_id=p.id and s.room_id=p_room and s.active and s.expires_at>now()
 join public.rooms r on r.id=s.room_id and r.status in ('published','live') and r.closes_at>now()
 where m.user_id=p_peer and m.kind='avatar';
 return result;
end $$;
create function public.room_photo_path(p_room uuid,p_peer uuid) returns text language sql security invoker set search_path='' as $$ select private.room_photo_path(p_room,p_peer); $$;
revoke all on function private.room_photo_path(uuid,uuid),public.room_photo_path(uuid,uuid) from public,anon,authenticated;
grant execute on function private.room_photo_path(uuid,uuid),public.room_photo_path(uuid,uuid) to authenticated;
