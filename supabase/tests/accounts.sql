-- Development database only. Synthetic identities; no external email or media.
begin;
insert into auth.users(id,email) values
 ('00000000-0000-4000-8000-0000000000da','account-a@momento.invalid'),
 ('00000000-0000-4000-8000-0000000000db','account-b@momento.invalid');
insert into auth.sessions(id,user_id,not_after) select id,id,now()+interval '1 day' from auth.users where email like '%@momento.invalid';
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000000da',true);
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('request.jwt.claim.sub'),'session_id',current_setting('request.jwt.claim.sub'))::text,true);
do $$ declare path text:='00000000-0000-4000-8000-0000000000da/avatar-00000000-0000-4000-8000-000000000001.jpg'; begin
 perform public.save_profile('Alice',27,'Paris',true,true);
 perform public.save_profile('Alice',28,'Lyon',true,true);
 if (select count(*) from public.profiles)<>1 or (select age from public.profiles)<>28 then raise exception 'Profile RPC did not persist'; end if;
 if (select count(*) from public.consents)<>1 then raise exception 'Consent duplicate or missing'; end if;
 begin perform public.save_profile('Alice',17,'Lyon',true,true); raise exception 'Minor profile accepted'; exception when invalid_parameter_value then null; end;
 begin perform public.save_profile('Alice',28,'Lyon',false,true); raise exception 'Adult declaration missing'; exception when invalid_parameter_value then null; end;
 begin perform public.save_profile('Alice',28,'Lyon',true,false); raise exception 'Storage acknowledgement missing'; exception when invalid_parameter_value then null; end;
 if (public.account_status()->>'unlimited')::boolean then raise exception 'Free user acquired Premium'; end if;
 if public.commit_profile_media('avatar',path) is not null then raise exception 'Unexpected previous media'; end if;
 if (select object_path from public.profile_media)<>path then raise exception 'Media pointer missing'; end if;
 begin perform public.commit_profile_media('avatar','00000000-0000-4000-8000-0000000000db/avatar-00000000-0000-4000-8000-000000000001.jpg'); raise exception 'Foreign media attached'; exception when invalid_parameter_value then null; end;
 if public.commit_profile_media('avatar',null)<>path then raise exception 'Previous media reference missing'; end if;
 if (select count(*) from public.profile_media)<>0 then raise exception 'Media deletion failed'; end if;
 begin perform public.server_auth_attempt('auth:forged',now()+interval '1 hour'); raise exception 'Member changed counters'; exception when insufficient_privilege then null; end;
 begin perform public.server_recovery_claim('auth:recovery-use:forged',now()+interval '5 minutes'); raise exception 'Member forged recovery grant'; exception when insufficient_privilege then null; end;
 begin perform public.server_session_active(auth.uid(),gen_random_uuid()); raise exception 'Member inspected sessions'; exception when insufficient_privilege then null; end;
 begin perform public.server_begin_account_deletion('00000000-0000-4000-8000-0000000000db'); raise exception 'Member deleted another account'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000000db',true);
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('request.jwt.claim.sub'),'session_id',current_setting('request.jwt.claim.sub'))::text,true);
do $$ begin
 if (select count(*) from public.profiles)<>0 or (select count(*) from public.profile_media)<>0 or (select count(*) from public.consents)<>0 then raise exception 'Cross-account personal data'; end if;
 perform public.save_profile('Bob',31,'Paris',true,true);
end $$;
reset role;
insert into public.entitlements(user_id,kind,environment,ends_at) values('00000000-0000-4000-8000-0000000000da','premium','test',now()+interval '1 day');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000000da',true);
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('request.jwt.claim.sub'),'session_id',current_setting('request.jwt.claim.sub'))::text,true);
do $$ begin
 if not (public.account_status()->>'unlimited')::boolean or public.account_status()->'dailyLimit'<>'null'::jsonb then raise exception 'Premium status still capped'; end if;
end $$;
reset role;
set local role service_role;
do $$ begin
 if public.server_auth_attempt('auth:synthetic-hash',now()+interval '1 hour')<>1 or public.server_auth_attempt('auth:synthetic-hash',now()+interval '1 hour')<>2 then raise exception 'Atomic counter did not increment'; end if;
 if not public.server_recovery_claim('auth:recovery-use:synthetic',now()+interval '5 minutes') then raise exception 'Recovery reservation failed'; end if;
 if public.server_recovery_claim('auth:recovery-use:synthetic',now()+interval '5 minutes') then raise exception 'Recovery reservation replay accepted'; end if;
 perform public.server_recovery_claim('auth:recovery-use:synthetic',now()+interval '5 minutes',true);
 if not public.server_recovery_claim('auth:recovery-use:synthetic',now()+interval '5 minutes') then raise exception 'Explicit correction could not retry'; end if;
 if public.server_session_active('00000000-0000-4000-8000-0000000000da',gen_random_uuid()) then raise exception 'Nonexistent session accepted'; end if;
 perform public.server_begin_account_deletion('00000000-0000-4000-8000-0000000000da');
end $$;
reset role;
set local role authenticated;
do $$ begin
 begin perform public.save_profile('Alice',28,'Paris',true,true); raise exception 'Closed account reopened'; exception when insufficient_privilege then null; end;
 begin perform public.commit_profile_media('avatar','00000000-0000-4000-8000-0000000000da/avatar-00000000-0000-4000-8000-000000000001.jpg'); raise exception 'Closed account added media'; exception when insufficient_privilege then null; end;
end $$;
reset role;
delete from auth.sessions where user_id='00000000-0000-4000-8000-0000000000db';
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000000db',true);
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('request.jwt.claim.sub'),'session_id',current_setting('request.jwt.claim.sub'))::text,true);
do $$ begin
 if (select count(*) from public.profiles)<>0 then raise exception 'Revoked JWT can still read Data API rows'; end if;
 begin perform public.save_profile('Bob',31,'Paris',true,true); raise exception 'Revoked session edited profile'; exception when insufficient_privilege then null; end;
 begin perform public.commit_profile_media('avatar',null); raise exception 'Revoked session edited media'; exception when insufficient_privilege then null; end;
 begin perform public.account_status(); raise exception 'Revoked session accessed salons'; exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role anon;
do $$ begin
 begin perform public.save_profile('Anonymous',25,'Paris',true,true); raise exception 'Anonymous registration accepted'; exception when insufficient_privilege then null; end;
 begin perform public.server_auth_attempt('auth:forged',now()+interval '1 hour'); raise exception 'Anonymous counter modification'; exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
