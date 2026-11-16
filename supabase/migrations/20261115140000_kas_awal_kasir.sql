-- Tahap B usaha yang sudah jalan: saldo kas awal (kasAwal) termasuk bagian keuangan,
-- jadi tidak dikirim ke akun kasir (sama seperti transactions).
create or replace function public.doc_kasir_hidden()
returns text[] language sql immutable set search_path = '' as $$
  select array['transactions', 'kasAwal', 'insight', 'idea', 'rab', 'bep', 'activation', 'calendar', 'chat'];
$$;
