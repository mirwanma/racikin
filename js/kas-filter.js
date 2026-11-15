// Filter & pencarian transaksi Kas. Murni (tanpa UI).
import { addDays } from "./ui.js";

export const PERIODE = [
  { id: "hari", nama: "Hari ini" },
  { id: "7", nama: "7 hari" },
  { id: "bulan", nama: "Bulan" },
  { id: "semua", nama: "Semua" },
  { id: "rentang", nama: "Pilih tanggal" },
];
export const SUMBER = [
  { id: "kasir", nama: "Dari Kasir" },
  { id: "laci", nama: "Dari laci (shift)" },
  { id: "manual", nama: "Dicatat manual" },
];

export const sumberOf = (t) => (t.ref === "pos" ? "kasir" : t.ref === "laci" ? "laci" : "manual");

/** Rentang tanggal [dari, sampai] untuk filter periode (null = tanpa batas). */
export function rentang(f, today, ym) {
  if (f.periode === "hari") return [today, today];
  if (f.periode === "7") return [addDays(today, -6), today];
  if (f.periode === "bulan") return [`${ym}-01`, `${ym}-31`];
  if (f.periode === "rentang") {
    const a = f.dari || null;
    const b = f.sampai || null;
    return a && b && a > b ? [b, a] : [a, b];
  }
  return [null, null];
}

const norm = (x) => String(x ?? "").toLowerCase();

/** Cocokkan kata kunci ke kategori, catatan, jenis; angka dicocokkan ke nominal (cth "22000", "22rb"). */
export function cocok(t, q) {
  const kata = norm(q).trim();
  if (!kata) return true;
  const teks = `${norm(t.kategori)} ${norm(t.catatan)} ${t.jenis === "masuk" ? "masuk pemasukan" : "keluar pengeluaran"} ${sumberOf(t)}`;
  return kata.split(/\s+/).every((k) => {
    const rb = k.match(/^(\d+(?:[.,]\d+)?)(rb|k|jt)$/);
    if (rb) {
      const n = Number(rb[1].replace(",", ".")) * (rb[2] === "jt" ? 1e6 : 1e3);
      return Math.round(Number(t.nominal)) === Math.round(n);
    }
    if (/^\d[\d.]*$/.test(k)) return String(Math.round(Number(t.nominal))).includes(k.replace(/\./g, "")) || teks.includes(k);
    return teks.includes(k);
  });
}

/**
 * Transaksi yang lolos filter, terbaru dulu.
 * f = { periode, dari, sampai, q, jenis: ""|masuk|keluar, kategori, sumber }
 */
export function filterTx(transactions, f, today, ym) {
  const [dari, sampai] = rentang(f, today, ym);
  return (transactions || [])
    .filter(
      (t) =>
        (!dari || t.tanggal >= dari) &&
        (!sampai || t.tanggal <= sampai) &&
        (!f.jenis || t.jenis === f.jenis) &&
        (!f.kategori || t.kategori === f.kategori) &&
        (!f.sumber || sumberOf(t) === f.sumber) &&
        cocok(t, f.q),
    )
    .sort((a, b) => b.tanggal.localeCompare(a.tanggal) || (b.ref === "pos") - (a.ref === "pos"));
}

/** Ringkasan hasil filter. */
export function ringkas(list) {
  let masuk = 0;
  let keluar = 0;
  for (const t of list) t.jenis === "masuk" ? (masuk += t.nominal) : (keluar += t.nominal);
  return { n: list.length, masuk, keluar, selisih: masuk - keluar };
}

/** Ada filter selain periode yang aktif? */
export const adaFilter = (f) => !!(f.q || f.jenis || f.kategori || f.sumber);
