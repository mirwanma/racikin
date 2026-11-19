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
- **Service worker** `sw.js`: naikkan `VERSION` (saat ini `racikin-v39`) di setiap rilis dan tambahkan file baru ke `SHELL`.
- **Desain "papan warung"**: kuning marigold `#FFC531`, ink `#1B1916`, paper `#F6EFDC`; font Archivo + IBM Plex Mono; token warna di `:root` + mode gelap. Layar ≥ 900px: rail navigasi kiri, halaman di `COLS` (app.js) dua kolom, Kasir dua panel.
- **Peran** (`js/cloud.js`): `owner`, `manajer`, `kasir` (hanya Kasir/Pelanggan/Stok; boleh menulis `bills`), `dapur` (hanya layar dapur). Rute dibatasi di `app.js` (`KASIR_ROUTES`, `DAPUR_ROUTES`), dan server juga membatasi.

## Supabase (project `racikin`, ref `ujdxslztjcufidhqpmcd`, ap-southeast-1)
- **Sinkron**: satu dokumen JSON per usaha (`user_data`, kolom `rev`), dibaca/ditulis lewat RPC `doc_get` / `doc_save` (optimistic locking) + **3-way merge** di klien (`js/merge.js`; field penghitung seperti `stok`, `stempel`, `delta` digabung sebagai selisih). Setelah merge, Kas & rekap kasir dihitung ulang dari order (`reconcile` di `js/pos.js`). Kasir tidak menerima & tidak bisa menulis bagian keuangan (`doc_kasir_hidden` / `doc_kasir_writable` di SQL).
- **Admin platform**: tabel `platform_admins` (diisi manual pemilik via SQL Editor) + fungsi `is_platform_admin` / `admin_merchants` / `admin_merchant_detail` / `admin_harian` untuk dashboard `#/admin` (read-only, `js/admin.js`). Akun admin otomatis masuk **mode admin** (`isAdminMode` di `js/views/admin.js`, `body[data-admin]`): menu Ringkasan / Merchant / Pertumbuhan / Akun, rute usaha dialihkan (`ADMIN_ROUTES` di app.js), bisa pindah ke app usaha dari Akun. Desain admin pakai token `--a-*` (gelap default lewat `prefers-color-scheme`, ada versi terang) dan kelas `a-*` di app.css. Jangan kirim kas/laba/data pelanggan merchant lewat fungsi admin.
- **Tabel lain**: `ai_usage`, `stamp_cards`, `team_members`, `team_invites`, `push_subscriptions`, `kitchen_tickets` (Realtime), `public_menu` (termasuk grup varian), `table_orders` (Realtime), Storage bucket `menu-foto`. Akses lewat RLS `team_role(owner_id)`; fungsi publik (anon) hanya untuk kartu stempel & pesan meja, dan harga **serta promo** dihitung di server (`meja_items`, `meja_promo`, `cek_promo_meja`; aturan promo di `public_menu.data.promoAturan` dari `aturanPromoMeja` di `js/promo.js`, harus tetap sama dengan `pilihPromo`).
- **Migrasi** di `supabase/migrations/` (urut timestamp). Terapkan lewat MCP Supabase `apply_migration`, lalu simpan file yang sama di repo.
- **Edge Functions** (`supabase/functions/`): `racikin-ai` (Gemini teks + foto untuk task ber-`gambar: true` seperti `parse_menu`/`parse_bahan`, fallback Claude; prompt & schema di `tasks.ts`), `racikin-push` (Web Push buatan sendiri + pg_cron 15 menit, `verify_jwt=false`), `racikin-foto` (edit foto Gemini, kuota terpisah). Deploy lewat MCP `deploy_edge_function` dengan **semua file** fungsi.
- Secret yang dipakai: `GEMINI_API_KEY` (wajib). Opsional: `GEMINI_MODEL`, `GEMINI_IMAGE_MODEL`, `RACIKIN_LIMIT_*`, `RACIKIN_FOTO_PER_DAY`, `RACIKIN_ALLOWED_ORIGIN`.
- **Catatan**: model gambar Gemini butuh **billing aktif** di Google AI Studio (paket gratis → 429). Auth: "Confirm email" dimatikan dan SMTP Resend belum dipasang.

## Tes
Lihat `tests/README.md`. Unit: `cd tests && npm run unit`. E2E: jalankan `python3 -m http.server 8766` di root lalu `node tests/e2e/<nama>.js <folder-screenshot>`. Tes yang butuh akun memakai akun `*@racikin.test`, dengan password lewat variabel lingkungan. Kosongkan data akun tes sebelum menjalankan tes cloud. Sebelum PR: jalankan unit test + E2E yang relevan + regresi `mvp.js`, `kasir.js`, `dummy.js`.

## Paket Gratis & Pro
Server yang menentukan paket (`paket_info` / `paket_saya`, tabel `langganan` & `platform_setting`): Pro berbayar → masa transisi (akun lama s/d 20 Feb 2027) → masa coba 14 hari → Gratis. Server mengunci kuota AI (20 vs 300/hari), AI foto, tim (`team_role`, `create_invite`, `join_team`) & pesan meja (`meja_dari_token`). Di app: `bolehPro()` (`js/paket.js`, tanpa akun = boleh dicoba) + `kunciPro(fitur)` (`js/views/paket.js`). Fitur Pro baru: tambahkan ke `FITUR_PRO` dan kunci di server kalau datanya lewat server.

## Kasir: open bill & pembayaran campuran
Open bill opsional (`posSetting.openBill`, `js/bill.js`, data `bills`): ronde memotong stok saat dikirim, uang masuk Kas hanya saat bill dilunasi (`buatOrder(..., { stok: false, bill })`); bayar sebagian lewat `keranjangPilih` + `bayarSebagian`, juga `gabungBill` / `pindahMeja`. Pembayaran campuran: `order.pembayaran` + `metode: "campur"`; semua hitungan per metode harus lewat `porsiMetode` (pos.js) / porsi di shift.js.

## Tahap usaha
`profile.tahap` = `ide` (default, alur dari ide) atau `jalan` (usaha sudah berjalan: langkah Beranda & halaman Bisnis beda, lihat `js/tahap.js`). Pindahan data usaha lama: `#/impor?jenis=menu|bahan` (teks/foto) + saldo kas awal (`kasAwal`, `js/impor.js`) + impor penjualan lama `#/impor-jual` (`js/imporjual.js`, rekap ber-`imporId`, Kas `ref: "impor"`). Cek kesehatan usaha: `#/sehat` (`js/sehat.js`). Panduan perizinan: `#/izin` (`js/izin.js`, isi panduan bertanggal `DICEK`, perbarui kalau aturan berubah). Fitur baru sebaiknya cocok untuk dua-duanya.

## Data contoh
`js/dummy.js` (tombol di Setelan / onboarding), profil tahap `jalan`: 15 menu (sebagian dengan varian: level pedas, topping, ukuran (Jumbo 1,5× porsi), tingkat manis (ada "Tanpa gula" yang menghilangkan gula)), 3 promo (happy hour, es teh weekend, voucher TAHGUY5), 25 bahan, ±2.000 order 60 hari, Kas, stok, 35 pelanggan, 5 supplier, shift 30 hari atas nama tim, 8 meja. Semua angka harus tetap konsisten: Kas = rekap kasir per hari, stok = total `stokLog`, stempel = total `stempelLog`. Data hari ini hanya sampai jam sekarang.

## Ide berikutnya (belum dikerjakan)
Payment gateway sungguhan untuk pesan meja (QRIS saat ini SIMULASI di `pay_table_order_dummy`); WhatsApp Business API resmi (integrasi wa.me sudah ada: `js/wa.js`, `#/wa`, order dari chat di Kasir); payment gateway untuk langganan Pro (pembayaran Pro saat ini manual lewat WA admin).
