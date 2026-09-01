-- Run this once in the Supabase SQL Editor, alongside the other schema
-- files.
--
-- Backs the WHOOP integration on the Sleep card in the Health tab. Same
-- sensitivity tier as enable_banking_schema.sql: biometric/recovery data is
-- more sensitive than the rest of this dashboard's data, so reading requires
-- a signed-in Supabase session belonging to your own email specifically
-- (the same magic-link login already used for the Finance tab — one login
-- unlocks both, since it's the same Supabase Auth session). Writing is
-- restricted to the service_role key, used only by the Vercel serverless
-- functions (api/whoop-*.js and the daily cron in api/strava-sync.js).
--
-- Replace 'qdvlugt@hotmail.com' below if you'd rather use a different email
-- (see also enable_banking_schema.sql and lib/enablebanking.js, which use
-- the same address).

create table if not exists whoop_connection (
  id boolean primary key default true,
  access_token text,
  refresh_token text,
  token_expires_at timestamptz,
  pending_state text,
  status text not null default 'disconnected',
  last_error text,
  last_synced_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint whoop_connection_single_row check (id)
);

alter table whoop_connection enable row level security;
create policy "owner read whoop_connection" on whoop_connection
  for select using (auth.jwt() ->> 'email' = 'qdvlugt@hotmail.com');
-- No insert/update/delete policy for anon or authenticated — only the
-- service_role key (server-side) writes to this table. The client-side JS
-- also deliberately never selects access_token/refresh_token even though
-- RLS would allow the owner to read them.

create table if not exists whoop_recovery (
  id bigint generated always as identity primary key,
  whoop_cycle_id bigint not null unique,
  recovery_score numeric(6, 2),
  hrv_rmssd_milli numeric(8, 3),
  resting_heart_rate numeric(6, 2),
  strain numeric(6, 2),
  recorded_at timestamptz,
  synced_at timestamptz not null default now()
);

create index if not exists whoop_recovery_recorded_at_idx on whoop_recovery (recorded_at desc);

alter table whoop_recovery enable row level security;
create policy "owner read whoop_recovery" on whoop_recovery
  for select using (auth.jwt() ->> 'email' = 'qdvlugt@hotmail.com');

create table if not exists whoop_sleep (
  id bigint generated always as identity primary key,
  whoop_sleep_id text not null unique,
  sleep_performance_percentage numeric(6, 2),
  total_sleep_time_milli bigint,
  stage_summary jsonb,
  start_time timestamptz,
  end_time timestamptz,
  synced_at timestamptz not null default now()
);

create index if not exists whoop_sleep_start_time_idx on whoop_sleep (start_time desc);

alter table whoop_sleep enable row level security;
create policy "owner read whoop_sleep" on whoop_sleep
  for select using (auth.jwt() ->> 'email' = 'qdvlugt@hotmail.com');

insert into whoop_connection (id, status) values (true, 'disconnected')
on conflict (id) do nothing;
