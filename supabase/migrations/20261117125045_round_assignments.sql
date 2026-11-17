-- A cancelled encounter keeps its round slots. This is not a scheduling API.
create table if not exists private.round_assignments (
 room_id uuid not null references public.rooms(id) on delete cascade,
 round_number integer not null check (round_number>=0),
 user_id uuid not null references public.profiles(id) on delete cascade,
 encounter_id uuid not null references public.encounters(id) on delete cascade,
 primary key(room_id,round_number,user_id),
 unique(encounter_id,user_id)
);
create index if not exists round_assignments_user on private.round_assignments(user_id);
alter table private.round_assignments enable row level security;
revoke all on private.round_assignments from public,anon,authenticated,service_role;
grant select on private.round_assignments to service_role;

-- Called only by the encounter trigger; no public or member-callable writer.
create or replace function private.reserve_encounter_round() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_op='UPDATE' then
  if (new.room_id,new.round_number,new.user_a,new.user_b) is distinct from
     (old.room_id,old.round_number,old.user_a,old.user_b) then
   raise exception 'encounter_assignment_immutable';
  end if;
  return new;
 end if;
 -- Ordered inserts: the primary key serializes competing assignments even
 -- when the same member appears on opposite sides of two ordered pairs.
 insert into private.round_assignments(room_id,round_number,user_id,encounter_id)
 values(new.room_id,new.round_number,new.user_a,new.id),
       (new.room_id,new.round_number,new.user_b,new.id);
 return new;
end $$;
revoke all on function private.reserve_encounter_round() from public,anon,authenticated,service_role;
drop trigger if exists reserve_encounter_round on public.encounters;
create trigger reserve_encounter_round after insert or update of room_id,round_number,user_a,user_b
 on public.encounters for each row execute function private.reserve_encounter_round();

-- Existing encounters must satisfy the same invariant; conflicting history
-- aborts the migration rather than silently dropping a participant's slot.
insert into private.round_assignments(room_id,round_number,user_id,encounter_id)
select e.room_id,e.round_number,p.user_id,e.id from public.encounters e
cross join lateral (values(e.user_a),(e.user_b)) p(user_id)
where not exists(select 1 from private.round_assignments a where
 a.room_id=e.room_id and a.round_number=e.round_number and a.user_id=p.user_id and a.encounter_id=e.id)
order by e.room_id,e.round_number,p.user_id;
