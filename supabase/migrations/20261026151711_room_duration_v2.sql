create or replace function private.hosted_room_json(p_room uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',r.id,'title',r.title,'theme',r.theme_slug,'city',r.city,'profession',r.profession,
 'minAge',r.min_age,'maxAge',r.max_age,'capacity',r.capacity,'opensAt',r.opens_at,'closesAt',r.closes_at,
 'modes',r.allowed_modes,'status',r.status,'description',h.description,'color',h.color,'visibility',h.visibility,
 'isTest',h.is_test,'formatVersion',case when r.round_seconds=300 then 1 else 2 end,'rounds',case when r.round_seconds=300 then 10 else r.capacity/2 end,'roundSeconds',r.round_seconds,'breakSeconds',r.break_seconds,
 'women',(select count(*) from private.hosted_room_registrations b where b.room_id=r.id and b.status='confirmed' and b.category='woman'),
 'men',(select count(*) from private.hosted_room_registrations b where b.room_id=r.id and b.status='confirmed' and b.category='man'),
 'waiting',(select count(*) from private.hosted_room_registrations b where b.room_id=r.id and b.status='waiting'))
 from public.rooms r join private.hosted_rooms h on h.room_id=r.id where r.id=p_room;
$$;
create or replace function private.save_hosted_room(p_data jsonb,p_key uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); rid uuid; existing private.hosted_rooms; r public.rooms; cap integer; lo integer; hi integer; moment timestamptz; modes text[];
begin
 if not private.is_active_member() then raise exception 'registration_required' using errcode='42501'; end if;
 if p_key is null or jsonb_typeof(p_data)<>'object' or length(p_data::text)>5000 or exists(select 1 from jsonb_object_keys(p_data) k where k not in ('id','title','description','theme','city','profession','minAge','maxAge','capacity','opensAt','modes','color','visibility')) then raise exception 'invalid_request' using errcode='22023'; end if;
 cap:=(p_data->>'capacity')::integer; lo:=(p_data->>'minAge')::integer; hi:=(p_data->>'maxAge')::integer; moment:=(p_data->>'opensAt')::timestamptz;
 select array_agg(x) into modes from jsonb_array_elements_text(p_data->'modes') x;
 if cap is null or cap not in (20,50,100) or lo is null or hi is null or lo<18 or hi>100 or lo>hi or moment is null or not isfinite(moment) or moment<now()+interval '10 minutes' or moment>now()+interval '90 days'
 or length(btrim(coalesce(p_data->>'title',''))) not between 3 and 80 or length(coalesce(p_data->>'description',''))>500
 or length(btrim(coalesce(p_data->>'city',''))) not between 1 and 100 or length(coalesce(p_data->>'profession',''))>120
 or not exists(select 1 from public.themes where slug=p_data->>'theme' and active)
 or coalesce(p_data->>'color','') not in ('duo','rose','blue','lavender') or coalesce(p_data->>'visibility','') not in ('public','link')
 or modes is null or cardinality(modes) not between 1 and 2 or not modes<@array['audio','video']::text[] or cardinality(modes)<>(select count(distinct x) from unnest(modes) x)
 then raise exception 'invalid_request' using errcode='22023'; end if;
 perform 1 from public.profiles where id=actor and status='active' for update;
 if not found then raise exception 'registration_required' using errcode='42501'; end if;
 if p_data->>'id' is not null then select * into existing from private.hosted_rooms where room_id=(p_data->>'id')::uuid and owner_id=actor;
 else select * into existing from private.hosted_rooms where owner_id=actor and draft_key=p_key; end if;
 if existing.room_id is not null then
  select * into r from public.rooms where id=existing.room_id for update;
  if r.status<>'draft' then raise exception 'room_locked'; end if; rid:=r.id;
 elsif p_data->>'id' is not null then raise exception 'room_unavailable';
 else
  if (select count(*) from private.hosted_rooms h join public.rooms catalog_room on catalog_room.id=h.room_id where h.owner_id=actor and catalog_room.status='draft')>=10 then raise exception 'draft_limit'; end if;
  perform private.community_limit('host-draft',20);
  insert into public.rooms(title,opens_at,closes_at) values(btrim(p_data->>'title'),moment,moment+case when cap=20 then interval '60 minutes' when cap=50 then interval '75 minutes' else interval '150 minutes' end) returning id into rid;
  insert into private.hosted_rooms(room_id,owner_id,draft_key) values(rid,actor,p_key);
 end if;
 update public.rooms set title=btrim(p_data->>'title'),theme_slug=p_data->>'theme',city=btrim(p_data->>'city'),profession=nullif(btrim(p_data->>'profession'),''),min_age=lo,max_age=hi,capacity=cap,
  opens_at=moment,closes_at=moment+case when cap=20 then interval '60 minutes' when cap=50 then interval '75 minutes' else interval '150 minutes' end,round_seconds=case when cap=20 then 330 else 150 end,break_seconds=30,allowed_modes=modes where id=rid;
 update private.hosted_rooms set description=coalesce(p_data->>'description',''),color=p_data->>'color',visibility=p_data->>'visibility' where room_id=rid returning * into existing;
 return private.hosted_room_json(rid)||jsonb_build_object('shareCode',existing.share_code);
end $$;
