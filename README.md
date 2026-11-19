# Racikin — Racik ide jadi cuan 🍜

PWA co-founder AI buat usaha F&B. Spesifikasi lengkap ada di [`docs/PRD.md`](docs/PRD.md).

**Live:** https://racikin.vercel.app (auto-deploy dari `main` via Vercel)

## Fitur MVP
- **Profil Bisnis**: onboarding yang jadi konteks semua AI (ada tombol "Isi contoh TAHGUY"). Dua pintu masuk: **Baru ide / mau mulai** atau **Udah jalan** (lihat "Tahap usaha")
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
- **Kasir / POS** (fase 6): jual dari daftar menu (resep), keranjang, diskon, pelanggan (stempel), bayar Tunai/QRIS/Transfer + kembalian, pesanan GoFood/GrabFood/ShopeeFood, struk via WA, rekap hari ini, batal order — otomatis ke Kas, stok & kartu stempel
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

## Tahap usaha (baru ide vs udah jalan)
- Pertanyaan pertama di Profil: **Baru ide / mau mulai** atau **Udah jalan** (`profile.tahap`: `ide` / `jalan`; profil lama tanpa field ini = `ide`).
- **Udah jalan** mengganti isian ide & modal dengan: cerita usaha, nama usaha (wajib), sudah jalan berapa lama, omzet rata-rata/hari, jumlah karyawan, harga rata-rata, saluran jualan, dan **maks. 2 masalah utama** (untung tipis, catatan berantakan, stok bocor, kontrol karyawan, pembeli sepi, harga online, atau **Lainnya** yang memunculkan kolom isian sendiri; ikut jadi konteks AI & tampil di baris Fokus Beranda).
- **Beranda** ("Beresin usahamu"): Masukin menu & resep → stok awal → Kasir → (harga online kalau jualan di ojol) → (ajak tim kalau ada karyawan) → (kartu stempel & konten kalau pembeli sepi) → seminggu jualan, cek untung. Langkah yang terkait masalah utama didahulukan; menu selalu pertama.
- **Halaman Bisnis** jadi "Usahamu": operasional dulu, modul perencanaan pindah ke **Alat pengembangan** (cek ulang konsep, rencana renovasi/cabang, rebranding, checklist online, Studio Brand).
- Usaha tahap ide yang sudah **14 hari jualan** di Kasir ditawari pindah ke tampilan "udah jalan" (bisa "Nanti aja"). Isian "udah jalan" tetap disimpan kalau pindah balik ke tahap ide.
- Data contoh TAHGUY = usaha udah jalan (fokus: untung & stok). Logika di `js/tahap.js`.

### Panduan perizinan
- Halaman `#/izin` (modul di Bisnis untuk dua tahap usaha): NIB, PIRT (SPP-IRT), sertifikat halal, SLHS, pendaftaran merek. Tiap izin: label **Wajib / Disarankan / Opsional / Belum perlu** + alasannya (dari jenis usaha, konsep & menu di profil, misal PIRT baru perlu untuk produk kemasan, menu daging → catatan halal reguler), biaya, lama, masa berlaku, langkah, checklist dokumen, tombol ke situs resmi (oss.go.id, ptsp.halal.go.id, merek.dgip.go.id).
- Catat status (Belum / Lagi diurus / Sudah punya), nomor izin, tanggal terbit & berlaku. Masa berlaku dihitung otomatis (PIRT 5 tahun, SLHS 3 tahun, merek 10 tahun) → pengingat di Beranda kalau tinggal ≤ 90 hari atau sudah habis. Status izin ikut jadi konteks Mentor AI (`#/mentor?tanya=izin`). Logika di `js/izin.js`, data di `izin`.
- Isinya panduan umum (terakhir dicek Nov 2026, `DICEK` di `js/izin.js`): perbarui kalau aturan berubah (misal batas wajib halal UMK sekarang 17 Okt 2028).

### Cek kesehatan usaha (tahap C, bagian 1)
- Halaman `#/sehat` (kartu di Beranda untuk usaha udah jalan / yang sudah 7 hari jualan, modul paling atas di "Usahamu"). Skor 0–100 + label (Sehat / Lumayan, ada PR / Perlu perhatian) dari data asli **30 hari terakhir**, tanpa AI.
- Pemeriksaan: untung kotor (HPP % dari harga, termasuk varian), menu rugi / margin < 30%, kelengkapan resep, tren omzet (2 minggu vs 2 minggu sebelumnya, Kasir + penjualan manual), jam rame & sepi (info), order online vs komisi (markup di bawah saran), stok (menipis, belum diisi, susut dari hitung fisik di luar "stok awal"), arus kas, pelanggan lama nggak balik, selisih kas shift kasir.
- Tiap pemeriksaan: status (Bagus / Waspada / Bahaya / Belum ada data / Info), angka, penjelasan, saran konkret, dan link ke halaman terkait. Skor = rata-rata yang punya data (bagus 100, waspada 60, bahaya 20).
- **Beresin dulu**: 3 prioritas teratas (bahaya dulu, lalu waspada; yang terkait masalah utama di profil didahulukan) + tombol **Diskusiin sama Mentor AI** (pertanyaan otomatis; ringkasan kesehatan selalu ikut jadi konteks Mentor). Logika di `js/sehat.js`.

### Impor penjualan lama (tahap C, bagian 2)
- Halaman `#/impor-jual` (modul di Bisnis, link di Kas, Laporan kosong & cek kesehatan "Tren omzet"). Sumber: **file CSV** (Excel: Save As CSV, aplikasi kasir lain, laporan GoFood/Grab) atau **copy tabel dari Excel / Google Sheets lalu tempel** (tanpa library Excel). Ada contoh format CSV yang bisa diunduh.
- Langkah: baca tabel (pemisah koma/titik koma/tab, tanda kutip) → **cocokkan kolom** (ditebak otomatis: tanggal, menu, qty, harga, total, saluran, no. order; Indonesia & Inggris; tanggal d/m/y, m/d/y, ISO, "1 Okt 2026") → **ringkasan** (hari, omzet, porsi, per saluran, menu terlaris, baris gagal) → simpan.
- Disimpan sebagai rekap harian (`posHarian`, ditandai `imporId`) + opsional pemasukan Penjualan di Kas per hari per saluran (`ref: "impor"`) + opsional komisi ojol + opsional menu baru (harga rata-rata, tanpa resep). Nama menu dicocokkan dengan menu yang ada.
- Pengaman: hari yang **sudah punya catatan penjualan** (Kasir, impor sebelumnya, atau Penjualan manual di Kas) dan hari ini dilewati; stok tidak dikurangi; tiap impor bisa **dibatalkan** dari Riwayat impor (`imporJual`). Logika di `js/imporjual.js`.
- Cek kesehatan: tren omzet dihitung sampai kemarin (hari ini belum selesai) dan penjualan impor tidak dihitung dobel.

### Pindahan data (tahap B)
- **Masukin menu cepat** (`#/impor?jenis=menu`): tempel daftar menu (catatan/WA) atau **foto papan menu / buku menu / screenshot GoFood** → dirapihin jadi nama + harga + kategori (+ catatan varian). Layar cek dulu: benerin nama/harga, centang yang disimpan; menu yang sudah ada ditandai (update harga / lewati). Menu baru langsung bisa dijual di Kasir; resep & HPP dilengkapi belakangan.
- **Bahan & stok cepat** (`#/impor?jenis=bahan`): tulis daftar bahan (cth "cabai rawit 1 kg 80rb", "tahu 200 pcs @600") atau **foto nota belanja / catatan stok** → nama, stok, satuan (kg → gram, liter → ml, tray → butir, dst.), harga per satuan. Stok dicatat sebagai hitung fisik (opname) sehingga stok = total riwayat stok.
- **Saldo kas awal** (kartu Saldo kas di `#/kas`): uang usaha yang ada (laci + rekening) per tanggal tertentu → saldo sekarang = saldo awal + masuk − keluar sejak itu (tampil juga di Beranda). `kasAwal` disembunyikan dari akun kasir.
- Mode Demo membaca teks pakai parser lokal (`js/impor.js`); **foto butuh AI Online** (task `parse_menu` / `parse_bahan` di `racikin-ai`, foto dikecilkan ke maks 1600 px & dikirim sebagai `input.gambar`, maks ±1,6 MB, 1 kuota AI).
- Beranda "udah jalan": Masukin daftar menu → Isi bahan & stok awal → Isi saldo kas awal → Kasir → … (masalah "catatan berantakan" mendahulukan saldo & Kasir).

## Varian & topping
- Tab **Varian** di Stok & Resep (`#/stok?tab=varian`), editor `#/varian?id=…` (ada contoh cepat: level pedas, topping, ukuran, tingkat manis).
- **Grup pilihan** dipakai ulang di banyak menu: nama, cara milih (**pilih satu** / **boleh lebih dari 1** + maksimal), wajib/opsional. Tiap pilihan punya **harga tambahan**, **bahan tambahan per porsi** (buat HPP & stok), dan tanda **lagi habis**. Grup dipasang ke menu dari editor varian atau dari editor resep.
- **Ubah resep dasar** (per pilihan, opsional): **porsi resep ×** (cth Jumbo 1,5×; bahan kemasan seperti cup/sendok bisa dicentang "nggak ikut dikali", ditebak otomatis dari nama bahan) dan **ganti bahan resep** (cth susu sapi → susu oat, atau gula → dihilangkan buat "tanpa gula"; jumlah ngikut resep). Stok berkurang sesuai bahan sesungguhnya; editor nampilin selisih HPP per menu (bisa minus). Pilihan otomatis "habis" kalau bahan penggantinya stoknya 0.
- **Kasir**: menu yang punya varian membuka sheet pilihan (aturan wajib/maks dicek, harga ter-update langsung). Menu sama dengan pilihan beda = baris keranjang beda. Struk, riwayat order, WA struk & tiket dapur menampilkan pilihannya.
- **Harga online**: tambahan harga ikut markup saluran (GoFood dkk), dibulatkan ke atas.
- **Stok**: yang dipotong bahan resep + bahan pilihan; batal order mengembalikan semuanya. Pilihan otomatis "habis" kalau stok bahannya (yang sudah diisi) kurang dari 1 porsi.
- **Rekap & laporan**: `posHarian[tgl].opsi` = porsi per pilihan, `opsiMenu` = porsi per pilihan per menu (HPP porsi/ganti bahan beda tiap menu; rekap lama tanpa `opsiMenu` dihitung dari bahan tambahan saja); tab Hari ini menampilkan varian terlaris, laporan laba rugi menghitung HPP tambahan pilihan & untung per pilihan.
- **Pesan meja**: pelanggan juga memilih varian; server mengecek pilihan & menghitung harga (`place_table_order`).
- Batasan: pilihan hanya **menambah** harga/bahan (belum bisa mengganti bahan atau mengalikan resep). Data `opsi` + `resep[].opsiIds`, logika di `js/varian.js`.

## Dashboard admin platform (manajemen Racikin)
- **Mode admin**: akun yang terdaftar di `platform_admins` otomatis masuk mode admin begitu login. Menu usaha (Beranda, Kasir, Kas, Konten, Bisnis) disembunyikan dan diganti menu admin: **Ringkasan** (`#/admin`: angka utama + "Perlu disapa" (merchant berisiko berhenti), "Paling rame 30 hari", "Pendaftar terbaru"; klik untuk buka detail), **Merchant** (`#/admin?tab=merchant`: cari/saring/urut, detail, CSV), **Pertumbuhan** (`#/admin?tab=tren`: pendaftar per minggu, adopsi fitur, sebaran, transaksi), **Akun**. Rute usaha dialihkan ke dashboard, profil usaha tidak wajib. Status admin diingat di perangkat (`racikin:admin`) biar menu nggak kedip, tapi tetap dicek ulang ke server. **Read-only.**
- **Desain "pusat kontrol"**: sidebar sendiri (Racikin · Admin platform, badge jumlah merchant yang perlu disapa), tema gelap ala Linear/Vercel dengan aksen marigold, otomatis versi terang kalau HP/laptop pakai mode terang. Pilihan periode **7 / 30 / 90 hari** (dibanding periode sebelumnya), kartu omzet besar + grafik, kotak angka (merchant, aktif 7 hari, berisiko, pemakaian AI), tabel merchant dengan grafik mini order 14 hari, "Perlu disapa" (berisiko berhenti, pendaftar baru yang menunya kosong, order turun ≥30%), adopsi fitur. Data harian platform dari RPC `admin_harian(p_hari, p_tes)` (tanpa akun tes kecuali dicentang).
- Admin yang juga punya usaha: Akun → **Buka app usaha** (`racikin:mode-usaha`), balik lewat link "Dashboard Admin" di Akun.
- Akses dicek di server: tabel `platform_admins` (RLS tanpa policy = tertutup dari klien) + fungsi `is_platform_admin()`, `admin_merchants()`, `admin_merchant_detail(uuid)` (security definer, menolak akun non-admin). Admin hanya menerima ringkasan: profil usaha, email pemilik, jumlah menu/bahan/pelanggan, order & omzet dari rekap kasir, fitur yang dipakai, tim, pemakaian AI. **Kas, laba, data & nomor WA pelanggan merchant tidak dikirim.**
- **Mendaftarkan admin** (sekali, oleh pemilik proyek di Supabase → SQL Editor; ganti emailnya):
  ```sql
  insert into public.platform_admins (user_id)
  select id from auth.users where email = 'email-admin@contoh.com';
  ```
  Mencabut: `delete from public.platform_admins where user_id = (select id from auth.users where email = '...');`
- Isi: KPI (merchant, aktif 7/30 hari, baru, berisiko berhenti, order & omzet 30 hari vs 30 hari sebelumnya, pemakaian AI, pesanan meja), adopsi 12 fitur, pendaftar per minggu (8 minggu), tahap/status/kota/jenis usaha, daftar merchant (cari nama/email/kota, filter status & tahap, urut terakhir aktif/omzet/order/terbaru/skor/nama), detail merchant (grafik order 60 hari, omzet 7/30 hari, rata-rata per order, menu terlaris, tim per peran, AI per task, fitur), export CSV. Akun tes `@racikin.test` disembunyikan default.
- Status merchant: **Aktif** (jualan ≤ 7 hari), **Berisiko berhenti** (pernah jualan, sepi > 14 hari), **Baru** (daftar ≤ 14 hari), **Belum jualan**. Skor aktivitas 0–100 = rutin jualan + fitur dipakai + tren. Logika di `js/admin.js`.

## WhatsApp (link wa.me)
- Semua lewat link `wa.me`: gratis, tanpa akun API. Pesan dibuka di WhatsApp HP, pengguna sendiri yang menekan kirim (WhatsApp biasa tidak bisa kirim massal / menerima pesan otomatis; itu butuh WhatsApp Business API resmi = tahap lanjutan).
- Halaman **WhatsApp** (`#/wa`, modul di Bisnis):
  - **Nomor WA usaha** (dipakai link pesan; fallback ke nomor di Studio Brand) & **nomor WA pemilik** (tujuan laporan). Disimpan di key `wa`.
  - **Link & QR "Pesan via WA"**: chat ke nomor usaha dengan format pesanan (nama, jam ambil). Salin link / unduh QR (SVG) untuk brosur, bio IG, stiker meja.
  - **Daftar menu siap kirim**: nama + harga toko + grup varian + promo hari ini (tanpa kode voucher) + jam/alamat + link pesan. Salin atau buka di WA (chat / Status).
  - **Broadcast ke pelanggan** (kartu stempel): kelompok semua / lama nggak balik / stempel hampir penuh / hadiah siap / pelanggan baru 30 hari, pesan dengan kode {nama} {stempel} {sisa} {hadiah} {link} (bawaan: promo hari ini), tombol Kirim per pelanggan + tanda "terkirim" & progres harian (di HP ini).
- **Kasir → Order dari chat WA**: tempel chat pelanggan → menu & jumlah dicocokkan otomatis (kata khas menu, "2x", "dua", abaikan "jam 5"/harga; kata asing tidak ditebak), atas nama & catatan (pedas, ambil jam, tanpa …) kebaca, yang nggak kebaca ditampilkan; cek & ubah, lalu masuk keranjang (menu bervarian pakai pilihan default). Dibaca di HP (tanpa AI, jalan juga di Mode Demo).
- **Laporan ke pemilik**: tombol "Kirim rekap ke pemilik" di Kasir → Hari ini, dan "Kirim ke pemilik" di riwayat Shift (ringkasan tutup shift + selisih).
- Logika di `js/wa.js`.

## Promo & voucher
- Halaman **Promo & Voucher** (`#/promo`, pemilik/manajer; modul di Bisnis). Contoh cepat: happy hour (jam diambil dari jam paling sepi), beli 2 gratis 1, diskon min. belanja, hari spesial, voucher kode.
- Jenis: **diskon order** (% dengan maks. potongan, atau Rp; min. belanja), **diskon menu** (% / potongan Rp per porsi / harga spesial per porsi; tambahan varian tetap dibayar), **beli X gratis Y** (menu yang dipilih, yang termurah gratis).
- Aturan berlaku: periode tanggal, hari, jam (jam selesai eksklusif), saluran (default hanya Toko). **Kode voucher** opsional + kuota total.
- **Kasir**: promo otomatis kepakai kalau syarat terpenuhi, **tidak numpuk** (diambil 1 promo dengan potongan terbesar) + diskon manual tetap bisa. Kolom kode voucher (pesan kenapa ditolak: nggak ada, nonaktif, di luar waktu/saluran, kuota habis, min. belanja, kalah untung). Hint "Tambah Rp… lagi biar dapat …". Promo tercatat di order (`order.promo`), struk & WA struk, rekap Hari ini.
- Pemakaian per promo dihitung dari rekap harian (`posHarian[tgl].promo = { id: { n, rp, omzet } }`, ikut `reconcile`), jadi kuota & statistik (dipakai, total potongan, omzet order) tetap benar setelah sinkron/batal. Laporan laba rugi menampilkan "sudah dipotong promo".
- **Kuota per pelanggan** (voucher): isian "Maks. per pelanggan". Pelanggan dikenali dari **nomor WA**: di Kasir wajib pilih pelanggan kartu stempel yang ada nomor WA-nya, di pesan meja pelanggan isi nomor WA. Pemakaian per nomor tercatat di `order.promo.wa` → `posHarian[tgl].promo[id].wa`.
- **Pesan meja (QR), promo dihitung server**: aturan promo aktif (saluran toko) ikut diunggah ke `public_menu.data.promoAturan` (tidak pernah dikirim ke pelanggan, jadi kode voucher aman; nomor WA pemakai di-hash). Di halaman pesan, server (`cek_promo_meja`) memilih 1 promo terbaik (tidak numpuk) + voucher kalau dimasukkan, lalu pelanggan lihat subtotal, potongan & total sebelum pesan. `place_table_order` menyimpan `subtotal` + `promo`, jadi yang bayar QRIS juga dapat promo. Kuota total = angka terakhir dari app + pesanan meja yang masih menunggu kasir (bisa lewat 1-2 kalau Kasir & meja dipakai bersamaan saat offline). Kasir menerima pesanan dengan kode voucher terisi; promo dihitung ulang di Kasir kalau isi pesanan diubah, kecuali yang sudah lunas digital (promo dikunci).
- Logika di `js/promo.js`.

## Kasir (POS)
- Tab **Kasir** (`#/kasir`). Menu = daftar resep (harga dari resep, sisa porsi dari stok). Item di luar menu bisa ditambah manual.
- Bayar: diskon (Rp), pelanggan kartu stempel (opsional), metode Tunai (uang diterima + tombol cepat + kembalian) / QRIS / Transfer, atau pesanan order online. Setelah bayar muncul struk + tombol kirim struk via WhatsApp.
- Setiap order otomatis:
  - **Kas**: masuk sebagai pemasukan *Penjualan* yang **digabung per hari per metode bayar** (`ref: "pos"`, id `pos-<tanggal>-<metode>`), dihitung ulang dari daftar order. Di halaman Kas ditandai "Kasir" dan tidak bisa dihapus manual.
  - **Stok**: bahan resep (yang stoknya sudah diisi) berkurang; riwayat stok digabung per hari per bahan.
  - **Stempel**: +1 untuk pelanggan kalau total ≥ minimal belanja program.
- Tab **Hari ini**: omzet, jumlah order, rata-rata, per metode bayar, menu terlaris, daftar order. **Batalkan order** mengembalikan kas, stok & stempel.
- Data: `orders` (detail order, disimpan 30 hari) + `posHarian` (rekap harian permanen) — supaya dokumen cloud tetap kecil walau ratusan order per hari. Logika di `js/pos.js`.

### Open bill (opsional)
- Aktifkan di Kasir → tab **Bill** (pemilik/manajer, default nonaktif). Buat pembeli yang pesan dulu, nambah-nambah, bayar belakangan, tanpa ganggu transaksi lain (keranjang kasir tetap bebas).
- **Simpan ke bill** dari layar bayar (bill baru atau bill yang masih buka), atau **Buka bill** dari tab Bill. Tiap tambahan = **ronde**: stok langsung dipotong & dikirim ke dapur (kalau mode dapur aktif). Uang baru masuk Kas & rekap waktu bill **dilunasi** (jadi 1 order biasa dengan `order.bill`), stok nggak dipotong dua kali.
- Pesan meja (QR) yang pilih "bayar di kasir" otomatis masuk **bill meja itu** (voucher dari pelanggan ikut tersimpan; status dapur tetap kelihatan di HP pelanggan). Waktu bill lunas, pesanan meja terkait ikut ditandai lunas.
- Isi bill nggak bisa diubah waktu dibayar (nambah lewat "Tambah pesanan"). Item yang sudah dikirim hanya bisa dibatalkan pemilik/manajer + alasan (pilih stok dikembalikan atau nggak); bill bisa dibatalkan seluruhnya (riwayat disimpan 30 hari). Tutup shift memperingatkan bill yang belum dibayar.
- Data di `bills` (sinkron antar HP, ronde dari 2 HP digabung). Logika di `js/bill.js`.

### Pembayaran campuran
- Untuk QRIS/Transfer bisa centang **Sebagian dibayar tunai**: order menyimpan `pembayaran: [{ metode, jumlah }]` (`metode: "campur"`). Kas per metode, rekap Hari ini, struk & laci shift memakai porsi masing-masing (`porsiMetode` di `js/pos.js`).

## Belanja & supplier
- Halaman `#/belanja` (Bisnis, atau Stok > Bahan & Stok). Khusus pemilik/manajer.
- **Daftar belanja**: untuk 1/3/7 hari ke depan = rata-rata pemakaian 14 hari terakhir (riwayat stok dari Kasir) × hari + stok minimum − stok sekarang, dibulatkan (gram/ml per 100–500, atau per kemasan `bahan.pack`). Dikelompokkan per supplier dengan perkiraan biaya; jumlah bisa diubah, item bisa dicoret atau ditambah. Tombol **Pesan via WA** mengirim daftar ke nomor supplier.
- **Sudah belanja**: isi jumlah & total bayar sebenarnya → stok bertambah, harga per satuan diperbarui (HPP & margin menu ikut berubah), riwayat harga tersimpan (`stokLog.harga`, `supplierId`), dan pengeluaran Kas per kategori (Bahan Baku / Kemasan). Kalau harga per satuan berubah > 2× lipat, diminta konfirmasi (cegah salah ketik).
- **Supplier**: nama, WA, catatan, bahan yang dibeli di sana, total belanja 30 hari.
- **Harga bahan**: harga naik/turun dibanding ±3 minggu sebelumnya + dampaknya ke HPP per porsi tiap menu; riwayat pembelian per bahan.
- Form "+ Beli" di Stok juga bisa memilih supplier & menyimpan riwayat harga. Logika di `js/belanja.js`.

## Kas: daftar transaksi
- Default hanya menampilkan **transaksi hari ini** (halaman Kas langsung ringan walau ada ribuan transaksi). Ringkasan bulanan di atas (masuk/keluar/laba, grafik, per kategori) tetap per bulan.
- Periode: Hari ini · 7 hari · Bulan (ikut navigasi ‹ bulan ›) · Semua · Pilih tanggal (rentang).
- **Cari** langsung saat mengetik: kata di kategori/catatan ("gas", "tahu", "GoFood"), nominal ("22000", "22rb", "1,5jt").
- **Filter**: masuk/keluar, kategori, sumber (Kasir / laci shift / manual).
- Ringkasan hasil (jumlah transaksi, total masuk, keluar, selisih); tampil 50 transaksi, tombol "Tampilkan 50 lagi"; **CSV** sesuai filter. Logika di `js/kas-filter.js`.

## Laporan laba rugi
- Halaman `#/laporan` (Kas > "Laporan laba rugi", atau Bisnis). Pilih bulan (6 bulan terakhir).
- Susunan: Pendapatan (kasir toko, order online, manual, pesanan/katering) − HPP = **laba kotor**; − biaya operasional per kategori = **laba usaha**; + pendapatan lain = **laba bersih**. Di bawahnya arus kas: belanja bahan, belanja peralatan (aset), arus kas bersih (= masuk − keluar di Kas).
- **HPP dari resep** (default kalau ada data Kasir): porsi terjual per menu (rekap kasir harian) × HPP resep; belanja bahan & kemasan tidak dihitung dua kali. **HPP dari belanja**: total belanja Bahan Baku + Kemasan bulan itu (untuk usaha yang belum pakai Kasir).
- Laba bersih vs bulan lalu: bulan berjalan dibandingkan dengan periode yang sama (tgl 1–N) bulan lalu; bulan dengan data tidak penuh tidak dibandingkan.
- Grafik laba bersih 6 bulan (satu seri, bulan rugi di bawah garis nol + tanda minus; tooltip saat hover), menu paling untung & margin paling tipis, catatan otomatis (margin, komisi online, marketing, tren, stok/susut).
- **Cetak / simpan PDF** (tampilan cetak khusus) dan **unduh CSV**. Logika di `js/laporan.js`.

## Foto menu (opsional)
- Di halaman Edit resep ada bagian **Foto menu**: upload / ambil foto → foto dikecilkan di HP (maks 1024 px, WebP ±40 KB).
- **Percantik otomatis (gratis)**: diproses di HP (rentang terang-gelap, kurva kontras, warna, sedikit hangat, pertajam). Tanpa AI, tanpa biaya.
- **Percantik pakai AI** (Gemini, Edge Function `racikin-foto`): pilihan gaya Studio terang / Meja kayu hangat / Latar polos / Natural; AI diminta mempertahankan isi makanan. Model `gemini-3.1-flash-image` (cadangan `gemini-2.5-flash-image`, `gemini-3.1-flash-lite-image`; bisa diganti lewat secret `GEMINI_IMAGE_MODEL`). Kuota terpisah: `RACIKIN_FOTO_PER_DAY` (default 15/hari) & 3/menit. **Butuh billing aktif di Google AI Studio** — model gambar tidak tersedia di paket gratis (tanpa billing, app menampilkan pesan & menyarankan percantik otomatis).
- Asli & hasil tampil berdampingan; tidak ada yang tersimpan sampai dipilih (simpan asli / simpan hasil). Bisa ganti, percantik ulang, atau hapus foto.
- Disimpan di Supabase Storage bucket publik `menu-foto` (`<owner_id>/<resep_id>-<waktu>.webp`); hanya pemilik/manajer yang bisa upload/ganti/hapus (`foto_boleh`), file lama ikut dihapus saat diganti. Perlu login.
- Foto tampil di kartu Kasir (menu tanpa foto pakai placeholder supaya grid rata), Stok & Resep, dan menu pelanggan QR meja. Logika di `js/foto.js`.

## Pesan lewat meja / QR (opsional)
- Aktifkan di Bisnis > **Meja & QR** (`#/meja`, pemilik/manajer). Kalau tidak aktif, Kasir tidak berubah dan link QR menampilkan "pesan lewat meja tidak aktif".
- Tambah meja (satu-satu atau sekaligus), tiap meja punya **QR unik** (`#/m/<token>`); **cetak semua QR** sebagai kartu meja, ganti QR (token baru), hapus meja. Tampil jumlah pesanan & yang menunggu per meja hari ini.
- **Pelanggan** (tanpa login/install): lihat menu & harga toko (yang habis ditandai), pilih varian & topping, keranjang, checkout dengan nama & catatan, pilih **Bayar di kasir** atau **Bayar digital (QRIS)**. Bayar digital saat ini **SIMULASI** (tidak ada uang ditarik; bisa disembunyikan). Halaman status: kode pesanan, diterima kasir, dimasak/siap (kalau mode dapur aktif), status bayar.
- **Kasir**: kotak "Pesanan meja" realtime → **Terima** mengisi keranjang + nama meja/pelanggan & catatan → selesaikan seperti biasa (Kas, stok, shift, stempel, tiket dapur); pesanan lunas digital otomatis memakai metode QRIS. **Tolak** dengan alasan → pelanggan melihatnya.
- Keamanan: menu publik disalin ke `public_menu` (tanpa HPP/stok detail); pelanggan hanya lewat fungsi `get_table_menu` / `place_table_order` / `get_table_order` / `pay_table_order_dummy`. **Harga & total dihitung server**, validasi menu/qty/nama/metode, batas 5 pesanan per meja per 5 menit, status pesanan hanya bisa dibaca dengan secret milik HP pelanggan. Pesanan meja > 7 hari dihapus tiap malam (data penjualannya tetap di Kasir/Kas). Logika di `js/meja.js`, QR pakai `js/vendor/qrcode-1.4.4.js` (MIT).

## Mode dapur (opsional)
- Untuk usaha yang dapurnya jauh dari kasir. Aktifkan di halaman `#/dapur` (Bisnis > Dapur, pemilik/manajer). Kalau tidak aktif, Kasir tidak berubah.
- Kasir: saat bayar ada kolom **Atas nama / no. meja** & **Catatan untuk dapur**; setelah selesai, tiket terkirim ke dapur (offline → antre & dikirim ulang otomatis). Struk menunjukkan status kirim.
- Layar dapur: kolom **Baru → Dimasak → Siap** (tablet landscape 3 kolom; HP pakai tab), nomor order, nama/meja, lama menunggu (kuning ≥ 10 menit, merah ≥ 20), saluran, item (bisa dicentang per item), catatan, bunyi saat pesanan baru.
- Kasir dapat kabar "Order #12 siap diambil" + daftar pesanan siap di atas menu; ketuk untuk menandai sudah diambil. Order yang dibatalkan hilang dari dapur.
- Peran tim baru **Dapur**: hanya layar dapur; server hanya mengirim nama usaha, brand & setelan kasir, dan menolak perubahan dokumen dari akun dapur.
- Teknis: tabel `kitchen_tickets` (RLS lewat `team_role`, tanpa harga) + **Supabase Realtime** (tiket muncul ±1 detik) dengan cadangan polling 20 detik; tiket > 3 hari dihapus tiap malam (pg_cron). Logika di `js/dapur.js`.

## Shift & tutup kasir
- Halaman `#/shift` (dari bar shift di Kasir, atau Kasir > Hari ini > "Shift & tutup kasir").
- **Buka shift**: isi modal awal laci. Order yang dicatat selama shift diberi `shiftId`.
- **Uang laci** selama shift: *Pengeluaran* (beli es, gas; otomatis jadi pengeluaran Kas dengan tag "Laci"), *Tambah uang* (kembalian), *Setor / ambil* (diambil pemilik). Dua yang terakhir hanya memindah uang, tidak masuk Kas.
- **Tutup shift**: hitung uang di laci (bisa per pecahan), app menghitung uang seharusnya = modal + penjualan tunai + tambah − pengeluaran − setor, lalu **selisih** (pas / kurang / lebih). Ringkasan saat tutup disimpan permanen.
- Pemilik/manajer: riwayat shift semua kasir (30 hari), selisih per kasir, tutup shift kasir lain yang lupa ditutup, dan opsi **wajib buka shift sebelum jualan**. Kasir hanya melihat shift miliknya.
- Data: `state.shifts` (disimpan 90 hari) & `state.posSetting`; logika di `js/shift.js`. Kasir boleh menulis `shifts` di server, tapi tidak `posSetting`.

## Harga online (GoFood, GrabFood, ShopeeFood)
- Halaman `#/online` (dari Kasir atau hub Bisnis). Per saluran: aktif, **komisi %**, **markup %**, pembulatan (Rp100/500/1.000). Harga online = harga toko × (1 + markup), dibulatkan ke atas; bisa diisi manual per menu.
- **Saran markup** = markup yang membuat untung per porsi sama dengan jual di toko: `1/(1 − komisi) − 1` (komisi 20% → 25%).
- Tabel per menu: harga, uang yang diterima setelah komisi, dan untung per porsi (dari HPP resep) — hijau/kuning/merah dibanding jual di toko.
- **Kasir**: pilih saluran (Toko / GoFood / GrabFood / ShopeeFood) di atas menu; harga ikut saluran (keranjang dihitung ulang kalau saluran diganti). Order online tidak memakai pembayaran tunai; layar bayar & struk menampilkan komisi dan "kamu terima".
- **Kas**: penjualan online masuk sebagai *Penjualan* (harga ke pembeli), dan komisinya sebagai pengeluaran **Komisi Order Online** (digabung per hari per saluran). Rekap Kasir menampilkan komisi, bersih, dan porsi penjualan online.
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

## Tablet & layar lebar
- **≥ 900px** (tablet landscape, laptop): tab bar jadi **rail navigasi di kiri**; konten lebih lebar dan sebagian besar halaman disusun **dua kolom** (kartu mengalir kiri-kanan; 3 kolom untuk Beranda & Bisnis di ≥ 1400px).
- **Kasir dua panel**: menu di kiri, pesanan + pelanggan + pembayaran di kanan. Tinggi pas satu layar; daftar pesanan yang di-scroll, jadi tombol **Selesaikan** selalu terlihat. Struk muncul di panel kanan, ketuk menu lagi untuk pesanan berikutnya.
- **700–899px** (tablet portrait): tetap satu kolom & tab bar bawah, konten sedikit lebih lebar, menu kasir 3 kolom.
- Rotasi layar langsung mengganti tata letak tanpa kehilangan keranjang (`isWide()` di `js/ui.js`, daftar halaman dua kolom `COLS` di `js/app.js`).

## Desain: "papan warung"
- **Warna**: kuning marigold `#FFC531` (utama) + hitam tinta `#1B1916` di atas kertas krem `#F6EFDC`. Aksen hemat: merah cabai (minus/peringatan) & hijau daun (untung/selesai). Mode gelap otomatis.
- **Font**: Archivo (judul pakai versi lebar/expanded, kesan papan nama) + IBM Plex Mono untuk label & angka kecil (kesan struk).
- **Bentuk**: garis tinta tegas, sudut kecil, tanpa bayangan blur; tombol utama kuning dengan bayangan padat.
- **Ikon**: set ikon garis sendiri di `js/icons.js` (tanpa emoji di UI). Token warna ada di atas `css/app.css`.

## Data contoh (demo)
- Onboarding: **Coba demo lengkap (data 2 bulan)**; atau Setelan > Data kamu > **Isi data contoh TAHGUY (2 bulan)**.
- Isi (`js/dummy.js`, acak tapi tetap/seeded): 15 menu + resep & HPP, 4 grup varian (level pedas, topping, ukuran, tingkat manis) yang ikut terpakai di order, 25 bahan dengan riwayat belanja & pemakaian, ±2.000 order kasir 60 hari (toko + GoFood/GrabFood/ShopeeFood, detail order 30 hari terakhir), Kas lengkap (penjualan, komisi order online, belanja bahan & kemasan, sewa, gas, gaji, iklan, pesanan katering), 35 pelanggan setia + stempel, RAB + realisasi, brand kit, checklist aktivasi, kalender konten, riwayat shift 30 hari (dengan beberapa selisih), 5 supplier & riwayat harga (cabai, telur, bakso naik; minyak turun). Data hari ini hanya sampai jam sekarang (TAHGUY buka ±14.30).
- Semua angka saling cocok: Kas = rekap kasir per hari, stok = total riwayat stok, stempel = total log stempel. Beberapa bahan sengaja menipis & beberapa pelanggan "perlu diajak balik" supaya fitur pengingat kelihatan.
- Mengganti data bisnis di perangkat (dan di cloud kalau sedang login); setelan perangkat tetap.

## Akun demo tim TAHGUY
Untuk mencoba mode tim, dapur, dan pesan meja di beberapa perangkat, ada 4 akun demo (satu tim) di project Supabase:

| Peran | Email | Nama di tim |
|---|---|---|
| Pemilik | `pemilik.tahguy@racikin.test` | Raka |
| Kasir | `kasir.tahguy@racikin.test` | Rina |
| Manajer | `manajer.tahguy@racikin.test` | Dodi |
| Dapur | `dapur.tahguy@racikin.test` | Sari |

- Password **tidak** disimpan di repo (tanya pemilik project). Akun pemilik sudah berisi data contoh 2 bulan, mode dapur & pesan meja aktif (8 meja).
- Data contoh mencatat order & shift atas nama yang jaga: Rina (hari kerja), Dodi (akhir pekan), Pemilik (sesekali). Kalau data contoh dimuat oleh pemilik yang punya tim, nama & ID diambil dari anggota tim sungguhan.
- Hapus akun demo dari dashboard Supabase (Authentication → Users) kalau sudah tidak dipakai.

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

## Tes
Unit test & skrip E2E Playwright ada di `tests/` (lihat `tests/README.md`). Panduan untuk asisten AI/kontributor ada di `CLAUDE.md`.

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
js/foto.js         foto menu: kecilkan, percantik otomatis/AI, upload & hapus di Storage
js/meja.js         pesan lewat meja: menu publik, pesanan meja realtime, API pelanggan, QR
js/dapur.js        mode dapur: tiket ke dapur, status, realtime, antrean offline
js/shift.js        shift kasir: buka/tutup, uang laci, ringkasan & selisih
js/belanja.js      daftar belanja otomatis, supplier, riwayat & perubahan harga bahan
js/laporan.js      laporan laba rugi bulanan (HPP resep/belanja), pembanding, catatan, CSV
js/online.js       harga & komisi per saluran online, saran markup, untung per porsi
js/studio/         theme.js (warna/font/ekspor PNG-SVG) + art.js (logo, mockup, spanduk, poster, dst.)
js/vendor/         supabase-js (UMD, disimpan lokal supaya jalan offline)
js/demo.js         generator Mode Demo (shape = schema di tasks.ts)
js/views/*.js      satu file per halaman
docs/PRD.md        Product Requirements Document
supabase/migrations/   user_data, ai_usage + consume_ai_quota, stamp_cards + get_stamp_card, mode tim (rev, team_members, team_invites, doc_get/doc_save)
supabase/functions/racikin-foto/   percantik foto menu pakai Gemini (kuota terpisah)
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
