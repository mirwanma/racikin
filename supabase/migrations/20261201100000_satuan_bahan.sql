-- Satuan bahan & nama kemasan bisa diatur admin platform (dashboard admin -> Satuan & kemasan).
--
-- platform_setting.satuan  = [{ nama, alias: [kata lain untuk impor teks], inti?: true }]
--   gram, ml & pcs = satuan inti (dipakai hitungan app: pembulatan belanja, konversi kg / liter), nggak bisa dihapus / diganti.
-- platform_setting.kemasan = ["dus", "pak", ...] saran nama kemasan beli (isi per kemasan di bahan).
-- Bahan merchant menyimpan nama satuan sebagai teks, jadi satuan yang dihapus / diganti tetap tampil di bahan lama.

alter table public.platform_setting add column if not exists satuan jsonb not null default
  '[{"nama":"gram","inti":true,"alias":[]},{"nama":"ml","inti":true,"alias":[]},{"nama":"pcs","inti":true,"alias":[]},
    {"nama":"butir","alias":[]},{"nama":"lembar","alias":[]},{"nama":"bungkus","alias":[]},
    {"nama":"renceng","alias":["rencengan","renteng","rentengan"]},{"nama":"ikat","alias":[]},{"nama":"sdm","alias":[]},
    {"nama":"porsi","alias":[]}]'::jsonb;
alter table public.platform_setting add column if not exists kemasan jsonb not null default
  '["dus","pak","karton","tray","kotak","bal","karung","renceng","lusin","jeriken"]'::jsonb;

/** Daftar satuan & kemasan untuk app (boleh tanpa login: app bisa dipakai tanpa akun). */
create or replace function public.satuan_daftar()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('satuan', s.satuan, 'kemasan', s.kemasan, 'diubah', s.diubah) from public.platform_setting s where s.id = 1;
$$;
revoke all on function public.satuan_daftar() from public;
grant execute on function public.satuan_daftar() to anon, authenticated;

/** Admin: simpan daftar satuan & kemasan. p = { satuan: [{ nama, alias }], kemasan: [teks] } */
create or replace function public.admin_set_satuan(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  x jsonb;
  nama text;
  al text;
  alias jsonb;
  sat jsonb := '[]'::jsonb;
  kem jsonb := '[]'::jsonb;
  dipakai text[] := array[]::text[];
  inti constant text[] := array['gram', 'ml', 'pcs'];
begin
  if not public.is_platform_admin() then
    raise exception 'Khusus admin Racikin';
  end if;
  if jsonb_typeof(p -> 'satuan') <> 'array' or jsonb_typeof(p -> 'kemasan') <> 'array' then
    raise exception 'Isian tidak valid';
  end if;
  if jsonb_array_length(p -> 'satuan') > 40 or jsonb_array_length(p -> 'kemasan') > 30 then
    raise exception 'Kebanyakan (maks. 40 satuan & 30 kemasan)';
  end if;
  for x in select * from jsonb_array_elements(p -> 'satuan') loop
    nama := lower(trim(coalesce(x ->> 'nama', '')));
    if nama !~ '^[a-z][a-z0-9 ]{0,19}$' then
      raise exception 'Nama satuan "%" nggak valid (huruf kecil / angka, maks. 20)', coalesce(x ->> 'nama', '');
    end if;
    if nama = any (dipakai) then
      raise exception 'Satuan "%" dobel', nama;
    end if;
    alias := '[]'::jsonb;
    if jsonb_typeof(x -> 'alias') = 'array' then
      if jsonb_array_length(x -> 'alias') > 10 then
        raise exception 'Kata lain untuk "%" maks. 10', nama;
      end if;
      for al in select lower(trim(v)) from jsonb_array_elements_text(x -> 'alias') v loop
        if al = '' then continue; end if;
        if al !~ '^[a-z][a-z0-9]{0,19}$' then
          raise exception 'Kata lain "%" nggak valid (satu kata, huruf kecil)', al;
        end if;
        if al = any (dipakai) or al = nama then
          raise exception 'Kata "%" dipakai dua kali', al;
        end if;
        dipakai := dipakai || al;
        alias := alias || to_jsonb(al);
      end loop;
    end if;
    dipakai := dipakai || nama;
    -- Kurung penting: array || (objek || objek), bukan (array || objek) || objek.
    sat := sat || jsonb_build_array(jsonb_build_object('nama', nama, 'alias', alias) || case when nama = any (inti) then '{"inti":true}'::jsonb else '{}'::jsonb end);
  end loop;
  foreach nama in array inti loop
    if not exists (select 1 from jsonb_array_elements(sat) e where e ->> 'nama' = nama) then
      raise exception 'Satuan inti "%" nggak boleh dihapus', nama;
    end if;
  end loop;
  for nama in select lower(trim(v)) from jsonb_array_elements_text(p -> 'kemasan') v loop
    if nama = '' then continue; end if;
    if nama !~ '^[a-z][a-z0-9 ]{0,19}$' then
      raise exception 'Nama kemasan "%" nggak valid', nama;
    end if;
    if kem ? nama then
      raise exception 'Kemasan "%" dobel', nama;
    end if;
    kem := kem || to_jsonb(nama);
  end loop;
  update public.platform_setting set satuan = sat, kemasan = kem, diubah = now() where id = 1;
  return public.satuan_daftar();
end;
$$;
revoke all on function public.admin_set_satuan(jsonb) from public, anon;
grant execute on function public.admin_set_satuan(jsonb) to authenticated;
