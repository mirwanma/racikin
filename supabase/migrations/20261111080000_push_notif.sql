-- Fase 9: Pengingat & notifikasi (Web Push).
--
-- - private.push_config: kunci VAPID (dibuat otomatis oleh Edge Function racikin-push saat pertama
--   dipakai) + token rahasia untuk pemanggilan terjadwal. Schema private tidak diekspos ke API.
-- - public.push_subscriptions: satu baris per perangkat (endpoint push browser) + preferensi pengingat.
--   Ditulis lewat fungsi push_subscribe / push_unsubscribe; user hanya bisa membaca miliknya.
-- - pg_cron memanggil Edge Function tiap 15 menit (pg_net), membawa token dari push_config.

create extension if not exists pg_cron;
create extension if not exists pg_net;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.push_config (
  id int primary key default 1 check (id = 1),
  vapid_public text,
  vapid_private jsonb,
  cron_token text not null default encode(extensions.gen_random_bytes(24), 'hex')
);
insert into private.push_config (id) values (1) on conflict do nothing;

create table if not exists public.push_subscriptions (
  endpoint text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  p256dh text not null,
  auth text not null,
  tz text not null default 'Asia/Jakarta',
  prefs jsonb not null default '{}'::jsonb,
  sent jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint push_endpoint_https check (endpoint like 'https://%' and char_length(endpoint) < 1000)
);
create index if not exists push_subscriptions_user on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;
create policy "push_subscriptions: baca milik sendiri" on public.push_subscriptions
  for select to authenticated using ((select auth.uid()) = user_id);
-- Tulis hanya lewat fungsi di bawah.

-- Host layanan push browser yang diizinkan (supaya server tidak dipakai menembak URL sembarang).
create or replace function public.push_host_ok(p_endpoint text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select substring(p_endpoint from '^https://([^/:]+)') ~ '(^fcm\.googleapis\.com$|^jmt[0-9]+\.google\.com$|^android\.googleapis\.com$|\.push\.services\.mozilla\.com$|\.notify\.windows\.com$|^web\.push\.apple\.com$|\.push\.apple\.com$)';
$$;

-- Daftarkan / perbarui perangkat ini. Endpoint yang sama dipindah ke akun yang sedang login
-- (perangkat dipakai bergantian).
create or replace function public.push_subscribe(p_endpoint text, p_p256dh text, p_auth text, p_tz text, p_prefs jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
begin
  if uid is null then
    raise exception 'Belum login';
  end if;
  if not public.push_host_ok(p_endpoint) then
    raise exception 'Layanan push browser ini tidak didukung';
  end if;
  if char_length(p_p256dh) > 200 or char_length(p_auth) > 100 or char_length(coalesce(p_tz, '')) > 64
     or pg_column_size(p_prefs) > 2000 then
    raise exception 'Data langganan tidak valid';
  end if;
  if (select count(*) from public.push_subscriptions where user_id = uid and endpoint <> p_endpoint) >= 10 then
    raise exception 'Maksimal 10 perangkat per akun';
  end if;
  insert into public.push_subscriptions (endpoint, user_id, p256dh, auth, tz, prefs)
  values (p_endpoint, uid, p_p256dh, p_auth, coalesce(nullif(p_tz, ''), 'Asia/Jakarta'), coalesce(p_prefs, '{}'::jsonb))
  on conflict (endpoint) do update
    set user_id = excluded.user_id,
        p256dh = excluded.p256dh,
        auth = excluded.auth,
        tz = excluded.tz,
        prefs = excluded.prefs,
        sent = case when push_subscriptions.user_id = excluded.user_id then push_subscriptions.sent else '{}'::jsonb end,
        updated_at = now();
end;
$$;

create or replace function public.push_unsubscribe(p_endpoint text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.push_subscriptions where endpoint = p_endpoint and user_id = (select auth.uid());
$$;

-- Untuk Edge Function (service role saja): baca & isi konfigurasi.
create or replace function public.push_config_get()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('vapid_public', c.vapid_public, 'vapid_private', c.vapid_private, 'cron_token', c.cron_token)
  from private.push_config c where c.id = 1;
$$;

-- Simpan kunci VAPID hanya kalau belum ada (aman kalau dua request bersamaan); return konfigurasi akhir.
create or replace function public.push_config_set_vapid(p_public text, p_private jsonb)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  update private.push_config set vapid_public = p_public, vapid_private = p_private
    where id = 1 and vapid_public is null;
  select public.push_config_get();
$$;

revoke all on function public.push_host_ok(text) from public, anon;
revoke all on function public.push_subscribe(text, text, text, text, jsonb) from public, anon;
revoke all on function public.push_unsubscribe(text) from public, anon;
revoke all on function public.push_config_get() from public, anon, authenticated;
revoke all on function public.push_config_set_vapid(text, jsonb) from public, anon, authenticated;
grant execute on function public.push_host_ok(text) to authenticated;
grant execute on function public.push_subscribe(text, text, text, text, jsonb) to authenticated;
grant execute on function public.push_unsubscribe(text) to authenticated;
grant execute on function public.push_config_get() to service_role;
grant execute on function public.push_config_set_vapid(text, jsonb) to service_role;

-- Jadwal: tiap 15 menit panggil Edge Function. Token dibaca saat jalan (tidak tersimpan di definisi job).
select cron.unschedule('racikin-push') where exists (select 1 from cron.job where jobname = 'racikin-push');
select cron.schedule(
  'racikin-push',
  '*/15 * * * *',
  $job$
  select net.http_post(
    url := 'https://ujdxslztjcufidhqpmcd.supabase.co/functions/v1/racikin-push',
    headers := jsonb_build_object('Content-Type', 'application/json',
                                  'x-cron-token', (select cron_token from private.push_config where id = 1)),
    body := '{"action":"run"}'::jsonb,
    timeout_milliseconds := 60000
  );
  $job$
);
