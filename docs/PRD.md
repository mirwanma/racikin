# PRD — Racikin (MVP)

> **Racikin** — *"Racik ide jadi cuan."*
> Co-founder AI di saku buat yang mau mulai (atau lagi jalanin) usaha F&B.

Versi: 0.1 (MVP) · Status: Draft · Studi kasus pertama: TAHGUY (tahu guyur, Cimahi)

---

## 1. Masalah
Calon pengusaha F&B (terutama anak muda & UMKM rumahan) biasanya:
- Punya ide, tapi nggak tahu idenya layak atau nggak.
- Nggak punya RAB, modal sering bocor ke hal yang nggak penting.
- Bingung branding, bingung mulai dari sosmed atau GoFood dulu.
- Nggak nyatet keuangan → nggak tahu sebenarnya untung atau rugi.
- Posting sosmed angin-anginan, nggak ada jadwal.

Tools yang ada terpisah-pisah (Canva, Excel, aplikasi kasir, ChatGPT) dan semuanya generik.

## 2. Solusi
PWA berbasis AI yang menemani user dari **ide → modal → brand → launching → pembukuan → rutin harian**, di mana semua output AI dipersonalisasi dari **Profil Bisnis** user (jenis F&B, konsep jualan, lokasi, target pasar, modal, waktu, skill).

## 3. Target User (MVP)
- **Fokus: F&B saja** (makanan berat, jajanan, minuman/kopi, dessert, frozen food, katering).
- Persona utama: "Raka", 22–30 th, mau buka usaha kuliner pertama dengan modal Rp 3–30 jt, aktif di HP, sosmed-savvy, belum ngerti keuangan.
- Persona kedua: pemilik UMKM F&B yang sudah jalan tapi pembukuan & konten berantakan.

## 4. Gaya & Prinsip Produk
- Bahasa **santai ala anak muda** ("kamu", "gas", "cuan"), tapi tetap jujur & jelas.
- Mobile-first, bisa di-install (PWA), bisa dipakai offline untuk input kas.
- AI bantu, user tetap pegang kendali: semua hasil AI bisa diedit.
- Setiap layar ada aksi berikutnya yang jelas (guided journey).

## 5. Ruang Lingkup MVP

| # | Modul | Fitur MVP | Kriteria selesai |
|---|---|---|---|
| 0 | Profil Bisnis (onboarding) | Wizard singkat: ide, jenis F&B, konsep, lokasi, target pasar, modal, harga rencana, waktu, skill | Profil tersimpan & dipakai semua prompt AI; bisa diedit |
| 1 | Analisa Ide | Skor kelayakan 0–100, ringkasan, persona, SWOT, kompetitor, pembeda, estimasi harga/HPP/margin, risiko, langkah validasi | Hasil tersimpan, bisa dianalisa ulang |
| 2 | RAB & Modal | RAB AI per kategori (wajib/opsional), mode hemat, edit item, input **realisasi**, total vs modal, biaya bulanan, kalkulator **BEP** | Total rencana vs realisasi vs modal terlihat jelas |
| 3 | Brand Kit | Opsi nama, tagline, brand story, tone, palet warna, font, konsep logo, ide menu, ide kemasan; pilih & simpan brand aktif | Nama/tagline terpilih dipakai di modul lain |
| 4 | Aktivasi | Checklist per channel (IG, TikTok, Google Maps, WA Business, GoFood, GrabFood, ShopeeFood), rencana launching 4 minggu, deskripsi menu untuk ojol | Checklist bisa dicentang & progres tersimpan |
| 5 | Pembukuan (Kas) | Input manual, **input cepat teks bebas** ("jual 25 porsi @12rb, beli tahu 50rb") → AI jadi transaksi, laporan bulanan (masuk/keluar/laba, per kategori, grafik harian), insight AI, export CSV | Laporan bulan berjalan akurat dari data |
| 6 | Jadwal Konten | Kalender konten 14/30 hari (platform, pilar, format, ide, hook, caption, hashtag, jam), tandai selesai, tugas hari ini di Beranda, generator caption | User tahu "hari ini posting apa" |
| + | Mentor AI | Chat tanya apa saja, dengan konteks profil + ringkasan data | Jawaban menyebut konteks bisnis user |
| + | Beranda | Progres journey 6 langkah, ringkasan kas, tugas konten hari ini, aksi cepat | — |
| + | Setelan | Mode AI (Demo / Online), export/import data JSON, reset | — |

### Fase 2 (selesai)
- Login email + password (Supabase Auth), halaman Akun, lupa password.
- Sinkron data ke cloud antar perangkat (dokumen JSON per user, RLS), tetap offline-first, dialog saat konflik.
- AI Online wajib login + kuota per user (default 6/menit, 60/hari).

### Fase 3: Stok & Resep (selesai)
- Resep per menu dengan HPP/porsi & margin otomatis dari harga bahan; resep bisa disusun AI.
- Stok bahan: beli (otomatis ke Kas), opname, riwayat, peringatan menipis di Beranda.
- Catat penjualan per menu: stok berkurang sesuai resep + pemasukan masuk Kas.
- HPP resep dipakai di kalkulator BEP dan konteks Mentor AI.

### Fase 4: Pelanggan Setia (selesai)
- Kartu stempel digital per pelanggan, link dikirim via WhatsApp & dibuka tanpa login.
- Stempel otomatis dari Catat penjualan (dengan minimal belanja), tukar hadiah.
- Daftar "ajak balik" (≥ 21 hari tidak datang) + pesan WA terisi otomatis, template bisa ditulis AI.
- Metrik terkait: % pelanggan yang kembali dalam 30 hari (north star game TAHGUY).

### Fase 5: Studio Brand (selesai)
- Logo 4 gaya + materi visual otomatis dari brand kit: stiker kemasan, mockup kemasan & kantong, mockup booth, spanduk, papan menu, poster, feed & story.
- Unduh PNG resolusi cetak & SVG (font ter-embed); teks promosi bisa ditulis AI.

### Fase 6: Kasir / POS (selesai)
- Jual langsung dari daftar menu (resep): keranjang, diskon, pelanggan, metode bayar, kembalian, struk WA.
- Otomatis tersambung ke Kas (gabungan harian per metode), stok bahan, dan kartu stempel; batal order mengembalikan semuanya.
- Rekap harian: omzet, jumlah & rata-rata order, per metode, menu terlaris.

### Fase 7: Harga khusus order online (selesai)
- Komisi & markup per platform (GoFood, GrabFood, ShopeeFood), harga manual per menu, saran markup agar untung sama dengan di toko.
- Kasir memilih saluran; Kas mencatat penjualan kotor + komisi sebagai pengeluaran; rekap menampilkan bersih.

### Fase 8: Mode tim / karyawan (selesai)
- Pemilik mengundang karyawan pakai kode/link (peran Kasir atau Manajer), bisa ubah peran & mengeluarkan anggota.
- Kasir hanya melihat Kasir, Pelanggan & Stok; data keuangan & perencanaan tidak dikirim ke perangkatnya (dibatasi di server).
- Sinkron diganti jadi penggabungan otomatis per item + versi dokumen, jadi beberapa HP bisa jualan bersamaan tanpa data hilang.
- Order mencatat nama kasir; rekap harian per kasir.

### Fase 9: Pengingat & notifikasi (selesai)
- Push notification ke HP (Web Push): jadwal posting hari ini, bahan menipis, pelanggan perlu diajak balik (mingguan), rekap tutup kasir.
- Preferensi per perangkat (jenis & jam), mengikuti zona waktu perangkat; kasir hanya menerima stok & rekap.
- Dijadwalkan pg_cron tiap 15 menit; tanpa layanan pihak ketiga & tanpa secret tambahan.

### Fase 10: Shift & tutup kasir (selesai)
- Buka shift dengan modal laci, catat uang keluar/masuk laci, tutup shift dengan hitung uang fisik → selisih per shift & per kasir.
- Opsi wajib buka shift sebelum jualan; pemilik bisa menutup shift kasir lain.

### Fase 11: Laporan laba rugi (selesai)
- Laba rugi bulanan (pendapatan, HPP dari resep atau belanja, biaya, laba kotor/usaha/bersih, arus kas), pembanding periode yang sama bulan lalu.
- Grafik laba 6 bulan, menu paling untung/tipis, catatan otomatis, cetak PDF & CSV.

### Fase 12: Belanja & supplier (selesai)
- Daftar belanja otomatis dari pemakaian & stok, per supplier, kirim via WA, catat hasil belanja (stok, harga, Kas).
- Data supplier, riwayat harga bahan & dampak kenaikan harga ke HPP menu.

### Fase 13: Mode dapur (selesai)
- Opsional: pesanan Kasir (dengan nama/meja & catatan) tampil realtime di layar dapur Baru → Dimasak → Siap; kasir dapat kabar siap diambil.
- Peran tim Dapur (hanya layar dapur, tanpa data penjualan).

### Fase 14: Pesan lewat meja / QR (selesai, opsional)
- QR per meja → pelanggan pesan dari HP (menu, keranjang, checkout, bayar di kasir atau digital simulasi), status pesanan.
- Pesanan masuk realtime ke Kasir (terima/tolak), lanjut ke Kas, stok, shift & dapur. Harga dihitung server.
- Berikutnya: hubungkan pembayaran digital ke payment gateway sungguhan (mis. QRIS via Midtrans/Xendit) lewat webhook.

### Fase 15: Foto menu (selesai, opsional)
- Upload foto per menu, percantik otomatis (gratis) atau pakai AI (Gemini, butuh billing), bandingkan sebelum simpan.
- Foto tampil di Kasir, Stok & menu pelanggan QR meja.

### Fase 16: Varian & topping (selesai)
- Grup pilihan (pilih satu / banyak + maks, wajib/opsional) yang dipakai ulang di banyak menu; tiap pilihan punya harga tambahan, bahan tambahan, dan status habis.
- Terhubung ke Kasir (sheet pilihan), harga online, stok & batal order, struk/WA, tiket dapur, rekap harian, laporan laba rugi (HPP pilihan), dan pesan lewat meja (validasi & harga di server).
- Berikutnya (belum): pilihan yang mengganti bahan resep atau mengalikan porsi (ukuran L = 1,5×).

### Fase 17: Usaha yang sudah jalan, tahap A (selesai)
- Pilihan tahap di onboarding (baru ide / udah jalan), profil versi usaha berjalan (lama usaha, omzet, karyawan, saluran, masalah utama), langkah Beranda yang disesuaikan & diurutkan menurut masalah utama, halaman Bisnis versi "Usahamu", tawaran naik tahap setelah 14 hari jualan.
- Berikutnya: tahap C (lihat Fase 19).

### Fase 18: Usaha yang sudah jalan, tahap B (selesai)
- Input menu cepat & bahan/stok cepat dari teks atau foto (AI Online: task `parse_menu` / `parse_bahan` dengan foto; Mode Demo: parser lokal), layar cek sebelum simpan, menu/bahan yang sudah ada dicocokkan (update, tidak dobel).
- Saldo kas awal + saldo sekarang di Kas & Beranda; langkah Beranda "udah jalan" diperbarui.

### Fase 19: Usaha yang sudah jalan, tahap C bagian 1: Cek kesehatan usaha (selesai)
- Skor + 10 pemeriksaan dari data asli 30 hari (untung, menu rugi, resep, tren omzet, jam rame/sepi, online vs komisi, stok & susut, arus kas, pelanggan balik, selisih kasir), prioritas sesuai masalah utama, sambung ke Mentor AI.
- Bagian 2 (selesai, lihat Fase 20).

### Fase 20: Usaha yang sudah jalan, tahap C bagian 2: Impor penjualan lama (selesai)
- Impor CSV / tempel dari spreadsheet, kolom ditebak otomatis & bisa diubah, ringkasan sebelum simpan, hari yang sudah ada dilewati, Kas + komisi + menu baru opsional, bisa dibatalkan.

### Fase 21: Promo & voucher (selesai)
- Diskon order / diskon menu / beli X gratis Y, aturan tanggal-hari-jam-saluran, kode voucher + kuota, otomatis di Kasir (tidak numpuk), statistik per promo, laporan, info promo di menu QR.
- Berikutnya (belum): promo dihitung di server untuk pesan meja; kuota voucher per pelanggan; paket bundling.

### Fase 22: Integrasi WhatsApp lewat wa.me (selesai)
- Nomor WA usaha & pemilik, link & QR "Pesan via WA", daftar menu siap kirim, broadcast pelanggan per kelompok, order dari chat WA ke Kasir, rekap harian & tutup shift ke pemilik.
- Berikutnya (opsional): WhatsApp Business API resmi (kirim otomatis & pesan masuk) setelah ada akun Meta Business + monetisasi.

### Fase 23: Dashboard admin platform (selesai)
- `#/admin` read-only untuk manajemen Racikin: ringkasan platform, adopsi fitur, pendaftar, daftar & detail merchant (termasuk omzet & email pemilik), status berisiko berhenti, CSV. Akses lewat `platform_admins` + fungsi `admin_*` di server.
- Berikutnya (opsional): aksi admin (catatan/tag merchant, atur kuota AI per merchant, kirim pengumuman), metrik retensi kohort.

### Fase 24: Panduan perizinan (selesai)
- `#/izin`: NIB, PIRT, halal, SLHS, merek. Rekomendasi per jenis usaha & menu, langkah, dokumen, link resmi, status & nomor izin, masa berlaku + pengingat di Beranda, konteks Mentor AI. Tanpa server baru (data di dokumen usaha).
- Berikutnya (opsional): panduan per daerah, pengingat push untuk izin yang mau habis.

### Fase 25: Varian yang mengubah resep (selesai)
- Pilihan varian bisa mengalikan porsi resep (Jumbo 1,5×, bahan kemasan tidak ikut dikali) dan mengganti / menghilangkan bahan resep (susu oat, tanpa gula). Stok, HPP per menu, rekap `opsiMenu`, laporan & cek kesehatan ikut. Data contoh: Es Teh Jumbo 1,5× porsi, pilihan "Tanpa gula".
- Tanpa perubahan server (harga tetap dari harga tambahan; pesan meja ikut otomatis).

### Fase 26: Mode admin platform (selesai)
- Akun admin langsung masuk mode admin dengan menu sendiri: Ringkasan, Merchant, Pertumbuhan, Akun. Menu usaha disembunyikan & dialihkan, profil usaha tidak wajib, bisa pindah ke app usaha & balik.
- Desain ulang "pusat kontrol" (gelap, ikut mode terang): periode 7/30/90 hari, grafik omzet & order harian, tabel merchant dengan grafik mini, "Perlu disapa". Migrasi `admin_desain`: `admin_harian` + `seri14`/`order90` di `admin_merchants`.

### Fase 27: Monetisasi tahap 1, langganan dengan aktivasi manual (rencana)
Tujuan: ngetes dulu apakah merchant mau bayar, **sebelum** bikin integrasi payment gateway. Bayar lewat QRIS/transfer manual, plan diaktifkan admin dari `#/admin`.

**Dari mana biaya muncul.** AI teks (Gemini, murah per request), AI foto (paling mahal, wajib billing), dan Supabase (sinkron, Realtime dapur & pesan meja, Storage foto, push), yang naik sesuai jumlah merchant aktif. Mode lokal hampir tanpa biaya. Jadi yang dikunci adalah fitur cloud + AI, yang juga paling bernilai buat usaha yang sudah jalan.

**Paket (usulan, angka belum final):**

| | Gratis | Pro (±Rp49–59rb/bln) | Bisnis (±Rp129–149rb/bln) |
|---|---|---|---|
| Alur ide, RAB, resep/HPP, izin, cek kesehatan | ✓ | ✓ | ✓ |
| Kasir, Kas, stok, laporan dasar (1 perangkat, lokal) | ✓ | ✓ | ✓ |
| AI teks per hari | ~5 | ~30 | ~60 |
| AI foto per bulan | – (percantik otomatis) | ~20 | ~60 |
| Sinkron cloud & backup multi-perangkat | – | ✓ | ✓ |
| Tim (kasir/manajer) | – | 2 akun | tanpa batas |
| Kartu stempel, promo/voucher, impor penjualan | – | ✓ | ✓ |
| Layar dapur, pesan meja QR, push notif | – | – | ✓ |

- Trial otomatis saat daftar (14–30 hari, plan Bisnis) supaya sinkron & tim sempat dicoba.
- Bayar tahunan = 10 bulan dapat 12.
- Add-on kredit foto AI (misalnya 20 foto) untuk yang butuh sesekali.

**Prinsip:**
1. **Data tidak disandera.** Langganan habis → data lokal tetap bisa dipakai penuh, data cloud jadi read-only & bisa diekspor. Tidak ada data yang dihapus otomatis.
2. **Batas dicek di server.** UI cuma menyembunyikan/menandai fitur; kuota AI/foto dicek di Edge Function, akses tim/dapur/meja dicek lewat RLS/fungsi SQL sesuai plan.
3. **Tahap `ide` tetap terasa gratis & berguna** (corong masuk). Monetisasi baru kena saat usaha `jalan` dan butuh fitur cloud/tim.

**Yang dikerjakan di tahap 1:**
- Tabel `subscriptions` (per `owner_id`: `plan` gratis/pro/bisnis, `berlaku_sampai`, `sumber` trial/manual, `catatan`) + fungsi `my_plan()` yang mengembalikan plan efektif (lewat tanggal → gratis). Anggota tim ikut plan pemiliknya.
- Batas per plan di satu tempat (tabel/konstanta server), dipakai `racikin-ai` & `racikin-foto` untuk kuota, serta `doc_save`, `team_invites`, `kitchen_tickets`, `table_orders` untuk gating.
- Halaman **Paket** di app (`#/paket`): plan sekarang, sisa hari, sisa kuota AI, perbandingan paket, cara bayar (QRIS statis + nomor rekening + tombol WA konfirmasi ke admin dengan ID usaha terisi otomatis).
- Penanda "Pro"/"Bisnis" di menu/fitur yang terkunci + layar ajakan upgrade yang sopan (bukan pop-up mengganggu). Pengingat di Beranda 7 & 1 hari sebelum habis.
- **Admin**: di detail merchant ada aksi set plan + tanggal berlaku + catatan pembayaran (fungsi `admin_set_plan`, hanya `platform_admins`, tercatat di log). Ringkasan admin menampilkan jumlah merchant per plan, trial yang mau habis, dan perkiraan pendapatan bulanan.
- Migrasi merchant lama: dapat masa grace (misalnya plan Bisnis 2–3 bulan) sebelum aturan baru berlaku.

**Keputusan terbuka:** sasaran utama yang bayar (usaha `jalan` vs pemula `ide`), harga final, lama trial & grace merchant lama.

**Tahap berikutnya:** payment gateway (Midtrans/Xendit/Tripay) + webhook ke Edge Function untuk perpanjang otomatis. Gateway yang sama dipakai untuk QRIS pesan meja sungguhan (ganti `pay_table_order_dummy`). Opsional: fee kecil per transaksi pesan meja.

### Di luar MVP (fase berikutnya)
Payment gateway sungguhan (monetisasi tahap 2), WhatsApp Business API resmi.

## 6. Arsitektur MVP
- **Frontend**: PWA statis (HTML + CSS + JS modules, tanpa build) di root repo ini, di-host di GitHub Pages. Data disimpan di `localStorage` (offline-first).
- **AI**: Supabase Edge Function `racikin-ai` → Google Gemini API (Claude sebagai cadangan). Prompt & JSON schema tiap task disimpan **di server** (`supabase/functions/racikin-ai/tasks.ts`); klien cuma kirim `{task, profile, input}`. Output pakai *structured outputs* biar selalu JSON valid.
- **Mode Demo**: tanpa backend, app tetap jalan pakai generator template lokal (buat coba-coba & demo ke orang).

### Kontrak task AI
`analyze_idea`, `generate_rab`, `generate_brand`, `activation_plan`, `content_calendar`, `caption`, `parse_transactions`, `cashflow_insight`, `mentor_chat` — shape output didefinisikan di `tasks.ts` dan wajib sama dengan generator demo di `js/demo.js`.

## 7. Metrik Sukses (MVP)
- ≥ 70% user yang mulai onboarding menyelesaikan Profil Bisnis.
- ≥ 50% user menjalankan minimal 3 modul AI.
- User aktif mencatat kas ≥ 3 hari/minggu (north star: **kebiasaan nyatet**).
- ≥ 40% item konten terjadwal ditandai selesai.

## 8. Risiko & Catatan
- Biaya API AI → batasi per task (max tokens, effort) + kuota per user (fase 2 ✅).
- Endpoint AI publik bisa disalahgunakan → task whitelist di server + wajib login & rate limit per user (fase 2 ✅).
- Data di `localStorage` bisa hilang kalau browser dibersihkan → export/import + sync cloud untuk user yang login (fase 2 ✅).
- Sinkron per dokumen: kalau dua perangkat mengubah data saat offline, salah satu versi harus dipilih (belum merge per item).
- Email konfirmasi/reset butuh Custom SMTP untuk user umum (batas server email bawaan Supabase).
- Angka estimasi AI (harga, RAB) bukan nasihat keuangan → tampilkan disclaimer.
