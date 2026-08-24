-- Run this once in the Supabase SQL Editor. Adds the configurable weekly
-- goals used by the Health tab's Hardlopen/Gym score rings to the existing
-- user_settings table (same singleton row as the wake/sleep times).
alter table user_settings
  add column if not exists run_km_goal numeric(6,1) not null default 25,
  add column if not exists gym_sessions_goal integer not null default 4,
  add column if not exists gym_minutes_goal integer not null default 180;
