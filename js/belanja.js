// Belanja & supplier: daftar belanja otomatis, riwayat harga bahan, catat belanja. Murni (tanpa UI).
//
// state.supplier = [{ id, nama, wa, catatan }]
// bahan.supplierId  -> supplier langganan bahan itu (opsional)
// bahan.kemasan     -> true kalau bahan termasuk kemasan (dicatat ke Kas kategori "Kemasan")
// stokLog beli      -> { ..., alasan: "beli", harga (per satuan), supplierId }  => riwayat harga
import { uid } from "./store.js";
import { todayISO, addDays } from "./ui.js";

const sum = (arr, f) => arr.reduce((a, x) => a + f(x), 0);
const round2 = (n) => Math.round(n * 100) / 100;

/** Rata-rata pemakaian per hari tiap bahan dari riwayat penjualan `hari` hari terakhir. */
export function pemakaianHarian(s, hari = 14, today = todayISO()) {
  const dari = addDays(today, -hari);
  const jual = (s.stokLog || []).filter((l) => l.alasan === "jual" && l.tanggal > dari && l.tanggal <= today);
  const hariAda = new Set(jual.map((l) => l.tanggal)).size;
  const n = Math.max(1, Math.min(hari, hariAda));
  const out = {};
  for (const l of jual) out[l.bahanId] = (out[l.bahanId] || 0) - (Number(l.delta) || 0);
  for (const k of Object.keys(out)) out[k] = Math.max(0, out[k] / n);
  return out;
}

/** Bulatkan jumlah beli ke angka yang wajar dibeli di toko. */
export function bulatkan(qty, satuan, pack) {
  if (qty <= 0) return 0;
  if (pack > 0) return Math.ceil(qty / pack) * pack;
  if (satuan === "gram" || satuan === "ml") return Math.ceil(qty / (qty > 2000 ? 500 : 100)) * (qty > 2000 ? 500 : 100);
  return Math.ceil(qty);
}

/**
 * Rencana belanja untuk `hari` hari ke depan.
 * beli = pemakaian/hari × hari + stok minimum − stok sekarang (dibulatkan).
 */
export function rencanaBelanja(s, hari = 3, today = todayISO()) {
  const pakai = pemakaianHarian(s, 14, today);
  const out = [];
  for (const b of s.bahan || []) {
    if (!b.tracked) continue;
    const perHari = pakai[b.id] || 0;
    const stok = Number(b.stok) || 0;
    const min = Number(b.min) || 0;
    let butuh = perHari * hari + min - stok;
    if (perHari === 0 && stok <= min) butuh = Math.max(min * 2 - stok, 1);
    const beli = bulatkan(butuh, b.satuan, Number(b.pack) || 0);
    if (beli <= 0) continue;
    out.push({
      bahan: b,
      beli,
      perHari,
      habisDalam: perHari > 0 ? stok / perHari : null,
      menipis: stok <= min,
      estimasi: beli * (Number(b.harga) || 0),
    });
  }
  return out.sort((a, b) => (a.habisDalam ?? 999) - (b.habisDalam ?? 999));
}

/** Kelompokkan item per supplier (null = belum ada supplier). */
export function perSupplier(s, items) {
  const sup = new Map((s.supplier || []).map((x) => [x.id, x]));
  const groups = new Map();
  for (const it of items) {
    const key = sup.has(it.bahan.supplierId) ? it.bahan.supplierId : null;
    if (!groups.has(key)) groups.set(key, { supplier: key ? sup.get(key) : null, items: [] });
    groups.get(key).items.push(it);
  }
  return [...groups.values()].sort((a, b) => (a.supplier ? 0 : 1) - (b.supplier ? 0 : 1) || (a.supplier?.nama || "").localeCompare(b.supplier?.nama || ""));
}

const fmt = (n) => (Number.isInteger(n) ? String(n) : String(round2(n)).replace(".", ","));

/** Pesan WhatsApp daftar belanja ke supplier. */
export function pesanWA(group, bisnis) {
  const halo = group.supplier ? `Halo ${group.supplier.nama}, ` : "";
  return [
    `${halo}saya dari ${bisnis} mau pesan:`,
    "",
    ...group.items.map((it, i) => `${i + 1}. ${it.bahan.nama}: ${fmt(it.qty ?? it.beli)} ${it.bahan.satuan}`),
    "",
    "Mohon info total & kapan bisa diambil/dikirim ya. Terima kasih!",
  ].join("\n");
}

/** Riwayat pembelian berharga satu bahan (lama -> baru). */
export const riwayatHarga = (s, bahanId) =>
  (s.stokLog || [])
    .filter((l) => l.bahanId === bahanId && l.alasan === "beli" && Number(l.harga) > 0)
    .sort((a, b) => a.tanggal.localeCompare(b.tanggal));

/**
 * Perubahan harga terakhir tiap bahan (pembelian terakhir vs sebelumnya) + dampaknya ke HPP menu.
 */
export function perubahanHarga(s) {
  const out = [];
  for (const b of s.bahan || []) {
    const r = riwayatHarga(s, b.id);
    if (r.length < 2) continue;
    const akhir = r[r.length - 1];
    const baru = Number(akhir.harga);
    // pembanding: harga sekitar 3 minggu sebelum pembelian terakhir (kenaikan pelan-pelan tetap kelihatan);
    // kalau riwayatnya belum sepanjang itu, pakai pembelian paling awal.
    const batas = addDays(akhir.tanggal, -21);
    const ref = [...r].reverse().find((x) => x.tanggal <= batas) || r[0];
    const lama = Number(ref.harga);
    const pct = lama ? ((baru - lama) / lama) * 100 : 0;
    const menu = (s.resep || [])
      .map((m) => {
        const it = (m.items || []).find((x) => x.bahanId === b.id);
        if (!it) return null;
        const hasil = Math.max(1, Number(m.hasil) || 1);
        return { nama: m.nama, deltaHpp: ((Number(it.qty) || 0) * (baru - lama)) / hasil };
      })
      .filter(Boolean)
      .sort((x, y) => Math.abs(y.deltaHpp) - Math.abs(x.deltaHpp));
    out.push({ bahan: b, lama, baru, pct, tanggal: akhir.tanggal, sejak: ref.tanggal, menu });
  }
  return out.sort((a, b) => b.pct - a.pct);
}

/** Total belanja per supplier dalam `hari` hari terakhir (dari riwayat stok yang punya harga). */
export function belanjaSupplier(s, hari = 30, today = todayISO()) {
  const dari = addDays(today, -hari);
  const out = {};
  for (const l of s.stokLog || []) {
    if (l.alasan !== "beli" || !l.supplierId || l.tanggal <= dari || !(Number(l.harga) > 0)) continue;
    out[l.supplierId] = (out[l.supplierId] || 0) + l.delta * l.harga;
  }
  return out;
}

/**
 * Patch: catat hasil belanja. rows = [{ bahanId, qty, total }] (total = bayar untuk bahan itu, boleh 0).
 * Stok bertambah, harga per satuan diperbarui (HPP menu ikut berubah), riwayat harga tersimpan,
 * dan (opsional) pengeluaran Kas per kategori (Bahan Baku / Kemasan).
 */
export function catatBelanja(s, rows, { supplierId = null, kas = true, tanggal = todayISO() } = {}) {
  const valid = rows.filter((r) => Number(r.qty) > 0);
  if (!valid.length) throw new Error("Isi jumlah yang dibeli dulu");
  const sup = (s.supplier || []).find((x) => x.id === supplierId);
  const byId = new Map(valid.map((r) => [r.bahanId, r]));
  const bahan = s.bahan.map((b) => {
    const r = byId.get(b.id);
    if (!r) return b;
    const qty = Number(r.qty);
    const total = Number(r.total) || 0;
    return { ...b, stok: round2((b.tracked ? Number(b.stok) || 0 : 0) + qty), tracked: true, harga: total > 0 ? round2(total / qty) : b.harga, estimasi: total > 0 ? false : b.estimasi };
  });
  const stokLog = [
    ...s.stokLog,
    ...valid.map((r) => ({
      id: uid(),
      tanggal,
      bahanId: r.bahanId,
      delta: Number(r.qty),
      alasan: "beli",
      catatan: sup ? sup.nama : "Belanja",
      ...(Number(r.total) > 0 ? { harga: round2(Number(r.total) / Number(r.qty)) } : {}),
      ...(sup ? { supplierId: sup.id } : {}),
    })),
  ];
  const patch = { bahan, stokLog };
  if (kas) {
    const kat = { "Bahan Baku": [], Kemasan: [] };
    for (const r of valid) {
      if (!(Number(r.total) > 0)) continue;
      const b = s.bahan.find((x) => x.id === r.bahanId);
      kat[b?.kemasan ? "Kemasan" : "Bahan Baku"].push({ nama: b?.nama || "", total: Number(r.total) });
    }
    const tx = [...s.transactions];
    for (const [kategori, list] of Object.entries(kat)) {
      if (!list.length) continue;
      tx.push({
        id: uid(),
        tanggal,
        jenis: "keluar",
        kategori,
        nominal: Math.round(sum(list, (x) => x.total)),
        catatan: `Belanja${sup ? ` di ${sup.nama}` : ""}: ${list.slice(0, 4).map((x) => x.nama.toLowerCase()).join(", ")}${list.length > 4 ? ` +${list.length - 4} lainnya` : ""}`,
      });
    }
    patch.transactions = tx;
  }
  return patch;
}
