# Tes Racikin

App Racikin tidak butuh build. Tes di sini hanya alat bantu pengembangan.

```bash
cd tests && npm install          # http_ece (cek silang Web Push) + playwright
npx playwright install chromium  # sekali saja, kalau belum ada browser
```

## Unit test (tanpa browser, tanpa internet)

```bash
cd tests && npm run unit
```

| File | Menguji |
|---|---|
| `unit/imporjual.test.mjs` | impor penjualan lama: baca CSV/TSV, tebak kolom, tanggal, saluran, lewati hari yang ada, laporan & batalkan |
| `unit/sehat.test.mjs` | cek kesehatan usaha: status tiap pemeriksaan, skor, prioritas, data contoh |
| `unit/impor.test.mjs` | input cepat menu & bahan (parser lokal, cocokkan data lama, stok = riwayat), saldo kas |
| `unit/tahap.test.mjs` | tahap usaha: langkah Beranda baru ide vs udah jalan, urutan menurut masalah utama, tawaran naik tahap |
| `unit/varian.test.mjs` | varian & topping: validasi pilihan, harga toko/online, stok & batal order, rekap, laporan, menu publik |
| `unit/merge.test.mjs` | 3-way merge sinkron (order/stok/stempel dari beberapa HP) |
| `unit/merge-shift.test.mjs` | merge data shift & catatan laci |
| `unit/kas-filter.test.mjs` | filter & pencarian transaksi Kas |
| `unit/notif.test.mts` | jadwal pengingat push (zona waktu, peran, anti-dobel) |
| `unit/webpush.test.mts` | enkripsi Web Push (dicek silang dengan `http_ece`) & tanda tangan VAPID |

## E2E (Playwright)

Jalankan app dari root repo, lalu jalankan skrip dengan folder tujuan screenshot:

```bash
python3 -m http.server 8766        # di root repo, terminal lain
mkdir -p /tmp/shots && node tests/e2e/kasir.js /tmp/shots
```

`RACIKIN_URL` mengganti alamat app (default `http://localhost:8766/`).

**Tanpa akun** (cukup app lokal): `mvp.js`, `kasir.js`, `online.js`, `tracked.js`, `studio.js`, `dummy.js`, `shift.js`, `laporan.js`, `belanja.js`, `kasfilter.js`, `tablet.js` (argumen opsional: lebar tinggi daftar-rute), `rotate.js`, `varian.js` (halaman pelanggan QR diuji dengan RPC mock), `tahap.js`, `impor.js` (Mode Demo; baca foto lewat AI Online dicoba manual), `sehat.js`, `imporjual.js`.

**Butuh Supabase & akun tes** (password lewat variabel lingkungan, tidak disimpan di repo):

| Skrip | Akun | Variabel |
|---|---|---|
| `tim.js`, `dapur.js`, `meja.js`, `foto.js`, `notif.js` | `racikin-tim-owner/kasir/mgr@racikin.test` | `RACIKIN_TEST_PASSWORD` |
| `loyal.js` | `racikin-test-k@racikin.test` | `RACIKIN_TEST_K_PASSWORD` |
| `seed-demo.js` | akun demo `*.tahguy@racikin.test` (lihat README utama) | `RACIKIN_DEMO_PASSWORD` |

- `foto.js` butuh argumen ke-2: path foto makanan (JPG/PNG) untuk diuji.
- `notif.js` memakai Chromium "full" + profil persisten (push tidak jalan di headless shell/incognito).
- Tes yang menulis ke cloud memakai data akun tes. Kosongkan dulu supaya hasilnya bersih (jalankan di SQL editor Supabase):

```sql
with u as (select id from auth.users where email like 'racikin-tim-%@racikin.test')
, a as (delete from public.team_members where owner_id in (select id from u) or member_id in (select id from u) returning 1)
, b as (delete from public.team_invites where owner_id in (select id from u) returning 1)
, c as (delete from public.kitchen_tickets where owner_id in (select id from u) returning 1)
, t as (delete from public.table_orders where owner_id in (select id from u) returning 1)
, p as (delete from public.public_menu where owner_id in (select id from u) returning 1)
, d as (delete from public.user_data where user_id in (select id from u) returning 1)
select (select count(*) from d) dokumen_dihapus;
```

Skrip E2E ini ditulis sebagai alat cek cepat (mencetak hasil ke konsol + screenshot), bukan test runner formal. Baris `errors: []` di akhir berarti tidak ada error JavaScript di halaman.
