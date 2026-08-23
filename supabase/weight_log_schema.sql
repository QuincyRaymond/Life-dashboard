-- Run this once in the Supabase SQL Editor, alongside the other schema files.
--
-- weight_log stores one row per progress-photo check-in: a date, a weight,
-- and a path to the photo in the "progress-photos" Storage bucket (created
-- below). Same open (no-login) access pattern as the rest of this app's
-- tables: the public anon key can read/write. Progress photos are
-- meaningfully more sensitive than a to-do list, though — this makes them
-- readable by anyone with the photo's URL (the bucket is public, which is
-- required since the dashboard has no login to gate a signed URL). Worth
-- reconsidering if that's not okay.

create table if not exists weight_log (
  id bigint generated always as identity primary key,
  entry_date date not null,
  weight_kg numeric(5,2) not null,
  photo_path text not null,
  created_at timestamptz not null default now()
);

create index if not exists weight_log_entry_date_idx on weight_log (entry_date);

alter table weight_log enable row level security;

create policy "public read weight log" on weight_log for select using (true);
create policy "public insert weight log" on weight_log for insert with check (true);
create policy "public update weight log" on weight_log for update using (true) with check (true);
create policy "public delete weight log" on weight_log for delete using (true);

-- Storage bucket for the progress photos themselves.
insert into storage.buckets (id, name, public)
values ('progress-photos', 'progress-photos', true)
on conflict (id) do nothing;

create policy "public read progress photos" on storage.objects
  for select using (bucket_id = 'progress-photos');
create policy "public upload progress photos" on storage.objects
  for insert with check (bucket_id = 'progress-photos');
create policy "public delete progress photos" on storage.objects
  for delete using (bucket_id = 'progress-photos');
