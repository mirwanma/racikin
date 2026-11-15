-- Fase 14: Pesan lewat meja (QR), opsional.
--
-- public_menu   : salinan menu publik per usaha (nama, harga toko, habis/tidak) + daftar meja & token QR.
--                 Ditulis pemilik/manajer dari app. Tidak bisa dibaca langsung oleh pelanggan.
-- table_orders  : pesanan dari pelanggan (tanpa login). Pelanggan hanya bisa membuat & melihat pesanannya
--                 sendiri lewat fungsi (pakai token meja + secret pesanan). Tim usaha membaca lewat RLS + Realtime.
-- Harga & total SELALU dihitung di server dari public_menu, bukan dari data yang dikirim pelanggan.
-- Pembayaran digital: SIMULASI (pay_table_order_dummy), belum terhubung payment gateway.

create table if not exists public.public_menu (
  owner_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null,            -- { aktif, bisnis, warna, menu:[{id,nama,harga,habis}], meja:[{id,nama,token}] }
  updated_at timestamptz not null default now(),
  constraint public_menu_size check (pg_column_size(data) < 200000)
);
alter table public.public_menu enable row level security;
create policy "public_menu: pemilik/manajer baca" on public.public_menu
  for select to authenticated using (public.team_role(owner_id) in ('owner', 'manajer'));
create policy "public_menu: pemilik/manajer tambah" on public.public_menu
  for insert to authenticated with check (public.team_role(owner_id) in ('owner', 'manajer'));
create policy "public_menu: pemilik/manajer ubah" on public.public_menu
  for update to authenticated using (public.team_role(owner_id) in ('owner', 'manajer')) with check (public.team_role(owner_id) in ('owner', 'manajer'));
create policy "public_menu: pemilik hapus" on public.public_menu
  for delete to authenticated using (public.team_role(owner_id) = 'owner');

create table if not exists public.table_orders (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  meja_id text not null,
  meja_nama text not null,
  no int not null,
  kode text not null,                                  -- kode pendek untuk disebut ke kasir
  secret uuid not null default gen_random_uuid(),      -- hanya diketahui HP pelanggan
  nama text not null,
  catatan text not null default '',
  items jsonb not null,                                -- [{id,nama,harga,qty}] (harga dari server)
  total int not null,
  metode text not null check (metode in ('kasir', 'digital')),
  bayar_status text not null default 'belum' check (bayar_status in ('belum', 'lunas')),
  status text not null default 'baru' check (status in ('baru', 'diproses', 'selesai', 'batal')),
  alasan text not null default '',
  pos_order_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint table_orders_size check (pg_column_size(items) < 8000 and char_length(nama) between 1 and 40 and char_length(catatan) <= 200)
);
create index if not exists table_orders_owner_time on public.table_orders (owner_id, created_at desc);
create index if not exists table_orders_owner_meja on public.table_orders (owner_id, meja_id, created_at desc);

create or replace function public.table_orders_touch()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists table_orders_touch on public.table_orders;
create trigger table_orders_touch before update on public.table_orders for each row execute function public.table_orders_touch();
revoke all on function public.table_orders_touch() from public, anon, authenticated;

alter table public.table_orders enable row level security;
create policy "table_orders: tim baca" on public.table_orders
  for select to authenticated using (public.team_role(owner_id) in ('owner', 'manajer', 'kasir'));
create policy "table_orders: tim ubah" on public.table_orders
  for update to authenticated using (public.team_role(owner_id) in ('owner', 'manajer', 'kasir')) with check (public.team_role(owner_id) in ('owner', 'manajer', 'kasir'));
-- Tidak ada policy insert/delete untuk klien: pelanggan membuat pesanan lewat place_table_order.

do $$ begin
  alter publication supabase_realtime add table public.table_orders;
exception when duplicate_object then null;
end $$;

-- Cari usaha & meja dari token QR.
create or replace function public.meja_dari_token(p_token text)
returns table (owner_id uuid, data jsonb, meja jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  select m.owner_id, m.data, e
  from public.public_menu m, jsonb_array_elements(m.data -> 'meja') e
  where e ->> 'token' = p_token
  limit 1;
$$;
revoke all on function public.meja_dari_token(text) from public, anon, authenticated;

-- 1) Menu untuk pelanggan (anon).
create or replace function public.get_table_menu(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  r record;
begin
  if char_length(coalesce(p_token, '')) not between 8 and 64 then
    return null;
  end if;
  select * into r from public.meja_dari_token(p_token);
  if not found then
    return null;
  end if;
  return jsonb_build_object(
    'aktif', coalesce((r.data ->> 'aktif')::boolean, false),
    'bisnis', r.data -> 'bisnis',
    'warna', r.data -> 'warna',
    'lokasi', r.data -> 'lokasi',
    'meja', jsonb_build_object('id', r.meja ->> 'id', 'nama', r.meja ->> 'nama'),
    'menu', case when coalesce((r.data ->> 'aktif')::boolean, false) then r.data -> 'menu' else '[]'::jsonb end,
    'digital', coalesce((r.data ->> 'digital')::boolean, true)
  );
end;
$$;

-- 2) Buat pesanan (anon). p_items = [{id, qty}]
create or replace function public.place_table_order(p_token text, p_items jsonb, p_nama text, p_catatan text, p_metode text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  it jsonb;
  m jsonb;
  q int;
  rows jsonb := '[]'::jsonb;
  total int := 0;
  nomor int;
  k text;
  alfabet constant text := 'ACDEFHJKMNPRTUVWXY34679';
  b bytea;
  i int;
  o public.table_orders;
begin
  select * into r from public.meja_dari_token(p_token);
  if not found then
    raise exception 'Meja tidak ditemukan. Scan ulang QR di meja ya.';
  end if;
  if not coalesce((r.data ->> 'aktif')::boolean, false) then
    raise exception 'Pesan lewat meja sedang tidak aktif. Silakan pesan langsung ke kasir.';
  end if;
  if p_metode not in ('kasir', 'digital') then
    raise exception 'Metode bayar tidak dikenal';
  end if;
  if p_metode = 'digital' and not coalesce((r.data ->> 'digital')::boolean, true) then
    raise exception 'Pembayaran digital sedang tidak tersedia';
  end if;
  if char_length(trim(coalesce(p_nama, ''))) not between 1 and 40 then
    raise exception 'Isi nama dulu (maks. 40 huruf)';
  end if;
  if char_length(coalesce(p_catatan, '')) > 200 then
    raise exception 'Catatan maksimal 200 huruf';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 30 then
    raise exception 'Pesanan kosong atau terlalu banyak item';
  end if;

  -- Anti spam: maks. 5 pesanan per meja per 5 menit.
  if (select count(*) from public.table_orders t where t.owner_id = r.owner_id and t.meja_id = r.meja ->> 'id' and t.created_at > now() - interval '5 minutes') >= 5 then
    raise exception 'Terlalu banyak pesanan dari meja ini. Tunggu sebentar atau pesan ke kasir.';
  end if;

  for it in select * from jsonb_array_elements(p_items) loop
    q := coalesce((it ->> 'qty')::int, 0);
    if q < 1 or q > 50 then
      raise exception 'Jumlah tidak valid';
    end if;
    select x into m from jsonb_array_elements(r.data -> 'menu') x where x ->> 'id' = it ->> 'id' limit 1;
    if m is null then
      raise exception 'Ada menu yang sudah tidak tersedia. Muat ulang halaman ya.';
    end if;
    if coalesce((m ->> 'habis')::boolean, false) then
      raise exception '% sedang habis', m ->> 'nama';
    end if;
    rows := rows || jsonb_build_array(jsonb_build_object('id', m ->> 'id', 'nama', m ->> 'nama', 'harga', (m ->> 'harga')::int, 'qty', q));
    total := total + (m ->> 'harga')::int * q;
  end loop;

  -- Nomor harian per usaha (zona waktu WIB) & kode pendek.
  perform pg_advisory_xact_lock(hashtextextended(r.owner_id::text, 7));
  select coalesce(max(t.no), 0) + 1 into nomor from public.table_orders t
    where t.owner_id = r.owner_id and (t.created_at at time zone 'Asia/Jakarta')::date = (now() at time zone 'Asia/Jakarta')::date;
  b := extensions.gen_random_bytes(4);
  k := '';
  for i in 0..3 loop
    k := k || substr(alfabet, (get_byte(b, i) % char_length(alfabet)) + 1, 1);
  end loop;

  insert into public.table_orders (owner_id, meja_id, meja_nama, no, kode, nama, catatan, items, total, metode)
  values (r.owner_id, r.meja ->> 'id', r.meja ->> 'nama', nomor, k, trim(p_nama), trim(coalesce(p_catatan, '')), rows, total, p_metode)
  returning * into o;

  return jsonb_build_object('id', o.id, 'secret', o.secret, 'no', o.no, 'kode', o.kode, 'total', o.total, 'items', o.items, 'metode', o.metode);
end;
$$;

-- 3) Status pesanan untuk pelanggan (anon) + status dapur kalau mode dapur aktif.
create or replace function public.get_table_order(p_id uuid, p_secret uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', o.id, 'no', o.no, 'kode', o.kode, 'meja', o.meja_nama, 'nama', o.nama, 'items', o.items, 'total', o.total,
    'catatan', o.catatan, 'metode', o.metode, 'bayar_status', o.bayar_status, 'status', o.status, 'alasan', o.alasan,
    'dapur', (select k.status from public.kitchen_tickets k where k.id = o.pos_order_id and k.owner_id = o.owner_id),
    'created_at', o.created_at
  )
  from public.table_orders o
  where o.id = p_id and o.secret = p_secret;
$$;

-- 4) Pembayaran digital SIMULASI (belum ada payment gateway).
create or replace function public.pay_table_order_dummy(p_id uuid, p_secret uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.table_orders set bayar_status = 'lunas'
    where id = p_id and secret = p_secret and metode = 'digital' and status in ('baru', 'diproses');
  if not found then
    raise exception 'Pesanan tidak bisa dibayar';
  end if;
  return public.get_table_order(p_id, p_secret);
end;
$$;

revoke all on function public.get_table_menu(text) from public;
revoke all on function public.place_table_order(text, jsonb, text, text, text) from public;
revoke all on function public.get_table_order(uuid, uuid) from public;
revoke all on function public.pay_table_order_dummy(uuid, uuid) from public;
grant execute on function public.get_table_menu(text) to anon, authenticated;
grant execute on function public.place_table_order(text, jsonb, text, text, text) to anon, authenticated;
grant execute on function public.get_table_order(uuid, uuid) to anon, authenticated;
grant execute on function public.pay_table_order_dummy(uuid, uuid) to anon, authenticated;

-- Bersihkan pesanan meja > 7 hari (data penjualannya tetap ada di Kasir/Kas).
select cron.unschedule('racikin-meja-bersih') where exists (select 1 from cron.job where jobname = 'racikin-meja-bersih');
select cron.schedule('racikin-meja-bersih', '23 20 * * *', $job$ delete from public.table_orders where created_at < now() - interval '7 days' $job$);
