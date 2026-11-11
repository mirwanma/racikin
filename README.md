# Racikin — Racik ide jadi cuan 🍜

PWA co-founder AI buat usaha F&B. Spesifikasi lengkap ada di [`docs/PRD.md`](docs/PRD.md).

**Live:** https://racikin.vercel.app (auto-deploy dari `main` via Vercel)

## Fitur MVP
- **Profil Bisnis**: onboarding yang jadi konteks semua AI (ada tombol "Isi contoh TAHGUY")
- **Analisa Ide**: skor kelayakan, SWOT, persona, kompetitor, harga/HPP/margin, risiko, validasi
- **RAB & Modal**: RAB per kategori (normal/hemat), realisasi, biaya bulanan, kalkulator BEP, export CSV
- **Brand Kit**: nama, tagline, story, tone, palet warna, font, konsep logo, ide menu & kemasan
- **Aktivasi**: checklist IG/TikTok/Maps/WA/GoFood/GrabFood/ShopeeFood + rencana launching 4 minggu
- **Kas**: catat cepat pakai teks bebas, input manual, grafik harian, per kategori, insight AI, CSV
- **Jadwal Konten**: kalender 14/30 hari, centang selesai, generator caption
- **Mentor AI**: chat dengan konteks bisnis
- **Setelan**: Mode Demo / AI Online, backup & restore JSON
- **Stok & Resep** (fase 3): resep per menu → HPP/porsi & margin otomatis, stok bahan (beli, opname, riwayat), catat penjualan per menu (stok berkurang + masuk Kas), resep pakai AI, peringatan stok menipis
- **Harga Online** (fase 7): harga & komisi GoFood/GrabFood/ShopeeFood (markup otomatis atau manual per menu, saran markup supaya untung sama dengan di toko), dipakai di Kasir; komisi tercatat di Kas
- **Kasir / POS** (fase 6): jual dari daftar menu (resep), keranjang, diskon, pelanggan (stempel), bayar Tunai/QRIS/Transfer/Ojol + kembalian, struk via WA, rekap hari ini, batal order — otomatis ke Kas, stok & kartu stempel
- **Studio Brand** (fase 5): logo (4 gaya), stiker kemasan, mockup cup/bowl & kantong, mockup booth, spanduk 3×1 m, papan menu, poster A4, feed & story IG — otomatis dari brand kit, unduh PNG/SVG siap cetak, teks promosi bisa ditulis AI
- **Pelanggan Setia** (fase 4): kartu stempel digital (link via WhatsApp, dibuka pelanggan tanpa login), stempel otomatis saat catat penjualan, tukar hadiah, daftar "ajak balik" + pesan WA (bisa ditulis AI)
- **Akun & Cloud** (fase 2): daftar/masuk pakai email + password, data tersinkron otomatis antar perangkat, AI Online wajib login dengan kuota per user

## Stok & resep
- Halaman `#/stok` (tab **Menu & Resep** dan **Bahan & Stok**), editor `#/resep?id=…`.
- Data: `bahan` (nama, satuan, harga per satuan, stok, min), `resep` (harga jual, hasil porsi, item bahan + qty), `stokLog` (beli / jual / opname). Ikut tersinkron ke cloud.
- HPP/porsi = Σ(qty × harga per satuan) ÷ hasil porsi. "Bisa dibuat" = porsi terbanyak yang bisa dibuat dari stok sekarang.
- **Beli** bahan menambah stok, memperbarui harga per satuan dari total bayar, dan (opsional) mencatat pengeluaran *Bahan Baku* di Kas.
- **Catat penjualan** per menu mengurangi stok semua bahan resep dan (opsional) mencatat pemasukan *Penjualan* di Kas.
- AI task `generate_recipe` menyusun bahan + takaran + estimasi harga (ditandai "estimasi" sampai diganti harga belanja asli).
- Rata-rata HPP resep dipakai sebagai default HPP di kalkulator BEP, dan ringkasan menu ikut jadi konteks Mentor AI.

## Kasir (POS)
- Tab **Kasir** (`#/kasir`). Menu = daftar resep (harga dari resep, sisa porsi dari stok). Item di luar menu bisa ditambah manual.
- Bayar: diskon (Rp), pelanggan kartu stempel (opsional), metode Tunai (uang diterima + tombol cepat + kembalian) / QRIS / Transfer / Ojol. Setelah bayar muncul struk + tombol kirim struk via WhatsApp.
- Setiap order otomatis:
  - **Kas**: masuk sebagai pemasukan *Penjualan* yang **digabung per hari per metode bayar** (`ref: "pos"`, id `pos-<tanggal>-<metode>`), dihitung ulang dari daftar order. Di halaman Kas ditandai "Kasir" dan tidak bisa dihapus manual.
  - **Stok**: bahan resep (yang stoknya sudah diisi) berkurang; riwayat stok digabung per hari per bahan.
  - **Stempel**: +1 untuk pelanggan kalau total ≥ minimal belanja program.
- Tab **Hari ini**: omzet, jumlah order, rata-rata, per metode bayar, menu terlaris, daftar order. **Batalkan order** mengembalikan kas, stok & stempel.
- Data: `orders` (detail order, disimpan 30 hari) + `posHarian` (rekap harian permanen) — supaya dokumen cloud tetap kecil walau ratusan order per hari. Logika di `js/pos.js`.

## Harga online (GoFood, GrabFood, ShopeeFood)
- Halaman `#/online` (dari Kasir atau hub Bisnis). Per saluran: aktif, **komisi %**, **markup %**, pembulatan (Rp100/500/1.000). Harga online = harga toko × (1 + markup), dibulatkan ke atas; bisa diisi manual per menu.
- **Saran markup** = markup yang membuat untung per porsi sama dengan jual di toko: `1/(1 − komisi) − 1` (komisi 20% → 25%).
- Tabel per menu: harga, uang yang diterima setelah komisi, dan untung per porsi (dari HPP resep) — hijau/kuning/merah dibanding jual di toko.
- **Kasir**: pilih saluran (Toko / GoFood / GrabFood / ShopeeFood) di atas menu; harga ikut saluran (keranjang dihitung ulang kalau saluran diganti). Order online tidak memakai pembayaran tunai; layar bayar & struk menampilkan komisi dan "kamu terima".
- **Kas**: penjualan online masuk sebagai *Penjualan* (harga ke pembeli), dan komisinya sebagai pengeluaran **Komisi Ojol** (digabung per hari per saluran). Rekap Kasir menampilkan komisi, bersih, dan porsi penjualan online.
- Logika di `js/online.js`.

## Studio brand
- Halaman `#/studio` (dari Brand Kit atau hub Bisnis). Semua desain digambar sebagai **SVG dari kode** (`js/studio/art.js`) memakai nama, tagline, palet, font (Google Fonts dari brand kit), menu & harga (dari resep, atau ide menu).
- Aset: logo (lencana / wordmark / stempel / monogram), stiker bulat Ø5 cm, mockup cup atau paper bowl (sesuai jenis usaha), mockup kantong, mockup booth/gerobak, spanduk 300×100 cm (6000×2000 px), papan menu A4 landscape, poster A4 300 dpi, feed IG 1080², story 1080×1920.
- Ekspor: PNG (dirender ke canvas pada resolusi cetak) & SVG; font brand di-embed ke file (subset latin) supaya tampil sama di percetakan.
- Warna diambil dari peran palet (utama/aksen/latar/teks); warna teks di atas warna utama dipilih otomatis berdasarkan kontras.
- Teks promosi (headline, sub, promo, CTA, tagline pendek, WA, IG, jam, alamat) bisa diisi manual atau lewat AI (`marketing_copy`); tata letak menyesuaikan panjang teks (ukuran huruf mengecil / pindah baris / dipotong rapi dengan "…").

## Pelanggan setia & kartu stempel
- Halaman `#/pelanggan`: atur program (target stempel, hadiah, min. belanja), tambah pelanggan (nama + no. WA), **+1 Stempel**, **Tukar hadiah**, koreksi, hapus.
- **Kartu publik** `#/kartu/<token>`: dibuka pelanggan tanpa login & tanpa tab bar, memakai warna brand kit kalau ada. Isinya cuma nama panggilan, stempel, target & hadiah (no. WA tidak pernah dipublikasikan).
  - Salinan kartu disimpan di tabel `public.stamp_cards` (RLS: hanya pemilik yang bisa menulis/membaca) dan dibaca publik lewat fungsi `get_stamp_card(token)`; token = UUID acak. Kartu di-upload otomatis tiap stempel berubah (antre saat offline). Butuh login.
- **Catat penjualan** di Stok bisa memilih pelanggan → +1 stempel kalau total ≥ minimal belanja.
- **Ajak balik**: pelanggan yang ≥ 21 hari belum datang, tombol "Kirim WA" berisi pesan terisi otomatis. Template bisa diedit atau ditulis AI (task `winback_template`). Kode: `{nama} {stempel} {sisa} {target} {hadiah} {bisnis} {hari} {link}`; kode lain dibuang otomatis.

## Akun & sinkron cloud
- **Auth**: Supabase Auth (email + password, alur PKCE). Halaman `#/akun`: masuk, daftar, lupa password, keluar.
- **Data**: satu dokumen JSON per usaha (milik pemilik) di tabel `public.user_data`, dibaca/ditulis lewat fungsi `doc_get` / `doc_save` yang memeriksa peran. Setelan per perangkat tidak ikut disinkron.
- **Sinkron**: perubahan lokal di-upload otomatis (±1,5 dtk). Saat app dibuka, tab aktif lagi, atau online lagi, versi cloud diambil. Data dari beberapa perangkat **digabung otomatis** (3-way merge, `js/merge.js`): item ber-id (order, transaksi, bahan, pelanggan) digabung per item, angka penghitung (stok, stempel) digabung sebagai selisih, lalu total Kas & rekap kasir dihitung ulang dari daftar order. Penyimpanan memakai nomor versi (`rev`), jadi tulisan yang bertabrakan selalu digabung ulang, tidak saling timpa. Dialog "pakai cloud / perangkat ini" hanya muncul sekali, saat login pertama di perangkat yang sudah berisi data lain.
- **Offline**: app tetap jalan tanpa internet; perubahan dikirim saat online lagi.
- **Kuota AI**: tabel `public.ai_usage` + fungsi `consume_ai_quota` (hanya service role). Default 6 permintaan/menit & 60/hari per user, ubah lewat secret `RACIKIN_LIMIT_MINUTE` / `RACIKIN_LIMIT_DAY`.
- Migrasi database ada di `supabase/migrations/`.

### Setting Supabase Auth yang wajib
1. **Authentication → URL Configuration**: Site URL = `https://racikin.vercel.app`, tambahkan juga ke Redirect URLs (link konfirmasi & reset password kembali ke sini).
2. **Email**: server email bawaan Supabase hanya mengirim ke anggota tim project (maks. 2 email/jam). Untuk user umum pilih salah satu:
   - Pasang **Custom SMTP** (Authentication → Emails → SMTP Settings), mis. Resend/Brevo, **atau**
   - Matikan **Confirm email** (Authentication → Sign In / Providers → Email) supaya daftar langsung bisa masuk. Catatan: fitur *lupa password* tetap butuh SMTP.

## Tim & karyawan
- Halaman `#/tim` (Bisnis > Tim & Karyawan): pemilik bikin **kode undangan** (8 karakter, sekali pakai, berlaku 7 hari) untuk peran **Kasir** atau **Manajer**, lalu kirim link-nya via WA. Karyawan buka link `#/gabung?kode=…`, login/daftar dengan email sendiri, lalu bergabung.
- **Kasir**: hanya Kasir, Pelanggan, Stok bahan, Akun (tab bar khusus). Data Kas, insight, ide, RAB, BEP, aktivasi, kalender & chat mentor **tidak dikirim server** ke HP kasir, dan server hanya menerima perubahan kasir untuk order, rekap harian, bahan, riwayat stok, pelanggan & riwayat stempel. Kasir hanya bisa membatalkan order yang dia catat sendiri.
- **Manajer**: semua fitur, kecuali mengelola tim. AI memakai kuota akun masing-masing.
- Setiap order mencatat siapa kasirnya; Kasir > Hari ini menampilkan rekap per kasir.
- Ada tim → data ditarik ulang tiap 30 detik saat app terbuka. Anggota dikeluarkan → data usaha dihapus dari HP-nya saat sinkron berikutnya.
- Tabel: `team_members`, `team_invites`; fungsi: `my_team`, `team_list`, `create_invite`, `join_team`, `doc_get`, `doc_save`, `team_role` (juga dipakai RLS `stamp_cards`, supaya kasir bisa memperbarui kartu stempel).
- Batasan: nomor order harian dihitung per perangkat, jadi dua HP yang mencatat order hampir bersamaan bisa dapat nomor yang sama (nama kasir ditampilkan untuk membedakan).

## Pengingat (push notification)
- Halaman `#/notif` (Setelan / Akun > Pengingat): nyalakan notifikasi di HP ini, pilih jenis pengingat & jamnya. Muncul walau app ditutup.
- Jenis: **jadwal posting hari ini** (dari Kalender Konten), **bahan menipis**, **pelanggan perlu diajak balik** (tiap Senin), **rekap tutup kasir** (omzet, order, terlaris). Kasir hanya stok & rekap. Tiap jenis maksimal sekali sehari, hanya kalau ada isinya.
- Cara kerja: `pg_cron` memanggil Edge Function `racikin-push` tiap 15 menit (via `pg_net`, membawa token rahasia dari `private.push_config`). Fungsi membaca dokumen usaha, menghitung pengingat yang jatuh tempo sesuai zona waktu & jam tiap perangkat, lalu mengirim Web Push.
- Web Push diimplementasi sendiri pakai WebCrypto (`webpush.ts`: enkripsi aes128gcm RFC 8291 + VAPID RFC 8292), tanpa layanan pihak ketiga. Kunci VAPID dibuat otomatis saat pertama dipakai dan disimpan di schema `private` (tidak bisa diakses klien), jadi **tidak perlu set secret apa pun**.
- Langganan per perangkat di `push_subscriptions` (ditulis lewat `push_subscribe` / `push_unsubscribe`, hanya host layanan push resmi yang diterima). Langganan mati (404/410) dihapus otomatis. Logout = pengingat di perangkat itu dimatikan.
- iPhone/iPad: hanya bisa setelah Racikin dipasang ke Layar Utama (iOS 16.4+).

## Desain: "papan warung"
- **Warna**: kuning marigold `#FFC531` (utama) + hitam tinta `#1B1916` di atas kertas krem `#F6EFDC`. Aksen hemat: merah cabai (minus/peringatan) & hijau daun (untung/selesai). Mode gelap otomatis.
- **Font**: Archivo (judul pakai versi lebar/expanded, kesan papan nama) + IBM Plex Mono untuk label & angka kecil (kesan struk).
- **Bentuk**: garis tinta tegas, sudut kecil, tanpa bayangan blur; tombol utama kuning dengan bayangan padat.
- **Ikon**: set ikon garis sendiri di `js/icons.js` (tanpa emoji di UI). Token warna ada di atas `css/app.css`.

## Data contoh (demo)
- Onboarding: **Coba demo lengkap (data 2 bulan)**; atau Setelan > Data kamu > **Isi data contoh TAHGUY (2 bulan)**.
- Isi (`js/dummy.js`, acak tapi tetap/seeded): 15 menu + resep & HPP, 25 bahan dengan riwayat belanja & pemakaian, ±2.000 order kasir 60 hari (toko + GoFood/GrabFood/ShopeeFood, detail order 30 hari terakhir), Kas lengkap (penjualan, komisi ojol, belanja bahan & kemasan, sewa, gas, gaji, iklan, pesanan katering), 35 pelanggan setia + stempel, RAB + realisasi, brand kit, checklist aktivasi, kalender konten.
- Semua angka saling cocok: Kas = rekap kasir per hari, stok = total riwayat stok, stempel = total log stempel. Beberapa bahan sengaja menipis & beberapa pelanggan "perlu diajak balik" supaya fitur pengingat kelihatan.
- Mengganti data bisnis di perangkat (dan di cloud kalau sedang login); setelan perangkat tetap.

## Jalanin lokal
Tanpa build. Dari root repo:

```bash
python3 -m http.server 8000
```

Buka http://localhost:8000/. Defaultnya **Mode Demo** (hasil dari template lokal, tanpa AI).

## Nyalain AI beneran (Gemini via Supabase)
**Sudah di-deploy** ke project Supabase `racikin` (`ujdxslztjcufidhqpmcd`, region Singapore).
App otomatis pakai server ini saat **Setelan → AI Online**.

Provider dipilih otomatis dari secret di Supabase Dashboard → Project `racikin` → Edge Functions → Secrets:
- `GEMINI_API_KEY` (atau `GOOGLE_API_KEY`) → **Google Gemini** (utama). Model default `gemini-3.6-flash`; kalau kena limit (429), error 5xx, atau timeout, otomatis pindah ke `gemini-3.5-flash-lite`. Ganti model utama lewat secret `GEMINI_MODEL`.
  - Kenapa bukan `gemini-3.8-flash`? Hasil uji: 3.8 butuh 7–27 dtk untuk tugas kecil (bahkan >150 dtk untuk tugas besar), 3.6 cuma ~2 dtk.
  - **Free tier Gemini dibatasi ±5 request/menit per model.** Untuk dipakai banyak user, aktifkan billing di Google AI Studio.
- `ANTHROPIC_API_KEY` → Claude (dipakai hanya kalau secret Gemini tidak ada).

Deploy ulang / ke project lain:
1. Bikin project di [supabase.com](https://supabase.com), install [Supabase CLI](https://supabase.com/docs/guides/cli).
2. Dari root repo:

```bash
supabase link --project-ref <project-ref>
```

```bash
supabase secrets set GEMINI_API_KEY=<api-key-kamu>
```

```bash
supabase functions deploy racikin-ai
```

3. Di app → **Setelan** → **AI Online** → buka "Server custom", isi URL `https://<project-ref>.supabase.co/functions/v1/racikin-ai` dan anon key (legacy JWT) project.

Opsional (secret di Supabase): `GEMINI_MODEL`, `RACIKIN_MODEL` (model Claude, default `claude-opus-5-5`), `RACIKIN_ALLOWED_ORIGIN` (default `*`, isi domain app kamu biar lebih aman).

## Struktur
```
index.html, manifest.webmanifest, sw.js, icons/
.nojekyll          wajib: tanpa ini GitHub Pages membuang js/views/_shared.js
css/app.css
js/app.js          router hash + event delegation
js/store.js        data lokal (localStorage)
js/cloud.js        login Supabase, sinkron data ke cloud, mode tim (undang/gabung/keluar)
js/merge.js        penggabungan otomatis data dari beberapa perangkat (3-way merge)
js/push.js         daftar/berhenti pengingat push di perangkat ini, preferensi, tes
js/ai.js           klien AI (online pakai token login / demo)
js/stok-utils.js   hitung HPP, porsi yang bisa dibuat, stok menipis
js/loyalty.js      program stempel, no. WA, link kartu, template pesan
js/pos.js          kasir: order -> kas harian gabungan, stok, stempel, batal, rekap, struk
js/online.js       harga & komisi per saluran online, saran markup, untung per porsi
js/studio/         theme.js (warna/font/ekspor PNG-SVG) + art.js (logo, mockup, spanduk, poster, dst.)
js/vendor/         supabase-js (UMD, disimpan lokal supaya jalan offline)
js/demo.js         generator Mode Demo (shape = schema di tasks.ts)
js/views/*.js      satu file per halaman
docs/PRD.md        Product Requirements Document
supabase/migrations/   user_data, ai_usage + consume_ai_quota, stamp_cards + get_stamp_card, mode tim (rev, team_members, team_invites, doc_get/doc_save)
supabase/functions/racikin-push/   pengingat terjadwal: index.ts (key/test/run), notif.ts (jadwal), webpush.ts (enkripsi + VAPID)
supabase/functions/racikin-ai/
  index.ts         endpoint (wajib login + kuota) → Gemini API / Claude API
  tasks.ts         prompt + JSON schema tiap task
```

## Hosting
Vercel (project terhubung ke repo ini, deploy otomatis dari `main`). Alternatif: GitHub Pages dari `main` / root (`.nojekyll` sudah ada).

## Nambah fitur AI baru
1. Tambah task di `supabase/functions/racikin-ai/tasks.ts` (instruction + schema).
2. Tambah generator dengan shape yang sama di `js/demo.js`.
3. Panggil `ai("nama_task", input)` dari view.
