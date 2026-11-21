-- Saldo pelanggan (uang titipan): akun kasir boleh menulis daftar saldo (state.saldoPelanggan): isi saldo, tarik,
-- simpan kembalian & pemakaian saldo dari order. Kas titipan dihitung ulang dari daftar ini di HP pemilik/manajer
-- (kasir tetap tidak menulis Kas).
create or replace function public.doc_kasir_writable()
returns text[] language sql immutable set search_path = '' as $$
  select array['orders', 'posHarian', 'bahan', 'stokLog', 'pelanggan', 'stempelLog', 'shifts', 'bills', 'kasbon', 'saldoPelanggan'];
$$;
