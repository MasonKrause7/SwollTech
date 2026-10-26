-- SwollTech notebook schema. The API connects as the table owner and scopes
-- every query by the JWT subject. RLS is on with no policies so the Data API
-- roles cannot read training data.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
end
$$;

create schema if not exists app_private;
revoke all on schema app_private from public;
revoke all on schema app_private from anon, authenticated;

create type public.weight_unit as enum ('lb', 'kg');
create type public.set_kind as enum ('warmup', 'working');
create type public.session_status as enum ('in_progress', 'completed', 'abandoned');
create type public.media_status as enum ('local', 'uploading', 'ready', 'failed');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  unit_preference public.weight_unit not null default 'lb',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.exercises (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users (id) on delete cascade,
  name text not null,
  primary_muscle text not null default '',
  equipment text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint exercises_name_len check (char_length(name) between 1 and 80)
);

create unique index exercises_global_name_idx
  on public.exercises (lower(name))
  where owner_id is null and deleted_at is null;
create unique index exercises_owner_name_idx
  on public.exercises (owner_id, lower(name))
  where owner_id is not null and deleted_at is null;
create index exercises_owner_idx
  on public.exercises (owner_id)
  where owner_id is not null and deleted_at is null;

create table public.catalog_meta (
  id int primary key default 1,
  version int not null,
  constraint catalog_meta_singleton check (id = 1)
);

create table public.exercise_references (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  exercise_id uuid not null references public.exercises (id),
  weight numeric(10, 3) not null,
  unit public.weight_unit not null,
  weight_kg numeric(12, 6) not null,
  noted_on date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint exercise_references_weight_pos check (weight > 0 and weight_kg > 0)
);

create unique index exercise_references_one_idx
  on public.exercise_references (user_id, exercise_id)
  where deleted_at is null;
create index exercise_references_exercise_idx
  on public.exercise_references (exercise_id);

create table public.workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  notes text not null default '',
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint workouts_name_len check (char_length(name) between 1 and 80)
);

create unique index workouts_active_name_idx
  on public.workouts (user_id, lower(name))
  where deleted_at is null and archived_at is null;
create index workouts_user_idx
  on public.workouts (user_id, updated_at desc)
  where deleted_at is null;

create table public.workout_exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  workout_id uuid not null references public.workouts (id) on delete cascade,
  exercise_id uuid not null references public.exercises (id),
  position int not null,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint workout_exercises_position_nonneg check (position >= 0)
);

create index workout_exercises_workout_idx
  on public.workout_exercises (workout_id, position)
  where deleted_at is null;
create index workout_exercises_exercise_idx
  on public.workout_exercises (exercise_id);
create index workout_exercises_user_idx
  on public.workout_exercises (user_id);

create table public.workout_sets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  workout_exercise_id uuid not null references public.workout_exercises (id) on delete cascade,
  position int not null,
  kind public.set_kind not null default 'working',
  target_reps int,
  target_weight numeric(10, 3),
  target_unit public.weight_unit,
  target_percent numeric(5, 2),
  target_rpe numeric(3, 1),
  rest_seconds int not null default 120,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint workout_sets_position_nonneg check (position >= 0),
  constraint workout_sets_target_exclusive check (target_weight is null or target_percent is null),
  constraint workout_sets_weight_unit check (target_weight is null or target_unit is not null),
  constraint workout_sets_percent_range check (target_percent is null or (target_percent >= 1 and target_percent <= 120)),
  constraint workout_sets_rpe check (target_rpe is null or (target_rpe >= 1 and target_rpe <= 10)),
  constraint workout_sets_reps check (target_reps is null or target_reps >= 1),
  constraint workout_sets_rest check (rest_seconds >= 0),
  constraint workout_sets_weight_nonneg check (target_weight is null or target_weight >= 0)
);

create index workout_sets_parent_idx
  on public.workout_sets (workout_exercise_id, position)
  where deleted_at is null;
create index workout_sets_user_idx on public.workout_sets (user_id);

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  workout_id uuid references public.workouts (id),
  name text not null default '',
  status public.session_status not null default 'in_progress',
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index sessions_user_started_idx
  on public.sessions (user_id, started_at desc)
  where deleted_at is null;
create index sessions_user_status_idx
  on public.sessions (user_id, status)
  where deleted_at is null;
create index sessions_workout_idx on public.sessions (workout_id);

create table public.session_exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  session_id uuid not null references public.sessions (id) on delete cascade,
  exercise_id uuid not null references public.exercises (id),
  position int not null,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint session_exercises_position_nonneg check (position >= 0)
);

create index session_exercises_session_idx
  on public.session_exercises (session_id, position)
  where deleted_at is null;
create index session_exercises_user_exercise_idx
  on public.session_exercises (user_id, exercise_id)
  where deleted_at is null;
create index session_exercises_exercise_idx
  on public.session_exercises (exercise_id);

create table public.session_sets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  session_exercise_id uuid not null references public.session_exercises (id) on delete cascade,
  position int not null,
  kind public.set_kind not null default 'working',
  target_reps int,
  target_weight numeric(10, 3),
  target_unit public.weight_unit,
  target_percent numeric(5, 2),
  target_rpe numeric(3, 1),
  rest_seconds int not null default 120,
  actual_reps int,
  actual_weight numeric(10, 3),
  actual_unit public.weight_unit,
  weight_kg numeric(12, 6),
  rpe numeric(3, 1),
  notes text not null default '',
  skipped boolean not null default false,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint session_sets_position_nonneg check (position >= 0),
  constraint session_sets_reps check (actual_reps is null or actual_reps >= 1),
  constraint session_sets_target_reps check (target_reps is null or target_reps >= 1),
  constraint session_sets_weight check (actual_weight is null or actual_weight >= 0),
  constraint session_sets_weight_unit check (actual_weight is null or actual_unit is not null),
  constraint session_sets_target_weight_unit check (target_weight is null or target_unit is not null),
  constraint session_sets_rpe check (rpe is null or (rpe >= 1 and rpe <= 10)),
  constraint session_sets_target_rpe check (target_rpe is null or (target_rpe >= 1 and target_rpe <= 10)),
  constraint session_sets_percent check (target_percent is null or (target_percent >= 1 and target_percent <= 120)),
  constraint session_sets_rest check (rest_seconds >= 0),
  constraint session_sets_kg check (
    (actual_weight is null and weight_kg is null)
    or (actual_weight is not null and weight_kg is not null)
  )
);

create index session_sets_parent_idx
  on public.session_sets (session_exercise_id, position)
  where deleted_at is null;
create index session_sets_user_idx on public.session_sets (user_id);

create table public.set_media (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  session_set_id uuid not null references public.session_sets (id) on delete cascade,
  storage_key text,
  content_type text,
  byte_size bigint,
  duration_seconds numeric(8, 2),
  status public.media_status not null default 'local',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint set_media_byte_size check (byte_size is null or byte_size > 0)
);

create unique index set_media_one_per_set_idx
  on public.set_media (session_set_id)
  where deleted_at is null;
create index set_media_user_idx on public.set_media (user_id);

create table public.sync_changes (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  entity text not null,
  entity_id uuid not null,
  op text not null check (op in ('upsert', 'delete')),
  changed_at timestamptz not null default now()
);

create index sync_changes_user_cursor_idx on public.sync_changes (user_id, id);

create table public.applied_mutations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  client_mutation_id uuid not null,
  created_at timestamptz not null default now()
);

create unique index applied_mutations_once_idx
  on public.applied_mutations (user_id, client_mutation_id);

create function app_private.set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create function app_private.record_sync()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  uid uuid;
  eid uuid;
  operation text := 'upsert';
begin
  if tg_op = 'DELETE' then
    operation := 'delete';
    eid := old.id;
    if tg_table_name = 'profiles' then
      uid := old.id;
    elsif tg_table_name = 'exercises' then
      uid := old.owner_id;
    else
      uid := old.user_id;
    end if;
  else
    eid := new.id;
    if tg_table_name = 'profiles' then
      uid := new.id;
    elsif tg_table_name = 'exercises' then
      uid := new.owner_id;
    else
      uid := new.user_id;
    end if;
    if tg_op = 'UPDATE' and new.deleted_at is not null and old.deleted_at is null then
      operation := 'delete';
    elsif tg_op = 'INSERT' and new.deleted_at is not null then
      operation := 'delete';
    end if;
  end if;

  if uid is not null then
    insert into public.sync_changes (user_id, entity, entity_id, op)
    values (uid, tg_table_name, eid, operation);
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create function app_private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'display_name', ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      ''
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create function app_private.delete_user_data()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  delete from public.set_media where user_id = old.id;
  delete from public.session_sets where user_id = old.id;
  delete from public.session_exercises where user_id = old.id;
  delete from public.sessions where user_id = old.id;
  delete from public.workout_sets where user_id = old.id;
  delete from public.workout_exercises where user_id = old.id;
  delete from public.workouts where user_id = old.id;
  delete from public.exercise_references where user_id = old.id;
  delete from public.exercises where owner_id = old.id;
  delete from public.profiles where id = old.id;
  delete from public.sync_changes where user_id = old.id;
  delete from public.applied_mutations where user_id = old.id;
  return old;
end;
$$;

revoke all on function app_private.set_updated_at() from public, anon, authenticated;
revoke all on function app_private.record_sync() from public, anon, authenticated;
revoke all on function app_private.handle_new_user() from public, anon, authenticated;
revoke all on function app_private.delete_user_data() from public, anon, authenticated;

create trigger profiles_set_updated_at before insert or update on public.profiles
  for each row execute function app_private.set_updated_at();
create trigger profiles_record_sync after insert or update or delete on public.profiles
  for each row execute function app_private.record_sync();

create trigger exercises_set_updated_at before insert or update on public.exercises
  for each row execute function app_private.set_updated_at();
create trigger exercises_record_sync after insert or update or delete on public.exercises
  for each row execute function app_private.record_sync();

create trigger exercise_references_set_updated_at before insert or update on public.exercise_references
  for each row execute function app_private.set_updated_at();
create trigger exercise_references_record_sync after insert or update or delete on public.exercise_references
  for each row execute function app_private.record_sync();

create trigger workouts_set_updated_at before insert or update on public.workouts
  for each row execute function app_private.set_updated_at();
create trigger workouts_record_sync after insert or update or delete on public.workouts
  for each row execute function app_private.record_sync();

create trigger workout_exercises_set_updated_at before insert or update on public.workout_exercises
  for each row execute function app_private.set_updated_at();
create trigger workout_exercises_record_sync after insert or update or delete on public.workout_exercises
  for each row execute function app_private.record_sync();

create trigger workout_sets_set_updated_at before insert or update on public.workout_sets
  for each row execute function app_private.set_updated_at();
create trigger workout_sets_record_sync after insert or update or delete on public.workout_sets
  for each row execute function app_private.record_sync();

create trigger sessions_set_updated_at before insert or update on public.sessions
  for each row execute function app_private.set_updated_at();
create trigger sessions_record_sync after insert or update or delete on public.sessions
  for each row execute function app_private.record_sync();

create trigger session_exercises_set_updated_at before insert or update on public.session_exercises
  for each row execute function app_private.set_updated_at();
create trigger session_exercises_record_sync after insert or update or delete on public.session_exercises
  for each row execute function app_private.record_sync();

create trigger session_sets_set_updated_at before insert or update on public.session_sets
  for each row execute function app_private.set_updated_at();
create trigger session_sets_record_sync after insert or update or delete on public.session_sets
  for each row execute function app_private.record_sync();

create trigger set_media_set_updated_at before insert or update on public.set_media
  for each row execute function app_private.set_updated_at();
create trigger set_media_record_sync after insert or update or delete on public.set_media
  for each row execute function app_private.record_sync();

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function app_private.handle_new_user();

create trigger before_auth_user_delete
  before delete on auth.users
  for each row execute function app_private.delete_user_data();

insert into public.exercises (id, owner_id, name, primary_muscle, equipment) values
  ('df00b70c-0d32-5048-8e57-2e8af0f85e22', null, 'Back Squat', 'quads', 'barbell'),
  ('32c7634a-8411-51a4-bd4e-e63f0a9d60ff', null, 'Front Squat', 'quads', 'barbell'),
  ('945588d5-76e8-50ff-9b08-5a61982e1c0e', null, 'Bench Press', 'chest', 'barbell'),
  ('593e1d8e-8a34-53dc-ba04-d8c756b1552e', null, 'Incline Bench Press', 'chest', 'barbell'),
  ('bb712dc6-743e-5af1-a235-0bc8818124fa', null, 'Overhead Press', 'shoulders', 'barbell'),
  ('6e444f8d-53f2-55ea-9fa0-1ad012e77515', null, 'Deadlift', 'back', 'barbell'),
  ('816ce516-5aec-5beb-bdb8-ad4ef85e1a0a', null, 'Romanian Deadlift', 'hamstrings', 'barbell'),
  ('a0ce1f6e-ee09-5dd7-92d2-a99309b7f346', null, 'Barbell Row', 'back', 'barbell'),
  ('2d5ba6a3-e11b-58d5-9c26-b418374db481', null, 'Pull-Up', 'back', 'bodyweight'),
  ('97899ada-a893-536c-a3c3-b085b63b532b', null, 'Dip', 'chest', 'bodyweight'),
  ('f09cf825-db6a-5030-876e-58024d3b0dfd', null, 'Lat Pulldown', 'back', 'cable'),
  ('10a30faa-4b41-59a9-b188-f4cf8fb858b7', null, 'Seated Cable Row', 'back', 'cable'),
  ('f589e359-e1da-535c-8c08-295b0a839417', null, 'Dumbbell Bench Press', 'chest', 'dumbbell'),
  ('83353b1e-d468-533e-9589-29f5618946fd', null, 'Dumbbell Shoulder Press', 'shoulders', 'dumbbell'),
  ('ffd8fd40-d7b7-5ed8-952a-8a176eb31cfa', null, 'Dumbbell Row', 'back', 'dumbbell'),
  ('a0fb58da-50da-595b-b34b-8c74e16f0ac2', null, 'Lateral Raise', 'shoulders', 'dumbbell'),
  ('638ef811-524f-5e95-b348-7230fa1f9dfe', null, 'Barbell Curl', 'biceps', 'barbell'),
  ('219efc97-baa1-5de7-a0ac-ffb5a907e895', null, 'Hammer Curl', 'biceps', 'dumbbell'),
  ('551e548d-f7c2-5ab6-8477-cc0b6e03d34e', null, 'Triceps Pushdown', 'triceps', 'cable'),
  ('12340e40-28dd-569b-a98a-8e06761fa27e', null, 'Skull Crusher', 'triceps', 'barbell'),
  ('080eb8e0-d28b-5833-80e4-22dd9b4c968a', null, 'Leg Press', 'quads', 'machine'),
  ('4d059840-e1de-5350-a35a-8e9b3902417f', null, 'Leg Curl', 'hamstrings', 'machine'),
  ('f7760e13-212f-56ff-b583-f01c3b458a82', null, 'Leg Extension', 'quads', 'machine'),
  ('9b46ccf7-7580-5cae-90be-cdb44f1c917e', null, 'Walking Lunge', 'quads', 'dumbbell'),
  ('326185f6-d401-521a-93f1-0181f58e930b', null, 'Bulgarian Split Squat', 'quads', 'dumbbell'),
  ('33895d4b-1837-5e47-a5c0-e06dfa713c56', null, 'Hip Thrust', 'glutes', 'barbell'),
  ('080d8286-b718-5cfe-bb94-f0827c919856', null, 'Calf Raise', 'calves', 'machine'),
  ('f940b1dd-2963-5132-8d70-96cd9f4bd80e', null, 'Face Pull', 'shoulders', 'cable'),
  ('f102fbdd-6e59-516d-a8b1-7abb0a397589', null, 'Chest Fly', 'chest', 'dumbbell'),
  ('2e2dcd49-9d32-5bb4-a683-f2a935d45608', null, 'Close-Grip Bench Press', 'triceps', 'barbell'),
  ('fac9f07d-2f21-5604-a7b1-35bf8e84b4f0', null, 'Pendlay Row', 'back', 'barbell'),
  ('56dbf121-1800-5e9e-91fb-c73afea8485d', null, 'Good Morning', 'hamstrings', 'barbell'),
  ('83bd567d-363d-5bac-824f-8c7c651d01c2', null, 'Hack Squat', 'quads', 'machine'),
  ('9ca2328c-f19e-5eee-acb2-0f8170be3ba9', null, 'Preacher Curl', 'biceps', 'barbell'),
  ('14298dc6-2b5e-5fc0-a85a-bbe783ade8a7', null, 'Overhead Triceps Extension', 'triceps', 'dumbbell'),
  ('d3d45b45-4dbf-5e82-9cb9-2fbecb1d93b0', null, 'Rear Delt Fly', 'shoulders', 'dumbbell'),
  ('23d49c3f-250f-5db4-a67c-ea89295425ea', null, 'Shrug', 'back', 'barbell'),
  ('d68490f1-2844-5321-af7d-cbdc6efd35ff', null, 'Weighted Pull-Up', 'back', 'bodyweight'),
  ('83dc6a51-5d7e-5f14-b21d-dc4e0023b2f5', null, 'Weighted Dip', 'chest', 'bodyweight'),
  ('70aed009-1ab7-5a46-a758-23a77cdeb9c4', null, 'Incline Dumbbell Press', 'chest', 'dumbbell');

insert into public.catalog_meta (id, version) values (1, 1);

do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'profiles',
    'exercises',
    'catalog_meta',
    'exercise_references',
    'workouts',
    'workout_exercises',
    'workout_sets',
    'sessions',
    'session_exercises',
    'session_sets',
    'set_media',
    'sync_changes',
    'applied_mutations'
  ]
  loop
    execute format('alter table public.%I enable row level security', tbl);
    execute format('revoke all on table public.%I from public, anon, authenticated, service_role', tbl);
  end loop;
end
$$;
