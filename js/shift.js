// Shift kasir & tutup kasir. Murni (tanpa UI).
//
// state.shifts = [{
//   id, kasir: { id, nama } | null, buka: "YYYY-MM-DDTHH:MM", tutup: null | "...",
//   modal,                                   // uang awal di laci
//   laci: [{ id, waktu, jenis: keluar|tambah|ambil, nominal, kategori, catatan }],
//   setor: null | number,                    // uang di laci saat dihitung waktu tutup
//   hasil: null | { ...ringkasan saat tutup }, catatan, ditutupOleh
// }]
// state.posSetting = { wajibShift: boolean }
//
// Order yang dibuat saat shift terbuka diberi order.shiftId.
// "keluar" (beli es, dll.) dibayar dari laci -> juga jadi pengeluaran di Kas (ref "laci").
// "tambah" (uang kembalian ditambah) & "ambil" (disetor ke pemilik) hanya memindah uang, tidak masuk Kas.
import { uid } from "./store.js";
import { todayISO } from "./ui.js";

export const SIMPAN_SHIFT_HARI = 90;
export const JENIS_LACI = {
  keluar: { nama: "Pengeluaran", desc: "Bayar sesuatu dari laci (beli es, gas, dll.) · tercatat di Kas", tanda: -1 },
  tambah: { nama: "Tambah uang", desc: "Tambah uang kembalian ke laci", tanda: 1 },
  ambil: { nama: "Setor / ambil", desc: "Uang diambil dari laci (disetor ke pemilik)", tanda: -1 },
};
export const KATEGORI_LACI = ["Bahan Baku", "Kemasan", "Operasional", "Lainnya"];

/** Waktu lokal "YYYY-MM-DDTHH:MM" */
export function nowLocal() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

const sum = (arr, f) => arr.reduce((a, x) => a + f(x), 0);
const kasirId = (k) => k?.id || null;

/** Shift yang masih terbuka milik kasir ini (null = pemakai tanpa akun). */
export const shiftAktif = (s, kasir) => (s.shifts || []).find((x) => !x.tutup && kasirId(x.kasir) === kasirId(kasir)) || null;
export const shiftTerbuka = (s) => (s.shifts || []).filter((x) => !x.tutup);
export const wajibShift = (s) => !!s.posSetting?.wajibShift;

/** Ringkasan uang shift (dihitung dari order & catatan laci). */
export function ringkasan(s, shift) {
  const orders = (s.orders || []).filter((o) => o.shiftId === shift.id && o.status !== "batal");
  const tunai = sum(orders.filter((o) => o.metode === "tunai"), (o) => o.total);
  const nonTunai = sum(orders.filter((o) => o.channel === "toko" && o.metode !== "tunai"), (o) => o.total);
  const online = sum(orders.filter((o) => o.channel && o.channel !== "toko"), (o) => o.total);
  const laci = shift.laci || [];
  const keluar = sum(laci.filter((l) => l.jenis === "keluar"), (l) => l.nominal);
  const tambah = sum(laci.filter((l) => l.jenis === "tambah"), (l) => l.nominal);
  const ambil = sum(laci.filter((l) => l.jenis === "ambil"), (l) => l.nominal);
  const seharusnya = (Number(shift.modal) || 0) + tunai + tambah - keluar - ambil;
  return {
    order: orders.length,
    omzet: tunai + nonTunai + online,
    tunai,
    nonTunai,
    online,
    keluar,
    tambah,
    ambil,
    modal: Number(shift.modal) || 0,
    seharusnya,
    batal: (s.orders || []).filter((o) => o.shiftId === shift.id && o.status === "batal").length,
  };
}

/** Patch: buka shift baru. */
export function bukaShift(s, { kasir = null, modal = 0 }) {
  if (shiftAktif(s, kasir)) throw new Error("Shift kamu masih terbuka. Tutup dulu sebelum buka yang baru.");
  const shift = { id: uid(), kasir, buka: nowLocal(), tutup: null, modal: Math.max(0, Math.round(Number(modal) || 0)), laci: [], setor: null, hasil: null, catatan: "" };
  return { patch: { shifts: prune([...(s.shifts || []), shift]) }, shift };
}

/** Patch: catat uang keluar/masuk laci. */
export function catatLaci(s, shiftId, { jenis, nominal, kategori = "Operasional", catatan = "" }) {
  const n = Math.round(Number(nominal) || 0);
  if (!JENIS_LACI[jenis]) throw new Error("Jenis tidak dikenal");
  if (n <= 0) throw new Error("Nominal harus lebih dari 0");
  const entry = { id: uid(), waktu: nowLocal(), jenis, nominal: n, kategori: jenis === "keluar" ? kategori : "", catatan: String(catatan || "").trim().slice(0, 80) };
  const shifts = (s.shifts || []).map((x) => (x.id === shiftId ? { ...x, laci: [...(x.laci || []), entry] } : x));
  return { shifts, transactions: laciTransactions({ ...s, shifts }) };
}

/** Patch: hapus catatan laci (salah input). */
export function hapusLaci(s, shiftId, entryId) {
  const shifts = (s.shifts || []).map((x) => (x.id === shiftId ? { ...x, laci: (x.laci || []).filter((l) => l.id !== entryId) } : x));
  return { shifts, transactions: laciTransactions({ ...s, shifts }) };
}

/** Patch: tutup shift dengan uang hasil hitung fisik. Ringkasan saat itu disimpan permanen. */
export function tutupShift(s, shiftId, { setor, catatan = "", oleh = null }) {
  const shift = (s.shifts || []).find((x) => x.id === shiftId);
  if (!shift || shift.tutup) throw new Error("Shift sudah ditutup");
  const r = ringkasan(s, shift);
  const uang = setor === null || setor === "" || setor === undefined ? null : Math.max(0, Math.round(Number(setor) || 0));
  const hasil = { ...r, setor: uang, selisih: uang === null ? null : uang - r.seharusnya };
  const tutup = nowLocal();
  return {
    shifts: s.shifts.map((x) => (x.id === shiftId ? { ...x, tutup, setor: uang, hasil, catatan: String(catatan || "").trim().slice(0, 200), ...(oleh ? { ditutupOleh: oleh } : {}) } : x)),
  };
}

/** Transaksi Kas dari pengeluaran laci (dibuat ulang dari daftar shift; aman setelah data digabung). */
export function laciTransactions(s) {
  const shifts = s.shifts || [];
  const ids = new Set(shifts.map((x) => x.id));
  const tx = (s.transactions || []).filter((t) => !(t.ref === "laci" && ids.has(t.shiftId)));
  for (const sh of shifts) {
    for (const l of sh.laci || []) {
      if (l.jenis !== "keluar") continue;
      tx.push({
        id: `laci-${l.id}`,
        tanggal: l.waktu.slice(0, 10),
        jenis: "keluar",
        kategori: l.kategori || "Operasional",
        nominal: l.nominal,
        catatan: `Dari laci${sh.kasir?.nama ? ` (${sh.kasir.nama})` : ""}${l.catatan ? ` · ${l.catatan}` : ""}`,
        ref: "laci",
        shiftId: sh.id,
      });
    }
  }
  return tx;
}

/** Buang shift yang sudah tutup & lebih tua dari SIMPAN_SHIFT_HARI. */
function prune(shifts) {
  const d = new Date(todayISO() + "T00:00:00");
  d.setDate(d.getDate() - SIMPAN_SHIFT_HARI);
  const batas = d.toISOString().slice(0, 10);
  return shifts.filter((x) => !x.tutup || x.buka.slice(0, 10) >= batas);
}

/** Ringkasan selisih per kasir untuk daftar shift yang sudah tutup. */
export function selisihPerKasir(shifts) {
  const m = new Map();
  for (const sh of shifts) {
    if (!sh.tutup || sh.hasil?.selisih == null) continue;
    const k = sh.kasir?.id || "-";
    const cur = m.get(k) || { nama: sh.kasir?.nama || "Kasir", n: 0, selisih: 0, kurang: 0 };
    cur.n += 1;
    cur.selisih += sh.hasil.selisih;
    if (sh.hasil.selisih < 0) cur.kurang += 1;
    m.set(k, cur);
  }
  return [...m.values()].sort((a, b) => a.selisih - b.selisih);
}

/** Pecahan uang untuk kalkulator hitung laci. */
export const PECAHAN = [100000, 50000, 20000, 10000, 5000, 2000, 1000, 500, 200, 100];
