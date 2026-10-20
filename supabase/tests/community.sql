-- Disposable test transaction; never publish these profiles or enable admissions.
begin;
insert into auth.users(id,email) values
 ('00000000-0000-4000-8000-0000000000a1','social-a@momento.invalid'),
 ('00000000-0000-4000-8000-0000000000b1','social-b@momento.invalid'),
 ('00000000-0000-4000-8000-0000000000c1','social-c@momento.invalid');
insert into auth.sessions(id,user_id,not_after) select id,id,now()+interval '1 day' from auth.users where email like 'social-%@momento.invalid';
insert into public.profiles(id,display_name,age,city,terms_version,privacy_version)
 select id,'Social QA',28,'Paris','test','test' from auth.users where email like 'social-%@momento.invalid';
insert into public.rooms(id,title,opens_at,closes_at,status) values('00000000-0000-4000-8000-0000000000d1','SQL only',now()-interval '1 hour',now()+interval '1 hour','published');
insert into public.encounters(room_id,user_a,user_b,round_number,starts_at,ends_at,status) values
 ('00000000-0000-4000-8000-0000000000d1','00000000-0000-4000-8000-0000000000a1','00000000-0000-4000-8000-0000000000b1',0,now()-interval '5 minutes',now(),'ended');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000000a1',true);
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('request.jwt.claim.sub'),'session_id',current_setting('request.jwt.claim.sub'))::text,true);
do $$ declare snap jsonb; begin
 snap:=public.community_snapshot();
 if jsonb_array_length(snap->'rooms')<>1 or snap->'admissionsEnabled'<>'false'::jsonb then raise exception 'Catalog not real or admission flag changed'; end if;
 if snap::text like '%@momento.invalid%' then raise exception 'Email exposed'; end if;
 begin perform public.friend_action('00000000-0000-4000-8000-0000000000c1','request'); raise exception 'Stranger spam allowed'; exception when insufficient_privilege then null; end;
 if public.friend_action('00000000-0000-4000-8000-0000000000b1','request')->>'status'<>'pending' then raise exception 'Request missing'; end if;
 perform public.friend_action('00000000-0000-4000-8000-0000000000b1','request');
 if (select count(*) from public.friend_requests)<>1 then raise exception 'Duplicate request'; end if;
 begin perform public.friend_action('00000000-0000-4000-8000-0000000000b1','accept'); raise exception 'Self accepted outgoing request'; exception when insufficient_privilege then null; end;
 begin perform public.invitation_action('00000000-0000-4000-8000-0000000000b1','request','video'); raise exception 'Invitation without friendship'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000000c1',true);
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('request.jwt.claim.sub'),'session_id',current_setting('request.jwt.claim.sub'))::text,true);
do $$ begin
 if jsonb_array_length(public.community_snapshot()->'requests')<>0 then raise exception 'Third party saw request'; end if;
 begin perform public.friend_action('00000000-0000-4000-8000-0000000000a1','accept'); raise exception 'Third party accepted'; exception when invalid_parameter_value then null; end;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000000b1',true);
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('request.jwt.claim.sub'),'session_id',current_setting('request.jwt.claim.sub'))::text,true);
do $$ begin
 perform public.friend_action('00000000-0000-4000-8000-0000000000a1','request');
 if (select count(*) from public.friendships)<>0 then raise exception 'Reverse request auto accepted'; end if;
 perform public.friend_action('00000000-0000-4000-8000-0000000000a1','accept');
 if jsonb_array_length(public.community_snapshot()->'friends')<>1 then raise exception 'Friendship not persistent'; end if;
 perform public.invitation_action('00000000-0000-4000-8000-0000000000a1','request','audio');
 begin perform public.invitation_action('00000000-0000-4000-8000-0000000000a1','accept','audio'); raise exception 'Sender accepted invitation'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000000a1',true);
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('request.jwt.claim.sub'),'session_id',current_setting('request.jwt.claim.sub'))::text,true);
do $$ begin
 perform public.invitation_action('00000000-0000-4000-8000-0000000000b1','accept','audio');
 if (select count(*) from public.video_requests where status='accepted' and credit_consumed_at is null)<>1 then raise exception 'Consent missing or invitation charged'; end if;
 perform public.block_peer('00000000-0000-4000-8000-0000000000b1','Synthetic QA report');
 if jsonb_array_length(public.community_snapshot()->'friends')<>0 or jsonb_array_length(public.community_snapshot()->'invitations')<>0 then raise exception 'Blocked pair still visible'; end if;
 if (select count(*) from public.reports)<>1 then raise exception 'Report not persisted'; end if;
 begin perform public.friend_action('00000000-0000-4000-8000-0000000000b1','request'); raise exception 'Blocked request accepted'; exception when insufficient_privilege then null; end;
 begin insert into public.blocks(actor_id,target_id) values(auth.uid(),'00000000-0000-4000-8000-0000000000c1'); raise exception 'Direct block bypass allowed'; exception when insufficient_privilege then null; end;
end $$;
reset role;
delete from auth.sessions where user_id='00000000-0000-4000-8000-0000000000a1';
set local role authenticated;
do $$ begin
 begin perform public.community_snapshot(); raise exception 'Revoked member accessed community'; exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role anon;
do $$ begin
 begin perform public.community_snapshot(); raise exception 'Anonymous community access'; exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
