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
| `unit/kemasan.test.mjs` | isi per kemasan beli: teks jumlah ("1 dus + 6 pcs"), patch dari form, daftar belanja dibulatkan per kemasan, pesan WA supplier, data contoh, satuan renceng (pilihan & impor teks) |
| `unit/transfer.test.mjs` | transfer stok antar cabang: validasi, stok asal/tujuan = riwayat, bahan baru, kirim ulang nggak dobel, gabung 3-way dengan HP kasir tujuan, riwayat |
| `unit/cabang.test.mjs` | multi-cabang: cabang baru disalin dari data contoh (stok 0, Kas kosong, token meja baru), kirim menu (stok & Kas tujuan tetap), ringkasan gabungan & laba per cabang, data contoh cabang muda (`hari`, `seed`, `denganTim`) |
| `unit/saldo.test.mjs` | saldo pelanggan: isi (Kas titipan), bayar pakai saldo (penuh & kurang + sisa QRIS), simpan kembalian, batal order, tarik, hapus, laci shift, reconcile, laba rugi & pajak, kartu publik |
| `unit/ordersync.test.mjs` | sinkron order lewat tabel: gabung base + tarikan, 3-way dengan batal dari HP lain, order yang perlu dikirim, since mundur 2 menit |
| `unit/jadwal.test.mjs` | jadwal shift: template default & custom, rentang, kuas, pola bergilir, salin, telat dari jam shift, lembur dari jam selesai shift (termasuk lewat tengah malam), sisanya hadir, jadwal akun kasir, WA |
| `unit/gaji.test.mjs` | gaji: periode mingguan/bulanan, harian & bulanan (potong alpa/izin), uang makan, bonus, kasbon karyawan, Kas & laba rugi, batal, pengingat, slip, lembur (tarif tetap & Depnaker), THR (masa kerja, proporsional, harian, H-7), CSV, izin manajer |
| `unit/absen.test.mjs` | karyawan & absen: posisi custom, catat absen, telat, otomatis dari shift, rekap, impor mesin absen (attlog ZKTeco, CSV, laporan Fingerspot, rekap masuk/pulang, sel Excel) |
| `unit/utang.test.mjs` | utang supplier: belanja tempo (stok masuk, Kas belum), status jatuh tempo, cicil (Kas proporsional per kategori), lunasi semua, hapus, pengingat |
| `unit/kasbon.test.mjs` | kasbon pelanggan: batas, order kasbon + DP, Kas saat lunas, cicilan, batal order, FIFO, laci shift, laba rugi, reconcile |
| `unit/pajak.test.mjs` | PPh Final UMKM: bebas Rp500 juta kumulatif, bentuk usaha, jatuh tempo & status, catat/batal bayar ke Kas, rekap SPT |
| `unit/izin.test.mjs` | panduan perizinan: rekomendasi per jenis usaha, masa berlaku, pengingat, progres |
| `unit/admin.test.mjs` | dashboard admin: status merchant (aktif/berisiko/baru/tidur), ringkasan platform, filter & urut, CSV, periode 7/30/90, perlu disapa |
| `unit/wa.test.mjs` | WhatsApp: baca chat order, link wa.me, teks menu, broadcast per kelompok, ringkasan rekap & shift |
| `unit/paket.test.mjs` | paket Gratis/Pro: label, sisa hari, pengingat, hemat tahunan, link upgrade WA, ringkasan langganan & MRR, perpanjang, konfigurasi fitur & kuota AI dari admin |
| `unit/split-bill.test.mjs` | open bill tahap 2: batal sebagian, bayar sebagian per orang, Kas & stok konsisten, gabung bill, pindah meja |
| `unit/bill.test.mjs` | open bill: ronde & stok, batal item/bill, bayar (Kas saat lunas, stok nggak dobel), pembayaran campuran di Kas/rekap/laci, bill meja, gabung ronde dari 2 HP |
| `unit/promo-meja.test.mjs` | voucher per pelanggan (nomor WA), rekap per nomor, batal, aturan promo yang diunggah, hash nomor WA sama dengan SQL |
| `unit/promo.test.mjs` | promo & voucher: waktu/saluran, potongan 3 jenis, pilih terbaik (tidak numpuk), kode & kuota, order/Kas/rekap/batal, laporan, data contoh |
| `unit/imporjual.test.mjs` | impor penjualan lama: baca CSV/TSV, tebak kolom, tanggal, saluran, lewati hari yang ada, laporan & batalkan |
| `unit/sehat.test.mjs` | cek kesehatan usaha: status tiap pemeriksaan, skor, prioritas, data contoh |
| `unit/impor.test.mjs` | input cepat menu & bahan (parser lokal, cocokkan data lama, stok = riwayat), saldo kas |
| `unit/tahap.test.mjs` | tahap usaha: langkah Beranda baru ide vs udah jalan, urutan menurut masalah utama, tawaran naik tahap |
| `unit/varian-resep.test.mjs` | varian yang mengubah resep: porsi ×, kemasan tidak dikali, ganti/tanpa bahan, stok, HPP per menu, rekap `opsiMenu`, laporan, data contoh |
| `unit/varian.test.mjs` | varian & topping: validasi pilihan, harga toko/online, stok & batal order, rekap, laporan, menu publik |
| `unit/merge.test.mjs` | 3-way merge sinkron (order/stok/stempel dari beberapa HP) |
| `unit/merge-shift.test.mjs` | merge data shift & catatan laci |
| `unit/kas-filter.test.mjs` | filter & pencarian transaksi Kas |
| `unit/notif.test.mts` | jadwal pengingat push (zona waktu, peran, anti-dobel) + tagihan (PPh bulanan, utang supplier, kasbon FIFO, gajian & THR) & jadwal besok per akun + pengingat per cabang (judul, penanda terkirim per cabang, link `?cabang=`) |
| `unit/webpush.test.mts` | enkripsi Web Push (dicek silang dengan `http_ece`) & tanda tangan VAPID |

## E2E (Playwright)

Jalankan app dari root repo, lalu jalankan skrip dengan folder tujuan screenshot:

```bash
python3 -m http.server 8766        # di root repo, terminal lain
mkdir -p /tmp/shots && node tests/e2e/kasir.js /tmp/shots
```

`RACIKIN_URL` mengganti alamat app (default `http://localhost:8766/`).

**Tanpa akun** (cukup app lokal): `mvp.js`, `kasir.js`, `online.js`, `tracked.js`, `studio.js`, `dummy.js`, `shift.js`, `laporan.js`, `belanja.js`, `kasfilter.js`, `tablet.js` (argumen opsional: lebar tinggi daftar-rute), `rotate.js`, `varian.js` (halaman pelanggan QR diuji dengan RPC mock), `tahap.js`, `impor.js` (Mode Demo; baca foto lewat AI Online dicoba manual), `sehat.js`, `imporjual.js`, `promo.js`, `wa.js` (link wa.me di-intercept, WhatsApp tidak benar-benar dibuka), `admin.js` (sesi & RPC Supabase di-mock, tidak menyentuh data asli), `izin.js`, `pajak.js`, `kasbon.js`, `utang.js`, `absen.js` (bikin file .xlsx & attlog contoh sendiri), `gaji.js`, `thr.js` (lembur, THR, CSV, izin manajer disimulasikan), `dummy.js` (sekarang juga cek keras: Kas = rekap, stok = riwayat & nggak minus, stempel, tumbuh ±3×, Kas Gaji = gajian, kasbon karyawan, Kas utang, Kas titipan = total saldo pelanggan), `pengingat.js` (daftar jenis pengingat per peran, push disimulasikan nggak didukung), `jadwal.js` (akun kasir disimulasikan; ekspor Excel dibaca balik, PDF dibuat ke folder screenshot), `varian-resep.js`, `promo-meja.js` (halaman pelanggan QR dengan RPC mock; perhitungan aslinya dites langsung di SQL), `bill.js`, `split-bill.js`, `paket.js` (sesi & RPC di-mock; penguncian aslinya dites di SQL), `kemasan.js` (isi per kemasan di bahan: tampil, tombol dus di form beli, edit, hapus, bahan baru), `cabang.js` (server palsu per cabang: tambah, ringkasan, pindah, jualan per cabang, kirim menu, transfer stok, link notifikasi `?cabang=`, hapus, paket Pro terkunci & kolom Max), `saldo.js` (aktifkan, isi & tarik saldo, simpan kembalian, bayar pakai saldo penuh & kurang + QRIS, Kas titipan vs penjualan), `sinkron.js` (2 HP dengan server palsu di memori: dokumen tanpa order, order lewat `orders_pull` / `orders_push`, jual & batal menyebar).

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
