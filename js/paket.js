// Paket Gratis & Pro (monetisasi tahap 1). Server yang menentukan & mengunci (paket_saya / paket_info di SQL);
// app hanya menampilkan & mengunci tombol. Tanpa akun (data hanya di HP ini) semua fitur boleh dicoba, karena fitur
// Pro yang butuh server (tim, pesan meja, AI foto, kuota AI) tetap dikunci server.
import { sb, cloud, onCloudChange } from "./cloud.js";
import { normWa } from "./loyalty.js";

export const HARGA = { bulan: 49000, tahun: 490000 };
export const AI_HARI = { gratis: 20, pro: 300 };

// Fitur yang dikunci untuk paket Gratis (id dipakai di kunciPro / bolehPro).
export const FITUR_PRO = [
  { id: "tim", nama: "Tim lebih dari 1 orang", ket: "Undang kasir, manajer & dapur, jualan dari banyak HP" },
  { id: "meja", nama: "Pesan lewat QR meja", ket: "Pelanggan scan, pesan & bayar dari HP, promo dihitung otomatis" },
  { id: "dapur", nama: "Layar dapur", ket: "Pesanan langsung muncul di dapur, status siap ke kasir" },
  { id: "bill", nama: "Open bill", ket: "Pesan dulu, nambah-nambah, bayar belakangan" },
  { id: "foto", nama: "Foto menu AI", ket: "Foto HP jadi foto menu ala studio" },
  { id: "imporJual", nama: "Impor penjualan lama", ket: "Pindahin data dari Excel / app kasir lain" },
  { id: "ai", nama: `Kuota AI ${AI_HARI.pro}/hari`, ket: `Gratis ${AI_HARI.gratis}/hari` },
];
export const FITUR_GRATIS = [
  "Kasir, struk & rekap harian",
  "Kas & laporan laba rugi",
  "Resep, HPP & stok bahan",
  "Promo, voucher & kartu stempel",
  "WhatsApp (link pesan, broadcast, rekap)",
  "Cek kesehatan usaha & panduan izin",
  `Mentor & AI ${AI_HARI.gratis}x/hari`,
];
export const namaFitur = (id) => FITUR_PRO.find((f) => f.id === id)?.nama || "Fitur ini";

const hari = (a, b) => Math.ceil((new Date(b) - new Date(a)) / 864e5);

/** Sisa hari Pro (coba / transisi / bayar). null kalau gratis. */
export const sisaHari = (p, now = new Date().toISOString()) => (p?.paket === "pro" && p.sampai ? Math.max(0, hari(now, p.sampai)) : null);

export const SUMBER = { bayar: "Pro", coba: "Pro · masa coba", transisi: "Pro · gratis masa transisi" };

/** Label singkat paket, cth "Pro · masa coba (sisa 5 hari)". */
export function labelPaket(p, now) {
  if (!p) return "";
  if (p.paket === "lokal") return "Mode coba di HP ini";
  if (p.paket !== "pro") return "Gratis";
  const n = sisaHari(p, now);
  return `${SUMBER[p.sumber] || "Pro"}${n !== null && p.sumber !== "bayar" ? ` (sisa ${n} hari)` : ""}`;
}

/** Perlu diingatkan? (masa coba/transisi tinggal <= 7 hari, Pro bayar <= 5 hari, atau baru turun ke Gratis <= 14 hari) */
export function perluIngat(p, now = new Date().toISOString()) {
  if (!p || p.paket === "lokal") return null;
  if (p.paket === "pro") {
    const n = sisaHari(p, now);
    if (n === null) return null;
    if (p.sumber === "bayar" ? n <= 5 : n <= 7) return { jenis: "habis", sisa: n };
    return null;
  }
  if (p.pro_terakhir && hari(p.pro_terakhir, now) <= 14) return { jenis: "turun", sejak: p.pro_terakhir };
  return null;
}

/** Hemat bayar tahunan dibanding 12x bulanan (Rp & bulan). */
export const hematTahun = (h = HARGA) => ({ rp: h.bulan * 12 - h.tahun, bulan: Math.round((h.bulan * 12 - h.tahun) / h.bulan) });

/** Link WA ke admin Racikin untuk upgrade (pesan sudah berisi email & nama usaha). */
export function linkUpgrade(p, { email = "", usaha = "", periode = "bulan" } = {}) {
  const harga = periode === "tahun" ? p?.harga_tahun ?? HARGA.tahun : p?.harga_bulan ?? HARGA.bulan;
  const teks = `Halo admin Racikin, aku mau upgrade ke Racikin Pro (${periode === "tahun" ? "tahunan" : "bulanan"}, Rp${Number(harga).toLocaleString("id-ID")}).\n\nUsaha: ${usaha || "-"}\nEmail akun: ${email || "-"}\n\nCara bayarnya gimana?`;
  const wa = normWa(p?.wa || "");
  return wa ? `https://wa.me/${wa}?text=${encodeURIComponent(teks)}` : "";
}

// ---------- Status paket akun yang login (dari server, disimpan juga di HP buat offline) ----------
let info = null; // hasil paket_saya untuk cloud.user
let infoUid = null;
let jalan = null;
const KEY = (uid) => `racikin:paket:${uid}`;
const listeners = new Set();
export const onPaket = (fn) => (listeners.add(fn), () => listeners.delete(fn));

export async function muatPaket(force = false) {
  if (!cloud.user || !sb()) return null;
  if (!force && info && infoUid === cloud.user.id) return info;
  if (jalan) return jalan;
  const uid = cloud.user.id;
  jalan = (async () => {
    const { data, error } = await sb().rpc("paket_saya");
    if (!error && data && uid === cloud.user?.id) {
      info = data;
      infoUid = uid;
      try {
        localStorage.setItem(KEY(uid), JSON.stringify(data));
      } catch {
        /* abaikan */
      }
      listeners.forEach((fn) => fn(info));
    }
    return info;
  })();
  try {
    return await jalan;
  } finally {
    jalan = null;
  }
}

/** Paket sekarang. Tanpa akun: { paket: "lokal" }. Belum termuat: data tersimpan di HP, atau dianggap Pro (server tetap mengunci). */
export function paketKini() {
  if (!cloud.user) return { paket: "lokal" };
  if (info && infoUid === cloud.user.id) return info;
  try {
    const simpan = JSON.parse(localStorage.getItem(KEY(cloud.user.id)) || "null");
    if (simpan) return simpan;
  } catch {
    /* abaikan */
  }
  return { paket: "pro", sumber: null, memuat: true };
}

/** Boleh pakai fitur Pro? (tanpa akun = boleh dicoba di HP ini) */
export const bolehPro = () => paketKini().paket !== "gratis";

export function initPaket() {
  onCloudChange(() => {
    if (cloud.user && infoUid !== cloud.user.id) muatPaket().catch(() => {});
    if (!cloud.user) {
      info = null;
      infoUid = null;
    }
  });
  // Cek ulang tiap 30 menit (masa coba bisa habis waktu app terbuka).
  setInterval(() => cloud.user && muatPaket(true).catch(() => {}), 30 * 60 * 1000);
}
