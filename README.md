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
- **Akun & Cloud** (fase 2): daftar/masuk pakai email + password, data tersinkron otomatis antar perangkat, AI Online wajib login dengan kuota per user

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
js/vendor/         supabase-js (UMD, disimpan lokal supaya jalan offline)
js/demo.js         generator Mode Demo (shape = schema di tasks.ts)
js/views/*.js      satu file per halaman
docs/PRD.md        Product Requirements Document
supabase/migrations/   tabel user_data, ai_usage, fungsi consume_ai_quota
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
