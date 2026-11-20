// Gaji karyawan + kasbon karyawan. Murni (tanpa UI). Melanjutkan js/absen.js (kehadiran).
//
// Skema per karyawan (karyawan.gaji):
//   { skema: "harian" | "bulanan", nominal, makan (uang makan per hari hadir), periode: "mingguan" | "bulanan",
//     potong: true (bulanan: dipotong per hari alpa/izin), hariKerja: 26 }
// - Harian: hadir × nominal. Bulanan: nominal per bulan (dibagi rata per hari kalau periodenya mingguan),
//   dipotong nominal/hariKerja per hari alpa & izin kalau `potong`. Uang makan × hari hadir. Bonus manual.
// - Kasbon karyawan: pinjam = Kas keluar "Kasbon karyawan" (piutang, bukan biaya); dipotong saat gajian.
// - Bayar gaji: Kas keluar "Gaji" sebesar gaji KOTOR + Kas masuk "Potong kasbon karyawan" (kalau ada),
//   jadi uang yang keluar = gaji bersih, biaya gaji di laba rugi = kotor, kasbon nggak dihitung biaya.
//
// state.gajian = [{ id, karyawanId, dari, sampai, rincian, kotor, potongKasbon, bersih, tanggal, metode, catatan }]
// state.kasbonKaryawan = [{ id, karyawanId, tanggal, jenis: "pinjam" | "potong", nominal, catatan, gajianId? }]
import { uid } from "./store.js";
import { rekapAbsen } from "./absen.js";

export const KAT_GAJI = "Gaji";
export const KAT_PINJAM = "Kasbon karyawan";
export const KAT_POTONG = "Potong kasbon karyawan";
/** Kategori Kas yang bukan pendapatan / biaya (cuma pindah uang dengan karyawan). */
export const KAT_PIUTANG_KARYAWAN = [KAT_PINJAM, KAT_POTONG];
export const GAJI_AWAL = { skema: "harian", nominal: 0, makan: 0, periode: "mingguan", potong: true, hariKerja: 26 };
export const METODE = [
  { id: "tunai", nama: "Tunai" },
  { id: "transfer", nama: "Transfer" },
];

const sum = (arr, f) => arr.reduce((a, x) => a + f(x), 0);
const pad = (n) => String(n).padStart(2, "0");
const isoDari = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const tgl = (iso) => new Date(iso + "T00:00:00");
const tambah = (iso, n) => {
  const d = tgl(iso);
  d.setDate(d.getDate() + n);
  return isoDari(d);
};

export const gajiOf = (k) => ({ ...GAJI_AWAL, ...(k?.gaji || {}) });
export const punyaGaji = (k) => Number(k?.gaji?.nominal) > 0;

/** Periode gaji yang memuat tanggal: mingguan Senin–Minggu, bulanan tgl 1–akhir bulan. */
export function periodeDi(periode, iso) {
  if (periode === "bulanan") {
    const d = tgl(iso);
    return { dari: `${iso.slice(0, 7)}-01`, sampai: isoDari(new Date(d.getFullYear(), d.getMonth() + 1, 0)) };
  }
  const dow = (tgl(iso).getDay() + 6) % 7; // Senin = 0
  const dari = tambah(iso, -dow);
  return { dari, sampai: tambah(dari, 6) };
}
/** Periode sebelumnya (yang sudah selesai). */
export const periodeLalu = (periode, iso) => periodeDi(periode, tambah(periodeDi(periode, iso).dari, -1));
const jumlahHari = (dari, sampai) => Math.round((tgl(sampai) - tgl(dari)) / 864e5) + 1;

/** Sisa kasbon karyawan. */
export const saldoKasbonKaryawan = (s, karyawanId) =>
  sum((s.kasbonKaryawan || []).filter((x) => x.karyawanId === karyawanId), (x) => (x.jenis === "pinjam" ? 1 : -1) * (Number(x.nominal) || 0));

/** Gajian yang sudah dibayar untuk karyawan & periode yang bertumpuk. */
export const gajianDi = (s, karyawanId, dari, sampai) => (s.gajian || []).find((g) => g.karyawanId === karyawanId && g.dari <= sampai && g.sampai >= dari) || null;

/**
 * Hitung gaji satu karyawan untuk periode [dari, sampai].
 * Return { hadir, izin, alpa, ..., pokok, makan, potongAbsen, kotor, sisaKasbon }.
 */
export function hitungGaji(s, k, dari, sampai, { bonus = 0 } = {}) {
  const g = gajiOf(k);
  const r = rekapAbsen(s, dari, sampai)[k.id] || { hadir: 0, telat: 0, izin: 0, sakit: 0, libur: 0, alpa: 0, menit: 0 };
  const nominal = Math.max(0, Math.round(Number(g.nominal) || 0));
  let pokok = 0;
  let potongAbsen = 0;
  let perHari = 0;
  if (g.skema === "bulanan") {
    // Bulanan dibayar per periode: penuh untuk periode bulanan, proporsional (hari / hari sebulan) untuk mingguan.
    const hariBulan = new Date(tgl(dari).getFullYear(), tgl(dari).getMonth() + 1, 0).getDate();
    pokok = g.periode === "bulanan" ? nominal : Math.round((nominal * jumlahHari(dari, sampai)) / hariBulan);
    perHari = Math.round(nominal / (Number(g.hariKerja) || 26));
    if (g.potong) potongAbsen = Math.min(pokok, perHari * (r.alpa + r.izin));
  } else {
    perHari = nominal;
    pokok = nominal * r.hadir;
  }
  const makan = Math.max(0, Math.round(Number(g.makan) || 0)) * r.hadir;
  const b = Math.max(0, Math.round(Number(bonus) || 0));
  const kotor = Math.max(0, pokok - potongAbsen + makan + b);
  return { ...r, skema: g.skema, perHari, pokok, potongAbsen, makan, bonus: b, kotor, sisaKasbon: Math.max(0, saldoKasbonKaryawan(s, k.id)) };
}

/** Pinjam kasbon karyawan (uang keluar dari Kas). */
export function pinjamKasbon(s, karyawanId, { nominal, tanggal, catatan = "" }) {
  const n = Math.round(Number(nominal) || 0);
  if (n <= 0) throw new Error("Isi jumlah kasbonnya");
  const k = (s.karyawan || []).find((x) => x.id === karyawanId);
  if (!k) throw new Error("Karyawan nggak ketemu");
  const e = { id: uid(), karyawanId, tanggal, jenis: "pinjam", nominal: n, ...(String(catatan).trim() ? { catatan: String(catatan).trim().slice(0, 80) } : {}) };
  return {
    kasbonKaryawan: [...(s.kasbonKaryawan || []), e],
    transactions: [...(s.transactions || []), { id: `kbk-${e.id}`, tanggal, jenis: "keluar", kategori: KAT_PINJAM, nominal: n, catatan: `Kasbon ${k.nama}${e.catatan ? ` · ${e.catatan}` : ""}`, ref: "gaji" }],
  };
}

/** Hapus catatan pinjam (salah catat). Potongan dari gajian dihapus lewat batalGajian. */
export function hapusPinjam(s, id) {
  const e = (s.kasbonKaryawan || []).find((x) => x.id === id);
  if (!e || e.jenis !== "pinjam") return null;
  return { kasbonKaryawan: s.kasbonKaryawan.filter((x) => x.id !== id), transactions: (s.transactions || []).filter((t) => t.id !== `kbk-${id}`) };
}

/**
 * Bayar gaji. Return { gajian, kasbonKaryawan, transactions, entri }.
 * potongKasbon dibatasi sisa kasbon & gaji kotor.
 */
export function bayarGaji(s, karyawanId, { dari, sampai, bonus = 0, potongKasbon = 0, tanggal, metode = "tunai", catatan = "" }) {
  const k = (s.karyawan || []).find((x) => x.id === karyawanId);
  if (!k) throw new Error("Karyawan nggak ketemu");
  if (gajianDi(s, karyawanId, dari, sampai)) throw new Error(`Gaji ${k.nama} periode ini sudah dibayar`);
  const h = hitungGaji(s, k, dari, sampai, { bonus });
  if (h.kotor <= 0) throw new Error(`Gaji ${k.nama} periode ini Rp0 (cek absen & setelan gajinya)`);
  const pot = Math.min(Math.max(0, Math.round(Number(potongKasbon) || 0)), h.sisaKasbon, h.kotor);
  const id = uid();
  const entri = {
    id,
    karyawanId,
    dari,
    sampai,
    rincian: { skema: h.skema, hadir: h.hadir, izin: h.izin, sakit: h.sakit, libur: h.libur, alpa: h.alpa, telat: h.telat, perHari: h.perHari, pokok: h.pokok, potongAbsen: h.potongAbsen, makan: h.makan, bonus: h.bonus },
    kotor: h.kotor,
    potongKasbon: pot,
    bersih: h.kotor - pot,
    tanggal,
    metode,
    ...(String(catatan).trim() ? { catatan: String(catatan).trim().slice(0, 80) } : {}),
  };
  const tx = [...(s.transactions || []), { id: `gaji-${id}`, tanggal, jenis: "keluar", kategori: KAT_GAJI, nominal: h.kotor, catatan: `Gaji ${k.nama} ${dari} s/d ${sampai}`, ref: "gaji" }];
  let kasbonKaryawan = s.kasbonKaryawan || [];
  if (pot) {
    kasbonKaryawan = [...kasbonKaryawan, { id: `pot-${id}`, karyawanId, tanggal, jenis: "potong", nominal: pot, gajianId: id }];
    tx.push({ id: `gaji-${id}-kasbon`, tanggal, jenis: "masuk", kategori: KAT_POTONG, nominal: pot, catatan: `Potong kasbon dari gaji ${k.nama}`, ref: "gaji" });
  }
  return { gajian: [...(s.gajian || []), entri], kasbonKaryawan, transactions: tx, entri };
}

/** Batalkan gajian (salah bayar): Kas & potongan kasbon ikut dihapus. */
export function batalGajian(s, id) {
  return {
    gajian: (s.gajian || []).filter((g) => g.id !== id),
    kasbonKaryawan: (s.kasbonKaryawan || []).filter((x) => x.gajianId !== id),
    transactions: (s.transactions || []).filter((t) => t.id !== `gaji-${id}` && t.id !== `gaji-${id}-kasbon`),
  };
}

/** Karyawan yang gajinya periode lalu belum dibayar (untuk pengingat). */
export function belumGajian(s, today) {
  return (s.karyawan || [])
    .filter((k) => k.aktif !== false && punyaGaji(k))
    .map((k) => {
      const p = periodeLalu(gajiOf(k).periode, today);
      if (k.mulai && k.mulai > p.sampai) return null;
      if (gajianDi(s, k.id, p.dari, p.sampai)) return null;
      const h = hitungGaji(s, k, p.dari, p.sampai);
      return h.kotor > 0 ? { k, ...p, kotor: h.kotor } : null;
    })
    .filter(Boolean);
}

/** Slip gaji untuk WhatsApp. */
export function teksSlip(k, g, bisnis, rp) {
  const r = g.rincian;
  return [
    `*Slip gaji ${bisnis}*`,
    `${k.nama}${k.posisi ? ` (${k.posisi})` : ""}`,
    `Periode ${g.dari} s/d ${g.sampai}`,
    "",
    `Hadir ${r.hadir} hari${r.izin ? ` · izin ${r.izin}` : ""}${r.sakit ? ` · sakit ${r.sakit}` : ""}${r.alpa ? ` · alpa ${r.alpa}` : ""}${r.telat ? ` · telat ${r.telat}` : ""}`,
    r.skema === "harian" ? `Gaji harian ${r.hadir} × ${rp(r.perHari)} = ${rp(r.pokok)}` : `Gaji pokok ${rp(r.pokok)}`,
    r.potongAbsen ? `Potongan nggak masuk -${rp(r.potongAbsen)}` : null,
    r.makan ? `Uang makan ${rp(r.makan)}` : null,
    r.bonus ? `Bonus / lembur ${rp(r.bonus)}` : null,
    `Total gaji ${rp(g.kotor)}`,
    g.potongKasbon ? `Potong kasbon -${rp(g.potongKasbon)}` : null,
    `*Diterima ${rp(g.bersih)}*`,
    `Dibayar ${g.tanggal} (${g.metode === "transfer" ? "transfer" : "tunai"})`,
    "",
    "Makasih atas kerja kerasnya!",
  ]
    .filter((l) => l !== null)
    .join("\n");
}
