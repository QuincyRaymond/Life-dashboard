-- Run this once in the Supabase SQL Editor, alongside the other schema
-- files. Safe to re-run: policy changes are guarded with "drop policy if
-- exists" in case an earlier version of this file already ran.
--
-- Backs the WHOOP integration on the Sleep card in the Health tab.
-- Recovery/sleep numbers sit at the same "no login required" sensitivity
-- tier as the rest of the Health tab (weight, workouts, etc.) — publicly
-- readable, no Finance-tab-style login gate. The raw OAuth tokens are a
-- different story: whoop_connection is locked down completely (no
-- anon/authenticated policy at all, service_role only), and the Sleep
-- card instead reads connection status through the whoop_connection_status
-- view below, which only ever exposes status/last_error/last_synced_at.

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
drop policy if exists "owner read whoop_connection" on whoop_connection;
-- Deliberately no select/insert/update/delete policy for anon or
-- authenticated — this table holds raw OAuth tokens and must never be
-- queried directly from the browser. Only the service_role key
-- (server-side, api/whoop-*.js) touches it directly.

-- Views run with the privileges of their owner (the postgres role that
-- runs this script, which bypasses RLS) rather than the querying role, so
-- this is the standard Supabase pattern for exposing a safe subset of
-- columns from an otherwise-locked-down table to anon/authenticated.
create or replace view whoop_connection_status as
  select status, last_error, last_synced_at from whoop_connection where id = true;

grant select on whoop_connection_status to anon, authenticated;

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
drop policy if exists "owner read whoop_recovery" on whoop_recovery;
drop policy if exists "public read whoop_recovery" on whoop_recovery;
create policy "public read whoop_recovery" on whoop_recovery
  for select using (true);

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
drop policy if exists "owner read whoop_sleep" on whoop_sleep;
drop policy if exists "public read whoop_sleep" on whoop_sleep;
create policy "public read whoop_sleep" on whoop_sleep
  for select using (true);

insert into whoop_connection (id, status) values (true, 'disconnected')
on conflict (id) do nothing;
