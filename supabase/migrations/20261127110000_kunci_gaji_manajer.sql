-- Setelan gaji & lembur diatur pemilik. Manajer hanya boleh mengubahnya kalau pemilik mengizinkan
-- (state.absenSetting.manajerAturGaji = true). Kalau tidak, doc_save mengembalikan bagian itu ke versi tersimpan:
-- karyawan[].gaji (skema, nominal, uang makan, periode, potongan, lembur, tarif lembur) dan
-- absenSetting.jamKerja / absenSetting.manajerAturGaji. Data lain (absen, bayar gaji, THR) tetap bisa ditulis manajer.

create or replace function public.kunci_gaji(lama jsonb, baru jsonb)
returns jsonb language sql immutable set search_path = '' as $$
  with k as (
    select case when jsonb_typeof(baru->'karyawan') = 'array' then (
      select coalesce(jsonb_agg(
        case
          when lk.v ? 'gaji' then e.v || jsonb_build_object('gaji', lk.v->'gaji')
          else e.v - 'gaji'
        end order by e.i), '[]'::jsonb)
      from jsonb_array_elements(baru->'karyawan') with ordinality e(v, i)
      left join lateral (
        select x.v from jsonb_array_elements(case when jsonb_typeof(lama->'karyawan') = 'array' then lama->'karyawan' else '[]'::jsonb end) x(v)
        where x.v->>'id' = e.v->>'id' limit 1
      ) lk on true
    ) end as karyawan
  ),
  a as (
    select case when jsonb_typeof(baru->'absenSetting') = 'object' then
      ((baru->'absenSetting') - 'jamKerja' - 'manajerAturGaji')
        || coalesce(jsonb_strip_nulls(jsonb_build_object('jamKerja', lama->'absenSetting'->'jamKerja', 'manajerAturGaji', lama->'absenSetting'->'manajerAturGaji')), '{}'::jsonb)
    end as setting
  )
  select baru
    || case when (select karyawan from k) is not null then jsonb_build_object('karyawan', (select karyawan from k)) else '{}'::jsonb end
    || case when (select setting from a) is not null then jsonb_build_object('absenSetting', (select setting from a)) else '{}'::jsonb end;
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
  lama jsonb;
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
    if r = 'manajer' then
      select d.data into lama from public.user_data d where d.user_id = p_owner;
      if not coalesce((lama->'absenSetting'->>'manajerAturGaji')::boolean, false) then
        p_data := public.kunci_gaji(coalesce(lama, '{}'::jsonb), p_data);
      end if;
    end if;
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
