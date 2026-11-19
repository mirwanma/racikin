-- Konfigurasi paket dari dashboard admin (halaman Paket): fitur mana yang Gratis / Pro, kuota AI per paket,
-- harga, masa coba, akhir masa transisi, nomor WA upgrade. Semua kunci di server membaca konfigurasi ini.
--
-- platform_setting.fitur = { tim, meja, dapur, bill, foto, imporJual: "pro" | "gratis" }
--   (fitur yang tidak tercantum dianggap "pro"). ai_gratis / ai_pro = kuota AI teks per akun per hari.

alter table public.platform_setting add column if not exists fitur jsonb not null
  default '{"tim":"pro","meja":"pro","dapur":"pro","bill":"pro","foto":"pro","imporJual":"pro"}'::jsonb;
alter table public.platform_setting add column if not exists ai_gratis int not null default 20 check (ai_gratis between 0 and 1000);
alter table public.platform_setting add column if not exists ai_pro int not null default 300 check (ai_pro between 0 and 5000);

-- Daftar fitur yang bisa diatur (urutan tampil di admin).
create or replace function public.paket_fitur_ids()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array['tim', 'meja', 'dapur', 'bill', 'foto', 'imporJual'];
$$;

-- Boleh pakai fitur? Fitur "gratis" boleh semua usaha; fitur "pro" hanya usaha yang Pro.
create or replace function public.fitur_boleh(p_owner uuid, p_fitur text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select s.fitur ->> p_fitur from public.platform_setting s where s.id = 1), 'pro') = 'gratis'
    or public.paket_pro(p_owner);
$$;

-- Kuota AI teks sesuai paket & konfigurasi.
create or replace function public.ai_limit(p_owner uuid)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select case when public.paket_pro(p_owner) then s.ai_pro else s.ai_gratis end from public.platform_setting s where s.id = 1;
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
    'harga_bulan', st.harga_bulan, 'harga_tahun', st.harga_tahun, 'wa', st.wa, 'coba_hari', st.coba_hari
  );
end;
$$;

create or replace function public.consume_ai_quota(p_user uuid, p_task text, p_per_minute integer, p_per_day integer)
returns json
language plpgsql
set search_path = ''
as $$
declare
  n_minute int;
  n_day int;
  per_day int := coalesce(public.ai_limit(public.owner_dari(p_user)), 20);
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

create or replace function public.consume_ai_quota_task(p_user uuid, p_task text, p_per_minute integer, p_per_day integer)
returns json
language plpgsql
set search_path = ''
as $$
declare
  n_minute int;
  n_day int;
begin
  if p_task = 'foto' and not public.fitur_boleh(public.owner_dari(p_user), 'foto') then
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
    when not public.fitur_boleh(p_owner, 'tim') then null
    else (select m.role from public.team_members m where m.owner_id = p_owner and m.member_id = (select auth.uid()))
  end;
$$;

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
      'pro', public.fitur_boleh(m.owner_id, 'tim')
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
  if not public.fitur_boleh(uid, 'tim') then
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
  if not public.fitur_boleh(inv.owner_id, 'tim') then
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

create or replace function public.meja_dari_token(p_token text)
returns table (owner_id uuid, data jsonb, meja jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  select m.owner_id,
    case when public.fitur_boleh(m.owner_id, 'meja') then m.data else jsonb_set(m.data, '{aktif}', 'false'::jsonb) end,
    e
  from public.public_menu m, jsonb_array_elements(m.data -> 'meja') e
  where e ->> 'token' = p_token
  limit 1;
$$;

-- Admin: simpan semua konfigurasi paket sekaligus.
-- p = { wa, harga_bulan, harga_tahun, coba_hari, transisi_sampai, ai_gratis, ai_pro, fitur: { id: "pro"|"gratis" } }
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
    v := coalesce(p -> 'fitur' ->> k, 'pro');
    if v not in ('pro', 'gratis') then
      raise exception 'Fitur % harus pro / gratis', k;
    end if;
    f := f || jsonb_build_object(k, v);
  end loop;
  if char_length(coalesce(p ->> 'wa', '')) > 20
     or coalesce((p ->> 'harga_bulan')::int, -1) not between 0 and 100000000
     or coalesce((p ->> 'harga_tahun')::int, -1) not between 0 and 1000000000
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

revoke all on function public.paket_fitur_ids() from public, anon, authenticated;
revoke all on function public.fitur_boleh(uuid, text) from public, anon, authenticated;
revoke all on function public.ai_limit(uuid) from public, anon, authenticated;
revoke all on function public.admin_set_paket(jsonb) from public, anon;
grant execute on function public.admin_set_paket(jsonb) to authenticated;
grant execute on function public.fitur_boleh(uuid, text) to service_role;
grant execute on function public.ai_limit(uuid) to service_role;
grant execute on function public.paket_fitur_ids() to service_role;
