-- Run this once in the Supabase SQL Editor.
--
-- Adds the column backing the Water widget's editable daily goal (default
-- 2500ml if unset, editable via the pencil icon next to the progress bar).
-- Lives on the existing single-row user_settings table, same place as
-- wake/sleep time, Health goals and the Journal PIN hash.
alter table user_settings add column if not exists water_goal_ml integer;
