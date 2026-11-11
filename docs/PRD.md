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

### Di luar MVP (fase berikutnya)
Foto produk AI (gambar), integrasi WhatsApp, perizinan (NIB/PIRT/Halal), monetisasi/langganan.

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
