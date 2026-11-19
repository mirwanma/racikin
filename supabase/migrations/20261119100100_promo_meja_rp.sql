-- Format rupiah di pesan promo pesan meja pakai titik (Rp25.000), sama seperti app.

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
      hint := format('Tambah Rp%s lagi biar dapat %s', replace(to_char((hasil ->> 'kurang')::numeric, 'FM999,999,999'), ',', '.'), a ->> 'nama');
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
        then format('Voucher butuh min. belanja Rp%s', replace(to_char((pk ->> 'minBelanja')::numeric, 'FM999,999,999'), ',', '.'))
        else 'Voucher ini belum kepakai di pesanan ini' end;
    else
      kode_error := 'Ada promo lain yang lebih untung, jadi voucher ini nggak dipakai (promo nggak numpuk)';
    end if;
  end if;

  return jsonb_build_object('promo', best, 'kodeError', kode_error, 'hint', case when best is null then hint else '' end, 'butuhWa', butuh_wa);
end;
$$;


revoke all on function public.meja_promo(uuid, jsonb, jsonb, text, text) from public, anon, authenticated;
