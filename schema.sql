create table if not exists public.users (
  id uuid primary key,
  email text not null unique,
  fcm_token text,
  created_at timestamptz not null default now()
);

create table if not exists public.medicine_cache (
  item_name text primary key,
  category text not null check (category in ('전문', '일반')),
  efficacy text,
  side_effects text,
  updated_at timestamptz not null default now()
);

create table if not exists public.medication_schedules (
  id bigserial primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  medicine_name text not null references public.medicine_cache(item_name),
  is_prescription boolean not null,
  dosage_times time[] not null,
  start_date date not null,
  end_date date not null,
  remaining_pills int not null check (remaining_pills >= 0),
  created_at timestamptz not null default now(),
  check (end_date >= start_date)
);

create index if not exists medication_schedules_user_id_idx
  on public.medication_schedules(user_id);

create index if not exists medication_schedules_date_idx
  on public.medication_schedules(start_date, end_date);

alter table public.users enable row level security;
alter table public.medication_schedules enable row level security;
alter table public.medicine_cache enable row level security;

drop policy if exists "users_select_own" on public.users;
create policy "users_select_own"
  on public.users
  for select
  using (auth.uid() = id);

drop policy if exists "users_insert_own" on public.users;
create policy "users_insert_own"
  on public.users
  for insert
  with check (auth.uid() = id);

drop policy if exists "users_update_own" on public.users;
create policy "users_update_own"
  on public.users
  for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists "medication_schedules_select_own" on public.medication_schedules;
create policy "medication_schedules_select_own"
  on public.medication_schedules
  for select
  using (auth.uid() = user_id);

drop policy if exists "medication_schedules_insert_own" on public.medication_schedules;
create policy "medication_schedules_insert_own"
  on public.medication_schedules
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "medication_schedules_update_own" on public.medication_schedules;
create policy "medication_schedules_update_own"
  on public.medication_schedules
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "medication_schedules_delete_own" on public.medication_schedules;
create policy "medication_schedules_delete_own"
  on public.medication_schedules
  for delete
  using (auth.uid() = user_id);

drop policy if exists "medicine_cache_public_select" on public.medicine_cache;
create policy "medicine_cache_public_select"
  on public.medicine_cache
  for select
  using (true);
