-- Desain baru dashboard admin (#/admin): data tambahan, tetap RINGKASAN & read-only.
-- admin_merchants : + seri14 (order per hari 14 hari terakhir, buat grafik mini di tabel), order90 / omzet90.
-- admin_harian    : total platform per hari (order, omzet, merchant yang jualan, pendaftar, pemakaian AI)
--                   untuk 2 x p_hari hari terakhir (periode sekarang + sebelumnya, buat pilihan 7 / 30 / 90 hari).
--                   Akun tes (@racikin.test) tidak dihitung kecuali p_tes = true.

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
      'order90', ph.order90, 'omzet90', ph.omzet90,
      'hari_jualan30', ph.hari30,
      'seri14', (
        select coalesce(jsonb_agg(coalesce((d.data -> 'posHarian' -> to_char(g, 'YYYY-MM-DD') ->> 'order')::numeric, 0)::int order by g), '[]'::jsonb)
        from generate_series(hari - 13, hari, interval '1 day') g
      ),
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
        coalesce(sum(coalesce((e.value ->> 'order')::numeric, 0)) filter (where e.key::date > hari - 90), 0)::int as order90,
        coalesce(sum(coalesce((e.value ->> 'omzet')::numeric, 0)) filter (where e.key::date > hari - 90), 0)::bigint as omzet90,
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

create or replace function public.admin_harian(p_hari int default 30, p_tes boolean default false)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  hari date := (now() at time zone 'Asia/Jakarta')::date;
  n int := least(greatest(coalesce(p_hari, 30), 1), 180);
  hasil jsonb;
begin
  if not public.is_platform_admin() then
    raise exception 'Khusus admin Racikin';
  end if;
  with akun as (
    select u.id, u.created_at from auth.users u
    where p_tes or coalesce(u.email, '') not ilike '%@racikin.test'
  ),
  dok as (
    select d.data -> 'posHarian' as ph
    from public.user_data d join akun a on a.id = d.user_id
    where jsonb_typeof(d.data -> 'profile') = 'object' and jsonb_typeof(d.data -> 'posHarian') = 'object'
  ),
  hr as (select g::date as t from generate_series(hari - (2 * n - 1), hari, interval '1 day') g)
  select coalesce(jsonb_agg(jsonb_build_object(
      'tgl', hr.t,
      'order', coalesce(x.ord, 0),
      'omzet', coalesce(x.omz, 0),
      'jualan', coalesce(x.jualan, 0),
      'daftar', (select count(*) from akun a where (a.created_at at time zone 'Asia/Jakarta')::date = hr.t),
      'ai', (select count(*) from public.ai_usage u join akun a on a.id = u.user_id where (u.created_at at time zone 'Asia/Jakarta')::date = hr.t)
    ) order by hr.t), '[]'::jsonb)
  into hasil
  from hr
  left join lateral (
    select
      sum(coalesce((dok.ph -> to_char(hr.t, 'YYYY-MM-DD') ->> 'order')::numeric, 0))::int as ord,
      sum(coalesce((dok.ph -> to_char(hr.t, 'YYYY-MM-DD') ->> 'omzet')::numeric, 0))::bigint as omz,
      count(*) filter (where coalesce((dok.ph -> to_char(hr.t, 'YYYY-MM-DD') ->> 'order')::numeric, 0) > 0)::int as jualan
    from dok
  ) x on true;
  return hasil;
end;
$$;

revoke all on function public.admin_harian(int, boolean) from public, anon;
grant execute on function public.admin_harian(int, boolean) to authenticated;
