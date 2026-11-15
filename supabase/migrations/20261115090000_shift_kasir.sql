-- Fase 10: Shift & tutup kasir.
-- Kasir boleh menulis daftar shift (buka/tutup shift, catatan uang laci) di dokumen usaha.
-- posSetting (wajib buka shift) tetap hanya bisa diubah pemilik/manajer.
create or replace function public.doc_kasir_writable()
returns text[] language sql immutable set search_path = '' as $$
  select array['orders', 'posHarian', 'bahan', 'stokLog', 'pelanggan', 'stempelLog', 'shifts'];
$$;
