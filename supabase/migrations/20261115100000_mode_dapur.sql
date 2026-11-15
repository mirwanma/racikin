-- Fase 13: Mode dapur (Kitchen Display).
-- Tiket dapur disimpan di tabel sendiri (bukan di dokumen usaha) supaya kecil & bisa realtime:
-- kasir menulis tiket saat order selesai, layar dapur menerima lewat Supabase Realtime & mengubah status.
-- Peran tim baru "dapur": hanya layar dapur, tidak menerima data penjualan/kas.

-- 1) Peran dapur
alter table public.team_members drop constraint if exists team_members_role_check;
alter table public.team_members add constraint team_members_role_check check (role in ('manajer', 'kasir', 'dapur'));
alter table public.team_invites drop constraint if exists team_invites_role_check;
alter table public.team_invites add constraint team_invites_role_check check (role in ('manajer', 'kasir', 'dapur'));

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
      -- kode bentrok (sangat jarang): coba lagi
    end;
  end loop;

  return jsonb_build_object('code', inv.code, 'role', inv.role, 'nama', inv.nama, 'expires_at', inv.expires_at);
end;
$$;

-- Dapur hanya menerima identitas usaha (nama, brand) dari dokumen; tidak bisa menulis dokumen.
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
    'data', case
      when r = 'kasir' then d.data - public.doc_kasir_hidden()
      when r = 'dapur' then jsonb_strip_nulls(jsonb_build_object('profile', d.data -> 'profile', 'brand', d.data -> 'brand', 'posSetting', d.data -> 'posSetting'))
      else d.data end,
    'rev', d.rev,
    'updated_at', d.updated_at,
    'role', r
  );
end;
$$;

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
  if r = 'dapur' then
    raise exception 'Akun dapur tidak bisa mengubah data usaha' using errcode = '42501';
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

-- 2) Tiket dapur
create table if not exists public.kitchen_tickets (
  id text primary key,                                   -- = id order kasir
  owner_id uuid not null references auth.users (id) on delete cascade,
  no int not null,
  data jsonb not null,                                   -- { items:[{nama,qty}], catatan, nama, channel, kasir, waktu }
  status text not null default 'baru' check (status in ('baru', 'dimasak', 'siap', 'diambil', 'batal')),
  done jsonb not null default '[]'::jsonb,               -- index item yang sudah selesai dibuat
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint kitchen_tickets_size check (pg_column_size(data) < 8000 and pg_column_size(done) < 1000),
  constraint kitchen_tickets_id check (char_length(id) between 1 and 64)
);
create index if not exists kitchen_tickets_owner_time on public.kitchen_tickets (owner_id, created_at desc);

create or replace function public.kitchen_tickets_touch()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists kitchen_tickets_touch on public.kitchen_tickets;
create trigger kitchen_tickets_touch before update on public.kitchen_tickets
  for each row execute function public.kitchen_tickets_touch();
revoke all on function public.kitchen_tickets_touch() from public, anon, authenticated;

alter table public.kitchen_tickets enable row level security;
create policy "kitchen_tickets: tim baca" on public.kitchen_tickets
  for select to authenticated using (public.team_role(owner_id) is not null);
create policy "kitchen_tickets: tim tambah" on public.kitchen_tickets
  for insert to authenticated with check (public.team_role(owner_id) is not null);
create policy "kitchen_tickets: tim ubah" on public.kitchen_tickets
  for update to authenticated using (public.team_role(owner_id) is not null) with check (public.team_role(owner_id) is not null);
create policy "kitchen_tickets: pemilik/manajer hapus" on public.kitchen_tickets
  for delete to authenticated using (public.team_role(owner_id) in ('owner', 'manajer'));

-- Realtime: perubahan tiket dikirim ke layar dapur & kasir (tetap lewat RLS di atas).
do $$ begin
  alter publication supabase_realtime add table public.kitchen_tickets;
exception when duplicate_object then null;
end $$;

-- 3) Bersihkan tiket lama tiap malam (tiket hanya untuk hari berjalan).
select cron.unschedule('racikin-dapur-bersih') where exists (select 1 from cron.job where jobname = 'racikin-dapur-bersih');
select cron.schedule('racikin-dapur-bersih', '17 20 * * *', $job$ delete from public.kitchen_tickets where created_at < now() - interval '3 days' $job$);
