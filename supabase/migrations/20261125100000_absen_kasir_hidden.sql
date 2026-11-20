-- Karyawan & absen: data karyawan (WA, PIN mesin) & absen hanya untuk pemilik/manajer, tidak dikirim ke kasir.
create or replace function public.doc_kasir_hidden()
returns text[] language sql immutable set search_path = '' as $$
  select array['transactions', 'kasAwal', 'insight', 'idea', 'rab', 'bep', 'activation', 'calendar', 'chat', 'pajak', 'utangSupplier', 'karyawan', 'absen', 'absenSetting'];
$$;
