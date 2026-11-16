// Panduan perizinan usaha F&B kecil (NIB, PIRT, Halal, SLHS, Merek). Murni (tanpa UI).
// Isi panduan = ringkasan umum, BUKAN nasihat hukum. Aturan sering berubah: perbarui DICEK & isi saat ada aturan baru.
//
// state.izin = { [id]: { status: "belum" | "proses" | "selesai", nomor, terbit, berlaku, catatan, dok: [index dokumen yang sudah siap] } }

export const DICEK = "November 2026";
export const STATUS = { belum: "Belum", proses: "Lagi diurus", selesai: "Sudah punya" };

// Kata kunci menu yang biasanya pakai daging sembelihan (jalur halal reguler / pastikan pemasok bersertifikat).
const DAGING = /\b(ayam|sapi|daging|bakso|sosis|kornet|rendang|sate|iga|bebek|kambing|nugget|abon|dendeng|burger|kebab|ati|ampela|ceker)\b/i;

export const IZIN = [
  {
    id: "nib",
    nama: "NIB (Nomor Induk Berusaha)",
    singkat: "Identitas resmi usaha. Gratis, online, dan jadi syarat izin lainnya (PIRT, halal, merek UMK).",
    biaya: "Gratis",
    lama: "Bisa jadi di hari yang sama",
    berlakuTahun: null, // berlaku selama usaha berjalan
    link: { url: "https://oss.go.id", label: "oss.go.id" },
    dokumen: ["KTP (NIK)", "Email & nomor HP aktif", "Alamat lokasi usaha", "NPWP (kalau sudah punya)"],
    langkah: [
      "Buka oss.go.id, daftar akun pakai NIK, email & nomor HP (pilih skala Usaha Mikro/Kecil).",
      "Isi data usaha: nama usaha, alamat lokasi, modal & jumlah karyawan.",
      "Pilih bidang usaha (KBLI) sesuai kegiatan: cari kata kunci seperti \"warung makan\", \"kedai minuman\", \"katering\", atau jenis makanan olahanmu.",
      "Isi pernyataan mandiri (K3L), lalu terbitkan NIB. Unduh dan simpan file NIB-nya.",
    ],
  },
  {
    id: "pirt",
    nama: "PIRT (SPP-IRT)",
    singkat: "Izin edar pangan olahan rumahan yang DIKEMAS & berlabel (frozen food, kue kering, sambal botol, keripik). Makanan siap saji yang langsung dimakan di tempat nggak pakai PIRT.",
    biaya: "Umumnya gratis lewat OSS (penyuluhan keamanan pangan bisa ada biaya, tergantung daerah)",
    lama: "Beberapa hari sampai minggu (ada penyuluhan & cek sarana)",
    berlakuTahun: 5,
    link: { url: "https://oss.go.id", label: "oss.go.id (menu PB-UMKU → SPP-IRT)" },
    dokumen: ["NIB", "Sertifikat Penyuluhan Keamanan Pangan (PKP)", "Rancangan label kemasan", "Daftar bahan & BTP yang dipakai", "Foto tempat produksi"],
    langkah: [
      "Pastikan NIB sudah terbit.",
      "Ikut Penyuluhan Keamanan Pangan (PKP) dari Dinas Kesehatan / daring, simpan sertifikatnya.",
      "Di OSS buka Perizinan Berusaha → PB-UMKU → pilih SPP-IRT, isi data produk & label.",
      "Ikuti pemeriksaan sarana produksi kalau dijadwalkan, lalu unduh SPP-IRT & cantumkan nomor PIRT di label.",
      "Perpanjang sebelum masa berlaku 5 tahun habis.",
    ],
    catatan: "Produk berisiko tinggi (susu olahan, daging olahan, makanan kaleng) nggak bisa PIRT, harus izin edar BPOM (MD).",
  },
  {
    id: "halal",
    nama: "Sertifikat Halal",
    singkat: "Wajib untuk makanan & minuman yang dijual. Usaha mikro & kecil dapat masa penahapan sampai 17 Oktober 2028.",
    biaya: "Gratis lewat program SEHATI (self declare, kuota terbatas); jalur reguler berbayar",
    lama: "Self declare ± beberapa minggu; reguler lebih lama (ada audit)",
    berlakuTahun: null, // berlaku selama komposisi & proses produksi tidak berubah
    link: { url: "https://ptsp.halal.go.id", label: "ptsp.halal.go.id (SIHALAL)" },
    dokumen: ["NIB skala mikro/kecil", "Daftar bahan + bukti halal bahan (sertifikat / label halal pemasok)", "Alur proses produksi sederhana", "Nama & foto produk", "Penyelia halal (bisa pemilik sendiri)"],
    langkah: [
      "Pastikan NIB sudah terbit (skala mikro/kecil untuk jalur gratis).",
      "Daftar akun di ptsp.halal.go.id (SIHALAL), pilih jalur self declare kalau memenuhi syarat (bahan sudah pasti halal, proses sederhana, omzet ≤ Rp15 miliar).",
      "Pilih Pendamping Proses Produk Halal (P3H) yang akan verifikasi bahan & proses.",
      "Isi data produk & bahan, ikrar halal, lalu tunggu penetapan dari Komite Fatwa & terbitnya sertifikat.",
      "Pasang logo halal resmi di kemasan / menu setelah sertifikat terbit.",
    ],
    catatan: "Batas penahapan UMK makanan & minuman diperpanjang dari 17 Okt 2026 ke 17 Okt 2028. Bahan berisiko (daging sembelihan) biasanya lewat jalur reguler atau wajib pakai pemasok bersertifikat halal. Cek ketentuan & kuota SEHATI terbaru di situs BPJPH.",
  },
  {
    id: "slhs",
    nama: "SLHS (Sertifikat Laik Higiene Sanitasi)",
    singkat: "Bukti dapur & penjamah makanan memenuhi standar higiene. Biasanya diminta untuk katering / jasa boga dan rumah makan; ketentuannya beda tiap daerah.",
    biaya: "Bervariasi per daerah (uji lab bisa berbayar)",
    lama: "Beberapa minggu (inspeksi & uji sampel)",
    berlakuTahun: 3,
    link: { url: "https://oss.go.id", label: "Dinas Kesehatan / Puskesmas setempat (ada yang lewat OSS)" },
    dokumen: ["NIB", "Sertifikat pelatihan penjamah makanan", "Denah dapur", "Hasil uji sampel makanan & air (dari lab)"],
    langkah: [
      "Tanya Dinas Kesehatan / Puskesmas setempat apakah usahamu wajib SLHS dan jalur pengajuannya.",
      "Ikut pelatihan higiene sanitasi untuk penjamah makanan.",
      "Ajukan permohonan, jalani inspeksi dapur & uji sampel.",
      "Simpan sertifikat dan perpanjang sebelum habis masa berlakunya.",
    ],
  },
  {
    id: "merek",
    nama: "Pendaftaran Merek (HKI)",
    singkat: "Melindungi nama & logo brand biar nggak dipakai orang lain. Opsional, tapi penting kalau mau buka cabang / franchise.",
    biaya: "UMK lebih murah (pakai surat keterangan UMK / NIB), cek tarif terbaru di DJKI",
    lama: "Beberapa bulan sampai terbit",
    berlakuTahun: 10,
    link: { url: "https://merek.dgip.go.id", label: "merek.dgip.go.id" },
    dokumen: ["KTP", "Logo / etiket merek (file gambar)", "NIB atau surat keterangan UMK", "Daftar barang/jasa (kelas merek)"],
    langkah: [
      "Cek dulu nama brand-mu belum dipakai orang di pdki-indonesia.dgip.go.id.",
      "Daftar akun di merek.dgip.go.id, isi data pemohon & unggah logo.",
      "Pilih kelas: makanan/minuman olahan (kelas 29/30/32) dan/atau jasa restoran (kelas 43).",
      "Bayar PNBP, tunggu pemeriksaan sampai merek terdaftar. Perpanjang tiap 10 tahun.",
    ],
  },
];

const RELEVANSI = { wajib: 0, disarankan: 1, opsional: 2, belum: 3 };
export const RELEVANSI_NAMA = { wajib: "Wajib", disarankan: "Disarankan", opsional: "Opsional", belum: "Belum perlu" };

/** Seberapa relevan tiap izin untuk usaha ini (dari profil & menu). Return [{ ...izin, relevan, alasan }]. */
export function rekomendasi(s) {
  const p = s.profile || {};
  const jenis = String(p.jenis || "");
  const konsep = String(p.konsep || "");
  const menuTeks = [p.menu, ...(s.resep || []).map((r) => r.nama)].join(" ");
  const dariRumah = /online|rumah/i.test(konsep);
  const kemasan = /frozen/i.test(jenis) || (dariRumah && /dessert|jajanan|snack|frozen/i.test(jenis));
  const katering = /katering/i.test(jenis);
  const daging = DAGING.test(menuTeks);
  const punyaBrand = !!(s.brand?.terpilih?.nama || p.nama);
  return IZIN.map((z) => {
    let relevan = "opsional";
    let alasan = "";
    if (z.id === "nib") [relevan, alasan] = ["wajib", "Semua usaha perlu NIB, dan izin lain butuh NIB dulu."];
    else if (z.id === "pirt")
      [relevan, alasan] = kemasan
        ? ["disarankan", "Usahamu kayaknya jual produk kemasan yang dikirim / dititip ke toko, jadi butuh nomor PIRT di label."]
        : ["belum", "Makanan siap saji yang langsung dimakan nggak pakai PIRT. Baru perlu kalau mulai jual produk kemasan (frozen, kue kering, sambal botol)."];
    else if (z.id === "halal")
      [relevan, alasan] = ["wajib", daging ? "Menumu ada bahan daging/olahan daging: pastikan pemasoknya bersertifikat halal, jalurnya mungkin reguler." : "Makanan & minuman wajib halal (UMK sampai 17 Okt 2028). Bahan sederhana biasanya bisa self declare gratis."];
    else if (z.id === "slhs")
      [relevan, alasan] = katering
        ? ["disarankan", "Katering / jasa boga biasanya diminta SLHS, apalagi kalau melayani kantor, sekolah, atau acara."]
        : /kios|ruko/i.test(konsep)
          ? ["opsional", "Rumah makan di beberapa daerah diminta SLHS. Cek ke Dinas Kesehatan setempat."]
          : ["opsional", "Biasanya belum diwajibkan untuk usaha kecil non-katering. Bagus buat kepercayaan pelanggan."];
    else if (z.id === "merek") [relevan, alasan] = [punyaBrand ? "disarankan" : "opsional", punyaBrand ? "Kamu sudah punya nama brand, daftarkan biar aman dari peniru." : "Daftarkan setelah nama brand fix."];
    return { ...z, relevan, alasan };
  }).sort((a, b) => RELEVANSI[a.relevan] - RELEVANSI[b.relevan]);
}

const tambahTahun = (iso, n) => {
  const d = new Date(iso + "T00:00:00");
  d.setFullYear(d.getFullYear() + n);
  return d.toISOString().slice(0, 10);
};
const hari = (a, b) => Math.round((new Date(b + "T00:00:00") - new Date(a + "T00:00:00")) / 864e5);

/** Tanggal habis berlaku: diisi manual, atau tanggal terbit + masa berlaku standar. */
export function berlakuSampai(z, data) {
  if (data?.berlaku) return data.berlaku;
  if (data?.terbit && z.berlakuTahun) return tambahTahun(data.terbit, z.berlakuTahun);
  return null;
}

/** Ringkasan progres & pengingat. Return { selesai, total, proses, pengingat: [{ id, nama, sampai, sisa }] } */
export function ringkasIzin(s, today) {
  const list = rekomendasi(s).filter((z) => z.relevan === "wajib" || z.relevan === "disarankan");
  const d = s.izin || {};
  const pengingat = [];
  for (const z of IZIN) {
    if (d[z.id]?.status !== "selesai") continue;
    const sampai = berlakuSampai(z, d[z.id]);
    if (!sampai) continue;
    const sisa = hari(today, sampai);
    if (sisa <= 90) pengingat.push({ id: z.id, nama: z.nama, sampai, sisa });
  }
  return {
    total: list.length,
    selesai: list.filter((z) => d[z.id]?.status === "selesai").length,
    proses: list.filter((z) => d[z.id]?.status === "proses").length,
    berikut: list.find((z) => d[z.id]?.status !== "selesai") || null,
    pengingat: pengingat.sort((a, b) => a.sisa - b.sisa),
  };
}

/** Ringkasan status izin buat konteks Mentor AI. */
export const konteksIzin = (s) =>
  rekomendasi(s).map((z) => ({ izin: z.nama, relevansi: RELEVANSI_NAMA[z.relevan], status: STATUS[s.izin?.[z.id]?.status || "belum"] }));

export const TANYA_IZIN = "Bantu aku urus izin usaha. Dari status izinku sekarang, izin mana yang harus aku urus duluan, dokumen apa yang perlu disiapin, dan kira-kira berapa lama?";
