-- Run this once in the Supabase SQL Editor, alongside the other schema files.
--
-- coach_feedback stores each AI-generated reflection from the Mental
-- Health tab's coach section, so past feedback can be read back later.
-- Unlike this app's other tables, writes are NOT open to the public anon
-- key here — only the Vercel serverless function (api/mental-coach.js,
-- using the service_role key) can insert. This is deliberate: the coach
-- endpoint enforces a cooldown by checking the most recent row here, and
-- allowing arbitrary anon inserts would let that cooldown be bypassed and
-- would let anyone plant fake "coach" messages in your history. Reading
-- stays public so the tab can show your feedback history.
create table if not exists coach_feedback (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  concern boolean not null default false,
  message text not null
);

create index if not exists coach_feedback_created_at_idx on coach_feedback (created_at desc);

alter table coach_feedback enable row level security;

create policy "public read coach feedback" on coach_feedback for select using (true);
-- Deliberately no insert/update/delete policy for anon.
