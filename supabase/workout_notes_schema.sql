-- Run this once in the Supabase SQL Editor, alongside the other schema files.
--
-- workout_notes lets you attach a free-text note and/or manually-entered
-- exercises/weights to a specific Strava activity (matched by its
-- strava_activity_id), for cases where Strava itself doesn't capture that
-- detail (e.g. a WeightTraining session with no exercise breakdown).
create table if not exists workout_notes (
  id bigint generated always as identity primary key,
  strava_activity_id bigint not null unique,
  note text,
  exercises text,
  updated_at timestamptz not null default now()
);

create index if not exists workout_notes_strava_activity_id_idx on workout_notes (strava_activity_id);

alter table workout_notes enable row level security;

-- Same open (no-login) access pattern as the goals table: anyone with the
-- public anon key can read/write. Fine for personal, non-sensitive workout
-- notes on a no-login dashboard.
create policy "public read workout notes" on workout_notes for select using (true);
create policy "public insert workout notes" on workout_notes for insert with check (true);
create policy "public update workout notes" on workout_notes for update using (true) with check (true);
create policy "public delete workout notes" on workout_notes for delete using (true);
