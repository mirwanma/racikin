-- Promo & voucher: menu QR meja ikut menampilkan promo otomatis yang berlaku hari ini (info saja).
-- public_menu.data.promo = [{ nama, ket }] (tanpa kode voucher). Potongan TIDAK dihitung di server:
-- kasir menerapkan promo saat pesanan meja diterima (pesanan yang sudah lunas digital tidak dapat promo).
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
    'promo', case when aktif then coalesce(r.data -> 'promo', '[]'::jsonb) else '[]'::jsonb end,
    'digital', coalesce((r.data ->> 'digital')::boolean, true)
  );
end;
$$;

revoke all on function public.get_table_menu(text) from public;
grant execute on function public.get_table_menu(text) to anon, authenticated;
