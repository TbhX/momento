-- Staging candidate only. No hosted migration version assigned.
create or replace function private.call_participant_valid(p_encounter uuid,p_user uuid,p_now timestamptz,p_env text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.call_participants c
 join public.profiles p on p.id=c.user_id and p.status='active'
 join auth.sessions a on a.id=c.session_id and a.user_id=c.user_id
 join public.encounters e on e.id=c.encounter_id
 join public.room_presence s on s.user_id=c.user_id and s.room_id=e.room_id and s.entry_id=c.entry_id
 join public.room_entries n on n.id=s.entry_id and n.user_id=s.user_id and n.room_id=s.room_id
 where c.encounter_id=p_encounter and c.user_id=p_user and c.left_at is null and c.environment=p_env
 and c.checked_at<=p_now and c.checked_at>p_now-interval '45 seconds'
 and (c.mode='audio' or n.media_mode='video') and (a.not_after is null or a.not_after>p_now) and s.active and s.expires_at>p_now
 and (c.assurance='aal2' or not exists(select 1 from auth.mfa_factors f where f.user_id=p_user and f.status='verified'))
 and ((n.admission_type<>'premium' and (c.mode<>'video' or p.gender<>'man')) or exists(select 1 from public.entitlements t where t.user_id=p_user and t.environment=p_env and t.kind='premium' and t.starts_at<=p_now and t.ends_at>p_now and t.revoked_at is null)));
$$;
