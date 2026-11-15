// Laporan laba rugi bulanan. Murni (tanpa UI).
//
// Sumber data:
// - Pendapatan & biaya: transaksi Kas bulan itu.
// - HPP metode "resep": porsi terjual (rekap kasir harian, posHarian.items) × HPP per porsi dari resep.
//   Belanja bahan & kemasan TIDAK dihitung sebagai biaya (sudah terwakili HPP); selisihnya = stok/susut.
// - HPP metode "belanja": total belanja Bahan Baku + Kemasan bulan itu (cocok kalau belum pakai Kasir).
// - Peralatan dicatat sebagai belanja aset (di bawah laba bersih), bukan biaya bulanan.
import { bahanMap, hppOf } from "./stok-utils.js";
import { CHANNELS } from "./online.js";

export const KAT_HPP = ["Bahan Baku", "Kemasan"];
export const KAT_ASET = ["Peralatan"];
const ONLINE = new Set(CHANNELS.map((c) => c.id));
const sum = (arr, f = (x) => x) => arr.reduce((a, x) => a + f(x), 0);

/** Daftar bulan (YYYY-MM) yang punya transaksi, terbaru di akhir. */
export const bulanTersedia = (s) => [...new Set((s.transactions || []).map((t) => t.tanggal.slice(0, 7)))].sort();

export const bulanSebelum = (ym) => {
  const [y, m] = ym.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
};

/** Porsi terjual per menu bulan itu (dari rekap kasir harian). */
function porsiBulan(s, ym, sampaiHari = 31) {
  const out = {};
  let hari = 0;
  let omzetKasir = 0;
  for (const [tgl, r] of Object.entries(s.posHarian || {})) {
    if (!tgl.startsWith(ym) || Number(tgl.slice(8)) > sampaiHari) continue;
    hari++;
    omzetKasir += Number(r.omzet) || 0;
    for (const [nama, q] of Object.entries(r.items || {})) out[nama] = (out[nama] || 0) + (Number(q) || 0);
  }
  return { porsi: out, hari, omzetKasir };
}

/** Metode HPP yang disarankan untuk bulan itu. */
export function metodeDefault(s, ym) {
  const p = porsiBulan(s, ym);
  return p.hari && (s.resep || []).length ? "resep" : "belanja";
}

/** sampaiHari: hanya hitung tanggal 1..N (untuk membandingkan bulan berjalan dengan periode yang sama). */
export function labaRugi(s, ym, metode = metodeDefault(s, ym), sampaiHari = 31) {
  const tx = (s.transactions || []).filter((t) => t.tanggal.startsWith(ym) && Number(t.tanggal.slice(8)) <= sampaiHari);
  const masuk = tx.filter((t) => t.jenis === "masuk");
  const keluar = tx.filter((t) => t.jenis === "keluar");

  // --- Pendapatan ---
  const posMasuk = masuk.filter((t) => t.ref === "pos");
  const metodePos = (t) => String(t.id).slice(15); // "pos-YYYY-MM-DD-<metode>"
  const kasirOnline = sum(posMasuk.filter((t) => ONLINE.has(metodePos(t))), (t) => t.nominal);
  const kasirToko = sum(posMasuk, (t) => t.nominal) - kasirOnline;
  const manual = sum(masuk.filter((t) => t.ref !== "pos" && t.kategori === "Penjualan"), (t) => t.nominal);
  const pesanan = sum(masuk.filter((t) => t.ref !== "pos" && (t.kategori === "Pre-order" || t.kategori === "Katering/pesanan")), (t) => t.nominal);
  const lain = sum(masuk.filter((t) => t.ref !== "pos" && !["Penjualan", "Pre-order", "Katering/pesanan"].includes(t.kategori)), (t) => t.nominal);
  const pendapatan = kasirToko + kasirOnline + manual + pesanan;

  // --- HPP ---
  const belanjaHpp = sum(keluar.filter((t) => KAT_HPP.includes(t.kategori)), (t) => t.nominal);
  const map = bahanMap(s.bahan);
  const hppMenu = Object.fromEntries((s.resep || []).map((r) => [r.nama, { hpp: hppOf(r, map).hpp, harga: Number(r.harga) || 0, id: r.id }]));
  const { porsi, hari: hariKasir, omzetKasir } = porsiBulan(s, ym, sampaiHari);
  let hppResep = 0;
  let porsiTanpaResep = 0;
  const menu = [];
  for (const [nama, q] of Object.entries(porsi)) {
    const m = hppMenu[nama];
    if (!m) {
      porsiTanpaResep += q;
      continue;
    }
    hppResep += q * m.hpp;
    menu.push({ nama, porsi: q, harga: m.harga, hpp: m.hpp, omzet: q * m.harga, untung: q * (m.harga - m.hpp), margin: m.harga ? ((m.harga - m.hpp) / m.harga) * 100 : 0 });
  }
  const hpp = Math.round(metode === "resep" ? hppResep : belanjaHpp);

  // --- Biaya ---
  const biayaKat = {};
  for (const t of keluar) {
    if (KAT_HPP.includes(t.kategori) || KAT_ASET.includes(t.kategori)) continue;
    biayaKat[t.kategori] = (biayaKat[t.kategori] || 0) + t.nominal;
  }
  const biaya = sum(Object.values(biayaKat));
  const aset = sum(keluar.filter((t) => KAT_ASET.includes(t.kategori)), (t) => t.nominal);

  const labaKotor = pendapatan - hpp;
  const labaUsaha = labaKotor - biaya;
  const labaBersih = labaUsaha + lain;
  const arusKas = sum(masuk, (t) => t.nominal) - sum(keluar, (t) => t.nominal);
  const pct = (a, b) => (b ? (a / b) * 100 : 0);
  const tanggal = tx.map((t) => t.tanggal).sort();

  return {
    ym,
    metode,
    pendapatan,
    rincianPendapatan: { kasirToko, kasirOnline, manual, pesanan },
    lain,
    hpp,
    belanjaHpp,
    hppResep: Math.round(hppResep),
    porsiTanpaResep,
    cakupanKasir: pct(omzetKasir, kasirToko + kasirOnline + manual), // % penjualan yang lewat kasir (punya data porsi)
    hariKasir,
    labaKotor,
    marginKotor: pct(labaKotor, pendapatan),
    biayaKat: Object.entries(biayaKat).sort((a, b) => b[1] - a[1]),
    biaya,
    labaUsaha,
    labaBersih,
    marginBersih: pct(labaBersih, pendapatan),
    aset,
    arusKas,
    menu: menu.sort((a, b) => b.untung - a.untung),
    komisi: biayaKat["Komisi Order Online"] || 0,
    marketing: biayaKat["Marketing"] || 0,
    transaksi: tx.length,
    dari: tanggal[0] || null,
    sampai: tanggal[tanggal.length - 1] || null,
  };
}

/**
 * Pembanding yang adil untuk bulan ym: bulan lalu pada periode yang sama.
 * - Bulan berjalan (ym = bulan ini) dibandingkan dengan tanggal 1..hari ini bulan lalu.
 * - Kalau bulan lalu adalah bulan pertama & datanya tidak mulai dari awal bulan -> tidak dibandingkan.
 * Return { r, label } atau null.
 */
export function pembanding(s, ym, metode, today) {
  const prevYm = bulanSebelum(ym);
  const semua = (s.transactions || []).map((t) => t.tanggal).sort();
  if (!semua.length || semua[0].slice(0, 7) > prevYm) return null;
  if (semua[0].slice(0, 7) === prevYm && Number(semua[0].slice(8)) > 3) return null; // data bulan lalu tidak penuh
  const berjalan = ym === today.slice(0, 7);
  const hari = berjalan ? Number(today.slice(8)) : 31;
  return { r: labaRugi(s, prevYm, metode || metodeDefault(s, prevYm), hari), sebagian: berjalan, hari };
}

/** Perubahan % dari bulan lalu (null kalau bulan lalu 0). */
export const delta = (now, prev) => (prev ? ((now - prev) / Math.abs(prev)) * 100 : null);

/** Catatan otomatis (tanpa AI) dari laporan bulan ini & bulan lalu. */
export function catatan(r, prev) {
  const out = [];
  if (r.pendapatan <= 0) return ["Belum ada pendapatan tercatat di bulan ini."];
  const mk = r.marginKotor.toFixed(0);
  if (r.marginKotor < 50) out.push({ t: "warn", x: `Margin kotor ${mk}%, terlalu tipis. Untuk F&B idealnya 60–70%: cek harga jual atau porsi bahan menu dengan margin terendah.` });
  else if (r.marginKotor < 60) out.push({ t: "info", x: `Margin kotor ${mk}%, sedikit di bawah target F&B (60–70%). Naik sedikit harga menu terlaris sudah cukup terasa.` });
  else out.push({ t: "ok", x: `Margin kotor ${mk}%, sehat untuk usaha F&B (target 60–70%).` });
  if (r.rincianPendapatan.kasirOnline) {
    const k = (r.komisi / r.rincianPendapatan.kasirOnline) * 100;
    out.push({ t: k > 25 ? "warn" : "info", x: `Order online ${((r.rincianPendapatan.kasirOnline / r.pendapatan) * 100).toFixed(0)}% dari pendapatan, komisinya ${k.toFixed(0)}% dari penjualan online.${k > 25 ? " Pertimbangkan naikkan markup harga online." : ""}` });
  }
  if (r.marketing) out.push({ t: "info", x: `Biaya marketing ${((r.marketing / r.pendapatan) * 100).toFixed(1)}% dari pendapatan (umumnya 3–8%).` });
  if (prev && prev.r.pendapatan) {
    const d = delta(r.labaBersih, prev.r.labaBersih);
    const vs = prev.sebagian ? `periode yang sama bulan lalu (tgl 1–${prev.hari})` : "bulan lalu";
    if (d !== null) out.push({ t: d >= 0 ? "ok" : "warn", x: `Laba bersih ${d >= 0 ? "naik" : "turun"} ${Math.abs(d).toFixed(0)}% dibanding ${vs}.` });
  }
  const tipis = [...r.menu].filter((m) => m.porsi >= 5).sort((a, b) => a.margin - b.margin)[0];
  if (tipis && tipis.margin < 45) out.push({ t: "warn", x: `${tipis.nama} marginnya paling tipis (${tipis.margin.toFixed(0)}%). Naikkan harga atau cek bahan termahalnya.` });
  if (r.metode === "resep" && r.belanjaHpp > r.hpp * 1.2) out.push({ t: "info", x: `Belanja bahan & kemasan (${Math.round((r.belanjaHpp / Math.max(1, r.hpp)) * 100)}% dari HPP terjual) lebih besar dari pemakaian: sebagian jadi stok, sisanya bisa susut/terbuang.` });
  if (r.metode === "resep" && r.cakupanKasir < 80) out.push({ t: "warn", x: `Hanya ${r.cakupanKasir.toFixed(0)}% penjualan lewat Kasir, jadi HPP dari resep belum lengkap. Pakai metode "dari belanja" atau catat semua penjualan lewat Kasir.` });
  return out;
}

/** Laporan dalam format CSV (untuk Excel / Google Sheets). */
export function toCSV(r, bisnis) {
  const rows = [
    ["Laporan Laba Rugi", bisnis],
    ["Periode", r.ym],
    ["Metode HPP", r.metode === "resep" ? "Dari resep (porsi terjual x HPP)" : "Dari belanja bahan & kemasan"],
    [],
    ["Pendapatan", ""],
    ["Penjualan toko (kasir)", r.rincianPendapatan.kasirToko],
    ["Penjualan order online", r.rincianPendapatan.kasirOnline],
    ["Penjualan manual", r.rincianPendapatan.manual],
    ["Pesanan / katering", r.rincianPendapatan.pesanan],
    ["Total pendapatan", r.pendapatan],
    ["HPP", -r.hpp],
    ["Laba kotor", r.labaKotor],
    [],
    ["Biaya operasional", ""],
    ...r.biayaKat.map(([k, v]) => [k, -v]),
    ["Total biaya", -r.biaya],
    ["Laba usaha", r.labaUsaha],
    ["Pendapatan lain", r.lain],
    ["Laba bersih", r.labaBersih],
    [],
    ["Belanja peralatan (aset)", -r.aset],
    ["Arus kas bersih", r.arusKas],
  ];
  const q = (v) => (typeof v === "number" ? String(Math.round(v)) : `"${String(v ?? "").replace(/"/g, '""')}"`);
  return "﻿" + rows.map((row) => row.map(q).join(",")).join("\n");
}
