// Impor riwayat penjualan dari CSV / tabel yang di-copy dari Excel atau Google Sheets. Murni (tanpa UI).
//
// Hasil impor per hari masuk ke:
// - posHarian[tgl] = { order, omzet, items: { menu: porsi }, imporId }  -> laporan, menu terlaris, cek kesehatan
// - Kas: pemasukan "Penjualan" per hari per saluran (ref "impor", id "impor-<tgl>-<saluran>"), opsional komisi ojol
// Hari yang sudah punya data penjualan (Kasir atau impor sebelumnya) dilewati supaya tidak dobel.
// Stok TIDAK dikurangi (penjualan lama; stok sekarang dihitung dari hitung fisik / stok awal).
import { uid } from "./store.js";
import { angka } from "./impor.js";
import { CHANNELS, channelCfg, isOnline } from "./online.js";

export const MAKS_BARIS = 20000;
const key = (n) => String(n || "").trim().toLowerCase().replace(/\s+/g, " ");

// ---------- Baca tabel ----------

/** CSV/TSV -> { header, rows }. Pemisah dideteksi dari baris pertama (tab, titik koma, koma). Mendukung tanda kutip. */
export function parseTabel(text) {
  const src = String(text || "").replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const first = src.split("\n").find((l) => l.trim()) || "";
  const delim = ["\t", ";", ","].map((d) => [d, first.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"' && cell === "") quoted = true;
    else if (c === delim) {
      row.push(cell);
      cell = "";
    } else if (c === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  const bersih = rows.map((r) => r.map((x) => x.trim())).filter((r) => r.some((x) => x));
  const [header = [], ...data] = bersih;
  return { header, rows: data.slice(0, MAKS_BARIS), terpotong: data.length > MAKS_BARIS, delim };
}

// ---------- Kolom ----------

export const PERAN = [
  { id: "tanggal", nama: "Tanggal", wajib: true },
  { id: "menu", nama: "Nama menu" },
  { id: "qty", nama: "Jumlah / qty" },
  { id: "harga", nama: "Harga satuan" },
  { id: "total", nama: "Total (Rp)" },
  { id: "saluran", nama: "Saluran / tipe pesanan" },
  { id: "order", nama: "No. order / struk" },
];
const POLA = {
  tanggal: /^(tanggal|tgl|date|waktu|time|created|dibuat|order date|tanggal (transaksi|order|pesanan)|transaction date|datetime)/i,
  menu: /(menu|item|produk|product|nama (barang|item|produk|menu)|barang|description|deskripsi)/i,
  qty: /^(qty|jumlah|jml|kuantitas|quantity|porsi|pcs|banyak)\b/i,
  harga: /(harga( satuan| jual)?|price|unit price|harga\/pcs)$/i,
  total: /(total|subtotal|sub total|amount|nominal|gross|penjualan|omzet|revenue|net sales|grand)/i,
  saluran: /(saluran|channel|platform|tipe (pesanan|order)|order type|sales type|jenis pesanan|metode|payment|pembayaran)/i,
  order: /(no\.?\s*(order|struk|nota|transaksi|invoice|pesanan)|order (id|no)|receipt|invoice|id (order|transaksi|pesanan)|kode)/i,
};

/** Tebak kolom dari judul. Return { peran: index | -1 }. */
export function tebakKolom(header) {
  const pakai = new Set();
  const out = {};
  for (const id of ["order", "tanggal", "qty", "harga", "total", "saluran", "menu"]) {
    const i = header.findIndex((h, j) => !pakai.has(j) && POLA[id].test(String(h).trim()));
    out[id] = i;
    if (i >= 0) pakai.add(i);
  }
  return out;
}

// ---------- Tanggal ----------

const BULAN = { jan: 1, feb: 2, peb: 2, mar: 3, apr: 4, mei: 5, may: 5, jun: 6, jul: 7, agu: 8, agt: 8, aug: 8, sep: 9, okt: 10, oct: 10, nov: 11, nop: 11, des: 12, dec: 12 };

/** Urutan tanggal angka (d/m/y atau m/d/y) dari contoh nilai. Default d/m/y (Indonesia). */
export function urutanTanggal(values) {
  let dmy = 0;
  let mdy = 0;
  for (const v of values) {
    const m = String(v).match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
    if (!m) continue;
    if (Number(m[1]) > 12) dmy++;
    if (Number(m[2]) > 12) mdy++;
  }
  return mdy > dmy ? "mdy" : "dmy";
}

const pad = (n) => String(n).padStart(2, "0");
function valid(y, m, d) {
  if (y < 100) y += 2000;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? `${y}-${pad(m)}-${pad(d)}` : null;
}

/** "2026-10-01", "01/10/2026", "1-10-26", "1 Okt 2026", "Oct 1, 2026", "2026-10-01 14:03" -> "2026-10-01" | null */
export function tanggalISO(raw, urutan = "dmy") {
  const s = String(raw || "").trim().toLowerCase();
  let m = s.match(/^(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})/);
  if (m) return valid(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
  if (m) return urutan === "mdy" ? valid(+m[3], +m[1], +m[2]) : valid(+m[3], +m[2], +m[1]);
  m = s.match(/^(\d{1,2})\s+([a-z]{3})[a-z]*\.?\s+(\d{2,4})/);
  if (m && BULAN[m[2]]) return valid(+m[3], BULAN[m[2]], +m[1]);
  m = s.match(/^([a-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{2,4})/);
  if (m && BULAN[m[1]]) return valid(+m[3], BULAN[m[1]], +m[2]);
  return null;
}

/** Saluran dari teks bebas ("GoFood", "Grab Food", "ShopeeFood", "Dine in") -> id saluran atau "toko". */
export function saluranDari(raw) {
  const s = key(raw).replace(/[\s-]/g, "");
  if (/gofood|gojek/.test(s)) return "gofood";
  if (/grab/.test(s)) return "grabfood";
  if (/shopee/.test(s)) return "shopeefood";
  return "toko";
}

/** Angka uang dari sel ("Rp 15.000", "15,000", "15000.00", "(2.000)" = minus). */
function uang(raw) {
  const s = String(raw || "").trim();
  if (!s) return 0;
  const neg = /^\(.*\)$/.test(s) || /^-/.test(s);
  const t = s.replace(/[()\s-]/g, "").replace(/^rp\.?/i, "").replace(/idr/i, "");
  const n = /^\d+\.\d{1,2}$/.test(t) ? Math.round(parseFloat(t)) : angka(t);
  return neg ? -n : n;
}

// ---------- Olah ----------

/**
 * Ringkas baris jadi data per hari. map = { peran: index }.
 * Return { hari: { tgl: { omzet, items, saluran: { id: omzet }, order } }, baris, gagal, alasan, menu: [{ nama, qty, omzet, adaId }] , dari, sampai, dilewati }
 */
export function olahPenjualan(s, tabel, map, today) {
  const ambil = (r, id) => (map[id] >= 0 ? r[map[id]] ?? "" : "");
  const urutan = urutanTanggal(tabel.rows.slice(0, 300).map((r) => ambil(r, "tanggal")));
  const resepNama = new Map((s.resep || []).map((r) => [key(r.nama), r]));
  const sudahAda = new Set([
    ...Object.entries(s.posHarian || {}).filter(([, r]) => (r.omzet || 0) > 0 || (r.order || 0) > 0).map(([t]) => t),
    ...(s.orders || []).map((o) => o.tanggal),
    // penjualan yang sudah dicatat manual di Kas juga dianggap ada (biar Kas tidak dobel)
    ...(s.transactions || []).filter((t) => t.jenis === "masuk" && t.kategori === "Penjualan").map((t) => t.tanggal),
  ]);
  const hari = {};
  const orderSet = {};
  const menu = new Map();
  const alasan = { tanggal: 0, nilai: 0, masaDepan: 0 };
  let gagal = 0;
  let baris = 0;
  for (const r of tabel.rows) {
    const t = tanggalISO(ambil(r, "tanggal"), urutan);
    if (!t) {
      gagal++;
      alasan.tanggal++;
      continue;
    }
    if (t >= today) {
      alasan.masaDepan++;
      continue;
    }
    const qtyRaw = ambil(r, "qty");
    const qty = map.qty >= 0 && String(qtyRaw).trim() !== "" ? Number(String(qtyRaw).replace(",", ".")) || 0 : 1;
    const total = map.total >= 0 ? uang(ambil(r, "total")) : uang(ambil(r, "harga")) * qty;
    if (!total && !qty) {
      gagal++;
      alasan.nilai++;
      continue;
    }
    baris++;
    const h = (hari[t] ||= { omzet: 0, items: {}, saluran: {}, order: 0 });
    h.omzet += total;
    const ch = map.saluran >= 0 ? saluranDari(ambil(r, "saluran")) : "toko";
    h.saluran[ch] = (h.saluran[ch] || 0) + total;
    if (map.order >= 0) (orderSet[t] ||= new Set()).add(String(ambil(r, "order")).trim() || `baris-${baris}`);
    else h.order++;
    const namaRaw = String(ambil(r, "menu")).trim();
    if (map.menu >= 0 && namaRaw && qty > 0 && !sudahAda.has(t)) {
      const ada = resepNama.get(key(namaRaw));
      const nama = ada ? ada.nama : namaRaw.slice(0, 60);
      h.items[nama] = (h.items[nama] || 0) + qty;
      const m = menu.get(key(nama)) || { nama, qty: 0, omzet: 0, adaId: ada?.id || null };
      m.qty += qty;
      m.omzet += total;
      menu.set(key(nama), m);
    }
  }
  for (const [t, set] of Object.entries(orderSet)) hari[t].order = set.size;
  for (const h of Object.values(hari)) h.omzet = Math.round(h.omzet);
  const semua = Object.keys(hari).sort();
  const dilewati = semua.filter((t) => sudahAda.has(t));
  return {
    hari,
    baris,
    gagal,
    alasan,
    urutan,
    menu: [...menu.values()].sort((a, b) => b.qty - a.qty),
    dari: semua[0] || null,
    sampai: semua[semua.length - 1] || null,
    dilewati,
  };
}

/**
 * Simpan hasil olah. opsi = { kas: bool, komisi: bool, menuBaru: bool, nama: string (nama file / sumber) }.
 * Return { patch, info: { hari, omzet, menuBaru } }.
 */
export function simpanPenjualan(s, hasil, opsi = {}, at = new Date().toISOString()) {
  const id = uid();
  const lewat = new Set(hasil.dilewati);
  const tanggal = Object.keys(hasil.hari).filter((t) => !lewat.has(t)).sort();
  const posHarian = { ...(s.posHarian || {}) };
  let transactions = [...(s.transactions || [])];
  let omzet = 0;
  for (const t of tanggal) {
    const h = hasil.hari[t];
    posHarian[t] = { order: h.order, omzet: h.omzet, items: h.items, imporId: id };
    omzet += h.omzet;
    if (!opsi.kas) continue;
    for (const [ch, nominal] of Object.entries(h.saluran)) {
      if (!nominal) continue;
      const nama = ch === "toko" ? "Toko" : CHANNELS.find((c) => c.id === ch)?.nama || ch;
      transactions.push({ id: `impor-${t}-${ch}-${id}`, tanggal: t, jenis: "masuk", kategori: "Penjualan", nominal: Math.round(nominal), catatan: `Impor penjualan · ${nama}`, ref: "impor", imporId: id });
      if (opsi.komisi && isOnline(ch)) {
        const k = Math.round((nominal * channelCfg(s, ch).komisi) / 100);
        if (k) transactions.push({ id: `impor-${t}-${ch}-komisi-${id}`, tanggal: t, jenis: "keluar", kategori: "Komisi Order Online", nominal: k, catatan: `Komisi ${nama} (impor, ${channelCfg(s, ch).komisi}%)`, ref: "impor", imporId: id });
      }
    }
  }
  transactions = transactions.sort((a, b) => a.tanggal.localeCompare(b.tanggal));
  // Menu yang belum ada -> tambah ke daftar menu (harga = rata-rata dari data, tanpa resep dulu)
  let resep = s.resep || [];
  const baru = opsi.menuBaru ? hasil.menu.filter((m) => !m.adaId && m.qty > 0) : [];
  if (baru.length) {
    const ada = new Set(resep.map((r) => key(r.nama)));
    resep = [...resep, ...baru.filter((m) => !ada.has(key(m.nama))).map((m) => ({ id: uid(), nama: m.nama, harga: Math.round(m.omzet / m.qty / 500) * 500 || 0, hasil: 1, items: [], imporId: id }))];
  }
  const batch = { id, at, nama: String(opsi.nama || "Impor").slice(0, 80), dari: tanggal[0] || null, sampai: tanggal[tanggal.length - 1] || null, hari: tanggal.length, omzet, kas: !!opsi.kas, menuBaru: baru.length };
  return {
    patch: { posHarian, transactions, resep, imporJual: [...(s.imporJual || []), batch] },
    info: { hari: tanggal.length, omzet, menuBaru: baru.length, id },
  };
}

/** Batalkan satu impor: rekap harian & catatan Kas dari impor itu dihapus (menu yang ditambahkan tetap ada). */
export function batalImpor(s, id) {
  const posHarian = Object.fromEntries(Object.entries(s.posHarian || {}).filter(([, r]) => r.imporId !== id));
  return {
    posHarian,
    transactions: (s.transactions || []).filter((t) => t.imporId !== id),
    imporJual: (s.imporJual || []).filter((b) => b.id !== id),
  };
}

/** Contoh CSV untuk diunduh. */
export const CONTOH_CSV = `tanggal,no_order,menu,qty,harga,total,saluran
01/10/2026,A001,Bakso Urat,2,15000,30000,Dine in
01/10/2026,A001,Es Teh Manis,2,4000,8000,Dine in
01/10/2026,A002,Mie Ayam Bakso,1,18000,18000,GoFood
02/10/2026,A003,Bakso Urat,1,15000,15000,GrabFood
`;
