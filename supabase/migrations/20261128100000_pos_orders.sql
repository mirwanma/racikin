-- Detail order kasir dipindah dari dokumen usaha (user_data.data.orders) ke tabel sendiri, supaya dokumen nggak
-- mentok batas 2 MB kalau usaha ramai (±70 order/hari x 30 hari). Rekap harian, Kas & laporan tetap di dokumen.
--
-- - pos_orders: satu baris per order, diakses lewat RPC saja (RLS tanpa policy).
-- - orders_pull / orders_push: dipakai app versi baru (sinkron per perubahan, updated_at).
-- - doc_get_v2: dokumen tanpa order (app baru).
-- - Kompatibel dengan app versi lama yang masih terpasang di HP: doc_get tetap mengembalikan order 30 hari dari tabel,
--   dan doc_save memindahkan `orders` yang dikirim ke tabel lalu membuangnya dari dokumen.
-- - Bentrok: status "batal" selalu menang (order yang sudah dibatalkan nggak bisa hidup lagi).

create table if not exists public.pos_orders (
  owner_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  tanggal date not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (owner_id, id),
  constraint pos_orders_size check (pg_column_size(data) < 20000)
);
create index if not exists pos_orders_sejak on public.pos_orders (owner_id, updated_at);
create index if not exists pos_orders_tanggal on public.pos_orders (owner_id, tanggal);
alter table public.pos_orders enable row level security; -- tanpa policy: hanya lewat fungsi di bawah

/** Simpan / perbarui order (dipakai doc_save & orders_push). Return jumlah baris yang berubah. */
create or replace function public.orders_upsert(p_owner uuid, p_orders jsonb)
returns integer language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  if p_orders is null or jsonb_typeof(p_orders) <> 'array' or jsonb_array_length(p_orders) = 0 then return 0; end if;
  insert into public.pos_orders as o (owner_id, id, tanggal, data, updated_at)
  select p_owner, x->>'id', (x->>'tanggal')::date, x, now()
  from jsonb_array_elements(p_orders) x
  where jsonb_typeof(x) = 'object' and coalesce(x->>'id', '') <> '' and (x->>'tanggal') ~ '^\d{4}-\d{2}-\d{2}$'
    and (x->>'tanggal')::date >= current_date - 40
  on conflict (owner_id, id) do update
    set data = excluded.data, tanggal = excluded.tanggal, updated_at = now()
    -- Nggak berubah -> dilewati; order yang sudah batal nggak bisa ditimpa versi belum-batal.
    where o.data is distinct from excluded.data
      and not (o.data->>'status' = 'batal' and excluded.data->>'status' is distinct from 'batal');
  get diagnostics n = row_count;
  -- Bersihkan order lama (app hanya menyimpan detail 30 hari; rekap harian tetap di dokumen).
  delete from public.pos_orders where owner_id = p_owner and tanggal < current_date - 40;
  return n;
end;
$$;
revoke all on function public.orders_upsert(uuid, jsonb) from public, anon, authenticated;

/** Order 30 hari terakhir dalam bentuk array (untuk doc_get versi lama). */
create or replace function public.orders_array(p_owner uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(o.data order by o.data->>'waktu', o.id), '[]'::jsonb)
  from public.pos_orders o where o.owner_id = p_owner and o.tanggal >= current_date - 31;
$$;
revoke all on function public.orders_array(uuid) from public, anon, authenticated;

create or replace function public.orders_pull(p_owner uuid, p_since timestamptz default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare r text := public.team_role(p_owner);
begin
  if r is null or r = 'dapur' then
    raise exception 'Tidak punya akses ke data order usaha ini' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object('data', o.data, 'updated_at', o.updated_at) order by o.updated_at)
      from public.pos_orders o
      where o.owner_id = p_owner and o.tanggal >= current_date - 31 and (p_since is null or o.updated_at > p_since)
    ), '[]'::jsonb),
    'now', now()
  );
end;
$$;

create or replace function public.orders_push(p_owner uuid, p_orders jsonb)
returns integer language plpgsql security definer set search_path = '' as $$
declare r text := public.team_role(p_owner);
begin
  if r is null or r = 'dapur' then
    raise exception 'Tidak punya akses untuk mencatat order usaha ini' using errcode = '42501';
  end if;
  if jsonb_typeof(p_orders) <> 'array' or jsonb_array_length(p_orders) > 2000 then
    raise exception 'Data order tidak valid';
  end if;
  return public.orders_upsert(p_owner, p_orders);
end;
$$;

-- Dokumen tanpa order (app versi baru).
create or replace function public.doc_get_v2(p_owner uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  r text := public.team_role(p_owner);
  d public.user_data;
begin
  if r is null then
    raise exception 'Tidak punya akses ke data usaha ini' using errcode = '42501';
  end if;
  select * into d from public.user_data where user_id = p_owner;
  if not found then return null; end if;
  return jsonb_build_object(
    'data', case
      when r = 'kasir' then d.data - public.doc_kasir_hidden() - 'orders'
      when r = 'dapur' then jsonb_strip_nulls(jsonb_build_object('profile', d.data -> 'profile', 'brand', d.data -> 'brand', 'posSetting', d.data -> 'posSetting'))
      else d.data - 'orders' end,
    'rev', d.rev,
    'updated_at', d.updated_at,
    'role', r
  );
end;
$$;

-- App versi lama: tetap dapat order 30 hari (dari tabel), supaya nggak kehilangan data saat transisi.
create or replace function public.doc_get(p_owner uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  r text := public.team_role(p_owner);
  d public.user_data;
begin
  if r is null then
    raise exception 'Tidak punya akses ke data usaha ini' using errcode = '42501';
  end if;
  select * into d from public.user_data where user_id = p_owner;
  if not found then return null; end if;
  return jsonb_build_object(
    'data', case
      when r = 'kasir' then (d.data - public.doc_kasir_hidden()) || jsonb_build_object('orders', public.orders_array(p_owner))
      when r = 'dapur' then jsonb_strip_nulls(jsonb_build_object('profile', d.data -> 'profile', 'brand', d.data -> 'brand', 'posSetting', d.data -> 'posSetting'))
      else d.data || jsonb_build_object('orders', public.orders_array(p_owner)) end,
    'rev', d.rev,
    'updated_at', d.updated_at,
    'role', r
  );
end;
$$;

-- doc_save: `orders` yang ikut dikirim (app versi lama) dipindah ke tabel dulu, lalu dibuang dari dokumen.
create or replace function public.doc_save(p_owner uuid, p_data jsonb, p_base_rev bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r text := public.team_role(p_owner);
  bagian jsonb;
  lama jsonb;
  hasil public.user_data;
begin
  if r is null then
    raise exception 'Tidak punya akses ke data usaha ini' using errcode = '42501';
  end if;
  if r = 'dapur' then
    raise exception 'Akun dapur tidak bisa mengubah data usaha' using errcode = '42501';
  end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then
    raise exception 'Data tidak valid';
  end if;

  if p_data ? 'orders' then
    perform public.orders_upsert(p_owner, p_data->'orders');
    p_data := p_data - 'orders';
  end if;

  if r = 'kasir' then
    select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb) into bagian
      from jsonb_each(p_data) e
      where e.key = any (public.doc_kasir_writable());
    update public.user_data set data = data || bagian
      where user_id = p_owner and rev = p_base_rev
      returning * into hasil;
  else
    if r = 'manajer' then
      select d.data into lama from public.user_data d where d.user_id = p_owner;
      if not coalesce((lama->'absenSetting'->>'manajerAturGaji')::boolean, false) then
        p_data := public.kunci_gaji(coalesce(lama, '{}'::jsonb), p_data);
      end if;
    end if;
    update public.user_data set data = p_data
      where user_id = p_owner and rev = p_base_rev
      returning * into hasil;
  end if;

  if found then
    return jsonb_build_object('ok', true, 'rev', hasil.rev, 'updated_at', hasil.updated_at);
  end if;

  if r = 'owner' and p_base_rev = 0 and not exists (select 1 from public.user_data where user_id = p_owner) then
    insert into public.user_data (user_id, data, rev) values (p_owner, p_data, 1)
      on conflict (user_id) do nothing
      returning * into hasil;
    if found then
      return jsonb_build_object('ok', true, 'rev', hasil.rev, 'updated_at', hasil.updated_at);
    end if;
  end if;

  return jsonb_build_object('ok', false, 'rev', (select d.rev from public.user_data d where d.user_id = p_owner));
end;
$$;

grant execute on function public.orders_pull(uuid, timestamptz) to authenticated;
grant execute on function public.orders_push(uuid, jsonb) to authenticated;
grant execute on function public.doc_get_v2(uuid) to authenticated;

-- Pindahkan order yang sudah ada di semua dokumen ke tabel, lalu buang dari dokumen.
do $$
declare u record;
begin
  for u in select user_id, data->'orders' as orders from public.user_data where data ? 'orders' loop
    perform public.orders_upsert(u.user_id, u.orders);
    update public.user_data set data = data - 'orders' where user_id = u.user_id;
  end loop;
end $$;
