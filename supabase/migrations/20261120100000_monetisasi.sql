-- Monetisasi tahap 1: paket Gratis & Pro (tanpa payment gateway; upgrade lewat WA, admin mengaktifkan).
--
-- Paket efektif usaha (paket_info), urutan:
--   1. Pro berbayar   : langganan.sampai > sekarang (diisi admin platform lewat admin_set_langganan).
--   2. Masa transisi  : akun yang daftar sebelum platform_setting.batas_transisi -> Pro sampai transisi_sampai.
--   3. Masa coba      : akun baru -> Pro selama coba_hari sejak daftar.
--   4. Selain itu Gratis.
-- Yang dikunci di server untuk Gratis:
--   - kuota AI teks 20/hari (Pro 300/hari), AI foto menu tidak bisa (consume_ai_quota*),
--   - undang & gabung tim (create_invite, join_team), anggota tim kehilangan akses kalau Pro usaha habis (team_role),
--   - pesan meja QR otomatis nonaktif (meja_dari_token).
-- Fitur yang datanya hanya di dokumen usaha (open bill, impor penjualan, layar dapur pemilik) dikunci di app.

create table if not exists public.platform_setting (
  id int primary key default 1 check (id = 1),
  wa text not null default '',
  harga_bulan int not null default 49000 check (harga_bulan >= 0),
  harga_tahun int not null default 490000 check (harga_tahun >= 0),
  coba_hari int not null default 14 check (coba_hari between 0 and 90),
  batas_transisi timestamptz not null default now(),
  transisi_sampai timestamptz not null default '2027-02-20 23:59:59+07',
  diubah timestamptz not null default now()
);
insert into public.platform_setting (id) values (1) on conflict (id) do nothing;
alter table public.platform_setting enable row level security;
revoke all on public.platform_setting from anon, authenticated;

create table if not exists public.langganan (
  owner_id uuid primary key references auth.users (id) on delete cascade,
  sampai timestamptz not null,
  periode text not null default 'bulan' check (periode in ('bulan', 'tahun', 'lain')),
  catatan text not null default '' check (char_length(catatan) <= 200),
  diubah timestamptz not null default now(),
  diubah_oleh uuid
);
alter table public.langganan enable row level security;
revoke all on public.langganan from anon, authenticated;

create table if not exists public.langganan_log (
  id bigint generated always as identity primary key,
  owner_id uuid not null references auth.users (id) on delete cascade,
  sampai_lama timestamptz,
  sampai_baru timestamptz,
  periode text,
  catatan text,
  oleh uuid,
  at timestamptz not null default now()
);
alter table public.langganan_log enable row level security;
revoke all on public.langganan_log from anon, authenticated;

-- Pemilik usaha dari sebuah akun (anggota tim -> pemiliknya).
create or replace function public.owner_dari(p_user uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select m.owner_id from public.team_members m where m.member_id = p_user), p_user);
$$;

-- Paket efektif usaha: { paket: pro|gratis, sumber: bayar|transisi|coba|null, sampai, coba_sampai, transisi_sampai, periode }
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
  select * into st from public.platform_setting where id = 1;
  select * into l from public.langganan where owner_id = p_owner;
  select u.created_at into daftar from auth.users u where u.id = p_owner;
  coba := daftar + make_interval(days => coalesce(st.coba_hari, 14));
  transisi := case when daftar < st.batas_transisi then st.transisi_sampai else null end;
  if l.sampai is not null and l.sampai > now() then
    return jsonb_build_object('paket', 'pro', 'sumber', 'bayar', 'sampai', l.sampai, 'periode', l.periode, 'coba_sampai', coba, 'transisi_sampai', transisi);
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
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.paket_info(p_owner) ->> 'paket' = 'pro';
$$;

-- Untuk app: paket usaha akun yang login (anggota tim -> paket pemiliknya) + harga & nomor WA upgrade.
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
  info jsonb;
begin
  if uid is null then
    raise exception 'Belum login';
  end if;
  select * into st from public.platform_setting where id = 1;
  info := public.paket_info(public.owner_dari(uid));
  return info || jsonb_build_object(
    'ai_hari', case when info ->> 'paket' = 'pro' then 300 else 20 end,
    'harga_bulan', st.harga_bulan, 'harga_tahun', st.harga_tahun, 'wa', st.wa, 'coba_hari', st.coba_hari
  );
end;
$$;

-- Kuota AI teks per paket: Gratis 20/hari, Pro 300/hari (p_per_day dari Edge Function diabaikan).
create or replace function public.consume_ai_quota(p_user uuid, p_task text, p_per_minute integer, p_per_day integer)
returns json
language plpgsql
set search_path = ''
as $$
declare
  n_minute int;
  n_day int;
  per_day int := case when public.paket_pro(public.owner_dari(p_user)) then 300 else 20 end;
begin
  -- Kunci per user supaya request paralel tidak lolos bareng.
  perform pg_advisory_xact_lock(hashtextextended(p_user::text, 0));

  select count(*) into n_minute from public.ai_usage
    where user_id = p_user and created_at > now() - interval '1 minute';
  select count(*) into n_day from public.ai_usage
    where user_id = p_user and created_at > now() - interval '1 day';

  if n_minute >= p_per_minute then
    return json_build_object('ok', false, 'reason', 'per_minute', 'limit', p_per_minute);
  end if;
  if n_day >= per_day then
    return json_build_object('ok', false, 'reason', 'per_day', 'limit', per_day);
  end if;

  insert into public.ai_usage (user_id, task) values (p_user, left(p_task, 64));
  return json_build_object('ok', true, 'used_today', n_day + 1, 'limit_day', per_day);
end;
$$;

-- AI foto menu: khusus Pro.
create or replace function public.consume_ai_quota_task(p_user uuid, p_task text, p_per_minute integer, p_per_day integer)
returns json
language plpgsql
set search_path = ''
as $$
declare
  n_minute int;
  n_day int;
begin
  if p_task = 'foto' and not public.paket_pro(public.owner_dari(p_user)) then
    return json_build_object('ok', false, 'reason', 'per_day', 'limit', 0, 'pro', true);
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user::text || p_task, 0));
  select count(*) into n_minute from public.ai_usage
    where user_id = p_user and task = p_task and created_at > now() - interval '1 minute';
  select count(*) into n_day from public.ai_usage
    where user_id = p_user and task = p_task and created_at > now() - interval '1 day';
  if n_minute >= p_per_minute then
    return json_build_object('ok', false, 'reason', 'per_minute', 'limit', p_per_minute);
  end if;
  if n_day >= p_per_day then
    return json_build_object('ok', false, 'reason', 'per_day', 'limit', p_per_day);
  end if;
  insert into public.ai_usage (user_id, task) values (p_user, left(p_task, 64));
  return json_build_object('ok', true, 'used_today', n_day + 1, 'limit_day', p_per_day);
end;
$$;

-- Anggota tim hanya punya akses selama usaha pemiliknya Pro.
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
    when not public.paket_pro(p_owner) then null
    else (select m.role from public.team_members m where m.owner_id = p_owner and m.member_id = (select auth.uid()))
  end;
$$;

-- Tim saya: anggota diberi tahu kalau Pro usaha pemilik habis.
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
      'bisnis', (select d.data -> 'profile' ->> 'nama' from public.user_data d where d.user_id = m.owner_id),
      'pro', public.paket_pro(m.owner_id)
    );
  end if;
  return jsonb_build_object(
    'owner_id', uid,
    'role', 'owner',
    'anggota', (select count(*) from public.team_members t where t.owner_id = uid)
  );
end;
$$;

create or replace function public.create_invite(p_role text, p_nama text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
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
  if not public.paket_pro(uid) then
    raise exception 'Fitur tim khusus paket Pro. Upgrade dulu di halaman Paket ya.';
  end if;
  if p_role not in ('manajer', 'kasir', 'dapur') then
    raise exception 'Peran tidak dikenal';
  end if;
  if char_length(trim(coalesce(p_nama, ''))) not between 1 and 40 then
    raise exception 'Nama karyawan 1-40 huruf';
  end if;

  delete from public.team_invites where owner_id = uid and expires_at < now();
  if (select count(*) from public.team_invites where owner_id = uid) >= 10 then
    raise exception 'Terlalu banyak undangan aktif. Batalkan yang tidak dipakai dulu.';
  end if;
  if (select count(*) from public.team_members where owner_id = uid) >= 20 then
    raise exception 'Maksimal 20 anggota tim';
  end if;

  loop
    b := extensions.gen_random_bytes(8);
    kode := '';
    for i in 0..7 loop
      kode := kode || substr(alfabet, (get_byte(b, i) % 32) + 1, 1);
    end loop;
    begin
      insert into public.team_invites (code, owner_id, role, nama)
      values (kode, uid, p_role, trim(p_nama))
      returning * into inv;
      exit;
    exception when unique_violation then
    end;
  end loop;

  return jsonb_build_object('code', inv.code, 'role', inv.role, 'nama', inv.nama, 'expires_at', inv.expires_at);
end;
$$;

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
  if inv.owner_id = uid then
    raise exception 'Ini kode undangan dari akunmu sendiri. Buka link ini di HP karyawan.';
  end if;
  if not public.paket_pro(inv.owner_id) then
    raise exception 'Paket Pro usaha ini sudah habis. Minta pemilik memperpanjang dulu.';
  end if;
  if exists (select 1 from public.team_members where member_id = uid) then
    raise exception 'Akunmu sudah tergabung di tim lain. Keluar dulu dari tim itu.';
  end if;
  if exists (select 1 from public.team_members where owner_id = uid) then
    raise exception 'Akunmu punya tim sendiri. Keluarkan dulu anggota timmu kalau mau bergabung ke tim lain.';
  end if;

  insert into public.team_members (owner_id, member_id, role, nama) values (inv.owner_id, uid, inv.role, inv.nama);
  delete from public.team_invites where code = inv.code;
  return public.my_team();
end;
$$;

-- Pesan meja: usaha yang bukan Pro dianggap nonaktif (get_table_menu, cek_promo_meja, place_table_order ikut).
create or replace function public.meja_dari_token(p_token text)
returns table (owner_id uuid, data jsonb, meja jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  select m.owner_id,
    case when public.paket_pro(m.owner_id) then m.data else jsonb_set(m.data, '{aktif}', 'false'::jsonb) end,
    e
  from public.public_menu m, jsonb_array_elements(m.data -> 'meja') e
  where e ->> 'token' = p_token
  limit 1;
$$;

-- ---------- Admin platform ----------
-- Paket semua usaha (untuk dashboard admin).
create or replace function public.admin_paket()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Khusus admin Racikin';
  end if;
  return (
    select coalesce(jsonb_agg(public.paket_info(d.user_id) || jsonb_build_object('id', d.user_id, 'catatan', coalesce(l.catatan, ''))), '[]'::jsonb)
    from public.user_data d
    left join public.langganan l on l.owner_id = d.user_id
    where jsonb_typeof(d.data -> 'profile') = 'object'
  );
end;
$$;

-- Setelan platform (harga & nomor WA upgrade) untuk admin.
create or replace function public.admin_setting()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Khusus admin Racikin';
  end if;
  return (select to_jsonb(s) from public.platform_setting s where id = 1);
end;
$$;

create or replace function public.admin_set_setting(p_wa text, p_harga_bulan int, p_harga_tahun int)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Khusus admin Racikin';
  end if;
  if char_length(coalesce(p_wa, '')) > 20 or coalesce(p_harga_bulan, -1) < 0 or coalesce(p_harga_tahun, -1) < 0 then
    raise exception 'Isian tidak valid';
  end if;
  update public.platform_setting set wa = regexp_replace(coalesce(p_wa, ''), '\D', '', 'g'), harga_bulan = p_harga_bulan, harga_tahun = p_harga_tahun, diubah = now() where id = 1;
  return public.admin_setting();
end;
$$;

-- Aktifkan / perpanjang / hentikan Pro berbayar satu usaha. p_sampai null = hentikan.
create or replace function public.admin_set_langganan(p_owner uuid, p_sampai timestamptz, p_periode text, p_catatan text)
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
  if coalesce(p_periode, 'bulan') not in ('bulan', 'tahun', 'lain') or char_length(coalesce(p_catatan, '')) > 200 then
    raise exception 'Isian tidak valid';
  end if;
  select sampai into lama from public.langganan where owner_id = p_owner;
  if p_sampai is null then
    delete from public.langganan where owner_id = p_owner;
  else
    insert into public.langganan (owner_id, sampai, periode, catatan, diubah, diubah_oleh)
    values (p_owner, p_sampai, coalesce(p_periode, 'bulan'), coalesce(p_catatan, ''), now(), (select auth.uid()))
    on conflict (owner_id) do update set sampai = excluded.sampai, periode = excluded.periode, catatan = excluded.catatan, diubah = now(), diubah_oleh = excluded.diubah_oleh;
  end if;
  insert into public.langganan_log (owner_id, sampai_lama, sampai_baru, periode, catatan, oleh)
  values (p_owner, lama, p_sampai, p_periode, coalesce(p_catatan, ''), (select auth.uid()));
  return public.paket_info(p_owner);
end;
$$;

revoke all on function public.owner_dari(uuid) from public, anon, authenticated;
revoke all on function public.paket_info(uuid) from public, anon, authenticated;
revoke all on function public.paket_pro(uuid) from public, anon, authenticated;
revoke all on function public.paket_saya() from public, anon;
revoke all on function public.admin_paket() from public, anon;
revoke all on function public.admin_setting() from public, anon;
revoke all on function public.admin_set_setting(text, int, int) from public, anon;
revoke all on function public.admin_set_langganan(uuid, timestamptz, text, text) from public, anon;
grant execute on function public.paket_saya() to authenticated;
grant execute on function public.admin_paket() to authenticated;
grant execute on function public.admin_setting() to authenticated;
grant execute on function public.admin_set_setting(text, int, int) to authenticated;
grant execute on function public.admin_set_langganan(uuid, timestamptz, text, text) to authenticated;
grant execute on function public.owner_dari(uuid) to service_role;
grant execute on function public.paket_info(uuid) to service_role;
grant execute on function public.paket_pro(uuid) to service_role;
