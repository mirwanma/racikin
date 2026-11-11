-- Fase 8: Mode tim / karyawan.
--
-- Satu usaha = satu dokumen di user_data milik PEMILIK. Karyawan (manajer/kasir) login
-- dengan akunnya sendiri lalu membaca/menulis dokumen pemilik lewat fungsi doc_get/doc_save.
-- - rev: nomor versi dokumen, naik tiap disimpan. doc_save hanya berhasil kalau rev yang
--   dikirim sama dengan rev di server (optimistic locking); kalau beda, klien menggabungkan
--   ulang (3-way merge) lalu mencoba lagi. Jadi penjualan dari beberapa HP tidak saling timpa.
-- - Kasir hanya menerima bagian dokumen yang dia perlukan (tanpa Kas, RAB, ide, dll) dan
--   hanya boleh mengubah bagian penjualan/stok/pelanggan.

-- 1) Versi dokumen. Trigger menaikkan rev di SETIAP update (juga dari klien versi lama).
alter table public.user_data add column if not exists rev bigint not null default 0;

create or replace function public.user_data_bump_rev()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.rev := old.rev + 1;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists user_data_bump_rev on public.user_data;
create trigger user_data_bump_rev before update on public.user_data
  for each row execute function public.user_data_bump_rev();

-- 2) Anggota tim. Satu akun hanya bisa jadi anggota di satu tim.
create table if not exists public.team_members (
  owner_id uuid not null references auth.users (id) on delete cascade,
  member_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('manajer', 'kasir')),
  nama text not null check (char_length(nama) between 1 and 40),
  created_at timestamptz not null default now(),
  primary key (owner_id, member_id),
  constraint team_members_satu_tim unique (member_id),
  constraint team_members_bukan_diri check (owner_id <> member_id)
);

alter table public.team_members enable row level security;

create policy "team_members: pemilik & anggota baca" on public.team_members
  for select to authenticated using ((select auth.uid()) in (owner_id, member_id));
create policy "team_members: pemilik ubah" on public.team_members
  for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
-- Pemilik mengeluarkan anggota, atau anggota keluar sendiri.
create policy "team_members: pemilik/anggota hapus" on public.team_members
  for delete to authenticated using ((select auth.uid()) in (owner_id, member_id));
-- Tidak ada policy insert: bergabung hanya lewat join_team (pakai kode undangan).

-- 3) Undangan: kode sekali pakai, berlaku 7 hari.
create table if not exists public.team_invites (
  code text primary key,
  owner_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('manajer', 'kasir')),
  nama text not null check (char_length(nama) between 1 and 40),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days'
);
create index if not exists team_invites_owner on public.team_invites (owner_id);

alter table public.team_invites enable row level security;

create policy "team_invites: pemilik baca" on public.team_invites
  for select to authenticated using ((select auth.uid()) = owner_id);
create policy "team_invites: pemilik hapus" on public.team_invites
  for delete to authenticated using ((select auth.uid()) = owner_id);
-- Insert hanya lewat create_invite (kode dibuat di server).

-- 4) Peran user yang login terhadap dokumen milik p_owner: owner | manajer | kasir | null.
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
    else (select m.role from public.team_members m where m.owner_id = p_owner and m.member_id = (select auth.uid()))
  end;
$$;

-- Bagian dokumen yang tidak dikirim ke kasir, dan bagian yang boleh diubah kasir.
create or replace function public.doc_kasir_hidden()
returns text[] language sql immutable set search_path = '' as $$
  select array['transactions', 'insight', 'idea', 'rab', 'bep', 'activation', 'calendar', 'chat'];
$$;
create or replace function public.doc_kasir_writable()
returns text[] language sql immutable set search_path = '' as $$
  select array['orders', 'posHarian', 'bahan', 'stokLog', 'pelanggan', 'stempelLog'];
$$;

-- 5) Tim saya: dipanggil saat login untuk tahu dokumen mana yang dipakai.
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
      'bisnis', (select d.data -> 'profile' ->> 'nama' from public.user_data d where d.user_id = m.owner_id)
    );
  end if;
  return jsonb_build_object(
    'owner_id', uid,
    'role', 'owner',
    'anggota', (select count(*) from public.team_members t where t.owner_id = uid)
  );
end;
$$;

-- 6) Daftar anggota (khusus pemilik), termasuk email supaya mudah dikenali.
create or replace function public.team_list()
returns table (member_id uuid, nama text, role text, email text, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select m.member_id, m.nama, m.role, u.email::text, m.created_at
  from public.team_members m
  join auth.users u on u.id = m.member_id
  where m.owner_id = (select auth.uid())
  order by m.created_at;
$$;

-- 7) Bikin kode undangan (khusus pemilik usaha, bukan anggota tim lain).
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
  if p_role not in ('manajer', 'kasir') then
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
      -- kode bentrok (sangat jarang): coba lagi
    end;
  end loop;

  return jsonb_build_object('code', inv.code, 'role', inv.role, 'nama', inv.nama, 'expires_at', inv.expires_at);
end;
$$;

-- 8) Gabung ke tim pakai kode.
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

-- 9) Baca dokumen usaha (sesuai peran).
create or replace function public.doc_get(p_owner uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  r text := public.team_role(p_owner);
  d public.user_data;
begin
  if r is null then
    raise exception 'Tidak punya akses ke data usaha ini' using errcode = '42501';
  end if;
  select * into d from public.user_data where user_id = p_owner;
  if not found then
    return null;
  end if;
  return jsonb_build_object(
    'data', case when r = 'kasir' then d.data - public.doc_kasir_hidden() else d.data end,
    'rev', d.rev,
    'updated_at', d.updated_at,
    'role', r
  );
end;
$$;

-- 10) Simpan dokumen usaha kalau versinya masih sama (p_base_rev).
--     Return { ok: true, rev, updated_at } atau { ok: false, rev } kalau ada versi lebih baru.
create or replace function public.doc_save(p_owner uuid, p_data jsonb, p_base_rev bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r text := public.team_role(p_owner);
  bagian jsonb;
  hasil public.user_data;
begin
  if r is null then
    raise exception 'Tidak punya akses ke data usaha ini' using errcode = '42501';
  end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then
    raise exception 'Data tidak valid';
  end if;

  if r = 'kasir' then
    select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb) into bagian
      from jsonb_each(p_data) e
      where e.key = any (public.doc_kasir_writable());
    update public.user_data set data = data || bagian
      where user_id = p_owner and rev = p_base_rev
      returning * into hasil;
  else
    update public.user_data set data = p_data
      where user_id = p_owner and rev = p_base_rev
      returning * into hasil;
  end if;

  if found then
    return jsonb_build_object('ok', true, 'rev', hasil.rev, 'updated_at', hasil.updated_at);
  end if;

  -- Dokumen belum ada: hanya pemilik yang boleh membuat.
  if r = 'owner' and p_base_rev = 0 and not exists (select 1 from public.user_data where user_id = p_owner) then
    insert into public.user_data (user_id, data, rev) values (p_owner, p_data, 1)
      on conflict (user_id) do nothing
      returning * into hasil;
    if found then
      return jsonb_build_object('ok', true, 'rev', hasil.rev, 'updated_at', hasil.updated_at);
    end if;
  end if;

  return jsonb_build_object('ok', false, 'rev', (select d.rev from public.user_data d where d.user_id = p_owner));
end;
$$;

-- Hak akses fungsi: hanya user yang login.
revoke all on function public.team_role(uuid) from public, anon;
revoke all on function public.my_team() from public, anon;
revoke all on function public.team_list() from public, anon;
revoke all on function public.create_invite(text, text) from public, anon;
revoke all on function public.join_team(text) from public, anon;
revoke all on function public.doc_get(uuid) from public, anon;
revoke all on function public.doc_save(uuid, jsonb, bigint) from public, anon;
revoke all on function public.doc_kasir_hidden() from public, anon;
revoke all on function public.doc_kasir_writable() from public, anon;
revoke all on function public.user_data_bump_rev() from public, anon, authenticated;
grant execute on function public.team_role(uuid) to authenticated;
grant execute on function public.my_team() to authenticated;
grant execute on function public.team_list() to authenticated;
grant execute on function public.create_invite(text, text) to authenticated;
grant execute on function public.join_team(text) to authenticated;
grant execute on function public.doc_get(uuid) to authenticated;
grant execute on function public.doc_save(uuid, jsonb, bigint) to authenticated;
grant execute on function public.doc_kasir_hidden() to authenticated;
grant execute on function public.doc_kasir_writable() to authenticated;

-- 11) Kartu stempel: anggota tim juga boleh memperbarui kartu milik usaha tempatnya bekerja.
drop policy if exists "stamp_cards: pemilik baca" on public.stamp_cards;
drop policy if exists "stamp_cards: pemilik tambah" on public.stamp_cards;
drop policy if exists "stamp_cards: pemilik ubah" on public.stamp_cards;
drop policy if exists "stamp_cards: pemilik hapus" on public.stamp_cards;

create policy "stamp_cards: tim baca" on public.stamp_cards
  for select to authenticated using (public.team_role(owner_id) is not null);
create policy "stamp_cards: tim tambah" on public.stamp_cards
  for insert to authenticated with check (public.team_role(owner_id) is not null);
create policy "stamp_cards: tim ubah" on public.stamp_cards
  for update to authenticated using (public.team_role(owner_id) is not null) with check (public.team_role(owner_id) is not null);
create policy "stamp_cards: tim hapus" on public.stamp_cards
  for delete to authenticated using (public.team_role(owner_id) is not null);
