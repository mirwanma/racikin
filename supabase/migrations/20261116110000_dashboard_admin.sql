-- Dashboard admin platform Racikin (#/admin): pihak manajemen memantau semua merchant. READ-ONLY.
--
-- platform_admins : daftar akun admin platform. Tidak ada policy untuk klien (RLS aktif tanpa policy = tertutup);
--                   diisi manual oleh pemilik lewat SQL Editor:
--                   insert into public.platform_admins (user_id) select id from auth.users where email = '<email-admin>';
-- Fungsi admin_* (security definer) menolak akun yang bukan admin. Data merchant tetap terkunci RLS; admin hanya
-- menerima RINGKASAN (profil usaha, email pemilik, jumlah menu/pelanggan, order & omzet harian dari rekap kasir,
-- fitur yang dipakai, tim, pemakaian AI). Kas, laba, data pelanggan & nomor WA merchant tidak dikirim.

create table if not exists public.platform_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.platform_admins enable row level security;
revoke all on public.platform_admins from anon, authenticated;

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.platform_admins a where a.user_id = auth.uid());
$$;

-- Panjang array jsonb yang aman (bukan array -> 0).
create or replace function public.admin_len(j jsonb)
returns int
language sql
immutable
set search_path = ''
as $$
  select case when jsonb_typeof(j) = 'array' then jsonb_array_length(j) else 0 end;
$$;

-- Ringkasan semua merchant (dokumen usaha yang punya profil).
create or replace function public.admin_merchants()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  hari date := (now() at time zone 'Asia/Jakarta')::date;
  hasil jsonb;
begin
  if not public.is_platform_admin() then
    raise exception 'Khusus admin Racikin';
  end if;
  select coalesce(jsonb_agg(m), '[]'::jsonb) into hasil
  from (
    select jsonb_build_object(
      'id', d.user_id,
      'email', u.email,
      'daftar', u.created_at,
      'login_terakhir', u.last_sign_in_at,
      'diubah', d.updated_at,
      'nama', coalesce(nullif(d.data -> 'brand' -> 'terpilih' ->> 'nama', ''), nullif(d.data -> 'profile' ->> 'nama', ''), '(tanpa nama)'),
      'pemilik', d.data -> 'profile' ->> 'owner',
      'kota', d.data -> 'profile' ->> 'kota',
      'jenis', d.data -> 'profile' ->> 'jenis',
      'konsep', d.data -> 'profile' ->> 'konsep',
      'tahap', coalesce(d.data -> 'profile' ->> 'tahap', 'ide'),
      'masalah', coalesce(d.data -> 'profile' -> 'masalah', '[]'::jsonb),
      'menu', public.admin_len(d.data -> 'resep'),
      'bahan', public.admin_len(d.data -> 'bahan'),
      'pelanggan', public.admin_len(d.data -> 'pelanggan'),
      'order7', ph.order7, 'omzet7', ph.omzet7,
      'order30', ph.order30, 'omzet30', ph.omzet30,
      'order_prev30', ph.order_prev, 'omzet_prev30', ph.omzet_prev,
      'hari_jualan30', ph.hari30,
      'jualan_terakhir', ph.terakhir,
      'tim', (select count(*) from public.team_members t where t.owner_id = d.user_id),
      'ai30', (select count(*) from public.ai_usage a where a.created_at > now() - interval '30 days'
                 and (a.user_id = d.user_id or a.user_id in (select t.member_id from public.team_members t where t.owner_id = d.user_id))),
      'meja_order30', (select count(*) from public.table_orders o where o.owner_id = d.user_id and o.created_at > now() - interval '30 days'),
      'fitur', jsonb_build_object(
        'kasir', ph.order30 > 0,
        'tim', exists (select 1 from public.team_members t where t.owner_id = d.user_id),
        'meja', coalesce((d.data -> 'posSetting' ->> 'pesanMeja')::boolean, false),
        'dapur', coalesce((d.data -> 'posSetting' ->> 'dapur')::boolean, false),
        'shift', public.admin_len(d.data -> 'shifts') > 0,
        'varian', public.admin_len(d.data -> 'opsi') > 0,
        'promo', exists (select 1 from jsonb_array_elements(case when jsonb_typeof(d.data -> 'promo') = 'array' then d.data -> 'promo' else '[]'::jsonb end) p where coalesce((p ->> 'aktif')::boolean, false)),
        'wa', coalesce(d.data -> 'wa' ->> 'usaha', '') <> '',
        'stempel', jsonb_typeof(d.data -> 'loyalty') = 'object',
        'impor', public.admin_len(d.data -> 'imporJual') > 0 or jsonb_typeof(d.data -> 'kasAwal') = 'object',
        'foto', exists (select 1 from jsonb_array_elements(case when jsonb_typeof(d.data -> 'resep') = 'array' then d.data -> 'resep' else '[]'::jsonb end) r where r ? 'foto'),
        'online', exists (select 1 from jsonb_each(case when jsonb_typeof(d.data -> 'online' -> 'channels') = 'object' then d.data -> 'online' -> 'channels' else '{}'::jsonb end) c where coalesce((c.value ->> 'aktif')::boolean, false))
      )
    ) m
    from public.user_data d
    join auth.users u on u.id = d.user_id
    cross join lateral (
      select
        coalesce(sum(coalesce((e.value ->> 'order')::numeric, 0)) filter (where e.key::date > hari - 7), 0)::int as order7,
        coalesce(sum(coalesce((e.value ->> 'omzet')::numeric, 0)) filter (where e.key::date > hari - 7), 0)::bigint as omzet7,
        coalesce(sum(coalesce((e.value ->> 'order')::numeric, 0)) filter (where e.key::date > hari - 30), 0)::int as order30,
        coalesce(sum(coalesce((e.value ->> 'omzet')::numeric, 0)) filter (where e.key::date > hari - 30), 0)::bigint as omzet30,
        coalesce(sum(coalesce((e.value ->> 'order')::numeric, 0)) filter (where e.key::date <= hari - 30 and e.key::date > hari - 60), 0)::int as order_prev,
        coalesce(sum(coalesce((e.value ->> 'omzet')::numeric, 0)) filter (where e.key::date <= hari - 30 and e.key::date > hari - 60), 0)::bigint as omzet_prev,
        count(*) filter (where e.key::date > hari - 30 and coalesce((e.value ->> 'order')::numeric, 0) > 0)::int as hari30,
        max(e.key) filter (where coalesce((e.value ->> 'order')::numeric, 0) > 0 or coalesce((e.value ->> 'omzet')::numeric, 0) > 0) as terakhir
      from jsonb_each(case when jsonb_typeof(d.data -> 'posHarian') = 'object' then d.data -> 'posHarian' else '{}'::jsonb end) e
      where e.key ~ '^\d{4}-\d{2}-\d{2}$'
    ) ph
    where jsonb_typeof(d.data -> 'profile') = 'object'
  ) x;
  return hasil;
end;
$$;

-- Detail 1 merchant: order & omzet harian 60 hari, menu terlaris 30 hari, tim per peran, pemakaian AI per task 30 hari.
create or replace function public.admin_merchant_detail(p_owner uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  hari date := (now() at time zone 'Asia/Jakarta')::date;
  d record;
begin
  if not public.is_platform_admin() then
    raise exception 'Khusus admin Racikin';
  end if;
  select * into d from public.user_data where user_id = p_owner;
  if not found then
    return null;
  end if;
  return jsonb_build_object(
    'harian', (
      select coalesce(jsonb_agg(jsonb_build_object('tgl', g::date, 'order', coalesce((d.data -> 'posHarian' -> to_char(g, 'YYYY-MM-DD') ->> 'order')::numeric, 0), 'omzet', coalesce((d.data -> 'posHarian' -> to_char(g, 'YYYY-MM-DD') ->> 'omzet')::numeric, 0)) order by g), '[]'::jsonb)
      from generate_series(hari - 59, hari, interval '1 day') g
    ),
    'terlaris', (
      select coalesce(jsonb_agg(jsonb_build_object('nama', nama, 'porsi', porsi) order by porsi desc), '[]'::jsonb)
      from (
        select i.key as nama, sum(coalesce(i.value::text::numeric, 0))::int as porsi
        from jsonb_each(case when jsonb_typeof(d.data -> 'posHarian') = 'object' then d.data -> 'posHarian' else '{}'::jsonb end) e
        cross join lateral jsonb_each(case when jsonb_typeof(e.value -> 'items') = 'object' then e.value -> 'items' else '{}'::jsonb end) i
        where e.key ~ '^\d{4}-\d{2}-\d{2}$' and e.key::date > hari - 30 and jsonb_typeof(i.value) = 'number'
        group by i.key
        order by 2 desc
        limit 5
      ) t
    ),
    'tim', (
      select coalesce(jsonb_agg(jsonb_build_object('role', role, 'n', n)), '[]'::jsonb)
      from (select t.role, count(*) as n from public.team_members t where t.owner_id = p_owner group by t.role) x
    ),
    'ai', (
      select coalesce(jsonb_agg(jsonb_build_object('task', task, 'n', n) order by n desc), '[]'::jsonb)
      from (
        select a.task, count(*) as n from public.ai_usage a
        where a.created_at > now() - interval '30 days'
          and (a.user_id = p_owner or a.user_id in (select t.member_id from public.team_members t where t.owner_id = p_owner))
        group by a.task
      ) x
    ),
    'meja', (select count(*) from public.table_orders o where o.owner_id = p_owner and o.created_at > now() - interval '30 days')
  );
end;
$$;

revoke all on function public.is_platform_admin() from public, anon;
revoke all on function public.admin_len(jsonb) from public, anon, authenticated;
revoke all on function public.admin_merchants() from public, anon;
revoke all on function public.admin_merchant_detail(uuid) from public, anon;
grant execute on function public.is_platform_admin() to authenticated;
grant execute on function public.admin_merchants() to authenticated;
grant execute on function public.admin_merchant_detail(uuid) to authenticated;
