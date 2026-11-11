// Kasir (POS): logika order -> Kas, stok, stempel. Murni (tanpa UI).
//
// Supaya data tetap ringan walau ratusan order/hari:
// - Kas: penjualan kasir DIGABUNG per hari per metode bayar (1 transaksi, id "pos-<tgl>-<metode>"),
//   dihitung ulang dari daftar order setiap ada order baru / batal.
// - Riwayat stok: pemakaian bahan dari kasir digabung per hari per bahan (id "pos-<tgl>-<bahanId>").
// - Detail order disimpan 30 hari; rekap harian (omzet, jumlah order, item terjual) disimpan permanen.
import { uid } from "./store.js";
import { todayISO } from "./ui.js";
import { kebutuhan } from "./stok-utils.js";
import { program, patchStempel } from "./loyalty.js";

export const METODE = [
  { id: "tunai", nama: "Tunai" },
  { id: "qris", nama: "QRIS" },
  { id: "transfer", nama: "Transfer" },
  { id: "ojol", nama: "Ojol" },
];
export const metodeNama = (id) => METODE.find((m) => m.id === id)?.nama || id;
export const SIMPAN_HARI = 30;

const sum = (arr, f) => arr.reduce((a, x) => a + f(x), 0);
export const subtotal = (items) => sum(items, (i) => (Number(i.harga) || 0) * (Number(i.qty) || 0));

/** Waktu lokal "YYYY-MM-DDTHH:MM" */
function nowLocal() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

export const ordersOn = (s, tanggal) => (s.orders || []).filter((o) => o.tanggal === tanggal);

/** Nomor order harian berikutnya: 1, 2, 3, ... */
export const nextNo = (s, tanggal) => Math.max(0, ...ordersOn(s, tanggal).map((o) => o.no)) + 1;

/** Hitung ulang transaksi Kas gabungan kasir untuk tanggal tertentu. */
function kasPatch(transactions, orders, tanggal) {
  const aktif = orders.filter((o) => o.tanggal === tanggal && o.status !== "batal");
  let tx = transactions.filter((t) => !(t.ref === "pos" && t.tanggal === tanggal));
  for (const m of METODE) {
    const list = aktif.filter((o) => o.metode === m.id);
    if (!list.length) continue;
    tx.push({
      id: `pos-${tanggal}-${m.id}`,
      tanggal,
      jenis: "masuk",
      kategori: "Penjualan",
      nominal: Math.round(sum(list, (o) => o.total)),
      catatan: `Kasir · ${m.nama} · ${list.length} order`,
      ref: "pos",
    });
  }
  return tx;
}

/** Ubah stok bahan dari item order (arah: -1 jual, +1 batal). Hanya bahan yang stoknya sudah diisi. */
function stokPatch(s, items, tanggal, arah) {
  const pakai = {};
  for (const it of items) {
    const r = s.resep.find((x) => x.id === it.resepId);
    if (!r) continue;
    for (const k of kebutuhan(r, it.qty)) pakai[k.bahanId] = (pakai[k.bahanId] || 0) + k.qty;
  }
  const tracked = new Set(s.bahan.filter((b) => b.tracked).map((b) => b.id));
  const ids = Object.keys(pakai).filter((id) => tracked.has(id) && pakai[id]);
  if (!ids.length) return {};
  // arah -1 = terjual (stok berkurang), +1 = order dibatalkan (stok kembali)
  const bahan = s.bahan.map((b) => (ids.includes(b.id) ? { ...b, stok: (Number(b.stok) || 0) + arah * pakai[b.id] } : b));
  // log digabung per hari per bahan
  const log = [...s.stokLog];
  for (const id of ids) {
    const lid = `pos-${tanggal}-${id}`;
    const i = log.findIndex((l) => l.id === lid);
    const delta = arah * pakai[id];
    if (i >= 0) log[i] = { ...log[i], delta: log[i].delta + delta };
    else log.push({ id: lid, tanggal, bahanId: id, delta, alasan: "jual", catatan: "Kasir (gabungan harian)" });
  }
  return { bahan, stokLog: log };
}

/** Rekap harian permanen (dipakai setelah detail order dihapus). */
function rekapPatch(s, tanggal, orders) {
  const aktif = orders.filter((o) => o.tanggal === tanggal && o.status !== "batal");
  const items = {};
  for (const o of aktif) for (const it of o.items) items[it.nama] = (items[it.nama] || 0) + it.qty;
  return { ...(s.posHarian || {}), [tanggal]: { order: aktif.length, omzet: Math.round(sum(aktif, (o) => o.total)), items } };
}

/** Buang detail order yang lebih tua dari SIMPAN_HARI hari. */
function prune(orders) {
  const batas = new Date(todayISO() + "T00:00:00");
  batas.setDate(batas.getDate() - SIMPAN_HARI);
  const b = batas.toISOString().slice(0, 10);
  return orders.filter((o) => o.tanggal >= b);
}

/**
 * Buat order baru. cart = [{ resepId|null, nama, harga, qty }].
 * Return { patch, order, stempelInfo }.
 */
export function buatOrder(s, { cart, diskon = 0, metode = "tunai", bayar = 0, pelangganId = "" }) {
  const tanggal = todayISO();
  const items = cart.filter((i) => i.qty > 0).map((i) => ({ resepId: i.resepId || null, nama: i.nama, harga: Number(i.harga) || 0, qty: Number(i.qty) }));
  const sub = subtotal(items);
  const disk = Math.min(Math.max(0, Math.round(Number(diskon) || 0)), sub);
  const total = sub - disk;
  const order = {
    id: uid(),
    no: nextNo(s, tanggal),
    tanggal,
    waktu: nowLocal(),
    items,
    subtotal: sub,
    diskon: disk,
    total,
    metode,
    bayar: metode === "tunai" ? Math.max(Number(bayar) || 0, total) : total,
    kembali: metode === "tunai" ? Math.max(0, (Number(bayar) || 0) - total) : 0,
    pelangganId: pelangganId || null,
    stempel: 0,
    status: "selesai",
  };

  let st = { ...s };
  // stempel pelanggan
  let stempelInfo = null;
  if (pelangganId && s.loyalty) {
    const prog = program(s);
    if (total >= (prog.minBelanja || 0)) {
      st = { ...st, ...patchStempel(st, pelangganId, 1, "beli", `Kasir #${order.no}`) };
      order.stempel = 1;
      const p = st.pelanggan.find((x) => x.id === pelangganId);
      stempelInfo = { nama: p.nama, stempel: p.stempel, target: prog.target, siap: p.stempel >= prog.target };
    } else stempelInfo = { kurang: prog.minBelanja };
  }
  // stok
  st = { ...st, ...stokPatch(st, items, tanggal, -1) };
  // order + kas + rekap
  const orders = prune([...(st.orders || []), order]);
  const patch = {
    ...st,
    orders,
    transactions: kasPatch(st.transactions, orders, tanggal),
    posHarian: rekapPatch(st, tanggal, orders),
  };
  return { patch: pick(patch), order, stempelInfo };
}

/** Batalkan order: kas & rekap dihitung ulang, stok dikembalikan, stempel dikurangi. */
export function batalOrder(s, orderId) {
  const o = (s.orders || []).find((x) => x.id === orderId);
  if (!o || o.status === "batal") return null;
  let st = { ...s };
  st = { ...st, ...stokPatch(st, o.items, o.tanggal, +1) };
  if (o.stempel && o.pelangganId && st.pelanggan.some((p) => p.id === o.pelangganId)) {
    st = { ...st, ...patchStempel(st, o.pelangganId, -o.stempel, "koreksi", `Batal kasir #${o.no}`) };
  }
  const orders = st.orders.map((x) => (x.id === orderId ? { ...x, status: "batal" } : x));
  return pick({ ...st, orders, transactions: kasPatch(st.transactions, orders, o.tanggal), posHarian: rekapPatch(st, o.tanggal, orders) });
}

const KEYS = ["orders", "transactions", "posHarian", "bahan", "stokLog", "pelanggan", "stempelLog"];
const pick = (obj) => Object.fromEntries(KEYS.filter((k) => k in obj).map((k) => [k, obj[k]]));

/** Ringkasan hari ini untuk layar rekap. */
export function rekapHari(s, tanggal = todayISO()) {
  const semua = ordersOn(s, tanggal);
  const aktif = semua.filter((o) => o.status !== "batal");
  const omzet = sum(aktif, (o) => o.total);
  const perMetode = METODE.map((m) => ({ ...m, total: sum(aktif.filter((o) => o.metode === m.id), (o) => o.total), n: aktif.filter((o) => o.metode === m.id).length })).filter((m) => m.n);
  const items = {};
  for (const o of aktif) for (const it of o.items) items[it.nama] = (items[it.nama] || 0) + it.qty;
  const terlaris = Object.entries(items).sort((a, b) => b[1] - a[1]);
  return { semua, aktif, omzet, n: aktif.length, rata: aktif.length ? omzet / aktif.length : 0, perMetode, terlaris, batal: semua.length - aktif.length };
}

/** Teks struk untuk WhatsApp. */
export function struk(o, bisnis, rp) {
  const lines = [
    `*${bisnis}*`,
    `Order #${o.no} · ${o.waktu.replace("T", " ")}`,
    "",
    ...o.items.map((i) => `${i.qty}× ${i.nama}  ${rp(i.harga * i.qty)}`),
    "",
    o.diskon ? `Subtotal ${rp(o.subtotal)}\nDiskon -${rp(o.diskon)}` : null,
    `*Total ${rp(o.total)}*`,
    `Bayar ${metodeNama(o.metode)}${o.metode === "tunai" ? ` ${rp(o.bayar)} · Kembali ${rp(o.kembali)}` : ""}`,
    "",
    "Terima kasih, ditunggu lagi ya!",
  ];
  return lines.filter((l) => l !== null).join("\n");
}
