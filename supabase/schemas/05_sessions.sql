-- A signed access JWT alone is insufficient after logout/deletion. This helper
-- checks the actual session, binding its id to the authenticated user's id.
create function private.has_active_session() returns boolean language sql stable security definer set search_path = '' as $$
 select (select auth.uid()) is not null and exists(select 1 from auth.sessions s
  where s.user_id=(select auth.uid()) and s.id=case
   when (select auth.jwt()->>'session_id') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
   then (select auth.jwt()->>'session_id')::uuid else null end
  and (s.not_after is null or s.not_after>now()))
 and (coalesce((select auth.jwt()->>'aal')='aal2',false) or not exists(
  select 1 from auth.mfa_factors f where f.user_id=(select auth.uid()) and f.status='verified'));
$$;
revoke execute on function private.has_active_session() from public,anon,authenticated;
