-- Generated from the revised session and administration declarations.
create or replace function private.has_active_session() returns boolean language sql stable security definer set search_path = '' as $$
 select (select auth.uid()) is not null and exists(select 1 from auth.sessions s
  where s.user_id=(select auth.uid()) and s.id=case
   when (select auth.jwt()->>'session_id') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
   then (select auth.jwt()->>'session_id')::uuid else null end
  and (s.not_after is null or s.not_after>now()))
 and (coalesce((select auth.jwt()->>'aal')='aal2',false) or not exists(
  select 1 from auth.mfa_factors f where f.user_id=(select auth.uid()) and f.status='verified'));
$$;

create or replace function private.require_administrator() returns text
language plpgsql stable security definer set search_path = '' as $$
declare result text;
begin
 if not private.is_active_member() then raise exception 'admin_required' using errcode='42501'; end if;
 select role into result from private.admin_roles where user_id=auth.uid() and not setup_required;
 if result is null then raise exception 'admin_required' using errcode='42501'; end if;
 if not exists(select 1 from auth.mfa_factors where user_id=auth.uid() and status='verified') then raise exception 'mfa_enrollment_required' using errcode='42501'; end if;
 if (auth.jwt()->>'aal') is distinct from 'aal2' then raise exception 'mfa_required' using errcode='42501'; end if;
 return result;
end $$;


-- No actor/role/entitlement supplied by a browser. The same MFA guard applies
-- to moderation, test publication and the unlimited local laboratory.
create or replace function public.admin_test_access() returns boolean language sql stable security invoker set search_path='' as $$
 select private.require_administrator()='admin';
$$;
revoke execute on function public.admin_test_access() from public,anon,authenticated;
grant execute on function public.admin_test_access() to authenticated;
