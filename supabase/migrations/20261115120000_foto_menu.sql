-- Fase 15: Foto menu (opsional) + percantik pakai AI.
-- Foto disimpan di Supabase Storage (bucket publik "menu-foto", path "<owner_id>/<resep_id>-<waktu>.webp"),
-- bukan di dokumen usaha. Siapa pun bisa MELIHAT (dipakai di menu QR meja), hanya pemilik/manajer
-- usaha itu yang bisa upload/ganti/hapus.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('menu-foto', 'menu-foto', true, 1572864, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Folder pertama path = owner_id usaha. Boleh tulis kalau user pemilik/manajer usaha itu.
create or replace function public.foto_boleh(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  owner uuid;
begin
  begin
    owner := split_part(p_name, '/', 1)::uuid;
  exception when others then
    return false;
  end;
  return coalesce(public.team_role(owner) in ('owner', 'manajer'), false);
end;
$$;
revoke all on function public.foto_boleh(text) from public, anon;
grant execute on function public.foto_boleh(text) to authenticated;

drop policy if exists "menu-foto: tim baca" on storage.objects;
drop policy if exists "menu-foto: tim tambah" on storage.objects;
drop policy if exists "menu-foto: tim ubah" on storage.objects;
drop policy if exists "menu-foto: tim hapus" on storage.objects;
-- Hapus/ganti file lewat API butuh izin SELECT juga (file tetap bisa dilihat publik lewat URL).
create policy "menu-foto: tim baca" on storage.objects
  for select to authenticated using (bucket_id = 'menu-foto' and public.foto_boleh(name));
create policy "menu-foto: tim tambah" on storage.objects
  for insert to authenticated with check (bucket_id = 'menu-foto' and public.foto_boleh(name));
create policy "menu-foto: tim ubah" on storage.objects
  for update to authenticated using (bucket_id = 'menu-foto' and public.foto_boleh(name)) with check (bucket_id = 'menu-foto' and public.foto_boleh(name));
create policy "menu-foto: tim hapus" on storage.objects
  for delete to authenticated using (bucket_id = 'menu-foto' and public.foto_boleh(name));

-- Kuota per jenis tugas (edit foto AI lebih mahal dari teks, jadi dihitung terpisah). Hanya service role.
create or replace function public.consume_ai_quota_task(p_user uuid, p_task text, p_per_minute int, p_per_day int)
returns json
language plpgsql
security invoker
set search_path = ''
as $$
declare
  n_minute int;
  n_day int;
begin
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
revoke all on function public.consume_ai_quota_task(uuid, text, int, int) from public, anon, authenticated;
grant execute on function public.consume_ai_quota_task(uuid, text, int, int) to service_role;
