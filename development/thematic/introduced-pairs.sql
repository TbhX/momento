-- Isolated development schema. No client grants, RPC, media or admission.
create table private.introduced_pairs (
 user_a uuid not null references public.profiles(id) on delete cascade,
 user_b uuid not null references public.profiles(id) on delete cascade,
 first_encounter uuid not null unique,
 primary key (user_a,user_b), check (user_a < user_b)
);
alter table private.introduced_pairs enable row level security;
revoke all on private.introduced_pairs from public,anon,authenticated,service_role;
