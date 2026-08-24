-- Run this once in the Supabase SQL Editor. Adds a calories column to the
-- existing strava_activities table, used by the Gym section's activity
-- list (kcal instead of distance, which isn't meaningful for strength
-- training). Populated by api/strava-sync.js, which now fetches each
-- activity's detail endpoint (the only place Strava exposes calories) on
-- every sync run.
alter table strava_activities
  add column if not exists calories real;
