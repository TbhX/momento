-- Administrator access is assigned privately; a client cannot grant a role.
alter table private.admin_roles add column setup_required boolean not null default false;
create table private.admin_setups (
 token_hash text primary key check(token_hash ~ '^[0-9a-f]{64}$'),
 user_id uuid not null unique references auth.users(id) on delete cascade,
 expires_at timestamptz not null, consumed_at timestamptz,
 lease_id uuid, lease_until timestamptz
);
alter table private.admin_setups enable row level security;
revoke all on private.admin_setups from public,anon,authenticated;
grant select,insert,update,delete on private.admin_setups to service_role;
create index reports_admin_queue on public.reports(status,created_at desc,id desc);
create index admin_audit_recent on private.admin_audit(created_at desc,id desc);

-- The server redeems a high-entropy, one-use setup code. Passwords are handled
-- only by the native Auth API, never inserted into the Auth schema with SQL.
create function public.server_admin_setup_begin(p_hash text,p_lease uuid) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare target uuid;
begin
 if p_hash is null or p_hash !~ '^[0-9a-f]{64}$' or p_lease is null then return null; end if;
 update private.admin_setups s set lease_id=p_lease,lease_until=clock_timestamp()+interval '90 seconds'
 where s.token_hash=p_hash and s.consumed_at is null and s.expires_at>clock_timestamp()
 and (s.lease_until is null or s.lease_until<=clock_timestamp())
 and exists(select 1 from private.admin_roles r where r.user_id=s.user_id and r.role='admin' and r.setup_required)
 returning s.user_id into target;
 return target;
end $$;
create function public.server_admin_setup_finish(p_hash text,p_lease uuid,p_release boolean default false) returns boolean
language plpgsql security invoker set search_path = '' as $$
declare target uuid;
begin
 select s.user_id into target from private.admin_setups s where s.token_hash=p_hash and s.lease_id=p_lease
 and s.consumed_at is null and s.expires_at>clock_timestamp() and s.lease_until>clock_timestamp() for update;
 if not found then return false; end if;
 if p_release then
  update private.admin_setups set lease_id=null,lease_until=null where token_hash=p_hash; return true;
 end if;
 update private.admin_roles set setup_required=false where user_id=target and role='admin' and setup_required;
 if not found then return false; end if;
 update private.admin_setups set consumed_at=clock_timestamp(),lease_id=null,lease_until=null where token_hash=p_hash;
 insert into private.admin_audit(actor_id,action,target_ref) values(target,'admin_setup_completed',target::text);
 return true;
end $$;
revoke execute on function public.server_admin_setup_begin(text,uuid),public.server_admin_setup_finish(text,uuid,boolean) from public,anon,authenticated;
grant execute on function public.server_admin_setup_begin(text,uuid),public.server_admin_setup_finish(text,uuid,boolean) to service_role;

create function private.require_administrator() returns text
language plpgsql stable security definer set search_path = '' as $$
declare result text;
begin
 if not private.is_active_member() then raise exception 'admin_required' using errcode='42501'; end if;
 select role into result from private.admin_roles where user_id=auth.uid() and not setup_required;
 if result is null then raise exception 'admin_required' using errcode='42501'; end if;
 return result;
end $$;

create function private.admin_snapshot(p_status text,p_before timestamptz,p_before_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare role_name text; records jsonb; extra boolean;
begin
 role_name:=private.require_administrator();
 if p_status is null or p_status not in ('all','open','reviewing','resolved','dismissed')
 or (p_before is null)<>(p_before_id is null) then raise exception 'invalid_request' using errcode='22023'; end if;
 with queue as (
  select r.id,r.reason,r.status,r.created_at,r.target_id,
   reporter.display_name as reporter_name,target.display_name as target_name,target.status as target_status,
   exists(select 1 from private.admin_roles a where a.user_id=r.target_id) as protected_target
  from public.reports r left join public.profiles reporter on reporter.id=r.reporter_id
  left join public.profiles target on target.id=r.target_id
  where (p_status='all' or r.status=p_status) and (p_before is null or (r.created_at,r.id)<(p_before,p_before_id))
  order by r.created_at desc,r.id desc limit 51
 ), numbered as (select *,row_number() over(order by created_at desc,id desc) as rn from queue)
 select coalesce(jsonb_agg(to_jsonb(n)-'rn' order by n.created_at desc,n.id desc) filter(where rn<=50),'[]'::jsonb),count(*)>50
 into records,extra from numbered n;
 return jsonb_build_object('role',role_name,'reports',records,'hasMore',extra,
  'counts',jsonb_build_object('members',(select count(*) from public.profiles where status='active'),
   'suspended',(select count(*) from public.profiles where status='suspended'),
   'rooms',(select count(*) from public.rooms where status in ('published','live')),
   'openReports',(select count(*) from public.reports where status in ('open','reviewing'))),
  'audit',coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at desc,a.id desc) from
   (select id,action,target_ref,created_at from private.admin_audit order by created_at desc,id desc limit 20) a),'[]'::jsonb));
end $$;

create function private.admin_report_action(p_report uuid,p_action text,p_expected text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare role_name text; report public.reports; next_status text;
begin
 role_name:=private.require_administrator();
 if p_action is null or p_action not in ('reviewing','resolved','dismissed','suspend','restore') or p_report is null
 or p_expected is null or p_expected not in ('open','reviewing','resolved','dismissed') then
  raise exception 'invalid_request' using errcode='22023'; end if;
 perform private.community_limit('moderation',200);
 select * into report from public.reports where id=p_report for update;
 if not found or report.status<>p_expected then raise exception 'report_changed' using errcode='P0001'; end if;
 if p_action in ('suspend','restore') then
  if role_name<>'admin' or report.target_id is null or report.target_id=auth.uid()
   or exists(select 1 from private.admin_roles where user_id=report.target_id) then
   raise exception 'protected_account' using errcode='42501'; end if;
  update public.profiles set status=case when p_action='suspend' then 'suspended' else 'active' end
   where id=report.target_id and status=case when p_action='suspend' then 'active' else 'suspended' end;
  if not found then raise exception 'report_changed' using errcode='P0001'; end if;
  if p_action='suspend' then
   update public.room_presence set active=false where user_id=report.target_id;
   update public.video_requests set status='cancelled' where (sender_id=report.target_id or recipient_id=report.target_id)
    and status in ('pending','accepted');
  end if;
  next_status:=case when p_action='suspend' then 'resolved' else 'reviewing' end;
 else next_status:=p_action;
 end if;
 update public.reports set status=next_status where id=p_report;
 insert into private.admin_audit(actor_id,action,target_ref) values(auth.uid(),'report_'||p_action,p_report::text);
 return jsonb_build_object('updated',true,'status',next_status);
end $$;

create function public.admin_snapshot(p_status text default 'open',p_before timestamptz default null,p_before_id uuid default null) returns jsonb
language sql stable security invoker set search_path = '' as $$ select private.admin_snapshot(p_status,p_before,p_before_id); $$;
create function public.admin_report_action(p_report uuid,p_action text,p_expected text) returns jsonb
language sql security invoker set search_path = '' as $$ select private.admin_report_action(p_report,p_action,p_expected); $$;
revoke execute on function private.require_administrator(),private.admin_snapshot(text,timestamptz,uuid),private.admin_report_action(uuid,text,text),
 public.admin_snapshot(text,timestamptz,uuid),public.admin_report_action(uuid,text,text) from public,anon,authenticated;
grant execute on function private.require_administrator(),private.admin_snapshot(text,timestamptz,uuid),private.admin_report_action(uuid,text,text),
 public.admin_snapshot(text,timestamptz,uuid),public.admin_report_action(uuid,text,text) to authenticated;

-- Activation is an additional constraint on a role, never a Premium grant.
create or replace function private.account_status() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare actor uuid:=auth.uid(); premium boolean;
begin
 if actor is null or not private.is_active_member() then raise exception 'registration_required' using errcode='42501'; end if;
 premium:=private.has_premium();
 return jsonb_build_object('admin',exists(select 1 from private.admin_roles where user_id=actor and role='admin' and not setup_required),
  'moderator',exists(select 1 from private.admin_roles where user_id=actor and role in ('admin','moderator') and not setup_required),
  'premium',premium,'unlimited',premium,'dailyLimit',case when premium then null else 1 end,
  'used',(select count(*) from public.room_entries where user_id=actor and admission_type='free' and quota_day=(now() at time zone 'Europe/Paris')::date),
  'bookingLimit',case when premium then 3 else 1 end,
  'premiumUntil',(select max(e.ends_at) from public.entitlements e join private.runtime_settings s on e.environment=s.billing_environment where e.user_id=actor and e.revoked_at is null and e.starts_at<=now() and e.ends_at>now()),
  'serverNow',floor(extract(epoch from now())*1000),'dataSource','supabase');
end $$;
