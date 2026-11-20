-- Kasbon pelanggan: akun kasir boleh menulis daftar kasbon (state.kasbon): utang dari order & terima pelunasan.
-- Uang pelunasan masuk Kas lewat hitung ulang dari daftar kasbon di HP pemilik/manajer (kasir tetap tidak menulis Kas).
create or replace function public.doc_kasir_writable()
returns text[] language sql immutable set search_path = '' as $$
  select array['orders', 'posHarian', 'bahan', 'stokLog', 'pelanggan', 'stempelLog', 'shifts', 'bills', 'kasbon'];
$$;
