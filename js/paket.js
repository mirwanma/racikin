// Paket Gratis, Pro & Max (monetisasi). Server yang menentukan & mengunci (paket_saya / paket_info di SQL);
// app hanya menampilkan & mengunci tombol. Tanpa akun (data hanya di HP ini) semua fitur boleh dicoba, karena fitur
// Pro yang butuh server (tim, pesan meja, AI foto, kuota AI) tetap dikunci server.
import { sb, cloud, onCloudChange } from "./cloud.js";
import { normWa } from "./loyalty.js";

export const HARGA = { bulan: 49000, tahun: 490000 };
export const HARGA_MAX = { bulan: 99000, tahun: 990000 };
/** Tingkat paket: fitur boleh dipakai kalau tingkat paket usaha >= tingkat fiturnya. */
export const LEVEL = { gratis: 0, pro: 1, max: 2 };
export const NAMA_PAKET = { gratis: "Gratis", pro: "Pro", max: "Max" };
export const AI_HARI = { gratis: 20, pro: 300 };

// Fitur yang bisa diatur Gratis / Pro / Max oleh admin (halaman Paket di dashboard admin, platform_setting.fitur).
// Sama dengan paket_fitur_ids() di SQL. Default: Pro, kecuali multi-cabang (Max).
export const FITUR = [
  { id: "tim", nama: "Tim lebih dari 1 orang", ket: "Undang kasir, manajer & dapur, jualan dari banyak HP" },
  { id: "meja", nama: "Pesan lewat QR meja", ket: "Pelanggan scan, pesan & bayar dari HP, promo dihitung otomatis" },
  { id: "dapur", nama: "Layar dapur", ket: "Pesanan langsung muncul di dapur, status siap ke kasir" },
  { id: "bill", nama: "Open bill", ket: "Pesan dulu, nambah-nambah, bayar belakangan" },
  { id: "foto", nama: "Foto menu AI", ket: "Foto HP jadi foto menu ala studio" },
  { id: "imporJual", nama: "Impor penjualan lama", ket: "Pindahin data dari Excel / app kasir lain" },
  { id: "cabang", nama: "Multi-cabang", ket: "Banyak cabang dari satu akun, ringkasan gabungan & kirim menu antar cabang", default: "max" },
];
// Fitur inti yang selalu gratis (nggak bisa dikunci).
export const SELALU_GRATIS = [
  "Kasir, struk & rekap harian",
  "Kas & laporan laba rugi",
  "Resep, HPP & stok bahan",
  "Promo, voucher & kartu stempel",
  "WhatsApp (link pesan, broadcast, rekap)",
  "Cek kesehatan usaha & panduan izin",
];
export const FITUR_DEFAULT = Object.fromEntries(FITUR.map((f) => [f.id, f.default || "pro"]));
export const namaFitur = (id) => FITUR.find((f) => f.id === id)?.nama || "Fitur ini";

/** Konfigurasi fitur dari paket (fitur yang nggak tercantum = default-nya). */
export const aturFitur = (p) => ({ ...FITUR_DEFAULT, ...(p?.fitur || {}) });
/** Kuota AI per paket dari konfigurasi. */
export const kuotaAi = (p) => ({ gratis: Number(p?.ai_gratis ?? AI_HARI.gratis), pro: Number(p?.ai_pro ?? AI_HARI.pro) });

/** Tingkat fitur sesuai konfigurasi: "gratis" | "pro" | "max". */
export const tingkatFitur = (id, p) => aturFitur(p)[id] || "pro";

/** Isi kolom Gratis, Pro & Max di halaman Paket sesuai konfigurasi. */
export function isiPaket(p) {
  const f = aturFitur(p);
  const ai = kuotaAi(p);
  return {
    gratis: [...SELALU_GRATIS, ...FITUR.filter((x) => f[x.id] === "gratis").map((x) => x.nama), `Mentor & AI ${ai.gratis}x/hari`],
    pro: [...FITUR.filter((x) => f[x.id] !== "gratis" && f[x.id] !== "max"), ...(ai.pro > ai.gratis ? [{ id: "ai", nama: `Kuota AI ${ai.pro}/hari`, ket: `Gratis ${ai.gratis}/hari` }] : [])],
    max: FITUR.filter((x) => f[x.id] === "max"),
  };
}

// Kompatibel dengan kode lama: daftar fitur Pro bawaan & isi kolom Gratis bawaan.
export const FITUR_PRO = isiPaket(null).pro;
export const FITUR_GRATIS = isiPaket(null).gratis;

const hari = (a, b) => Math.ceil((new Date(b) - new Date(a)) / 864e5);

/** Sisa hari Pro (coba / transisi / bayar). null kalau gratis. */
const berbayar = (p) => p?.paket === "pro" || p?.paket === "max";
export const sisaHari = (p, now = new Date().toISOString()) => (berbayar(p) && p.sampai ? Math.max(0, hari(now, p.sampai)) : null);

export const SUMBER = { bayar: "Pro", coba: "Pro · masa coba", transisi: "Pro · gratis masa transisi" };

/** Label singkat paket, cth "Pro · masa coba (sisa 5 hari)". */
export function labelPaket(p, now) {
  if (!p) return "";
  if (p.paket === "lokal") return "Mode coba di HP ini";
  if (!berbayar(p)) return "Gratis";
  if (p.paket === "max") return "Max";
  const n = sisaHari(p, now);
  return `${SUMBER[p.sumber] || "Pro"}${n !== null && p.sumber !== "bayar" ? ` (sisa ${n} hari)` : ""}`;
}

/** Perlu diingatkan? (masa coba/transisi tinggal <= 7 hari, Pro bayar <= 5 hari, atau baru turun ke Gratis <= 14 hari) */
export function perluIngat(p, now = new Date().toISOString()) {
  if (!p || p.paket === "lokal") return null;
  if (berbayar(p)) {
    const n = sisaHari(p, now);
    if (n === null) return null;
    if (p.sumber === "bayar" ? n <= 5 : n <= 7) return { jenis: "habis", sisa: n };
    return null;
  }
  if (p.pro_terakhir && hari(p.pro_terakhir, now) <= 14) return { jenis: "turun", sejak: p.pro_terakhir };
  return null;
}

/** Harga paket (dari server kalau ada). */
export const hargaPaket = (p, paket = "pro") =>
  paket === "max"
    ? { bulan: Number(p?.harga_max_bulan ?? HARGA_MAX.bulan), tahun: Number(p?.harga_max_tahun ?? HARGA_MAX.tahun) }
    : { bulan: Number(p?.harga_bulan ?? HARGA.bulan), tahun: Number(p?.harga_tahun ?? HARGA.tahun) };

/** Hemat bayar tahunan dibanding 12x bulanan (Rp & bulan). */
export const hematTahun = (h = HARGA) => ({ rp: h.bulan * 12 - h.tahun, bulan: Math.round((h.bulan * 12 - h.tahun) / h.bulan) });

/** Link WA ke admin Racikin untuk upgrade (pesan sudah berisi email & nama usaha). */
export function linkUpgrade(p, { email = "", usaha = "", periode = "bulan", paket = "pro" } = {}) {
  const h = hargaPaket(p, paket);
  const harga = periode === "tahun" ? h.tahun : h.bulan;
  const teks = `Halo admin Racikin, aku mau upgrade ke Racikin ${NAMA_PAKET[paket] || "Pro"} (${periode === "tahun" ? "tahunan" : "bulanan"}, Rp${Number(harga).toLocaleString("id-ID")}).\n\nUsaha: ${usaha || "-"}\nEmail akun: ${email || "-"}\n\nCara bayarnya gimana?`;
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

/** Boleh pakai fitur ini? Tingkat paket usaha >= tingkat fitur (tanpa akun = boleh dicoba). */
export function bolehFitur(id, p = paketKini()) {
  if (p.paket === "lokal") return true;
  return (LEVEL[p.paket] ?? 1) >= (LEVEL[tingkatFitur(id, p)] ?? 1);
}

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
