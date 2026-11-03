-- Planned workouts on the calendar. One row is one workout on one local day.
-- Whether it was done is derived from sessions on that day, so nothing here
-- changes when a session starts or finishes.

create table public.scheduled_workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  workout_id uuid not null references public.workouts (id),
  scheduled_on date not null,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint scheduled_workouts_notes_len check (char_length(notes) <= 500)
);

create index scheduled_workouts_user_day_idx
  on public.scheduled_workouts (user_id, scheduled_on)
  where deleted_at is null;
create index scheduled_workouts_workout_idx
  on public.scheduled_workouts (workout_id);

create trigger scheduled_workouts_set_updated_at before insert or update on public.scheduled_workouts
  for each row execute function app_private.set_updated_at();
create trigger scheduled_workouts_record_sync after insert or update or delete on public.scheduled_workouts
  for each row execute function app_private.record_sync();

create or replace function app_private.delete_user_data()
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
  delete from public.scheduled_workouts where user_id = old.id;
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

revoke all on function app_private.delete_user_data() from public, anon, authenticated;

alter table public.scheduled_workouts enable row level security;
revoke all on table public.scheduled_workouts from public, anon, authenticated, service_role;
