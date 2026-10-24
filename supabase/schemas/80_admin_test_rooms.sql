-- An administrator can publish an explicitly non-live, unlisted test event.
-- No paid entitlement, real admission or media authorization is created.
create function private.admin_publish_test_room(p_room uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); h private.hosted_rooms; r public.rooms; bill text;
begin
 if private.require_administrator()<>'admin' then raise exception 'admin_required' using errcode='42501'; end if;
 perform 1 from public.profiles where id=actor and status='active' for update;
 if not found then raise exception 'admin_required' using errcode='42501'; end if;
 perform 1 from private.admin_roles where user_id=actor and role='admin' and not setup_required for share;
 if not found then raise exception 'admin_required' using errcode='42501'; end if;
 select billing_environment into bill from private.runtime_settings where singleton for share;
 if bill is distinct from 'test' then raise exception 'test_environment_required' using errcode='42501'; end if;
 if not exists(select 1 from private.hosted_rooms where room_id=p_room and owner_id=actor) then raise exception 'room_unavailable'; end if;
 select * into r from public.rooms where id=p_room for update;
 select * into h from private.hosted_rooms where room_id=p_room for update;
 if h.is_test and r.status='published' then return private.hosted_room_json(p_room)||jsonb_build_object('shareCode',h.share_code,'chargedCredits',0,'reused',true); end if;
 if r.status<>'draft' or r.opens_at<clock_timestamp()+interval '10 minutes' then raise exception 'room_locked'; end if;
 if (select count(*) from private.hosted_rooms x join public.rooms y on y.id=x.room_id where x.owner_id=actor and y.status in ('published','live') and y.closes_at>now())>=3 then raise exception 'hosting_limit'; end if;
 perform private.community_limit('admin-test-publish',20);
 update private.hosted_rooms set is_test=true,visibility='link',environment='test',charged_credits=0,published_at=clock_timestamp() where room_id=p_room returning * into h;
 update public.rooms set status='published' where id=p_room;
 insert into private.admin_audit(actor_id,action,target_ref) values(actor,'test_room_published',p_room::text);
 return private.hosted_room_json(p_room)||jsonb_build_object('shareCode',h.share_code,'chargedCredits',0,'reused',false);
end $$;
create function public.admin_publish_test_room(p_room uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.admin_publish_test_room(p_room); $$;
revoke all on function private.admin_publish_test_room(uuid),public.admin_publish_test_room(uuid) from public,anon,authenticated;
grant execute on function private.admin_publish_test_room(uuid),public.admin_publish_test_room(uuid) to authenticated;
