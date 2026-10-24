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
