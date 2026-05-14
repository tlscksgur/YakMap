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

create table if not exists public.safe_store_list (
  store_name text primary key,
  address text not null,
  geo_location point,
  phone text,
  open_hours text,
  updated_at timestamptz not null default now()
);

create index if not exists medication_schedules_user_id_idx
  on public.medication_schedules(user_id);

create index if not exists medication_schedules_date_idx
  on public.medication_schedules(start_date, end_date);
