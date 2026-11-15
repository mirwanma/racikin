// Tahap usaha: "ide" (baru mau mulai / baru buka) atau "jalan" (usaha sudah berjalan). Murni, tanpa UI.
// Menentukan langkah di Beranda & susunan halaman Bisnis. Profil lama tanpa `tahap` dianggap "ide".
import { activeChannels } from "./online.js";

export const TAHAP = [
  { id: "ide", nama: "Baru ide / mau mulai", sub: "Bantu dari analisa ide, modal, brand, sampai buka" },
  { id: "jalan", nama: "Udah jalan", sub: "Rapihin kasir, stok, HPP & untung usaha yang sudah ada" },
];
export const LAMA = ["< 6 bulan", "6–12 bulan", "1–3 tahun", "> 3 tahun"];
export const SALURAN = ["Jualan langsung", "GoFood", "GrabFood", "ShopeeFood", "WhatsApp / pre-order", "Katering"];
export const MASALAH = [
  { id: "untung", nama: "Untung tipis / nggak tahu untung beneran" },
  { id: "catat", nama: "Catatan keuangan berantakan" },
  { id: "stok", nama: "Stok sering habis atau bocor" },
  { id: "karyawan", nama: "Susah kontrol kasir / karyawan" },
  { id: "sepi", nama: "Pembeli sepi / omzet stagnan" },
  { id: "online", nama: "Ribet atur harga GoFood dkk" },
];
export const MAKS_MASALAH = 2;
export const HARI_NAIK = 14; // hari jualan di Kasir sebelum ditawari pindah ke tampilan "udah jalan"

export const tahapOf = (s) => (s.profile?.tahap === "jalan" ? "jalan" : "ide");
export const isJalan = (s) => tahapOf(s) === "jalan";

/** Jumlah hari yang punya penjualan Kasir (rekap harian). */
export const hariJualan = (s) => Object.values(s.posHarian || {}).filter((r) => (r.order || 0) > 0).length;

/** Langkah usaha baru (dari ide). */
function langkahIde(s) {
  return [
    { key: "ide", label: "Analisa ide", done: !!s.idea, href: "#/ide" },
    { key: "rab", label: "RAB & modal", done: !!s.rab, href: "#/rab" },
    { key: "brand", label: "Brand kit", done: !!s.brand?.terpilih, href: "#/brand" },
    { key: "aktivasi", label: "Aktivasi jualan", done: !!s.activation, href: "#/aktivasi" },
    { key: "kas", label: "Mulai nyatet kas", done: s.transactions.length > 0, href: "#/kas" },
    { key: "konten", label: "Jadwal konten", done: !!s.calendar, href: "#/konten" },
  ];
}

// Masalah utama -> langkah yang didahulukan.
const PRIORITAS = {
  untung: ["laporan"],
  catat: ["kasir"],
  stok: ["stok"],
  karyawan: ["tim", "kasir"],
  sepi: ["pelanggan", "konten"],
  online: ["online"],
};

/** Langkah usaha yang sudah jalan, disesuaikan dengan saluran, tim & masalah utama. */
function langkahJalan(s, { anggotaTim = 0 } = {}) {
  const p = s.profile || {};
  const masalah = p.masalah || [];
  const saluran = p.saluran || [];
  const ojol = saluran.some((x) => ["GoFood", "GrabFood", "ShopeeFood"].includes(x));
  const adaJualan = (s.orders || []).length > 0 || hariJualan(s) > 0;
  const semua = [
    { key: "menu", label: "Masukin menu & resep", done: s.resep.length > 0, href: s.resep.length ? "#/stok" : "#/resep?id=new" },
    { key: "stok", label: "Isi stok awal", done: s.bahan.some((b) => b.tracked), href: "#/stok?tab=bahan&isi=1" },
    { key: "kasir", label: "Jualan pakai Kasir", done: adaJualan, href: "#/kasir" },
    { key: "online", label: "Atur harga online", done: activeChannels(s).length > 0, href: "#/online", ikut: ojol || masalah.includes("online") },
    { key: "tim", label: "Ajak tim ke Racikin", done: anggotaTim > 0, href: "#/tim", ikut: (Number(p.karyawan) || 0) > 0 || masalah.includes("karyawan") },
    { key: "pelanggan", label: "Kartu stempel pelanggan", done: !!s.loyalty, href: "#/pelanggan", ikut: masalah.includes("sepi") },
    { key: "konten", label: "Jadwal konten", done: !!s.calendar, href: "#/konten", ikut: masalah.includes("sepi") },
    { key: "laporan", label: "Seminggu jualan, cek untung", done: hariJualan(s) >= 7, href: "#/laporan" },
  ].filter((x) => x.ikut !== false);
  const utama = new Set(masalah.flatMap((m) => PRIORITAS[m] || []));
  // "Masukin menu" selalu pertama (Kasir, stok & HPP butuh menu); sisanya: yang terkait masalah utama didahulukan.
  const [menu, ...lain] = semua;
  const urut = lain.map((x, i) => ({ x, i })).sort((a, b) => (utama.has(b.x.key) ? 1 : 0) - (utama.has(a.x.key) ? 1 : 0) || a.i - b.i);
  return [menu, ...urut.map(({ x }) => ({ ...x, utama: utama.has(x.key) }))].map(({ ikut: _i, ...x }) => x);
}

/** Langkah di Beranda sesuai tahap. */
export const langkah = (s, opt) => (isJalan(s) ? langkahJalan(s, opt) : langkahIde(s));

/** Tawarkan pindah ke tampilan "udah jalan"? */
export const tawarNaik = (s) => !isJalan(s) && !s.profile?.tolakNaik && hariJualan(s) >= HARI_NAIK;
