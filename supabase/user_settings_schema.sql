-- Run this once in the Supabase SQL Editor, alongside the other schema files.
--
-- user_settings is a single-row table holding your personal wake/sleep
-- times, used by the day-ring on the Dashboard tab to compute the
-- percentage-through-the-day. Same open (no-login) access pattern as the
-- rest of this app's tables.
create table if not exists user_settings (
  id boolean primary key default true,
  wake_time text not null default '08:00',
  sleep_time text not null default '00:00',
  updated_at timestamptz not null default now(),
  constraint user_settings_single_row check (id)
);

alter table user_settings enable row level security;

create policy "public read user settings" on user_settings for select using (true);
create policy "public insert user settings" on user_settings for insert with check (true);
create policy "public update user settings" on user_settings for update using (true) with check (true);
