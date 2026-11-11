-- Fase 2: data user di cloud + kuota AI per user.

-- 1) Satu dokumen JSON per user (seluruh state app: profil, RAB, brand, kas, dll).
create table if not exists public.user_data (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.user_data enable row level security;

create policy "user_data: baca milik sendiri" on public.user_data
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "user_data: tambah milik sendiri" on public.user_data
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "user_data: ubah milik sendiri" on public.user_data
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "user_data: hapus milik sendiri" on public.user_data
  for delete to authenticated using ((select auth.uid()) = user_id);

-- Batas ukuran dokumen biar nggak disalahgunakan (±2 MB).
alter table public.user_data
  add constraint user_data_size check (pg_column_size(data) < 2000000);

-- 2) Log pemakaian AI, hanya bisa ditulis lewat fungsi consume_ai_quota.
create table if not exists public.ai_usage (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  task text not null,
  created_at timestamptz not null default now()
);
create index if not exists ai_usage_user_time on public.ai_usage (user_id, created_at desc);

alter table public.ai_usage enable row level security;
-- Sengaja tanpa policy: klien tidak bisa baca/tulis langsung.

-- 3) Cek & catat kuota secara atomik. Dipanggil Edge Function dengan JWT user.
create or replace function public.consume_ai_quota(p_task text, p_per_minute int default 6, p_per_day int default 60)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  n_minute int;
  n_day int;
begin
  if uid is null then
    return json_build_object('ok', false, 'reason', 'unauthenticated');
  end if;

  -- Kunci per user supaya request paralel tidak lolos bareng.
  perform pg_advisory_xact_lock(hashtextextended(uid::text, 0));

  select count(*) into n_minute from public.ai_usage
    where user_id = uid and created_at > now() - interval '1 minute';
  select count(*) into n_day from public.ai_usage
    where user_id = uid and created_at > now() - interval '1 day';

  if n_minute >= p_per_minute then
    return json_build_object('ok', false, 'reason', 'per_minute', 'limit', p_per_minute);
  end if;
  if n_day >= p_per_day then
    return json_build_object('ok', false, 'reason', 'per_day', 'limit', p_per_day);
  end if;

  insert into public.ai_usage (user_id, task) values (uid, left(p_task, 64));
  return json_build_object('ok', true, 'used_today', n_day + 1, 'limit_day', p_per_day);
end;
$$;

revoke all on function public.consume_ai_quota(text, int, int) from public, anon;
grant execute on function public.consume_ai_quota(text, int, int) to authenticated;
