# CLAUDE.md — konteks proyek Racikin

Racikin ("Racik ide jadi cuan") = PWA co-founder AI untuk usaha F&B kecil di Indonesia. Pemilik: mirwanma. Live: https://racikin.vercel.app (deploy otomatis dari `main` lewat Vercel). Detail fitur ada di `README.md`, rencana & riwayat fase di `docs/PRD.md`.

## Cara kerja dengan pemilik proyek
- Bahasa: **Indonesia santai** (pengguna & pemilik). Teks UI juga santai ala anak muda, **tanpa emoji** (ikon garis dari `js/icons.js` → `icon(nama, ukuran)`).
- Alur: satu fitur = satu branch `claude/<nama>` dari `main` terbaru → commit → push → **PR** (pemilik me-review & merge sendiri). Setelah merge, lanjut fitur berikutnya dari `main` terbaru.
- Fitur yang tidak dipakai semua usaha (dapur, pesan meja, foto) harus **opsional** (default nonaktif, toggle oleh pemilik/manajer).
- Jangan simpan secret/password di repo. Secret Supabase diisi pemilik di dashboard.

## Arsitektur
- **Frontend tanpa build**: vanilla ES modules, router hash (`js/app.js`), event delegation `data-action` (click) / `data-change` / `data-form`. View = objek `{ render(s), after(root), actions, changes, forms }` yang mengembalikan template string.
- **State**: satu objek di `localStorage` (`racikin:v1`, `js/store.js`). `store.set(patch)` → render ulang. `DEFAULT` di store.js = daftar semua key.
- **Service worker** `sw.js`: naikkan `VERSION` (saat ini `racikin-v24`) di setiap rilis dan tambahkan file baru ke `SHELL`.
- **Desain "papan warung"**: kuning marigold `#FFC531`, ink `#1B1916`, paper `#F6EFDC`; font Archivo + IBM Plex Mono; token warna di `:root` + mode gelap. Layar ≥ 900px: rail navigasi kiri, halaman di `COLS` (app.js) dua kolom, Kasir dua panel.
- **Peran** (`js/cloud.js`): `owner`, `manajer`, `kasir` (hanya Kasir/Pelanggan/Stok), `dapur` (hanya layar dapur). Rute dibatasi di `app.js` (`KASIR_ROUTES`, `DAPUR_ROUTES`), dan server juga membatasi.

## Supabase (project `racikin`, ref `ujdxslztjcufidhqpmcd`, ap-southeast-1)
- **Sinkron**: satu dokumen JSON per usaha (`user_data`, kolom `rev`), dibaca/ditulis lewat RPC `doc_get` / `doc_save` (optimistic locking) + **3-way merge** di klien (`js/merge.js`; field penghitung seperti `stok`, `stempel`, `delta` digabung sebagai selisih). Setelah merge, Kas & rekap kasir dihitung ulang dari order (`reconcile` di `js/pos.js`). Kasir tidak menerima & tidak bisa menulis bagian keuangan (`doc_kasir_hidden` / `doc_kasir_writable` di SQL).
- **Tabel lain**: `ai_usage`, `stamp_cards`, `team_members`, `team_invites`, `push_subscriptions`, `kitchen_tickets` (Realtime), `public_menu` (termasuk grup varian), `table_orders` (Realtime), Storage bucket `menu-foto`. Akses lewat RLS `team_role(owner_id)`; fungsi publik (anon) hanya untuk kartu stempel & pesan meja, dan harga dihitung di server.
- **Migrasi** di `supabase/migrations/` (urut timestamp). Terapkan lewat MCP Supabase `apply_migration`, lalu simpan file yang sama di repo.
- **Edge Functions** (`supabase/functions/`): `racikin-ai` (Gemini teks, fallback Claude; prompt & schema di `tasks.ts`), `racikin-push` (Web Push buatan sendiri + pg_cron 15 menit, `verify_jwt=false`), `racikin-foto` (edit foto Gemini, kuota terpisah). Deploy lewat MCP `deploy_edge_function` dengan **semua file** fungsi.
- Secret yang dipakai: `GEMINI_API_KEY` (wajib). Opsional: `GEMINI_MODEL`, `GEMINI_IMAGE_MODEL`, `RACIKIN_LIMIT_*`, `RACIKIN_FOTO_PER_DAY`, `RACIKIN_ALLOWED_ORIGIN`.
- **Catatan**: model gambar Gemini butuh **billing aktif** di Google AI Studio (paket gratis → 429). Auth: "Confirm email" dimatikan dan SMTP Resend belum dipasang.

## Tes
Lihat `tests/README.md`. Unit: `cd tests && npm run unit`. E2E: jalankan `python3 -m http.server 8766` di root lalu `node tests/e2e/<nama>.js <folder-screenshot>`. Tes yang butuh akun memakai akun `*@racikin.test`, dengan password lewat variabel lingkungan. Kosongkan data akun tes sebelum menjalankan tes cloud. Sebelum PR: jalankan unit test + E2E yang relevan + regresi `mvp.js`, `kasir.js`, `dummy.js`.

## Data contoh
`js/dummy.js` (tombol di Setelan / onboarding): 15 menu (sebagian dengan varian: level pedas, topping, ukuran, tingkat manis), 25 bahan, ±2.000 order 60 hari, Kas, stok, 35 pelanggan, 5 supplier, shift 30 hari atas nama tim, 8 meja. Semua angka harus tetap konsisten: Kas = rekap kasir per hari, stok = total `stokLog`, stempel = total `stempelLog`. Data hari ini hanya sampai jam sekarang.

## Ide berikutnya (belum dikerjakan)
Promo & voucher; varian yang mengganti bahan / mengalikan porsi; payment gateway sungguhan untuk pesan meja (QRIS saat ini SIMULASI di `pay_table_order_dummy`); panduan perizinan (NIB/PIRT/Halal); integrasi WhatsApp; monetisasi.
