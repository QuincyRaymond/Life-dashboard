-- Run this once in the Supabase SQL Editor.
--
-- Adds the columns needed for the new "Koppel Google Calendar opnieuw"
-- button (api/google-calendar-start.js + api/google-calendar-callback.js),
-- which lets you re-authorize from the dashboard instead of manually
-- generating a new GOOGLE_REFRESH_TOKEN env var whenever the old refresh
-- token expires or gets revoked.
alter table google_calendar_tokens add column if not exists pending_state text;
alter table google_calendar_tokens add column if not exists last_error text;
