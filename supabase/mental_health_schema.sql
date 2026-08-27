-- Run this once in the Supabase SQL Editor, alongside the other schema files.
--
-- Backs the "Mental Health" tab: a daily journal, a mood tracker, and a
-- gratitude log. One row per calendar day per table (entry_date unique),
-- upserted from the client. Same open (no-login) access pattern as the
-- rest of this app's tables — journal entries are personal, so this is
-- worth keeping in mind alongside the app's other no-login data.

create table if not exists journal_entries (
  id bigint generated always as identity primary key,
  entry_date date not null unique,
  text text not null default '',
  updated_at timestamptz not null default now()
);

alter table journal_entries enable row level security;

create policy "public read journal entries" on journal_entries for select using (true);
create policy "public insert journal entries" on journal_entries for insert with check (true);
create policy "public update journal entries" on journal_entries for update using (true) with check (true);
create policy "public delete journal entries" on journal_entries for delete using (true);

create table if not exists mood_log (
  id bigint generated always as identity primary key,
  entry_date date not null unique,
  score integer not null check (score between 1 and 5),
  updated_at timestamptz not null default now()
);

alter table mood_log enable row level security;

create policy "public read mood log" on mood_log for select using (true);
create policy "public insert mood log" on mood_log for insert with check (true);
create policy "public update mood log" on mood_log for update using (true) with check (true);
create policy "public delete mood log" on mood_log for delete using (true);

create table if not exists gratitude_entries (
  id bigint generated always as identity primary key,
  entry_date date not null unique,
  items text[] not null default '{}',
  updated_at timestamptz not null default now()
);

alter table gratitude_entries enable row level security;

create policy "public read gratitude entries" on gratitude_entries for select using (true);
create policy "public insert gratitude entries" on gratitude_entries for insert with check (true);
create policy "public update gratitude entries" on gratitude_entries for update using (true) with check (true);
create policy "public delete gratitude entries" on gratitude_entries for delete using (true);
