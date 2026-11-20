// Jadwal kerja / shift karyawan. Murni (tanpa UI).
//
// - Template shift bisa diatur sendiri (default Pagi / Siang / Malam) + "Libur".
// - Jadwal per tanggal per karyawan, dilihat per minggu (Senin–Minggu) atau per bulan.
// - Isi cepat: pola mingguan (hari libur tetap + satu shift, atau shift bergilir tiap N minggu), salin periode lalu.
// - Dipakai absen & gaji: telat dihitung dari jam mulai shift, lembur dari jam selesai shift (lihat absen.js / gaji.js).
//
// state.jadwal = { shift: [{ id, nama, mulai, selesai }], hari: { "YYYY-MM-DD": { karyawanId: shiftId | "libur" } },
//                  akun: { akunId: karyawanId } }
// Disimpan terpisah dari `karyawan` supaya akun kasir bisa melihat jadwalnya sendiri (data karyawan, gaji & absen
// tetap disembunyikan dari kasir). `akun` diisi dari karyawan.akunId (sinkronAkun).
import { uid } from "./store.js";

export const LIBUR = "libur";
export const SHIFT_AWAL = [
  { id: "pagi", nama: "Pagi", mulai: "07:00", selesai: "15:00" },
  { id: "siang", nama: "Siang", mulai: "11:00", selesai: "19:00" },
  { id: "malam", nama: "Malam", mulai: "15:00", selesai: "23:00" },
];
export const HARI = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];

const pad = (n) => String(n).padStart(2, "0");
const isoDari = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const tgl = (iso) => new Date(iso + "T00:00:00");
export const tambahHari = (iso, n) => {
  const d = tgl(iso);
  d.setDate(d.getDate() + n);
  return isoDari(d);
};
/** 0 = Senin … 6 = Minggu */
export const hariKe = (iso) => (tgl(iso).getDay() + 6) % 7;
const menit = (hhmm) => {
  const m = String(hhmm || "").match(/^(\d{1,2}):(\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

export const jadwalOf = (s) => ({
  shift: Array.isArray(s.jadwal?.shift) && s.jadwal.shift.length ? s.jadwal.shift : SHIFT_AWAL,
  hari: s.jadwal?.hari || {},
  akun: s.jadwal?.akun || {},
});
export const templateShift = (s) => jadwalOf(s).shift;
export const adaJadwal = (s) => Object.keys(jadwalOf(s).hari).length > 0;

/** Singkatan buat kotak jadwal (P / S / M, atau 2 huruf kalau dobel). */
export function kodeShift(list, id) {
  if (id === LIBUR) return "L";
  const sh = list.find((x) => x.id === id);
  if (!sh) return "?";
  const satu = sh.nama.trim()[0]?.toUpperCase() || "?";
  const sama = list.filter((x) => x.nama.trim()[0]?.toUpperCase() === satu).length > 1 || satu === "L";
  return sama ? sh.nama.trim().slice(0, 2).replace(/^./, (c) => c.toUpperCase()) : satu;
}

/** Durasi shift (menit), shift lewat tengah malam didukung (cth 18:00–02:00). */
export function durasi(sh) {
  const a = menit(sh.mulai);
  const b = menit(sh.selesai);
  if (a == null || b == null) return 0;
  return b > a ? b - a : b + 1440 - a;
}

/** Jadwal satu orang di satu tanggal: null (nggak dijadwalkan) | { libur: true } | template shift. */
export function shiftDi(s, tanggal, karyawanId) {
  const j = jadwalOf(s);
  const v = j.hari[tanggal]?.[karyawanId];
  if (!v) return null;
  if (v === LIBUR) return { id: LIBUR, nama: "Libur", libur: true };
  return j.shift.find((x) => x.id === v) || null;
}

const simpanHari = (s, hari) => ({ jadwal: { ...jadwalOf(s), hari } });

/** Isi / hapus satu kotak (val null = hapus). */
export function setSel(s, tanggal, karyawanId, val) {
  const hari = { ...jadwalOf(s).hari };
  const h = { ...(hari[tanggal] || {}) };
  if (val) h[karyawanId] = val;
  else delete h[karyawanId];
  if (Object.keys(h).length) hari[tanggal] = h;
  else delete hari[tanggal];
  return simpanHari(s, hari);
}

/** Rentang tampilan: minggu (Senin–Minggu) atau bulan yang memuat `anchor`. */
export function rentang(mode, anchor) {
  if (mode === "bulan") {
    const d = tgl(anchor);
    const dari = `${anchor.slice(0, 7)}-01`;
    const sampai = isoDari(new Date(d.getFullYear(), d.getMonth() + 1, 0));
    return { dari, sampai, hari: daftarHari(dari, sampai) };
  }
  const dari = tambahHari(anchor, -hariKe(anchor));
  const sampai = tambahHari(dari, 6);
  return { dari, sampai, hari: daftarHari(dari, sampai) };
}
export function daftarHari(dari, sampai) {
  const out = [];
  for (let t = dari; t <= sampai; t = tambahHari(t, 1)) out.push(t);
  return out;
}
/** Geser anchor satu periode. */
export function geserAnchor(mode, anchor, n) {
  if (mode === "bulan") {
    const d = tgl(`${anchor.slice(0, 7)}-01`);
    return isoDari(new Date(d.getFullYear(), d.getMonth() + n, 1));
  }
  return tambahHari(anchor, 7 * n);
}

/**
 * Pola mingguan untuk beberapa karyawan dalam rentang:
 * libur = [0..6] hari libur tetap; shiftIds = [satu shift] atau beberapa (bergilir tiap `ganti` minggu, mulai minggu pertama rentang).
 * timpa = false: kotak yang sudah terisi dibiarkan.
 */
export function terapkanPola(s, { karyawanIds, dari, sampai, shiftIds, libur = [], ganti = 1, timpa = true }) {
  if (!karyawanIds?.length) throw new Error("Pilih karyawannya dulu");
  if (!shiftIds?.length) throw new Error("Pilih minimal satu shift");
  const awal = tambahHari(dari, -hariKe(dari));
  const n = Math.max(1, Math.round(Number(ganti) || 1));
  const hari = { ...jadwalOf(s).hari };
  for (const t of daftarHari(dari, sampai)) {
    const minggu = Math.floor((tgl(t) - tgl(awal)) / (7 * 864e5));
    const val = libur.includes(hariKe(t)) ? LIBUR : shiftIds[Math.floor(minggu / n) % shiftIds.length];
    const h = { ...(hari[t] || {}) };
    for (const id of karyawanIds) if (timpa || !h[id]) h[id] = val;
    hari[t] = h;
  }
  return simpanHari(s, hari);
}

/** Salin jadwal dari periode sebelumnya: minggu lalu (−7 hari) atau 4 minggu lalu untuk bulan (hari dalam minggu tetap sama). */
export function salinSebelumnya(s, mode, dari, sampai, { timpa = false } = {}) {
  const geser = mode === "bulan" ? 28 : 7;
  const hari = { ...jadwalOf(s).hari };
  let n = 0;
  for (const t of daftarHari(dari, sampai)) {
    const asal = hari[tambahHari(t, -geser)];
    if (!asal) continue;
    const h = { ...(hari[t] || {}) };
    for (const [id, v] of Object.entries(asal)) {
      if (!timpa && h[id]) continue;
      h[id] = v;
      n++;
    }
    hari[t] = h;
  }
  if (!n) throw new Error(`Jadwal ${mode === "bulan" ? "4 minggu" : "minggu"} sebelumnya masih kosong`);
  return { ...simpanHari(s, hari), n };
}

/** Kosongkan jadwal dalam rentang (opsional untuk karyawan tertentu). */
export function kosongkan(s, dari, sampai, karyawanIds = null) {
  const hari = { ...jadwalOf(s).hari };
  for (const t of daftarHari(dari, sampai)) {
    if (!hari[t]) continue;
    if (!karyawanIds) delete hari[t];
    else {
      const h = { ...hari[t] };
      for (const id of karyawanIds) delete h[id];
      if (Object.keys(h).length) hari[t] = h;
      else delete hari[t];
    }
  }
  return simpanHari(s, hari);
}

// ---------- Template shift ----------
function cekShift({ nama, mulai, selesai }, list, id = null) {
  const n = String(nama || "").trim().replace(/\s+/g, " ").slice(0, 20);
  if (!n) throw new Error("Isi nama shiftnya");
  if (n.toLowerCase() === "libur") throw new Error('"Libur" sudah tersedia');
  if (list.some((x) => x.id !== id && x.nama.toLowerCase() === n.toLowerCase())) throw new Error(`Shift ${n} sudah ada`);
  if (menit(mulai) == null || menit(selesai) == null) throw new Error("Isi jam mulai & selesai");
  if (mulai === selesai) throw new Error("Jam mulai & selesai nggak boleh sama");
  return { nama: n, mulai, selesai };
}
export function tambahShift(s, data) {
  const list = templateShift(s);
  const sh = { id: uid(), ...cekShift(data, list) };
  return { jadwal: { ...jadwalOf(s), shift: [...list, sh] } };
}
export function ubahShift(s, id, data) {
  const list = templateShift(s);
  if (!list.some((x) => x.id === id)) throw new Error("Shift nggak ketemu");
  return { jadwal: { ...jadwalOf(s), shift: list.map((x) => (x.id === id ? { id, ...cekShift(data, list, id) } : x)) } };
}
/** Hapus template; kotak jadwal yang memakai shift itu ikut dikosongkan. */
export function hapusShift(s, id) {
  const list = templateShift(s);
  if (list.length <= 1) throw new Error("Minimal harus ada satu shift");
  const hari = {};
  for (const [t, h] of Object.entries(jadwalOf(s).hari)) {
    const baru = Object.fromEntries(Object.entries(h).filter(([, v]) => v !== id));
    if (Object.keys(baru).length) hari[t] = baru;
  }
  return { jadwal: { ...jadwalOf(s), shift: list.filter((x) => x.id !== id), hari } };
}
export const pakaiShift = (s, id) => Object.values(jadwalOf(s).hari).reduce((a, h) => a + Object.values(h).filter((v) => v === id).length, 0);

// ---------- Akun kasir ----------
/** Peta akun kasir -> karyawan (dari karyawan.akunId), supaya kasir bisa melihat jadwalnya sendiri. */
export function sinkronAkun(s) {
  const akun = {};
  for (const k of s.karyawan || []) if (k.akunId && k.aktif !== false) akun[k.akunId] = k.id;
  return { jadwal: { ...jadwalOf(s), akun } };
}
/** Jadwal milik akun (untuk kasir): [{ tanggal, shift|null }] */
export function jadwalAkun(s, akunId, dari, sampai) {
  const kid = jadwalOf(s).akun[akunId];
  if (!kid) return null;
  return daftarHari(dari, sampai).map((t) => ({ tanggal: t, shift: shiftDi(s, t, kid) }));
}

// ---------- Ringkasan ----------
/** Yang dijadwalkan masuk di tanggal itu (bukan libur), urut jam mulai. */
export function masukHari(s, tanggal) {
  return (s.karyawan || [])
    .filter((k) => k.aktif !== false)
    .map((k) => ({ k, shift: shiftDi(s, tanggal, k.id) }))
    .filter((x) => x.shift && !x.shift.libur)
    .sort((a, b) => a.shift.mulai.localeCompare(b.shift.mulai) || a.k.nama.localeCompare(b.k.nama, "id"));
}

/** Jumlah orang per shift per hari (cek kekurangan orang). */
export function hitungPerHari(s, hari) {
  return hari.map((t) => {
    const h = jadwalOf(s).hari[t] || {};
    const per = {};
    for (const v of Object.values(h)) if (v !== LIBUR) per[v] = (per[v] || 0) + 1;
    return { tanggal: t, per, total: Object.values(per).reduce((a, n) => a + n, 0) };
  });
}

const NAMA_HARI = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"];
/** Jadwal satu karyawan untuk WhatsApp. */
export function teksJadwal(s, k, dari, sampai, bisnis) {
  const baris = daftarHari(dari, sampai).map((t) => {
    const sh = shiftDi(s, t, k.id);
    return `${NAMA_HARI[hariKe(t)]} ${Number(t.slice(8))}/${Number(t.slice(5, 7))}: ${!sh ? "-" : sh.libur ? "Libur" : `${sh.nama} ${sh.mulai}–${sh.selesai}`}`;
  });
  return [`*Jadwal kerja ${bisnis}*`, `${k.nama} · ${dari} s/d ${sampai}`, "", ...baris, "", "Kalau ada yang bentrok kabarin ya!"].join("\n");
}

/** Batas telat & lembur dari jadwal: { mulai, selesai } menit, atau null kalau nggak dijadwalkan / libur. */
export function jamShift(s, tanggal, karyawanId) {
  const sh = shiftDi(s, tanggal, karyawanId);
  if (!sh || sh.libur) return null;
  return { mulai: menit(sh.mulai), selesai: menit(sh.selesai), durasi: durasi(sh) };
}
