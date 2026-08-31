-- Run this once in the Supabase SQL Editor, alongside the other schema
-- files.
--
-- Backs the Finance tab's Enable Banking integration. Unlike every other
-- table in this app, these are NOT publicly readable — bank balances and
-- transactions are far more sensitive than the rest of this dashboard's
-- data. Reading requires a signed-in Supabase session belonging to your
-- own email specifically (not just "any authenticated user" — see the
-- policies below), obtained via the magic-link login added to the Finance
-- tab. Writing is restricted to the service_role key, used only by the
-- Vercel serverless functions (api/enable-banking-*.js).
--
-- Replace 'qdvlugt@hotmail.com' below if you'd rather use a different email
-- for the Finance-tab login than the one this was generated for.

create table if not exists bank_connection (
  id boolean primary key default true,
  session_id text,
  aspsp_name text,
  aspsp_country text,
  access_valid_until timestamptz,
  authorization_id text,
  pending_state text,
  status text not null default 'disconnected',
  last_error text,
  updated_at timestamptz not null default now(),
  constraint bank_connection_single_row check (id)
);

alter table bank_connection enable row level security;
create policy "owner read bank_connection" on bank_connection
  for select using (auth.jwt() ->> 'email' = 'qdvlugt@hotmail.com');
-- No insert/update/delete policy for anon or authenticated — only the
-- service_role key (server-side) writes to this table.

create table if not exists bank_accounts (
  id bigint generated always as identity primary key,
  account_uid text not null unique,
  iban text,
  name text,
  currency text,
  cash_account_type text,
  created_at timestamptz not null default now()
);

alter table bank_accounts enable row level security;
create policy "owner read bank_accounts" on bank_accounts
  for select using (auth.jwt() ->> 'email' = 'qdvlugt@hotmail.com');

create table if not exists bank_balances (
  id bigint generated always as identity primary key,
  account_uid text not null references bank_accounts (account_uid) on delete cascade,
  balance_type text,
  amount numeric(14, 2),
  currency text,
  reference_date date,
  synced_at timestamptz not null default now()
);

create index if not exists bank_balances_account_uid_idx on bank_balances (account_uid, synced_at desc);

alter table bank_balances enable row level security;
create policy "owner read bank_balances" on bank_balances
  for select using (auth.jwt() ->> 'email' = 'qdvlugt@hotmail.com');

create table if not exists bank_transactions (
  id bigint generated always as identity primary key,
  account_uid text not null references bank_accounts (account_uid) on delete cascade,
  transaction_id text not null,
  booking_date date,
  amount numeric(14, 2),
  currency text,
  creditor_name text,
  debtor_name text,
  remittance_info text,
  raw jsonb,
  synced_at timestamptz not null default now(),
  unique (account_uid, transaction_id)
);

create index if not exists bank_transactions_booking_date_idx on bank_transactions (booking_date desc);

alter table bank_transactions enable row level security;
create policy "owner read bank_transactions" on bank_transactions
  for select using (auth.jwt() ->> 'email' = 'qdvlugt@hotmail.com');

insert into bank_connection (id, status) values (true, 'disconnected')
on conflict (id) do nothing;
