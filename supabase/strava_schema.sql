-- Run this once in the Supabase SQL Editor, alongside schema.sql.
--
-- strava_tokens holds the OAuth tokens used by the Vercel sync function.
-- It has RLS enabled with NO policies at all, so the public anon key
-- (embedded in index.html) has zero access to it — only a request using
-- the Supabase service_role key (kept as a Vercel env var, never in git)
-- can read or write this table.
create table if not exists strava_tokens (
  id boolean primary key default true,
  access_token text not null default '',
  refresh_token text not null,
  expires_at bigint not null default 0,
  constraint strava_tokens_single_row check (id)
);

alter table strava_tokens enable row level security;

-- strava_activities mirrors your recent Strava activities. Read is public
-- (so the dashboard can display it with the anon key); only the service
-- role can insert/update, so only the sync function can write to it.
--
-- If you already ran an earlier version of this file (before the calories
-- column existed), run supabase/strava_calories_migration.sql instead to
-- add it to your existing table.
create table if not exists strava_activities (
  id bigint generated always as identity primary key,
  strava_id bigint not null unique,
  name text,
  type text,
  distance real,
  moving_time integer,
  elapsed_time integer,
  total_elevation_gain real,
  start_date timestamptz,
  average_speed real,
  calories real,
  synced_at timestamptz not null default now()
);

create index if not exists strava_activities_start_date_idx on strava_activities (start_date desc);

alter table strava_activities enable row level security;

create policy "public read strava activities" on strava_activities for select using (true);
-- Deliberately no insert/update/delete policy for anon.
