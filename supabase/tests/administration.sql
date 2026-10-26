-- Run only in an isolated test database. Every fixture is rolled back.
begin;
insert into auth.users(id,email) values
 ('00000000-0000-4000-8000-0000000000a1','admin@momento.test'),
 ('00000000-0000-4000-8000-0000000000a2','member@momento.test'),
 ('00000000-0000-4000-8000-0000000000a3','moderator@momento.test');
insert into auth.sessions(id,user_id) select id,id from auth.users where email like '%@momento.test';
insert into public.profiles(id,display_name,age,city,terms_version,privacy_version)
 select id,'Synthetic account',28,'Paris','test','test' from auth.users where email like '%@momento.test';
insert into private.admin_roles(user_id,role,setup_required) values
 ('00000000-0000-4000-8000-0000000000a1','admin',true),
 ('00000000-0000-4000-8000-0000000000a3','moderator',false);
insert into auth.mfa_factors(id,user_id,status) select user_id,user_id,'verified' from private.admin_roles;
insert into private.admin_setups(token_hash,user_id,expires_at)
 values(repeat('a',64),'00000000-0000-4000-8000-0000000000a1',now()+interval '1 day');
insert into public.reports(id,reporter_id,target_id,reason) values
 ('00000000-0000-4000-8000-0000000000b1','00000000-0000-4000-8000-0000000000a3','00000000-0000-4000-8000-0000000000a2','Synthetic report'),
 ('00000000-0000-4000-8000-0000000000b2','00000000-0000-4000-8000-0000000000a2','00000000-0000-4000-8000-0000000000a1','Protected administrator');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000000a2',true);
select set_config('request.jwt.claims',jsonb_build_object('aal','aal2','session_id',current_setting('request.jwt.claim.sub'),'user_metadata',jsonb_build_object('role','admin'))::text,true);
do $$ begin
 begin perform public.admin_snapshot(); raise exception 'Member accessed admin reports'; exception when insufficient_privilege then null; end;
 begin perform public.admin_report_action('00000000-0000-4000-8000-0000000000b1','suspend','open'); raise exception 'Member suspended another account'; exception when insufficient_privilege then null; end;
 begin perform public.server_admin_setup_begin(repeat('a',64),gen_random_uuid()); raise exception 'Member claimed setup lease'; exception when insufficient_privilege then null; end;
 begin insert into auth.mfa_factors(id,user_id,status) select user_id,user_id,'verified' from private.admin_roles;
insert into private.admin_setups values(repeat('b',64),auth.uid(),now()+interval '1 day',null,null,null); raise exception 'Member forged setup'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000000a1',true);
select set_config('request.jwt.claims',jsonb_build_object('aal','aal2','session_id',current_setting('request.jwt.claim.sub'))::text,true);
do $$ begin
 if (public.account_status()->>'admin')::boolean then raise exception 'Pending administrator authorized'; end if;
 begin perform public.admin_snapshot(); raise exception 'Pending administrator accessed reports'; exception when insufficient_privilege then null; end;
end $$;
reset role;
update private.admin_setups set expires_at=clock_timestamp()-interval '1 second';
set local role service_role;
do $$ begin
 if public.server_admin_setup_begin(repeat('a',64),gen_random_uuid()) is not null then raise exception 'Expired setup accepted'; end if;
end $$;
reset role;
update private.admin_setups set expires_at=clock_timestamp()+interval '1 day';
set local role service_role;
do $$ declare lease uuid:=gen_random_uuid(); begin
 if public.server_admin_setup_begin(repeat('b',64),lease) is not null then raise exception 'Invalid setup accepted'; end if;
 if public.server_admin_setup_begin(repeat('a',64),lease) is null then raise exception 'Valid setup rejected'; end if;
 if public.server_admin_setup_begin(repeat('a',64),gen_random_uuid()) is not null then raise exception 'Concurrent setup lease allowed'; end if;
 if public.server_admin_setup_finish(repeat('a',64),gen_random_uuid()) then raise exception 'Wrong lease completed'; end if;
 if not public.server_admin_setup_finish(repeat('a',64),lease,true) then raise exception 'Release failed'; end if;
 if public.server_admin_setup_begin(repeat('a',64),lease) is null or not public.server_admin_setup_finish(repeat('a',64),lease) then raise exception 'Activation failed'; end if;
 if public.server_admin_setup_begin(repeat('a',64),lease) is not null or public.server_admin_setup_finish(repeat('a',64),lease) then raise exception 'Setup code replay accepted'; end if;
end $$;
reset role;
set local role authenticated;
do $$ begin
 if not (public.account_status()->>'admin')::boolean or (public.account_status()->>'premium')::boolean then raise exception 'Wrong role or Premium grant'; end if;
 if jsonb_array_length(public.admin_snapshot()->'reports')<>2 then raise exception 'Missing moderation queue'; end if;
 perform public.admin_report_action('00000000-0000-4000-8000-0000000000b1','suspend','open');
 begin perform public.admin_report_action('00000000-0000-4000-8000-0000000000b1','dismissed','open'); raise exception 'Stale moderation overwrote newer action'; exception when raise_exception then if sqlerrm<>'report_changed' then raise; end if; end;
 begin perform public.admin_report_action('00000000-0000-4000-8000-0000000000b2','suspend','open'); raise exception 'Administrator suspended'; exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin
 if (select status from public.profiles where id='00000000-0000-4000-8000-0000000000a2')<>'suspended' then raise exception 'Suspension missing'; end if;
 if (select count(*) from private.admin_audit)<>2 then raise exception 'Audit missing'; end if;
end $$;
set local role authenticated;
select public.admin_report_action('00000000-0000-4000-8000-0000000000b1','restore','resolved');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000000a3',true);
select set_config('request.jwt.claims',jsonb_build_object('aal','aal2','session_id',current_setting('request.jwt.claim.sub'))::text,true);
do $$ begin
 if public.admin_snapshot()->>'role'<>'moderator' then raise exception 'Moderator access missing'; end if;
 begin perform public.admin_report_action('00000000-0000-4000-8000-0000000000b1','suspend','reviewing'); raise exception 'Moderator suspended a member'; exception when insufficient_privilege then null; end;
 perform public.admin_report_action('00000000-0000-4000-8000-0000000000b1','dismissed','reviewing');
end $$;
reset role;
delete from auth.sessions where user_id='00000000-0000-4000-8000-0000000000a3';
set local role authenticated;
do $$ begin
 begin perform public.admin_snapshot(); raise exception 'Revoked session accessed administration'; exception when insufficient_privilege then null; end;
end $$;
reset role;
insert into public.reports(reporter_id,target_id,reason)
 select '00000000-0000-4000-8000-0000000000a3','00000000-0000-4000-8000-0000000000a2','Pagination test' from generate_series(1,51);
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000000a1',true);
select set_config('request.jwt.claims',jsonb_build_object('aal','aal2','session_id',current_setting('request.jwt.claim.sub'))::text,true);
do $$ declare first_page jsonb; second_page jsonb; last_row jsonb; begin
 first_page:=public.admin_snapshot('all');
 if jsonb_array_length(first_page->'reports')<>50 or not (first_page->>'hasMore')::boolean then raise exception 'Queue not bounded'; end if;
 last_row:=first_page->'reports'->49;
 second_page:=public.admin_snapshot('all',(last_row->>'created_at')::timestamptz,(last_row->>'id')::uuid);
 if jsonb_array_length(second_page->'reports')<>3 or (second_page->>'hasMore')::boolean then raise exception 'Queue pagination lost rows'; end if;
 if exists(select 1 from jsonb_array_elements(first_page->'reports') a join jsonb_array_elements(second_page->'reports') b on a->>'id'=b->>'id') then raise exception 'Pagination duplicated reports'; end if;
end $$;
reset role;
set local role anon;
do $$ begin
 begin perform public.admin_snapshot(); raise exception 'Anonymous admin access'; exception when insufficient_privilege then null; end;
 begin perform public.server_admin_setup_finish(repeat('a',64),gen_random_uuid()); raise exception 'Anonymous setup completion'; exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
