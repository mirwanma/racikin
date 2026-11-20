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
import { rekapAbsen, absenHari, setelan } from "./absen.js";
import { jamShift } from "./jadwal.js";

export const KAT_GAJI = "Gaji";
export const KAT_PINJAM = "Kasbon karyawan";
export const KAT_POTONG = "Potong kasbon karyawan";
/** Kategori Kas yang bukan pendapatan / biaya (cuma pindah uang dengan karyawan). */
export const KAT_PIUTANG_KARYAWAN = [KAT_PINJAM, KAT_POTONG];
export const GAJI_AWAL = { skema: "harian", nominal: 0, makan: 0, periode: "mingguan", potong: true, hariKerja: 26, lembur: "tidak", tarifLembur: 0 };
export const KAT_THR = "THR";
// Lembur: jam kerja (masuk–pulang di absen) yang lewat jam kerja normal (absenSetting.jamKerja, default 8), per jam penuh,
// maks 4 jam/hari (PP 35/2021). lembur: "tidak" | "tetap" (tarifLembur per jam) | "depnaker" (upah sebulan / 173;
// jam pertama 1,5×, berikutnya 2×). THR (Permenaker 6/2016, SE Menaker tiap tahun): masa kerja ≥ 12 bulan = 1 bulan upah,
// 1–12 bulan proporsional (masa kerja / 12 × upah), harian = rata-rata upah bulanan; dibayar paling lambat H-7.
export const MAKS_LEMBUR = 4;
export const THR_DICEK = "November 2026";
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
/**
 * Siapa yang boleh mengubah setelan gaji & lembur (gaji per karyawan, jam kerja normal): pemilik, atau manajer kalau
 * pemilik mengizinkan (absenSetting.manajerAturGaji). Server juga mengunci (kunci_gaji di doc_save).
 */
export const bolehAturGaji = (s, peran) => peran === "owner" || (peran === "manajer" && !!s.absenSetting?.manajerAturGaji);
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
/** Upah sebulan (dasar lembur Depnaker & THR): bulanan = nominal, harian = nominal × hari kerja sebulan. */
export const upahBulanan = (k) => {
  const g = gajiOf(k);
  return Math.round((Number(g.nominal) || 0) * (g.skema === "bulanan" ? 1 : Number(g.hariKerja) || 26));
};

/** Lembur satu hari dari menit kerja. Return { jam, rp }. */
export function lemburHari(k, menitKerja, jamKerja = 8) {
  const g = gajiOf(k);
  if (g.lembur === "tidak" || !menitKerja) return { jam: 0, rp: 0 };
  const jam = Math.min(MAKS_LEMBUR, Math.max(0, Math.floor((menitKerja - jamKerja * 60) / 60)));
  if (!jam) return { jam: 0, rp: 0 };
  if (g.lembur === "depnaker") {
    const sejam = upahBulanan(k) / 173;
    return { jam, rp: Math.round(1.5 * sejam + (jam - 1) * 2 * sejam) };
  }
  return { jam, rp: jam * Math.max(0, Math.round(Number(g.tarifLembur) || 0)) };
}

/** Lembur dalam periode, dari absen hadir yang punya jam masuk & pulang. */
export function lemburPeriode(s, k, dari, sampai) {
  const jamKerja = Number(setelan(s).jamKerja) || 8;
  let jam = 0;
  let rp = 0;
  const hari = [];
  for (let t = dari; t <= sampai; t = tambah(t, 1)) {
    const a = absenHari(s, t)[k.id];
    if (a?.status !== "hadir" || !a.masuk || !a.pulang) continue;
    const [h1, m1] = a.masuk.split(":").map(Number);
    const [h2, m2] = a.pulang.split(":").map(Number);
    // Dijadwalkan shift: lembur = pulang lewat jam selesai shift (shift lewat tengah malam didukung).
    // Tanpa jadwal: lama kerja lewat jam kerja normal.
    const js = jamShift(s, t, k.id);
    let kerja = h2 * 60 + m2 - (h1 * 60 + m1);
    if (js) {
      const masuk = h1 * 60 + m1;
      let pulang = h2 * 60 + m2;
      let selesai = js.selesai;
      if (selesai <= js.mulai) selesai += 1440;
      if (pulang < masuk) pulang += 1440;
      kerja = jamKerja * 60 + Math.max(0, pulang - selesai);
    }
    const l = lemburHari(k, kerja, jamKerja);
    if (!l.jam) continue;
    jam += l.jam;
    rp += l.rp;
    hari.push({ tanggal: t, ...l });
  }
  return { jam, rp, hari };
}

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
  const l = lemburPeriode(s, k, dari, sampai);
  const kotor = Math.max(0, pokok - potongAbsen + makan + l.rp + b);
  return { ...r, skema: g.skema, perHari, pokok, potongAbsen, makan, lemburJam: l.jam, lembur: l.rp, lemburHari: l.hari, bonus: b, kotor, sisaKasbon: Math.max(0, saldoKasbonKaryawan(s, k.id)) };
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
    rincian: { skema: h.skema, hadir: h.hadir, izin: h.izin, sakit: h.sakit, libur: h.libur, alpa: h.alpa, telat: h.telat, perHari: h.perHari, pokok: h.pokok, potongAbsen: h.potongAbsen, makan: h.makan, lemburJam: h.lemburJam, lembur: h.lembur, bonus: h.bonus },
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
    r.lembur ? `Lembur ${r.lemburJam} jam ${rp(r.lembur)}` : null,
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

// ---------- THR ----------

/** Masa kerja dalam bulan penuh sampai hari raya. null kalau tanggal mulai kerja belum diisi. */
export function masaKerja(mulai, hariRaya) {
  if (!mulai || !hariRaya || mulai > hariRaya) return mulai ? 0 : null;
  const a = tgl(mulai);
  const b = tgl(hariRaya);
  let n = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
  if (b.getDate() < a.getDate()) n -= 1;
  return Math.max(0, n);
}

/**
 * Upah sebulan untuk THR. Bulanan: gaji pokok. Harian: rata-rata gaji pokok per bulan dari gaji yang sudah dibayar
 * (12 bulan terakhir sebelum hari raya, atau selama masa kerja); kalau belum ada data, perkiraan nominal × 26.
 */
export function upahThr(s, k, hariRaya) {
  const g = gajiOf(k);
  if (g.skema === "bulanan") return { upah: Math.round(Number(g.nominal) || 0), estimasi: false, bulan: 0 };
  const awal = tambah(hariRaya, -365);
  const per = {};
  for (const x of (s.gajian || []).filter((y) => y.karyawanId === k.id && y.sampai < hariRaya && y.sampai >= awal)) {
    const ym = x.sampai.slice(0, 7);
    per[ym] = (per[ym] || 0) + (Number(x.rincian?.pokok) || 0) - (Number(x.rincian?.potongAbsen) || 0);
  }
  const vals = Object.values(per);
  if (!vals.length) return { upah: upahBulanan(k), estimasi: true, bulan: 0 };
  return { upah: Math.round(sum(vals, (v) => v) / vals.length), estimasi: false, bulan: vals.length };
}

/** Hitung THR satu karyawan. Return { masa, upah, estimasi, nominal, catatan }. */
export function hitungThr(s, k, hariRaya) {
  const masa = masaKerja(k.mulai, hariRaya);
  const u = upahThr(s, k, hariRaya);
  if (masa === null) return { masa, ...u, nominal: 0, catatan: "Isi tanggal mulai kerja dulu" };
  if (masa < 1) return { masa, ...u, nominal: 0, catatan: "Belum 1 bulan kerja: belum dapat THR" };
  const nominal = masa >= 12 ? u.upah : Math.round((masa / 12) * u.upah);
  // Pekerja harian: riwayat gaji di app lebih pendek dari masa kerja -> rata-rata bisa kekecilan, minta dicek.
  const kurang = !u.estimasi && u.bulan > 0 && u.bulan < Math.min(masa, 12);
  return { masa, ...u, nominal, kurang, catatan: masa >= 12 ? "1 bulan upah" : `${masa}/12 × upah sebulan` };
}

export const thrDi = (s, karyawanId, hariRaya) => (s.thr || []).find((x) => x.karyawanId === karyawanId && x.hariRaya === hariRaya) || null;

/** Bayar THR -> Kas keluar kategori THR. */
export function bayarThr(s, karyawanId, { hariRaya, nominal, tanggal, metode = "tunai" }) {
  const k = (s.karyawan || []).find((x) => x.id === karyawanId);
  if (!k) throw new Error("Karyawan nggak ketemu");
  if (!hariRaya) throw new Error("Isi tanggal hari raya dulu");
  if (thrDi(s, karyawanId, hariRaya)) throw new Error(`THR ${k.nama} sudah dibayar`);
  const n = Math.round(Number(nominal) || 0);
  if (n <= 0) throw new Error("Isi jumlah THR");
  const h = hitungThr(s, k, hariRaya);
  const e = { id: uid(), karyawanId, hariRaya, masa: h.masa, upah: h.upah, nominal: n, tanggal, metode };
  return {
    thr: [...(s.thr || []), e],
    transactions: [...(s.transactions || []), { id: `thr-${e.id}`, tanggal, jenis: "keluar", kategori: KAT_THR, nominal: n, catatan: `THR ${k.nama} (hari raya ${hariRaya})`, ref: "gaji" }],
    entri: e,
  };
}

export const batalThr = (s, id) => ({ thr: (s.thr || []).filter((x) => x.id !== id), transactions: (s.transactions || []).filter((t) => t.id !== `thr-${id}`) });

/** Batas bayar THR (H-7). */
export const batasThr = (hariRaya) => tambah(hariRaya, -7);

/** Pengingat: hari raya ≤ 30 hari lagi & THR belum dibayar. Return { hariRaya, batas, telat, list } | null */
export function pengingatThr(s, today) {
  const hr = setelan(s).hariRaya;
  if (!hr || today > hr || today < tambah(hr, -30)) return null;
  const list = (s.karyawan || [])
    .filter((k) => k.aktif !== false && punyaGaji(k) && !thrDi(s, k.id, hr))
    .map((k) => ({ k, ...hitungThr(s, k, hr) }))
    .filter((x) => x.nominal > 0 || x.masa === null);
  if (!list.length) return null;
  return { hariRaya: hr, batas: batasThr(hr), telat: today > batasThr(hr), list, total: sum(list, (x) => x.nominal) };
}

/** Rekap gaji & THR (baris CSV), urut tanggal bayar. */
export function rekapGajiCsv(s, dari = "0000-00-00", sampai = "9999-99-99") {
  const nama = new Map((s.karyawan || []).map((k) => [k.id, k.nama]));
  const rows = [["Tanggal bayar", "Karyawan", "Jenis", "Periode", "Hadir", "Izin", "Sakit", "Alpa", "Gaji pokok", "Potongan absen", "Uang makan", "Lembur (jam)", "Lembur (Rp)", "Bonus", "Total gaji", "Potong kasbon", "Diterima", "Metode"]];
  const list = [
    ...(s.gajian || []).map((g) => ({ t: g.tanggal, row: [g.tanggal, nama.get(g.karyawanId) || "-", "Gaji", `${g.dari} s/d ${g.sampai}`, g.rincian.hadir, g.rincian.izin, g.rincian.sakit, g.rincian.alpa, g.rincian.pokok, g.rincian.potongAbsen, g.rincian.makan, g.rincian.lemburJam || 0, g.rincian.lembur || 0, g.rincian.bonus, g.kotor, g.potongKasbon, g.bersih, g.metode] })),
    ...(s.thr || []).map((x) => ({ t: x.tanggal, row: [x.tanggal, nama.get(x.karyawanId) || "-", "THR", `hari raya ${x.hariRaya}`, "", "", "", "", x.upah, "", "", "", "", "", x.nominal, 0, x.nominal, x.metode] })),
  ]
    .filter((x) => x.t >= dari && x.t <= sampai)
    .sort((a, b) => a.t.localeCompare(b.t));
  return [...rows, ...list.map((x) => x.row)];
}
