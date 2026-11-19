-- Promo di server untuk pesan meja + kuota voucher per pelanggan.
--
-- public_menu.data.promoAturan = aturan promo aktif (saluran toko) yang diunggah pemilik/manajer dari app
--   (lihat aturanPromoMeja di js/promo.js). TIDAK pernah dikirim ke pelanggan (get_table_menu tidak membacanya),
--   jadi kode voucher aman. Nomor WA pemakai voucher hanya disimpan sebagai hash di pakaiWa.
-- Server memilih SATU promo terbaik (promo tidak numpuk), sama seperti Kasir (pilihPromo di js/promo.js):
--   promo otomatis + voucher (kalau kodenya dimasukkan). Waktu promo dihitung WIB.
-- Kuota total voucher  = pakai (angka terakhir dari app) + pesanan meja yang masih menunggu kasir.
-- Kuota per pelanggan  = pakaiWa[hash nomor WA] + pesanan meja menunggu dengan nomor WA yang sama.
--   (Bisa lewat 1-2 pemakaian kalau Kasir & meja dipakai bersamaan saat offline; disetujui pemilik.)
-- table_orders: + subtotal, promo { id, nama, potongan, kode?, wa? }; total = subtotal - potongan.

alter table public.table_orders add column if not exists subtotal int;
alter table public.table_orders add column if not exists promo jsonb;

-- Normalisasi nomor WA Indonesia (sama dengan normWa di js/loyalty.js) & hash-nya.
create or replace function public.meja_norm_wa(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when d = '' then ''
    when left(d, 1) = '0' then '62' || substr(d, 2)
    when left(d, 1) = '8' then '62' || d
    else d end
  from (select regexp_replace(coalesce(p, ''), '\D', '', 'g') as d) x;
$$;

create or replace function public.meja_hash_wa(p_wa text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when coalesce(p_wa, '') = '' then '' else encode(extensions.digest('racikin:' || p_wa, 'sha256'), 'hex') end;
$$;

-- Hitung & cek item pesanan meja dari menu publik. Return { rows, total }.
create or replace function public.meja_items(p_data jsonb, p_items jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
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
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 30 then
    raise exception 'Pesanan kosong atau terlalu banyak item';
  end if;
  for it in select * from jsonb_array_elements(p_items) loop
    if jsonb_typeof(it) <> 'object' then
      raise exception 'Pesanan tidak valid';
    end if;
    q := coalesce((it ->> 'qty')::int, 0);
    if q < 1 or q > 50 then
      raise exception 'Jumlah tidak valid';
    end if;
    select x into m from jsonb_array_elements(p_data -> 'menu') x where x ->> 'id' = it ->> 'id' limit 1;
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
      join lateral (select x from jsonb_array_elements(coalesce(p_data -> 'opsi', '[]'::jsonb)) x where x ->> 'id' = e.gid limit 1) gg on true
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

  return jsonb_build_object('rows', rows, 'total', total);
end;
$$;

-- Apakah promo berlaku pada waktu (WIB) tsb.
create or replace function public.meja_promo_berlaku(a jsonb, t timestamp)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  w jsonb := coalesce(a -> 'waktu', '{}'::jsonb);
  tgl text := to_char(t, 'YYYY-MM-DD');
  jam text := to_char(t, 'HH24:MI');
begin
  if coalesce(w ->> 'dari', '') <> '' and tgl < w ->> 'dari' then return false; end if;
  if coalesce(w ->> 'sampai', '') <> '' and tgl > w ->> 'sampai' then return false; end if;
  if jsonb_typeof(w -> 'hari') = 'array' and jsonb_array_length(w -> 'hari') > 0
     and not (w -> 'hari') @> to_jsonb(extract(dow from t)::int) then return false; end if;
  if coalesce(w ->> 'jamDari', '') <> '' and jam < w ->> 'jamDari' then return false; end if;
  if coalesce(w ->> 'jamSampai', '') <> '' and jam >= w ->> 'jamSampai' then return false; end if;
  return true;
end;
$$;

-- Potongan satu promo untuk isi pesanan (sama dengan potonganPromo di js/promo.js). Return { potongan, kurang, kurangPorsi }.
create or replace function public.meja_promo_potongan(a jsonb, p_rows jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  sub numeric := 0;
  pot numeric := 0;
  x jsonb;
  hrg numeric;
  tambah numeric;
  nilai numeric := coalesce((a ->> 'nilai')::numeric, 0);
  minb numeric := coalesce((a ->> 'minBelanja')::numeric, 0);
  maksp numeric := coalesce((a ->> 'maks')::numeric, 0);
  ikut jsonb := coalesce(a -> 'resepIds', '[]'::jsonb);
  beli int := greatest(1, coalesce((a ->> 'beli')::int, 1));
  gratis int := greatest(1, coalesce((a ->> 'gratis')::int, 1));
  nunit int;
  ngratis int;
begin
  select coalesce(sum((r ->> 'harga')::numeric * (r ->> 'qty')::int), 0) into sub from jsonb_array_elements(p_rows) r;
  if sub <= 0 then
    return jsonb_build_object('potongan', 0, 'kurang', 0);
  end if;
  if a ->> 'jenis' = 'order' then
    if sub < minb then
      return jsonb_build_object('potongan', 0, 'kurang', minb - sub);
    end if;
    pot := case when a ->> 'tipe' = 'persen' then sub * nilai / 100 else nilai end;
    if maksp > 0 then pot := least(pot, maksp); end if;
  elsif a ->> 'jenis' = 'menu' then
    for x in select * from jsonb_array_elements(p_rows) loop
      if not ikut ? (x ->> 'id') then continue; end if;
      hrg := (x ->> 'harga')::numeric;
      select coalesce(sum((o ->> 'harga')::numeric), 0) into tambah from jsonb_array_elements(coalesce(x -> 'opsi', '[]'::jsonb)) o;
      pot := pot + (case
        when a ->> 'tipe' = 'persen' then hrg * nilai / 100
        when a ->> 'tipe' = 'harga' then greatest(0, hrg - tambah - nilai)
        else least(hrg, nilai) end) * (x ->> 'qty')::int;
    end loop;
  elsif a ->> 'jenis' = 'bxgy' then
    select count(*) into nunit from jsonb_array_elements(p_rows) r, generate_series(1, (r ->> 'qty')::int) g where ikut ? (r ->> 'id');
    ngratis := (nunit / (beli + gratis)) * gratis;
    if ngratis = 0 then
      return jsonb_build_object('potongan', 0, 'kurang', 0, 'kurangPorsi', case when nunit > 0 then beli + gratis - nunit else 0 end);
    end if;
    select coalesce(sum(h), 0) into pot from (
      select (r ->> 'harga')::numeric as h from jsonb_array_elements(p_rows) r, generate_series(1, (r ->> 'qty')::int) g
      where ikut ? (r ->> 'id') order by 1 limit ngratis
    ) u;
  end if;
  return jsonb_build_object('potongan', round(least(pot, sub))::int, 'kurang', 0);
end;
$$;

-- Pilih promo terbaik untuk pesanan meja (sama dengan pilihPromo di js/promo.js).
-- Return { promo: { id, nama, potongan, kode?, wa? } | null, kodeError, hint, butuhWa }.
create or replace function public.meja_promo(p_owner uuid, p_aturan jsonb, p_rows jsonb, p_kode text, p_wa text)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  t timestamp := (now() at time zone 'Asia/Jakarta');
  k text := upper(regexp_replace(coalesce(p_kode, ''), '\s+', '', 'g'));
  w text := public.meja_norm_wa(p_wa);
  wh text;
  a jsonb;
  pk jsonb;
  hasil jsonb;
  best jsonb;
  pot int;
  hint text := '';
  kode_error text := '';
  butuh_wa boolean := false;
  pakai int;
  pakai_wa int;
  maks_wa int;
begin
  wh := public.meja_hash_wa(w);
  if jsonb_typeof(p_aturan) <> 'array' then
    p_aturan := '[]'::jsonb;
  end if;
  if char_length(k) > 30 then
    k := left(k, 30);
  end if;

  for a in select * from jsonb_array_elements(p_aturan) loop
    if not public.meja_promo_berlaku(a, t) then
      if k <> '' and coalesce(a ->> 'kode', '') = k then kode_error := 'Voucher ini nggak berlaku sekarang'; end if;
      continue;
    end if;
    if coalesce(a ->> 'kode', '') <> '' then
      if a ->> 'kode' <> k then continue; end if;
      -- Kuota total: angka dari app + pesanan meja yang masih menunggu kasir
      pakai := coalesce((a ->> 'pakai')::int, 0) + (select count(*) from public.table_orders o
        where o.owner_id = p_owner and o.status = 'baru' and o.promo ->> 'id' = a ->> 'id');
      if coalesce((a ->> 'kuota')::int, 0) > 0 and pakai >= (a ->> 'kuota')::int then
        kode_error := 'Kuota voucher ini sudah habis';
        continue;
      end if;
      maks_wa := coalesce((a ->> 'maksPerPelanggan')::int, 0);
      if maks_wa > 0 then
        if w = '' or char_length(w) not between 9 and 15 then
          kode_error := format('Voucher ini maks. %sx per orang. Isi nomor WA kamu dulu', maks_wa);
          butuh_wa := true;
          continue;
        end if;
        pakai_wa := coalesce((a -> 'pakaiWa' ->> wh)::int, 0) + (select count(*) from public.table_orders o
          where o.owner_id = p_owner and o.status = 'baru' and o.promo ->> 'id' = a ->> 'id' and o.promo ->> 'wa' = w);
        if pakai_wa >= maks_wa then
          kode_error := format('Nomor WA ini sudah pakai voucher ini %sx (maks. %sx)', pakai_wa, maks_wa);
          continue;
        end if;
      end if;
    end if;
    hasil := public.meja_promo_potongan(a, p_rows);
    pot := coalesce((hasil ->> 'potongan')::int, 0);
    if pot > coalesce((best ->> 'potongan')::int, 0) then
      best := jsonb_build_object('id', a ->> 'id', 'nama', a ->> 'nama', 'potongan', pot);
      if coalesce(a ->> 'kode', '') <> '' then
        best := best || jsonb_build_object('kode', a ->> 'kode');
        if coalesce((a ->> 'maksPerPelanggan')::int, 0) > 0 then best := best || jsonb_build_object('wa', w); end if;
      end if;
    elsif pot = 0 and hint = '' and coalesce((hasil ->> 'kurang')::numeric, 0) > 0 then
      hint := format('Tambah Rp%s lagi biar dapat %s', to_char((hasil ->> 'kurang')::numeric, 'FM999G999G999'), a ->> 'nama');
    elsif pot = 0 and hint = '' and coalesce((hasil ->> 'kurangPorsi')::int, 0) > 0 then
      hint := format('Tambah %s porsi lagi biar dapat %s', hasil ->> 'kurangPorsi', a ->> 'nama');
    end if;
  end loop;

  if k <> '' and kode_error = '' and coalesce(best ->> 'kode', '') <> k then
    select x into pk from jsonb_array_elements(p_aturan) x where x ->> 'kode' = k limit 1;
    if pk is null then
      kode_error := 'Kode voucher nggak ditemukan';
    elsif coalesce((public.meja_promo_potongan(pk, p_rows) ->> 'potongan')::int, 0) = 0 then
      kode_error := case when coalesce((pk ->> 'minBelanja')::numeric, 0) > 0
        then format('Voucher butuh min. belanja Rp%s', to_char((pk ->> 'minBelanja')::numeric, 'FM999G999G999'))
        else 'Voucher ini belum kepakai di pesanan ini' end;
    else
      kode_error := 'Ada promo lain yang lebih untung, jadi voucher ini nggak dipakai (promo nggak numpuk)';
    end if;
  end if;

  return jsonb_build_object('promo', best, 'kodeError', kode_error, 'hint', case when best is null then hint else '' end, 'butuhWa', butuh_wa);
end;
$$;

-- Cek promo sebelum pesan (pelanggan, tanpa login): subtotal, promo, total.
create or replace function public.cek_promo_meja(p_token text, p_items jsonb, p_kode text, p_wa text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  r record;
  hit jsonb;
  pr jsonb;
  sub int;
begin
  select * into r from public.meja_dari_token(p_token);
  if not found or not coalesce((r.data ->> 'aktif')::boolean, false) then
    raise exception 'Pesan lewat meja sedang tidak aktif';
  end if;
  if char_length(coalesce(p_kode, '')) > 40 or char_length(coalesce(p_wa, '')) > 30 then
    raise exception 'Input tidak valid';
  end if;
  hit := public.meja_items(r.data, p_items);
  sub := (hit ->> 'total')::int;
  pr := public.meja_promo(r.owner_id, r.data -> 'promoAturan', hit -> 'rows', p_kode, p_wa);
  return jsonb_build_object(
    'subtotal', sub,
    'promo', case when pr -> 'promo' is null or jsonb_typeof(pr -> 'promo') = 'null' then null else (pr -> 'promo') - 'wa' end,
    'total', sub - coalesce((pr -> 'promo' ->> 'potongan')::int, 0),
    'kodeError', pr ->> 'kodeError', 'hint', pr ->> 'hint', 'butuhWa', (pr ->> 'butuhWa')::boolean
  );
end;
$$;

-- Pesan dari meja, sekarang dengan promo otomatis + voucher (+ nomor WA untuk voucher per pelanggan).
create or replace function public.place_table_order(p_token text, p_items jsonb, p_nama text, p_catatan text, p_metode text, p_kode text, p_wa text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  hit jsonb;
  pr jsonb;
  sub int;
  pot int := 0;
  promo jsonb;
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
  if char_length(coalesce(p_kode, '')) > 40 or char_length(coalesce(p_wa, '')) > 30 then
    raise exception 'Kode voucher / nomor WA tidak valid';
  end if;

  -- Anti spam: maks. 5 pesanan per meja per 5 menit.
  if (select count(*) from public.table_orders t where t.owner_id = r.owner_id and t.meja_id = r.meja ->> 'id' and t.created_at > now() - interval '5 minutes') >= 5 then
    raise exception 'Terlalu banyak pesanan dari meja ini. Tunggu sebentar atau pesan ke kasir.';
  end if;

  hit := public.meja_items(r.data, p_items);
  sub := (hit ->> 'total')::int;

  -- Kunci per usaha: nomor harian & kuota voucher dihitung tanpa balapan.
  perform pg_advisory_xact_lock(hashtextextended(r.owner_id::text, 7));
  pr := public.meja_promo(r.owner_id, r.data -> 'promoAturan', hit -> 'rows', p_kode, p_wa);
  if coalesce(trim(p_kode), '') <> '' and coalesce(pr ->> 'kodeError', '') <> '' then
    raise exception '%', pr ->> 'kodeError';
  end if;
  promo := case when jsonb_typeof(pr -> 'promo') = 'object' then pr -> 'promo' else null end;
  pot := coalesce((promo ->> 'potongan')::int, 0);

  select coalesce(max(t.no), 0) + 1 into nomor from public.table_orders t
    where t.owner_id = r.owner_id and (t.created_at at time zone 'Asia/Jakarta')::date = (now() at time zone 'Asia/Jakarta')::date;
  b := extensions.gen_random_bytes(4);
  k := '';
  for i in 0..3 loop
    k := k || substr(alfabet, (get_byte(b, i) % char_length(alfabet)) + 1, 1);
  end loop;

  insert into public.table_orders (owner_id, meja_id, meja_nama, no, kode, nama, catatan, items, subtotal, promo, total, metode)
  values (r.owner_id, r.meja ->> 'id', r.meja ->> 'nama', nomor, k, trim(p_nama), trim(coalesce(p_catatan, '')), hit -> 'rows', sub, promo, sub - pot, p_metode)
  returning * into o;

  return jsonb_build_object('id', o.id, 'secret', o.secret, 'no', o.no, 'kode', o.kode, 'subtotal', o.subtotal,
    'promo', case when o.promo is null then null else o.promo - 'wa' end, 'total', o.total, 'items', o.items, 'metode', o.metode);
end;
$$;

-- Versi lama (app yang belum diperbarui): tetap dapat promo otomatis, tanpa voucher.
create or replace function public.place_table_order(p_token text, p_items jsonb, p_nama text, p_catatan text, p_metode text)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select public.place_table_order(p_token, p_items, p_nama, p_catatan, p_metode, null::text, null::text);
$$;

create or replace function public.get_table_order(p_id uuid, p_secret uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', o.id, 'no', o.no, 'kode', o.kode, 'meja', o.meja_nama, 'nama', o.nama, 'items', o.items,
    'subtotal', coalesce(o.subtotal, o.total), 'promo', case when o.promo is null then null else o.promo - 'wa' end, 'total', o.total,
    'catatan', o.catatan, 'metode', o.metode, 'bayar_status', o.bayar_status, 'status', o.status, 'alasan', o.alasan,
    'dapur', (select k.status from public.kitchen_tickets k where k.id = o.pos_order_id and k.owner_id = o.owner_id),
    'created_at', o.created_at
  )
  from public.table_orders o
  where o.id = p_id and o.secret = p_secret;
$$;

revoke all on function public.meja_norm_wa(text) from public, anon, authenticated;
revoke all on function public.meja_hash_wa(text) from public, anon, authenticated;
revoke all on function public.meja_items(jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.meja_promo_berlaku(jsonb, timestamp) from public, anon, authenticated;
revoke all on function public.meja_promo_potongan(jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.meja_promo(uuid, jsonb, jsonb, text, text) from public, anon, authenticated;
revoke all on function public.cek_promo_meja(text, jsonb, text, text) from public;
revoke all on function public.place_table_order(text, jsonb, text, text, text, text, text) from public;
revoke all on function public.place_table_order(text, jsonb, text, text, text) from public;
revoke all on function public.get_table_order(uuid, uuid) from public;
grant execute on function public.cek_promo_meja(text, jsonb, text, text) to anon, authenticated;
grant execute on function public.place_table_order(text, jsonb, text, text, text, text, text) to anon, authenticated;
grant execute on function public.place_table_order(text, jsonb, text, text, text) to anon, authenticated;
grant execute on function public.get_table_order(uuid, uuid) to anon, authenticated;
