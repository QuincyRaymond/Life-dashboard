-- Run this once in the Supabase SQL Editor, alongside the other schema
-- files.
--
-- Backs the new Habits tiles and Water widget on the Dashboard tab, which
-- replace the old To Do List (goals/goal_streak tables — left untouched,
-- nothing writes to them anymore, drop them yourself later if you don't
-- need the old data). Same "no login" public read/write access pattern as
-- the rest of this app's low-sensitivity tables.

create table if not exists habit_log (
  id bigint generated always as identity primary key,
  habit_name text not null,
  date date not null,
  completed_at timestamptz not null default now(),
  unique (habit_name, date)
);

alter table habit_log enable row level security;
create policy "public read habit_log" on habit_log for select using (true);
create policy "public insert habit_log" on habit_log for insert with check (true);
create policy "public update habit_log" on habit_log for update using (true) with check (true);
create policy "public delete habit_log" on habit_log for delete using (true);

-- One row per habit (habit_name is the primary key, e.g. 'journal',
-- 'meditate') tracking the running streak so it doesn't need to be
-- recomputed from the full habit_log history on every load.
create table if not exists habit_streaks (
  habit_name text primary key,
  current_streak integer not null default 0,
  longest_streak integer not null default 0,
  last_completed_date date,
  updated_at timestamptz not null default now()
);

alter table habit_streaks enable row level security;
create policy "public read habit_streaks" on habit_streaks for select using (true);
create policy "public insert habit_streaks" on habit_streaks for insert with check (true);
create policy "public update habit_streaks" on habit_streaks for update using (true) with check (true);

-- One row per day; fill_count/total_ml are cumulative for that day so the
-- widget can just read today's row directly, no forward-filling needed.
create table if not exists water_log (
  date date primary key,
  fill_count integer not null default 0,
  total_ml integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table water_log enable row level security;
create policy "public read water_log" on water_log for select using (true);
create policy "public insert water_log" on water_log for insert with check (true);
create policy "public update water_log" on water_log for update using (true) with check (true);
