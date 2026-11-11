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

## Pelanggan setia & kartu stempel
- Halaman `#/pelanggan`: atur program (target stempel, hadiah, min. belanja), tambah pelanggan (nama + no. WA), **+1 Stempel**, **Tukar hadiah**, koreksi, hapus.
- **Kartu publik** `#/kartu/<token>`: dibuka pelanggan tanpa login & tanpa tab bar, memakai warna brand kit kalau ada. Isinya cuma nama panggilan, stempel, target & hadiah (no. WA tidak pernah dipublikasikan).
  - Salinan kartu disimpan di tabel `public.stamp_cards` (RLS: hanya pemilik yang bisa menulis/membaca) dan dibaca publik lewat fungsi `get_stamp_card(token)`; token = UUID acak. Kartu di-upload otomatis tiap stempel berubah (antre saat offline). Butuh login.
- **Catat penjualan** di Stok bisa memilih pelanggan → +1 stempel kalau total ≥ minimal belanja.
- **Ajak balik**: pelanggan yang ≥ 21 hari belum datang, tombol "Kirim WA" berisi pesan terisi otomatis. Template bisa diedit atau ditulis AI (task `winback_template`). Kode: `{nama} {stempel} {sisa} {target} {hadiah} {bisnis} {hari} {link}`; kode lain dibuang otomatis.

## Akun & sinkron cloud
- **Auth**: Supabase Auth (email + password, alur PKCE). Halaman `#/akun`: masuk, daftar, lupa password, keluar.
- **Data**: satu dokumen JSON per user di tabel `public.user_data` (RLS: user hanya bisa baca/tulis miliknya). Setelan per perangkat tidak ikut disinkron.
- **Sinkron**: perubahan lokal di-upload otomatis (±1,5 dtk). Saat app dibuka, tab aktif lagi, atau online lagi, versi cloud diambil. Kalau dua perangkat mengubah data bersamaan, user ditanya mau pakai data cloud atau data perangkat ini (seluruh dokumen, bukan per item).
- **Offline**: app tetap jalan tanpa internet; perubahan dikirim saat online lagi.
- **Kuota AI**: tabel `public.ai_usage` + fungsi `consume_ai_quota` (hanya service role). Default 6 permintaan/menit & 60/hari per user, ubah lewat secret `RACIKIN_LIMIT_MINUTE` / `RACIKIN_LIMIT_DAY`.
- Migrasi database ada di `supabase/migrations/`.

### Setting Supabase Auth yang wajib
1. **Authentication → URL Configuration**: Site URL = `https://racikin.vercel.app`, tambahkan juga ke Redirect URLs (link konfirmasi & reset password kembali ke sini).
2. **Email**: server email bawaan Supabase hanya mengirim ke anggota tim project (maks. 2 email/jam). Untuk user umum pilih salah satu:
   - Pasang **Custom SMTP** (Authentication → Emails → SMTP Settings), mis. Resend/Brevo, **atau**
   - Matikan **Confirm email** (Authentication → Sign In / Providers → Email) supaya daftar langsung bisa masuk. Catatan: fitur *lupa password* tetap butuh SMTP.

## Desain: "papan warung"
- **Warna**: kuning marigold `#FFC531` (utama) + hitam tinta `#1B1916` di atas kertas krem `#F6EFDC`. Aksen hemat: merah cabai (minus/peringatan) & hijau daun (untung/selesai). Mode gelap otomatis.
- **Font**: Archivo (judul pakai versi lebar/expanded, kesan papan nama) + IBM Plex Mono untuk label & angka kecil (kesan struk).
- **Bentuk**: garis tinta tegas, sudut kecil, tanpa bayangan blur; tombol utama kuning dengan bayangan padat.
- **Ikon**: set ikon garis sendiri di `js/icons.js` (tanpa emoji di UI). Token warna ada di atas `css/app.css`.

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
js/cloud.js        login Supabase + sinkron data ke cloud
js/ai.js           klien AI (online pakai token login / demo)
js/stok-utils.js   hitung HPP, porsi yang bisa dibuat, stok menipis
js/loyalty.js      program stempel, no. WA, link kartu, template pesan
js/vendor/         supabase-js (UMD, disimpan lokal supaya jalan offline)
js/demo.js         generator Mode Demo (shape = schema di tasks.ts)
js/views/*.js      satu file per halaman
docs/PRD.md        Product Requirements Document
supabase/migrations/   user_data, ai_usage + consume_ai_quota, stamp_cards + get_stamp_card
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
