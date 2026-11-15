-- Fase 16: Varian & topping menu di pesan lewat meja (QR).
--
-- public_menu.data sekarang juga berisi:
--   menu[].opsi = [grupId, ...]   (grup varian yang dipakai menu itu)
--   opsi = [{ id, nama, tipe: satu|banyak, wajib, maks, pilihan: [{ id, nama, harga, habis }] }]
-- Pelanggan mengirim p_items = [{ id, qty, opsi: [pilihanId, ...] }].
-- Server mengecek pilihan (harus milik grup menu itu, wajib/pilih satu/maks, tidak habis)
-- dan menghitung harga = harga menu + harga tambahan pilihan. Harga dari klien tetap diabaikan.
-- Item pesanan: { id, nama, harga (per porsi, sudah termasuk tambahan), qty, opsi?: [{ g, id, nama, harga }] }.

alter table public.table_orders drop constraint if exists table_orders_size;
alter table public.table_orders add constraint table_orders_size
  check (pg_column_size(items) < 16000 and char_length(nama) between 1 and 40 and char_length(catatan) <= 200);

-- 1) Menu untuk pelanggan (anon): ikut kirim grup varian.
create or replace function public.get_table_menu(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  r record;
  aktif boolean;
begin
  if char_length(coalesce(p_token, '')) not between 8 and 64 then
    return null;
  end if;
  select * into r from public.meja_dari_token(p_token);
  if not found then
    return null;
  end if;
  aktif := coalesce((r.data ->> 'aktif')::boolean, false);
  return jsonb_build_object(
    'aktif', aktif,
    'bisnis', r.data -> 'bisnis',
    'warna', r.data -> 'warna',
    'lokasi', r.data -> 'lokasi',
    'meja', jsonb_build_object('id', r.meja ->> 'id', 'nama', r.meja ->> 'nama'),
    'menu', case when aktif then r.data -> 'menu' else '[]'::jsonb end,
    'opsi', case when aktif then coalesce(r.data -> 'opsi', '[]'::jsonb) else '[]'::jsonb end,
    'digital', coalesce((r.data ->> 'digital')::boolean, true)
  );
end;
$$;

-- 2) Buat pesanan (anon). p_items = [{id, qty, opsi?:[pilihanId]}]
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
  g jsonb;
  p jsonb;
  ids jsonb;
  q int;
  harga int;
  cnt int;
  dipakai int;
  maks int;
  opsi_rows jsonb;
  baris jsonb;
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
    if jsonb_typeof(it) <> 'object' then
      raise exception 'Pesanan tidak valid';
    end if;
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
    harga := (m ->> 'harga')::int;

    -- Varian & topping
    ids := coalesce(it -> 'opsi', '[]'::jsonb);
    if jsonb_typeof(ids) <> 'array' or jsonb_array_length(ids) > 20 then
      raise exception 'Pilihan varian tidak valid';
    end if;
    if exists (select 1 from jsonb_array_elements(ids) v where jsonb_typeof(v) <> 'string') then
      raise exception 'Pilihan varian tidak valid';
    end if;
    opsi_rows := '[]'::jsonb;
    dipakai := 0;
    for g in
      select gg.x
      from jsonb_array_elements_text(coalesce(m -> 'opsi', '[]'::jsonb)) with ordinality e(gid, ord)
      join lateral (select x from jsonb_array_elements(coalesce(r.data -> 'opsi', '[]'::jsonb)) x where x ->> 'id' = e.gid limit 1) gg on true
      order by e.ord
    loop
      cnt := 0;
      for p in select y from jsonb_array_elements(coalesce(g -> 'pilihan', '[]'::jsonb)) y where ids ? (y ->> 'id') loop
        if coalesce((p ->> 'habis')::boolean, false) then
          raise exception '% lagi habis', p ->> 'nama';
        end if;
        cnt := cnt + 1;
        harga := harga + coalesce((p ->> 'harga')::int, 0);
        opsi_rows := opsi_rows || jsonb_build_array(jsonb_build_object('g', g ->> 'id', 'id', p ->> 'id', 'nama', p ->> 'nama', 'harga', coalesce((p ->> 'harga')::int, 0)));
      end loop;
      maks := case when g ->> 'tipe' = 'satu' then 1 else coalesce((g ->> 'maks')::int, 0) end;
      if coalesce((g ->> 'wajib')::boolean, false) and cnt = 0 then
        raise exception 'Pilih % dulu untuk %', g ->> 'nama', m ->> 'nama';
      end if;
      if maks > 0 and cnt > maks then
        raise exception '%: maksimal % pilihan', g ->> 'nama', maks;
      end if;
      dipakai := dipakai + cnt;
    end loop;
    if dipakai <> (select count(distinct v) from jsonb_array_elements_text(ids) v) then
      raise exception 'Ada pilihan varian yang sudah tidak tersedia. Muat ulang halaman ya.';
    end if;

    baris := jsonb_build_object('id', m ->> 'id', 'nama', m ->> 'nama', 'harga', harga, 'qty', q);
    if jsonb_array_length(opsi_rows) > 0 then
      baris := baris || jsonb_build_object('opsi', opsi_rows);
    end if;
    rows := rows || jsonb_build_array(baris);
    total := total + harga * q;
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

revoke all on function public.get_table_menu(text) from public;
revoke all on function public.place_table_order(text, jsonb, text, text, text) from public;
grant execute on function public.get_table_menu(text) to anon, authenticated;
grant execute on function public.place_table_order(text, jsonb, text, text, text) to anon, authenticated;
