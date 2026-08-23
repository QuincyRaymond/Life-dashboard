-- Run this once in the Supabase SQL Editor (Project > SQL Editor > New query)
-- for the "Life dashboard" project (atsusphjcgrxgfeejhex).
--
-- No login is used, so RLS policies below allow anyone with the project's
-- anon/publishable key to read and write this data. That key is embedded in
-- the public index.html, so treat this data as public.

create table if not exists goals (
  id bigint generated always as identity primary key,
  date date not null,
  text text not null,
  done boolean not null default false,
  done_at timestamptz,
  queued boolean not null default false,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists goals_date_idx on goals (date);

alter table goals enable row level security;

create policy "public read goals" on goals for select using (true);
create policy "public insert goals" on goals for insert with check (true);
create policy "public update goals" on goals for update using (true) with check (true);
create policy "public delete goals" on goals for delete using (true);

create table if not exists goal_streak (
  id boolean primary key default true,
  count integer not null default 0,
  last_processed_date date,
  constraint goal_streak_single_row check (id)
);

alter table goal_streak enable row level security;

create policy "public read streak" on goal_streak for select using (true);
create policy "public insert streak" on goal_streak for insert with check (true);
create policy "public update streak" on goal_streak for update using (true) with check (true);
