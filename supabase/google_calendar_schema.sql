-- Run this once in the Supabase SQL Editor, alongside the other schema files.
--
-- google_calendar_tokens holds the OAuth tokens used by the Vercel
-- calendar-events function. Same pattern as strava_tokens: RLS enabled with
-- NO policies at all, so the public anon key has zero access — only a
-- request using the Supabase service_role key (kept as a Vercel env var,
-- never in git) can read or write this table.
create table if not exists google_calendar_tokens (
  id boolean primary key default true,
  access_token text not null default '',
  refresh_token text not null,
  expires_at bigint not null default 0,
  constraint google_calendar_tokens_single_row check (id)
);

alter table google_calendar_tokens enable row level security;
