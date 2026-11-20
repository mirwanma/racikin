-- Gaji & kasbon karyawan: data keuangan, tidak dikirim ke & tidak bisa ditulis kasir.
create or replace function public.doc_kasir_hidden()
returns text[] language sql immutable set search_path = '' as $$
  select array['transactions', 'kasAwal', 'insight', 'idea', 'rab', 'bep', 'activation', 'calendar', 'chat', 'pajak', 'utangSupplier', 'karyawan', 'absen', 'absenSetting', 'gajian', 'kasbonKaryawan'];
$$;
