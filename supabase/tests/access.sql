-- Synthetic fixtures only. All test data and setting changes are rolled back.
begin;
insert into auth.users(id,email) values
 ('00000000-0000-4000-8000-00000000000a','a@momento.test'),
 ('00000000-0000-4000-8000-00000000000b','b@momento.test'),
 ('00000000-0000-4000-8000-00000000000c','c@momento.test');
insert into public.profiles(id,display_name,age,city,terms_version,privacy_version)
 select id,'Test member',28,'Paris','test-v1','test-v1' from auth.users where email like '%@momento.test';
insert into public.rooms(id,title,capacity,opens_at,closes_at,status) values
 ('00000000-0000-4000-8000-000000000101','Test room A',2,now()-interval '1 hour',now()+interval '1 hour','published'),
 ('00000000-0000-4000-8000-000000000102','Test room B',20,now()-interval '1 hour',now()+interval '1 hour','published');
update private.runtime_settings set admissions_enabled = true;
insert into public.matches(id,user_a,user_b) values('00000000-0000-4000-8000-000000000201','00000000-0000-4000-8000-00000000000a','00000000-0000-4000-8000-00000000000b');
insert into public.messages(match_id,sender_id,body) values('00000000-0000-4000-8000-000000000201','00000000-0000-4000-8000-00000000000b','Synthetic test message');
do $$ begin
 if exists(select 1 from pg_tables where schemaname in ('public','private') and not rowsecurity) then raise exception 'A table lacks RLS'; end if;
 if has_table_privilege('authenticated','private.admin_roles','select') then raise exception 'Admin data exposed'; end if;
 if has_function_privilege('anon','public.enter_room(uuid,text,uuid)','execute') then raise exception 'Anonymous admissions exposed'; end if;
 if exists(select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prosecdef) then raise exception 'Public security definer found'; end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000000a',true);
select set_config('request.jwt.claims','{"user_metadata":{"role":"admin"}}',true);
do $$ begin
 if (select count(*) from public.profiles) <> 1 then raise exception 'Cross-account profile access'; end if;
 if (select count(*) from public.matches) <> 1 or (select count(*) from public.messages) <> 1 then raise exception 'Mutual match should be readable'; end if;
 update public.profiles set bio = 'Own profile update';
 if (select bio from public.profiles) <> 'Own profile update' then raise exception 'Own edit denied'; end if;
 begin update public.profiles set status = 'suspended'; raise exception 'Status escalation accepted'; exception when insufficient_privilege then null; end;
 begin update public.profiles set id = '00000000-0000-4000-8000-00000000000b'; raise exception 'Owner reassignment accepted'; exception when insufficient_privilege then null; end;
 begin insert into private.admin_roles(user_id,role) values(auth.uid(),'admin'); raise exception 'Administrator escalation accepted'; exception when insufficient_privilege then null; end;
 begin insert into public.entitlements(user_id,kind,ends_at) values(auth.uid(),'premium',now()+interval '1 month'); raise exception 'Premium escalation accepted'; exception when insufficient_privilege then null; end;
 begin insert into public.credit_ledger(user_id,unit,amount,reason,idempotency_key) values(auth.uid(),'room_entry',100,'promotion','forged'); raise exception 'Credit escalation accepted'; exception when insufficient_privilege then null; end;
 insert into public.preferences(user_id) values(auth.uid());
 begin insert into public.preferences(user_id) values('00000000-0000-4000-8000-00000000000b'); raise exception 'Other preferences edited'; exception when insufficient_privilege then null; end;
 if public.enter_room('00000000-0000-4000-8000-000000000101','audio','00000000-0000-4000-8000-000000000301')->>'admission_type' <> 'free' then raise exception 'First admission is not free'; end if;
 if public.enter_room('00000000-0000-4000-8000-000000000101','audio','00000000-0000-4000-8000-000000000301')->>'reused' <> 'true' then raise exception 'Admission retry not idempotent'; end if;
 begin perform public.enter_room('00000000-0000-4000-8000-000000000102','audio','00000000-0000-4000-8000-000000000301'); raise exception 'Conflicting retry accepted'; exception when invalid_parameter_value then null; end;
 perform public.leave_room();
 begin perform public.enter_room('00000000-0000-4000-8000-000000000102','video','00000000-0000-4000-8000-000000000302'); raise exception 'Second free admission accepted'; exception when insufficient_privilege then if sqlerrm <> 'daily_limit_reached' then raise; end if; end;
 if (select count(*) from public.room_entries) <> 1 then raise exception 'Retry or leave changed quota'; end if;
 if exists(select 1 from public.room_entries where quota_day <> (now() at time zone 'Europe/Paris')::date) then raise exception 'Wrong quota timezone'; end if;
end $$;
reset role;
insert into public.credit_ledger(user_id,unit,amount,reason,idempotency_key) values('00000000-0000-4000-8000-00000000000a','room_entry',1,'promotion','synthetic-grant');
set local role authenticated;
do $$ begin
 if public.enter_room('00000000-0000-4000-8000-000000000102','video','00000000-0000-4000-8000-000000000303')->>'admission_type' <> 'credit' then raise exception 'Extra entry credit not used'; end if;
 perform public.enter_room('00000000-0000-4000-8000-000000000102','video','00000000-0000-4000-8000-000000000303');
 if (select sum(amount) from public.credit_ledger) <> 0 then raise exception 'Credit was not consumed exactly once'; end if;
 perform public.leave_room();
 begin perform public.enter_room('00000000-0000-4000-8000-000000000101','audio',gen_random_uuid()); raise exception 'Negative balance allowed'; exception when insufficient_privilege then null; end;
end $$;
reset role;
insert into public.entitlements(user_id,kind,environment,ends_at) values('00000000-0000-4000-8000-00000000000a','premium','live',now()+interval '1 month');
set local role authenticated;
do $$ begin
 begin perform public.enter_room('00000000-0000-4000-8000-000000000101','audio',gen_random_uuid()); raise exception 'Live Premium leaked into test mode'; exception when insufficient_privilege then null; end;
end $$;
reset role;
insert into public.entitlements(user_id,kind,environment,ends_at) values('00000000-0000-4000-8000-00000000000a','premium','test',now()+interval '1 month');
set local role authenticated;
do $$ begin
 for i in 1..6 loop
  if public.enter_room('00000000-0000-4000-8000-000000000101','video',gen_random_uuid())->>'admission_type' <> 'premium' then raise exception 'Active Premium was capped'; end if;
  perform public.leave_room();
 end loop;
 if (select count(*) from public.room_entries where admission_type = 'free') <> 1 then raise exception 'Premium reset the daily free usage'; end if;
end $$;
reset role;
update public.entitlements set starts_at = now()-interval '2 days', ends_at = now()-interval '1 day' where environment = 'test';
set local role authenticated;
do $$ begin
 begin perform public.enter_room('00000000-0000-4000-8000-000000000101','audio',gen_random_uuid()); raise exception 'Expired Premium still allowed entry'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000000b',true);
select public.enter_room('00000000-0000-4000-8000-000000000101','audio',gen_random_uuid());
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000000c',true);
select public.enter_room('00000000-0000-4000-8000-000000000101','video',gen_random_uuid());
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000000a',true);
do $$ begin
 begin perform public.enter_room('00000000-0000-4000-8000-000000000101','audio',gen_random_uuid()); raise exception 'Room capacity was exceeded'; exception when invalid_parameter_value then if sqlerrm <> 'room_full' then raise; end if; end;
 if (select count(*) from public.room_preview('00000000-0000-4000-8000-000000000101')) <> 2 then raise exception 'Free member cannot preview room'; end if;
 insert into public.blocks(actor_id,target_id) values(auth.uid(),'00000000-0000-4000-8000-00000000000b');
 if (select count(*) from public.room_preview('00000000-0000-4000-8000-000000000101')) <> 1 then raise exception 'Blocked member remained in preview'; end if;
 if (select count(*) from public.matches) <> 0 or (select count(*) from public.messages) <> 0 then raise exception 'Blocking did not revoke access'; end if;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000000b',true);
do $$ begin
 if (select count(*) from public.blocks) <> 0 then raise exception 'Blocker identity leaked'; end if;
 if (select count(*) from public.matches) <> 0 or (select count(*) from public.messages) <> 0 then raise exception 'Reciprocal blocking not enforced'; end if;
end $$;
reset role;
update public.profiles set status = 'suspended' where id = '00000000-0000-4000-8000-00000000000b';
set local role authenticated;
do $$ begin
 begin perform public.enter_room('00000000-0000-4000-8000-000000000102','audio',gen_random_uuid()); raise exception 'Suspended member admitted'; exception when insufficient_privilege then null; end;
 if public.heartbeat_room((select id from public.room_entries limit 1)) then raise exception 'Suspended heartbeat accepted'; end if;
end $$;
reset role;
set local role anon;
do $$ begin
 begin perform 1 from public.profiles; raise exception 'Anonymous profile access'; exception when insufficient_privilege then null; end;
 begin perform public.room_preview('00000000-0000-4000-8000-000000000101'); raise exception 'Anonymous room preview'; exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
