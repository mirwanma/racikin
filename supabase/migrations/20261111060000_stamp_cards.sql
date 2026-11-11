-- Kartu stempel digital: salinan publik kartu tiap pelanggan.
-- Pemilik usaha menulis lewat RLS; pelanggan membaca HANYA lewat token (uuid acak)
-- memakai fungsi get_stamp_card. Tabel tidak bisa dibaca/di-list langsung oleh anon.

create table if not exists public.stamp_cards (
  token uuid primary key,
  owner_id uuid not null references auth.users (id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  constraint stamp_cards_size check (pg_column_size(data) < 8000)
);
create index if not exists stamp_cards_owner on public.stamp_cards (owner_id);

alter table public.stamp_cards enable row level security;

create policy "stamp_cards: pemilik baca" on public.stamp_cards
  for select to authenticated using ((select auth.uid()) = owner_id);
create policy "stamp_cards: pemilik tambah" on public.stamp_cards
  for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy "stamp_cards: pemilik ubah" on public.stamp_cards
  for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy "stamp_cards: pemilik hapus" on public.stamp_cards
  for delete to authenticated using ((select auth.uid()) = owner_id);

-- Baca satu kartu berdasarkan token. Sengaja SECURITY DEFINER + bisa dipanggil anon:
-- token = uuid acak (tidak bisa ditebak), dan yang dikembalikan cuma isi kartu itu.
create or replace function public.get_stamp_card(p_token uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select c.data || jsonb_build_object('diperbarui', c.updated_at)
  from public.stamp_cards c
  where c.token = p_token;
$$;

revoke all on function public.get_stamp_card(uuid) from public;
grant execute on function public.get_stamp_card(uuid) to anon, authenticated;
