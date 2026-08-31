-- Run this once in the Supabase SQL Editor, alongside
-- enable_banking_schema.sql.
--
-- Backs the net worth, emergency fund, investment tracker and monthly
-- review sections of the Finance tab. Same sensitivity level as the bank
-- tables, so the same owner-only RLS pattern applies for reads — but
-- unlike the bank_* tables, these are entered directly by you through the
-- Finance tab UI (not synced by a server function), so the owner is also
-- allowed to insert/update, not just read.
--
-- Replace 'qdvlugt@hotmail.com' throughout if you'd rather use a different
-- login email (see also enable_banking_schema.sql and lib/enablebanking.js,
-- which use the same address).

create table if not exists investment_log (
  id bigint generated always as identity primary key,
  entry_month date not null unique,
  degiro_value numeric(14, 2),
  contributed boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table investment_log enable row level security;
create policy "owner read investment_log" on investment_log
  for select using (auth.jwt() ->> 'email' = 'qdvlugt@hotmail.com');
create policy "owner insert investment_log" on investment_log
  for insert with check (auth.jwt() ->> 'email' = 'qdvlugt@hotmail.com');
create policy "owner update investment_log" on investment_log
  for update using (auth.jwt() ->> 'email' = 'qdvlugt@hotmail.com') with check (auth.jwt() ->> 'email' = 'qdvlugt@hotmail.com');

create table if not exists emergency_fund_log (
  id bigint generated always as identity primary key,
  entry_date date not null unique,
  amount numeric(14, 2) not null,
  updated_at timestamptz not null default now()
);

alter table emergency_fund_log enable row level security;
create policy "owner read emergency_fund_log" on emergency_fund_log
  for select using (auth.jwt() ->> 'email' = 'qdvlugt@hotmail.com');
create policy "owner insert emergency_fund_log" on emergency_fund_log
  for insert with check (auth.jwt() ->> 'email' = 'qdvlugt@hotmail.com');
create policy "owner update emergency_fund_log" on emergency_fund_log
  for update using (auth.jwt() ->> 'email' = 'qdvlugt@hotmail.com') with check (auth.jwt() ->> 'email' = 'qdvlugt@hotmail.com');

create table if not exists emergency_fund_goal (
  id boolean primary key default true,
  target_amount numeric(14, 2) not null default 0,
  updated_at timestamptz not null default now(),
  constraint emergency_fund_goal_single_row check (id)
);

alter table emergency_fund_goal enable row level security;
create policy "owner read emergency_fund_goal" on emergency_fund_goal
  for select using (auth.jwt() ->> 'email' = 'qdvlugt@hotmail.com');
create policy "owner insert emergency_fund_goal" on emergency_fund_goal
  for insert with check (auth.jwt() ->> 'email' = 'qdvlugt@hotmail.com');
create policy "owner update emergency_fund_goal" on emergency_fund_goal
  for update using (auth.jwt() ->> 'email' = 'qdvlugt@hotmail.com') with check (auth.jwt() ->> 'email' = 'qdvlugt@hotmail.com');

insert into emergency_fund_goal (id, target_amount) values (true, 0)
on conflict (id) do nothing;

-- One row per update to emergency fund or investment value, capturing all
-- three net-worth components together at that moment. This is what powers
-- the "development over time" chart — simpler and more direct than trying
-- to merge three independently-paced time series (daily bank syncs vs.
-- occasional manual updates) with forward-fill logic at render time.
create table if not exists net_worth_snapshots (
  id bigint generated always as identity primary key,
  snapshot_date date not null,
  bank_balance numeric(14, 2),
  degiro_value numeric(14, 2),
  emergency_fund numeric(14, 2),
  total numeric(14, 2),
  created_at timestamptz not null default now()
);

create index if not exists net_worth_snapshots_date_idx on net_worth_snapshots (snapshot_date);

alter table net_worth_snapshots enable row level security;
create policy "owner read net_worth_snapshots" on net_worth_snapshots
  for select using (auth.jwt() ->> 'email' = 'qdvlugt@hotmail.com');
create policy "owner insert net_worth_snapshots" on net_worth_snapshots
  for insert with check (auth.jwt() ->> 'email' = 'qdvlugt@hotmail.com');

create table if not exists monthly_review (
  id bigint generated always as identity primary key,
  entry_month date not null unique,
  went_well text,
  improve text,
  unexpected_expenses text,
  on_track text,
  updated_at timestamptz not null default now()
);

alter table monthly_review enable row level security;
create policy "owner read monthly_review" on monthly_review
  for select using (auth.jwt() ->> 'email' = 'qdvlugt@hotmail.com');
create policy "owner insert monthly_review" on monthly_review
  for insert with check (auth.jwt() ->> 'email' = 'qdvlugt@hotmail.com');
create policy "owner update monthly_review" on monthly_review
  for update using (auth.jwt() ->> 'email' = 'qdvlugt@hotmail.com') with check (auth.jwt() ->> 'email' = 'qdvlugt@hotmail.com');
