-- Open bill: akun kasir boleh menulis daftar bill (state.bills) di dokumen usaha.
-- Bill bukan data keuangan (uang baru masuk Kas saat bill dibayar), jadi kasir juga menerimanya.
create or replace function public.doc_kasir_writable()
returns text[] language sql immutable set search_path = '' as $$
  select array['orders', 'posHarian', 'bahan', 'stokLog', 'pelanggan', 'stempelLog', 'shifts', 'bills'];
$$;
