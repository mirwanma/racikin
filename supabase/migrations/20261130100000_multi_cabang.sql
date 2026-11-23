-- Multi-cabang + paket Max.
--
-- Usaha / cabang:
-- - Tabel usaha: satu baris per usaha. Cabang utama = id akun pemilik (data lama tetap di tempatnya), cabang tambahan
--   punya id sendiri (uuid baru) dengan pemilik = akun yang sama. Semua tabel data usaha (dokumen, order, kartu stempel,
--   tim, undangan, dapur, menu publik, pesanan meja) sekarang mengacu ke usaha(id) (hapus akun -> semua cabang ikut).
-- - Tiap cabang = data terpisah (dokumen, order, Kas, stok, tim sendiri). Pemilik bisa membuka semua cabangnya
--   (team_role = 'owner'), anggota tim terikat ke satu cabang.
-- - Paket & kuota mengikuti akun pemilik (induk): paket_info(cabang) = paket_info(pemilik).
--
-- Paket Max (di atas Pro): langganan.paket = 'pro' | 'max'. Fitur bisa diatur admin jadi gratis / pro / max
-- (platform_setting.fitur). Fitur baru "cabang" default Max. Masa coba & transisi = Pro.

-- ---------- Usaha ----------
create table if not exists public.usaha (
  id uuid primary key,
  pemilik uuid not null references auth.users (id) on delete cascade,
  nama text not null default '' check (char_length(nama) <= 60),
  utama boolean not null default false,
  dibuat timestamptz not null default now(),
  constraint usaha_utama check (utama = (id = pemilik))
);
create index if not exists usaha_pemilik on public.usaha (pemilik);
alter table public.usaha enable row level security; -- tanpa policy: hanya lewat fungsi
revoke all on public.usaha from anon, authenticated;

insert into public.usaha (id, pemilik, utama) select u.id, u.id, true from auth.users u on conflict (id) do nothing;

create or replace function public.usaha_akun_baru()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.usaha (id, pemilik, utama) values (new.id, new.id, true) on conflict (id) do nothing;
  return new;
end;
$$;
revoke all on function public.usaha_akun_baru() from public, anon, authenticated;
drop trigger if exists usaha_akun_baru on auth.users;
create trigger usaha_akun_baru after insert on auth.users for each row execute function public.usaha_akun_baru();

-- Kolom pemilik data usaha: FK ke auth.users -> FK ke usaha.
do $$
declare
  t record;
  c record;
begin
  for t in select * from (values
    ('user_data', 'user_id'), ('stamp_cards', 'owner_id'), ('team_members', 'owner_id'), ('team_invites', 'owner_id'),
    ('kitchen_tickets', 'owner_id'), ('public_menu', 'owner_id'), ('table_orders', 'owner_id'), ('pos_orders', 'owner_id')
  ) v(tbl, kol) loop
    for c in
      select con.conname from pg_constraint con
      join pg_attribute a on a.attrelid = con.conrelid and a.attnum = any (con.conkey)
      where con.contype = 'f' and con.conrelid = ('public.' || t.tbl)::regclass and a.attname = t.kol
        and con.confrelid = 'auth.users'::regclass
    loop
      execute format('alter table public.%I drop constraint %I', t.tbl, c.conname);
    end loop;
    execute format('alter table public.%I add constraint %I foreign key (%I) references public.usaha (id) on delete cascade',
      t.tbl, t.tbl || '_usaha_fk', t.kol);
  end loop;
end $$;

/** Akun pemilik (induk) sebuah usaha / cabang. */
create or replace function public.induk(p_usaha uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select coalesce((select u.pemilik from public.usaha u where u.id = p_usaha), p_usaha);
$$;
revoke all on function public.induk(uuid) from public, anon, authenticated;

-- ---------- Paket Max ----------
alter table public.langganan add column if not exists paket text not null default 'pro' check (paket in ('pro', 'max'));
alter table public.langganan_log add column if not exists paket text;
alter table public.platform_setting add column if not exists harga_max_bulan int not null default 99000 check (harga_max_bulan >= 0);
alter table public.platform_setting add column if not exists harga_max_tahun int not null default 990000 check (harga_max_tahun >= 0);
update public.platform_setting set fitur = fitur || '{"cabang":"max"}'::jsonb where id = 1 and not (fitur ? 'cabang');

create or replace function public.paket_fitur_ids()
returns text[] language sql immutable set search_path = '' as $$
  select array['tim', 'meja', 'dapur', 'bill', 'foto', 'imporJual', 'cabang'];
$$;

/** Tingkat paket: gratis 0, pro 1, max 2. */
create or replace function public.paket_level(p text)
returns int language sql immutable set search_path = '' as $$
  select case p when 'max' then 2 when 'pro' then 1 else 0 end;
$$;

-- Paket efektif usaha (cabang ikut akun pemiliknya). paket: gratis | pro | max.
create or replace function public.paket_info(p_owner uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  st public.platform_setting;
  l public.langganan;
  daftar timestamptz;
  coba timestamptz;
  transisi timestamptz;
begin
  p_owner := public.induk(p_owner);
  select * into st from public.platform_setting where id = 1;
  select * into l from public.langganan where owner_id = p_owner;
  select u.created_at into daftar from auth.users u where u.id = p_owner;
  coba := daftar + make_interval(days => coalesce(st.coba_hari, 14));
  transisi := case when daftar < st.batas_transisi then st.transisi_sampai else null end;
  if l.sampai is not null and l.sampai > now() then
    return jsonb_build_object('paket', l.paket, 'sumber', 'bayar', 'sampai', l.sampai, 'periode', l.periode, 'coba_sampai', coba, 'transisi_sampai', transisi);
  elsif transisi is not null and transisi > now() then
    return jsonb_build_object('paket', 'pro', 'sumber', 'transisi', 'sampai', transisi, 'coba_sampai', coba, 'transisi_sampai', transisi);
  elsif coba is not null and coba > now() then
    return jsonb_build_object('paket', 'pro', 'sumber', 'coba', 'sampai', coba, 'coba_sampai', coba, 'transisi_sampai', transisi);
  end if;
  return jsonb_build_object('paket', 'gratis', 'sumber', null, 'sampai', null, 'coba_sampai', coba, 'transisi_sampai', transisi,
    'pro_terakhir', greatest(l.sampai, transisi, coba));
end;
$$;

create or replace function public.paket_pro(p_owner uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.paket_info(p_owner) ->> 'paket' in ('pro', 'max');
$$;

-- Boleh pakai fitur: tingkat paket usaha >= tingkat yang diatur admin (default cabang = max, lainnya pro).
create or replace function public.fitur_boleh(p_owner uuid, p_fitur text)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.paket_level(public.paket_info(p_owner) ->> 'paket')
    >= public.paket_level(coalesce((select s.fitur ->> p_fitur from public.platform_setting s where s.id = 1), case when p_fitur = 'cabang' then 'max' else 'pro' end));
$$;

create or replace function public.paket_saya()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  st public.platform_setting;
  owner uuid;
  info jsonb;
begin
  if uid is null then
    raise exception 'Belum login';
  end if;
  select * into st from public.platform_setting where id = 1;
  owner := public.owner_dari(uid);
  info := public.paket_info(owner);
  return info || jsonb_build_object(
    'ai_hari', public.ai_limit(owner),
    'ai_gratis', st.ai_gratis, 'ai_pro', st.ai_pro,
    'fitur', st.fitur,
    'harga_bulan', st.harga_bulan, 'harga_tahun', st.harga_tahun,
    'harga_max_bulan', st.harga_max_bulan, 'harga_max_tahun', st.harga_max_tahun,
    'wa', st.wa, 'coba_hari', st.coba_hari
  );
end;
$$;

-- Admin: aktifkan / perpanjang / hentikan langganan, sekarang dengan pilihan paket (pro / max).
drop function if exists public.admin_set_langganan(uuid, timestamptz, text, text);
create or replace function public.admin_set_langganan(p_owner uuid, p_sampai timestamptz, p_periode text, p_catatan text, p_paket text default 'pro')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  lama timestamptz;
begin
  if not public.is_platform_admin() then
    raise exception 'Khusus admin Racikin';
  end if;
  if not exists (select 1 from auth.users u where u.id = p_owner) then
    raise exception 'Usaha tidak ditemukan';
  end if;
  if coalesce(p_periode, 'bulan') not in ('bulan', 'tahun', 'lain') or char_length(coalesce(p_catatan, '')) > 200
     or coalesce(p_paket, 'pro') not in ('pro', 'max') then
    raise exception 'Isian tidak valid';
  end if;
  select sampai into lama from public.langganan where owner_id = p_owner;
  if p_sampai is null then
    delete from public.langganan where owner_id = p_owner;
  else
    insert into public.langganan (owner_id, sampai, periode, catatan, paket, diubah, diubah_oleh)
    values (p_owner, p_sampai, coalesce(p_periode, 'bulan'), coalesce(p_catatan, ''), coalesce(p_paket, 'pro'), now(), (select auth.uid()))
    on conflict (owner_id) do update set sampai = excluded.sampai, periode = excluded.periode, catatan = excluded.catatan,
      paket = excluded.paket, diubah = now(), diubah_oleh = excluded.diubah_oleh;
  end if;
  insert into public.langganan_log (owner_id, sampai_lama, sampai_baru, periode, catatan, oleh, paket)
  values (p_owner, lama, p_sampai, p_periode, coalesce(p_catatan, ''), (select auth.uid()), coalesce(p_paket, 'pro'));
  return public.paket_info(p_owner);
end;
$$;
revoke all on function public.admin_set_langganan(uuid, timestamptz, text, text, text) from public, anon;
grant execute on function public.admin_set_langganan(uuid, timestamptz, text, text, text) to authenticated;

-- Admin: konfigurasi paket. fitur: gratis | pro | max; harga Max.
create or replace function public.admin_set_paket(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  f jsonb := '{}'::jsonb;
  k text;
  v text;
begin
  if not public.is_platform_admin() then
    raise exception 'Khusus admin Racikin';
  end if;
  if jsonb_typeof(p) <> 'object' then
    raise exception 'Isian tidak valid';
  end if;
  foreach k in array public.paket_fitur_ids() loop
    v := coalesce(p -> 'fitur' ->> k, case when k = 'cabang' then 'max' else 'pro' end);
    if v not in ('pro', 'gratis', 'max') then
      raise exception 'Fitur % harus gratis / pro / max', k;
    end if;
    f := f || jsonb_build_object(k, v);
  end loop;
  if char_length(coalesce(p ->> 'wa', '')) > 20
     or coalesce((p ->> 'harga_bulan')::int, -1) not between 0 and 100000000
     or coalesce((p ->> 'harga_tahun')::int, -1) not between 0 and 1000000000
     or coalesce((p ->> 'harga_max_bulan')::int, 99000) not between 0 and 100000000
     or coalesce((p ->> 'harga_max_tahun')::int, 990000) not between 0 and 1000000000
     or coalesce((p ->> 'coba_hari')::int, -1) not between 0 and 90
     or coalesce((p ->> 'ai_gratis')::int, -1) not between 0 and 1000
     or coalesce((p ->> 'ai_pro')::int, -1) not between 0 and 5000
     or (p ->> 'transisi_sampai') is null then
    raise exception 'Isian tidak valid';
  end if;
  update public.platform_setting set
    wa = regexp_replace(coalesce(p ->> 'wa', ''), '\D', '', 'g'),
    harga_bulan = (p ->> 'harga_bulan')::int,
    harga_tahun = (p ->> 'harga_tahun')::int,
    harga_max_bulan = coalesce((p ->> 'harga_max_bulan')::int, harga_max_bulan),
    harga_max_tahun = coalesce((p ->> 'harga_max_tahun')::int, harga_max_tahun),
    coba_hari = (p ->> 'coba_hari')::int,
    transisi_sampai = (p ->> 'transisi_sampai')::timestamptz,
    ai_gratis = (p ->> 'ai_gratis')::int,
    ai_pro = (p ->> 'ai_pro')::int,
    fitur = f,
    diubah = now()
  where id = 1;
  return public.admin_setting();
end;
$$;

-- Admin: daftar merchant & paket hanya usaha induk (cabang ikut pemiliknya).
do $$
declare
  fn text;
  def text;
begin
  foreach fn in array array['admin_merchants', 'admin_paket'] loop
    select pg_get_functiondef(p.oid) into def from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = fn;
    if def is not null and position('usaha_induk_saja' in def) = 0 then
      def := replace(def, 'from public.user_data d', 'from public.user_data d join public.usaha usaha_induk_saja on usaha_induk_saja.id = d.user_id and usaha_induk_saja.utama');
      execute def;
    end if;
  end loop;
end $$;

-- ---------- Peran: pemilik membuka semua cabangnya ----------
create or replace function public.team_role(p_owner uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when (select auth.uid()) is null then null
    when p_owner = (select auth.uid()) then 'owner'
    when exists (select 1 from public.usaha u where u.id = p_owner and u.pemilik = (select auth.uid())) then 'owner'
    when not public.fitur_boleh(p_owner, 'tim') then null
    else (select m.role from public.team_members m where m.owner_id = p_owner and m.member_id = (select auth.uid()))
  end;
$$;

-- Nama usaha / cabang untuk ditampilkan.
create or replace function public.usaha_nama(p_usaha uuid)
returns text language sql stable security definer set search_path = '' as $$
  select coalesce(nullif((select u.nama from public.usaha u where u.id = p_usaha), ''),
    (select d.data -> 'profile' ->> 'nama' from public.user_data d where d.user_id = p_usaha), '');
$$;
revoke all on function public.usaha_nama(uuid) from public, anon, authenticated;

-- my_team: pemilik juga mendapat daftar cabangnya.
create or replace function public.my_team()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  m public.team_members;
begin
  if uid is null then
    raise exception 'Belum login';
  end if;
  select * into m from public.team_members where member_id = uid;
  if found then
    return jsonb_build_object(
      'owner_id', m.owner_id,
      'role', m.role,
      'nama', m.nama,
      'bisnis', public.usaha_nama(m.owner_id),
      'pro', public.fitur_boleh(m.owner_id, 'tim')
    );
  end if;
  return jsonb_build_object(
    'owner_id', uid,
    'role', 'owner',
    'anggota', (select count(*) from public.team_members t where t.owner_id = uid),
    'cabang', coalesce((
      select jsonb_agg(jsonb_build_object('id', u.id, 'nama', public.usaha_nama(u.id), 'utama', u.utama,
        'anggota', (select count(*) from public.team_members t where t.owner_id = u.id)) order by u.utama desc, u.dibuat)
      from public.usaha u where u.pemilik = uid
    ), '[]'::jsonb)
  );
end;
$$;

-- Tim per cabang: undangan & daftar anggota untuk cabang tertentu (default cabang utama).
drop function if exists public.create_invite(text, text);
create or replace function public.create_invite(p_role text, p_nama text, p_owner uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  own uuid := coalesce(p_owner, (select auth.uid()));
  alfabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  kode text;
  b bytea;
  i int;
  inv public.team_invites;
begin
  if uid is null then
    raise exception 'Belum login';
  end if;
  if exists (select 1 from public.team_members where member_id = uid) then
    raise exception 'Akun anggota tim tidak bisa mengundang orang lain';
  end if;
  if public.team_role(own) is distinct from 'owner' then
    raise exception 'Cabang ini bukan milikmu';
  end if;
  if not public.fitur_boleh(own, 'tim') then
    raise exception 'Fitur tim khusus paket Pro. Upgrade dulu di halaman Paket ya.';
  end if;
  if p_role not in ('manajer', 'kasir', 'dapur') then
    raise exception 'Peran tidak dikenal';
  end if;
  if char_length(trim(coalesce(p_nama, ''))) not between 1 and 40 then
    raise exception 'Nama karyawan 1-40 huruf';
  end if;

  delete from public.team_invites where owner_id = own and expires_at < now();
  if (select count(*) from public.team_invites where owner_id = own) >= 10 then
    raise exception 'Terlalu banyak undangan aktif. Batalkan yang tidak dipakai dulu.';
  end if;
  if (select count(*) from public.team_members where owner_id = own) >= 20 then
    raise exception 'Maksimal 20 anggota tim per cabang';
  end if;

  loop
    b := extensions.gen_random_bytes(8);
    kode := '';
    for i in 0..7 loop
      kode := kode || substr(alfabet, (get_byte(b, i) % 32) + 1, 1);
    end loop;
    begin
      insert into public.team_invites (code, owner_id, role, nama)
      values (kode, own, p_role, trim(p_nama))
      returning * into inv;
      exit;
    exception when unique_violation then
    end;
  end loop;

  return jsonb_build_object('code', inv.code, 'role', inv.role, 'nama', inv.nama, 'expires_at', inv.expires_at);
end;
$$;
revoke all on function public.create_invite(text, text, uuid) from public, anon;
grant execute on function public.create_invite(text, text, uuid) to authenticated;

create or replace function public.join_team(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  inv public.team_invites;
begin
  if uid is null then
    raise exception 'Belum login';
  end if;
  select * into inv from public.team_invites
    where code = upper(trim(p_code)) and expires_at > now()
    for update;
  if not found then
    raise exception 'Kode undangan tidak valid atau sudah kedaluwarsa';
  end if;
  if public.induk(inv.owner_id) = uid then
    raise exception 'Ini kode undangan dari akunmu sendiri. Buka link ini di HP karyawan.';
  end if;
  if not public.fitur_boleh(inv.owner_id, 'tim') then
    raise exception 'Paket Pro usaha ini sudah habis. Minta pemilik memperpanjang dulu.';
  end if;
  if exists (select 1 from public.team_members where member_id = uid) then
    raise exception 'Akunmu sudah tergabung di tim lain. Keluar dulu dari tim itu.';
  end if;
  if exists (select 1 from public.team_members t join public.usaha u on u.id = t.owner_id where u.pemilik = uid) then
    raise exception 'Akunmu punya tim sendiri. Keluarkan dulu anggota timmu kalau mau bergabung ke tim lain.';
  end if;
  if exists (select 1 from public.usaha u where u.pemilik = uid and not u.utama) then
    raise exception 'Akunmu punya cabang sendiri, jadi nggak bisa gabung ke tim lain.';
  end if;

  insert into public.team_members (owner_id, member_id, role, nama) values (inv.owner_id, uid, inv.role, inv.nama);
  delete from public.team_invites where code = inv.code;
  return public.my_team();
end;
$$;

drop function if exists public.team_list();
create or replace function public.team_list(p_owner uuid default null)
returns table (member_id uuid, nama text, role text, email text, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select m.member_id, m.nama, m.role, u.email::text, m.created_at
  from public.team_members m
  join auth.users u on u.id = m.member_id
  where m.owner_id = coalesce(p_owner, (select auth.uid()))
    and public.team_role(m.owner_id) = 'owner'
  order by m.created_at;
$$;
revoke all on function public.team_list(uuid) from public, anon;
grant execute on function public.team_list(uuid) to authenticated;

drop policy if exists "team_invites: pemilik baca" on public.team_invites;
create policy "team_invites: pemilik baca" on public.team_invites for select using (public.team_role(owner_id) = 'owner');
drop policy if exists "team_invites: pemilik hapus" on public.team_invites;
create policy "team_invites: pemilik hapus" on public.team_invites for delete using (public.team_role(owner_id) = 'owner');
drop policy if exists "team_members: pemilik & anggota baca" on public.team_members;
create policy "team_members: pemilik & anggota baca" on public.team_members for select
  using (public.team_role(owner_id) = 'owner' or (select auth.uid()) = member_id);
drop policy if exists "team_members: pemilik ubah" on public.team_members;
create policy "team_members: pemilik ubah" on public.team_members for update
  using (public.team_role(owner_id) = 'owner') with check (public.team_role(owner_id) = 'owner');
drop policy if exists "team_members: pemilik/anggota hapus" on public.team_members;
create policy "team_members: pemilik/anggota hapus" on public.team_members for delete
  using (public.team_role(owner_id) = 'owner' or (select auth.uid()) = member_id);

-- ---------- Cabang ----------
create or replace function public.cabang_buat(p_nama text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  baru uuid := gen_random_uuid();
begin
  if uid is null then
    raise exception 'Belum login';
  end if;
  if exists (select 1 from public.team_members where member_id = uid) then
    raise exception 'Akun anggota tim nggak bisa bikin cabang';
  end if;
  if not public.fitur_boleh(uid, 'cabang') then
    raise exception 'Multi-cabang khusus paket Max. Upgrade dulu di halaman Paket ya.';
  end if;
  if char_length(trim(coalesce(p_nama, ''))) not between 1 and 60 then
    raise exception 'Nama cabang 1-60 huruf';
  end if;
  if (select count(*) from public.usaha where pemilik = uid) >= 10 then
    raise exception 'Maksimal 10 cabang';
  end if;
  insert into public.usaha (id, pemilik, nama, utama) values (uid, uid, '', true) on conflict (id) do nothing;
  insert into public.usaha (id, pemilik, nama, utama) values (baru, uid, trim(p_nama), false);
  return jsonb_build_object('id', baru, 'nama', trim(p_nama));
end;
$$;

create or replace function public.cabang_ubah(p_id uuid, p_nama text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if char_length(trim(coalesce(p_nama, ''))) > 60 then
    raise exception 'Nama cabang maksimal 60 huruf';
  end if;
  update public.usaha set nama = trim(coalesce(p_nama, '')) where id = p_id and pemilik = (select auth.uid());
  if not found then
    raise exception 'Cabang tidak ditemukan';
  end if;
  return jsonb_build_object('id', p_id, 'nama', public.usaha_nama(p_id));
end;
$$;

-- Hapus cabang tambahan beserta SEMUA datanya (dokumen, order, kartu, tim). Cabang utama nggak bisa dihapus.
create or replace function public.cabang_hapus(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.usaha where id = p_id and pemilik = (select auth.uid()) and not utama;
  if not found then
    raise exception 'Cabang tidak ditemukan (cabang utama nggak bisa dihapus)';
  end if;
  return true;
end;
$$;

-- Ringkasan semua cabang untuk pemilik: rekap kasir, Kas & data HPP sejak p_dari (dihitung di app).
create or replace function public.cabang_ringkasan(p_dari date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
begin
  if uid is null then
    raise exception 'Belum login';
  end if;
  if p_dari is null or p_dari < current_date - 400 then
    raise exception 'Tanggal tidak valid';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', u.id,
      'nama', public.usaha_nama(u.id),
      'utama', u.utama,
      'updated_at', d.updated_at,
      'data', case when d.data is null then null else jsonb_build_object(
        'profile', d.data -> 'profile',
        'resep', d.data -> 'resep',
        'bahan', d.data -> 'bahan',
        'opsi', d.data -> 'opsi',
        'posHarian', coalesce((select jsonb_object_agg(e.key, e.value) from jsonb_each(case when jsonb_typeof(d.data -> 'posHarian') = 'object' then d.data -> 'posHarian' else '{}'::jsonb end) e where e.key >= p_dari::text), '{}'::jsonb),
        'transactions', coalesce((select jsonb_agg(x) from jsonb_array_elements(case when jsonb_typeof(d.data -> 'transactions') = 'array' then d.data -> 'transactions' else '[]'::jsonb end) x where x ->> 'tanggal' >= p_dari::text), '[]'::jsonb),
        'kasbon', coalesce((select jsonb_agg(x) from jsonb_array_elements(case when jsonb_typeof(d.data -> 'kasbon') = 'array' then d.data -> 'kasbon' else '[]'::jsonb end) x where x ->> 'tanggal' >= p_dari::text), '[]'::jsonb)
      ) end
    ) order by u.utama desc, u.dibuat)
    from public.usaha u left join public.user_data d on d.user_id = u.id
    where u.pemilik = uid
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.cabang_buat(text) from public, anon;
revoke all on function public.cabang_ubah(uuid, text) from public, anon;
revoke all on function public.cabang_hapus(uuid) from public, anon;
revoke all on function public.cabang_ringkasan(date) from public, anon;
grant execute on function public.cabang_buat(text) to authenticated;
grant execute on function public.cabang_ubah(uuid, text) to authenticated;
grant execute on function public.cabang_hapus(uuid) to authenticated;
grant execute on function public.cabang_ringkasan(date) to authenticated;
revoke all on function public.paket_level(text) from public, anon, authenticated;
grant execute on function public.paket_level(text) to service_role;
