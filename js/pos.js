// Kasir (POS): logika order -> Kas, stok, stempel. Murni (tanpa UI).
//
// Supaya data tetap ringan walau ratusan order/hari:
// - Kas: penjualan kasir DIGABUNG per hari per metode bayar (1 transaksi, id "pos-<tgl>-<metode>"),
//   dihitung ulang dari daftar order setiap ada order baru / batal.
// - Riwayat stok: pemakaian bahan dari kasir digabung per hari per bahan (id "pos-<tgl>-<bahanId>").
// - Detail order disimpan 30 hari; rekap harian (omzet, jumlah order, item terjual) disimpan permanen.
import { uid } from "./store.js";
import { todayISO } from "./ui.js";
import { pakaiItem, namaLengkap } from "./varian.js";
import { rekapPromo } from "./promo.js";
import { program, patchStempel } from "./loyalty.js";
import { CHANNELS, isOnline, channelNama, komisiRp } from "./online.js";
import { laciTransactions } from "./shift.js";
import { porsiKasbon, utangDariOrder, hapusUtangOrder, kasbonKasSemua } from "./kasbon.js";
import { porsiSaldo, saldoDariOrder, hapusPakaiOrder, saldoKas, saldoKasSemua, saldoOf, KAT_SALDO } from "./saldo.js";

// Metode bayar untuk order di toko. Order online memakai id saluran (gofood, grabfood, shopeefood) sebagai metode.
export const METODE = [
  { id: "tunai", nama: "Tunai" },
  { id: "qris", nama: "QRIS" },
  { id: "transfer", nama: "Transfer" },
];
// Semua "metode" yang mungkin muncul di order (termasuk data lama "ojol").
const SEMUA_METODE = [...METODE, ...CHANNELS.map((c) => ({ id: c.id, nama: c.nama })), { id: "ojol", nama: "Ojol" }, { id: "campur", nama: "Campuran" }, { id: "kasbon", nama: "Kasbon" }, { id: "saldo", nama: "Saldo" }];
/**
 * Porsi pembayaran order per metode: [{ metode, jumlah }]. Order biasa = 1 metode senilai total;
 * order dengan pembayaran campuran (mis. sebagian tunai, sisanya QRIS) punya o.pembayaran.
 */
export const porsiMetode = (o) => (Array.isArray(o.pembayaran) && o.pembayaran.length ? o.pembayaran : [{ metode: o.metode, jumlah: o.total }]);
const jumlahMetode = (list, id) => sum(list, (o) => sum(porsiMetode(o).filter((x) => x.metode === id), (x) => Number(x.jumlah) || 0));
const pakaiMetode = (o, id) => porsiMetode(o).some((x) => x.metode === id);
export const metodeNama = (id) => SEMUA_METODE.find((m) => m.id === id)?.nama || channelNama(id);
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
  for (const m of SEMUA_METODE) {
    // Kasbon belum jadi uang: masuk Kas saat dilunasi (js/kasbon.js).
    if (m.id === "kasbon") continue;
    const list = aktif.filter((o) => pakaiMetode(o, m.id));
    if (!list.length) continue;
    tx.push({
      id: `pos-${tanggal}-${m.id}`,
      tanggal,
      jenis: "masuk",
      kategori: "Penjualan",
      nominal: Math.round(jumlahMetode(list, m.id)),
      catatan: `Kasir · ${m.nama} · ${list.length} order`,
      ref: "pos",
    });
    const komisi = Math.round(sum(list, (o) => o.komisi || 0));
    if (komisi) {
      tx.push({
        id: `pos-${tanggal}-${m.id}-komisi`,
        tanggal,
        jenis: "keluar",
        kategori: "Komisi Order Online",
        nominal: komisi,
        catatan: `Komisi ${m.nama} · ${list.length} order`,
        ref: "pos",
      });
    }
    // Dibayar pakai saldo: penjualannya tetap masuk (di atas), titipan pelanggan berkurang senilai yang sama.
    if (m.id === "saldo") {
      tx.push({
        id: `pos-${tanggal}-saldo-pakai`,
        tanggal,
        jenis: "keluar",
        kategori: KAT_SALDO,
        nominal: Math.round(jumlahMetode(list, m.id)),
        catatan: `Saldo pelanggan terpakai · ${list.length} order`,
        ref: "pos",
      });
    }
  }
  return tx;
}

/** Ubah stok bahan dari item order (arah: -1 jual, +1 batal). Hanya bahan yang stoknya sudah diisi. */
export function stokPatch(s, items, tanggal, arah) {
  const pakai = {};
  for (const it of items) for (const k of pakaiItem(s, it)) pakai[k.bahanId] = (pakai[k.bahanId] || 0) + k.qty;
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
  const opsi = {}; // pilihan varian/topping terjual: { pilihanId: porsi }
  const opsiMenu = {}; // per menu (HPP porsi jumbo / ganti bahan beda tiap menu): { pilihanId: { namaMenu: porsi } }
  for (const o of aktif)
    for (const it of o.items) {
      items[it.nama] = (items[it.nama] || 0) + it.qty;
      for (const x of it.opsi || []) {
        opsi[x.id] = (opsi[x.id] || 0) + it.qty;
        opsiMenu[x.id] ??= {};
        opsiMenu[x.id][it.nama] = (opsiMenu[x.id][it.nama] || 0) + it.qty;
      }
    }
  const rekap = { order: aktif.length, omzet: Math.round(sum(aktif, (o) => o.total)), items };
  if (Object.keys(opsi).length) Object.assign(rekap, { opsi, opsiMenu });
  const promo = rekapPromo(aktif); // pemakaian promo: { promoId: { n, rp, omzet } }
  if (promo) rekap.promo = promo;
  return { ...(s.posHarian || {}), [tanggal]: rekap };
}

/** Buang detail order yang lebih tua dari SIMPAN_HARI hari. */
function prune(orders) {
  const batas = new Date(todayISO() + "T00:00:00");
  batas.setDate(batas.getDate() - SIMPAN_HARI);
  const b = batas.toISOString().slice(0, 10);
  return orders.filter((o) => o.tanggal >= b);
}

/** Salin item keranjang ke order (pilihan varian ikut disimpan kalau ada). */
function itemOrder(i) {
  const it = { resepId: i.resepId || null, nama: i.nama, harga: Number(i.harga) || 0, qty: Number(i.qty) };
  if (i.opsi?.length) it.opsi = i.opsi.map((o) => ({ g: o.g, id: o.id, nama: o.nama, harga: Number(o.harga) || 0 }));
  return it;
}

/**
 * Buat order baru. cart = [{ resepId|null, nama, harga, qty, opsi? }].
 * Return { patch, order, stempelInfo }.
 */
export function buatOrder(s, { cart, diskon = 0, promo = null, metode = "tunai", bayar = 0, pelangganId = "", channel = "toko", kasir = null, shiftId = null, tunaiSebagian = 0, stok = true, bill = null, saldoPakai = null, sisaMetode = "tunai", simpanKembalian = 0 }) {
  if (isOnline(channel)) metode = channel; // order online dibayar lewat platform
  const tanggal = todayISO();
  const items = cart.filter((i) => i.qty > 0).map(itemOrder);
  const sub = subtotal(items);
  // Promo (satu, dari pilihPromo di js/promo.js) dulu, lalu diskon manual kasir.
  const pot = promo ? Math.min(Math.max(0, Math.round(Number(promo.potongan) || 0)), sub) : 0;
  const disk = Math.min(Math.max(0, Math.round(Number(diskon) || 0)), sub - pot);
  const total = sub - pot - disk;
  const order = {
    id: uid(),
    no: nextNo(s, tanggal),
    tanggal,
    waktu: nowLocal(),
    items,
    subtotal: sub,
    diskon: disk,
    total,
    ...(pot ? { promo: { id: promo.id, nama: promo.nama, potongan: pot, ...(promo.kode ? { kode: promo.kode } : {}), ...(promo.wa ? { wa: promo.wa } : {}) } } : {}),
    channel: isOnline(channel) ? channel : "toko",
    komisi: komisiRp(s, channel, total),
    metode,
    bayar: metode === "tunai" ? Math.max(Number(bayar) || 0, total) : total,
    kembali: metode === "tunai" ? Math.max(0, (Number(bayar) || 0) - total) : 0,
    pelangganId: pelangganId || null,
    stempel: 0,
    status: "selesai",
  };
  // Pembayaran campuran: sebagian tunai (pas), sisanya pakai metode non-tunai yang dipilih.
  const tunaiPart = Math.round(Number(tunaiSebagian) || 0);
  if (metode === "saldo") {
    // Bayar pakai saldo pelanggan; kalau saldonya kurang, sisanya dibayar tunai / QRIS / transfer.
    if (!pelangganId) throw new Error("Bayar pakai saldo wajib pilih pelanggan");
    const ada = saldoOf(s, pelangganId);
    const pakai = Math.min(total, Math.max(0, Math.round(saldoPakai == null ? Math.min(ada, total) : Number(saldoPakai) || 0)));
    if (pakai > ada) throw new Error(`Saldo cuma Rp${ada.toLocaleString("id-ID")}`);
    if (pakai <= 0 && total > 0) throw new Error("Saldo pelanggan ini kosong");
    if (pakai < total) {
      if (!METODE.some((m) => m.id === sisaMetode)) throw new Error("Metode sisa bayar nggak dikenal");
      order.pembayaran = [
        { metode: sisaMetode, jumlah: total - pakai },
        { metode: "saldo", jumlah: pakai },
      ];
      order.metode = "campur";
    }
  } else if (!isOnline(channel) && metode !== "tunai" && tunaiPart > 0 && tunaiPart < total) {
    order.pembayaran = [
      { metode: "tunai", jumlah: tunaiPart },
      { metode, jumlah: total - tunaiPart },
    ];
    order.metode = "campur";
  }
  if (porsiKasbon(order) && !order.pelangganId) throw new Error("Kasbon wajib pilih pelanggan");
  // Kembalian nggak diambil, disimpan jadi saldo pelanggan.
  const simpan = Math.round(Number(simpanKembalian) || 0);
  if (simpan > 0) {
    if (order.metode !== "tunai" || !order.pelangganId) throw new Error("Simpan kembalian cuma untuk bayar tunai dengan pelanggan");
    if (simpan > order.kembali) throw new Error("Yang disimpan lebih besar dari kembalian");
    order.kembali -= simpan;
    order.simpanSaldo = simpan;
  }
  if (bill) order.bill = bill; // { id, nama, ronde } dari open bill (stok sudah dipotong per ronde)
  if (kasir) order.kasir = kasir; // { id, nama } yang mencatat (mode tim)
  if (shiftId) order.shiftId = shiftId; // shift kasir yang sedang terbuka

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
  // kasbon pelanggan (piutang)
  const utang = utangDariOrder(order);
  if (utang) st = { ...st, kasbon: [...(st.kasbon || []), utang] };
  // saldo pelanggan (dipakai bayar / kembalian disimpan); kasir & kasbon: lihat saldoDariOrder
  const saldoBaru = saldoDariOrder(order);
  if (saldoBaru.length) st = { ...st, saldoPelanggan: [...(st.saldoPelanggan || []), ...saldoBaru] };
  // stok (open bill: sudah dipotong waktu tiap ronde dikirim)
  if (stok) st = { ...st, ...stokPatch(st, items, tanggal, -1) };
  // order + kas + rekap
  const orders = prune([...(st.orders || []), order]);
  const patch = {
    ...st,
    orders,
    transactions: order.simpanSaldo ? saldoKas(kasPatch(st.transactions, orders, tanggal), st.saldoPelanggan, tanggal) : kasPatch(st.transactions, orders, tanggal),
    posHarian: rekapPatch(st, tanggal, orders),
  };
  return { patch: pick(patch), order, stempelInfo };
}

/** Batalkan order: kas & rekap dihitung ulang, stok dikembalikan, stempel dikurangi. */
export function batalOrder(s, orderId, oleh = null) {
  const o = (s.orders || []).find((x) => x.id === orderId);
  if (!o || o.status === "batal") return null;
  let st = { ...s };
  st = { ...st, ...stokPatch(st, o.items, o.tanggal, +1) };
  if (o.stempel && o.pelangganId && st.pelanggan.some((p) => p.id === o.pelangganId)) {
    st = { ...st, ...patchStempel(st, o.pelangganId, -o.stempel, "koreksi", `Batal kasir #${o.no}`) };
  }
  if (porsiKasbon(o)) st = { ...st, kasbon: hapusUtangOrder(st.kasbon, orderId) };
  if (porsiSaldo(o)) st = { ...st, saldoPelanggan: hapusPakaiOrder(st.saldoPelanggan, orderId) };
  const orders = st.orders.map((x) => (x.id === orderId ? { ...x, status: "batal", ...(oleh ? { batalOleh: oleh } : {}) } : x));
  return pick({ ...st, orders, transactions: kasPatch(st.transactions, orders, o.tanggal), posHarian: rekapPatch(st, o.tanggal, orders) });
}

const KEYS = ["orders", "transactions", "posHarian", "bahan", "stokLog", "pelanggan", "stempelLog", "kasbon", "saldoPelanggan"];
const pick = (obj) => Object.fromEntries(KEYS.filter((k) => k in obj).map((k) => [k, obj[k]]));

/**
 * Hitung ulang rekap harian (& transaksi Kas kasir kalau `kas`) dari daftar order.
 * Dipakai setelah data dari beberapa HP digabung, supaya total selalu cocok dengan order.
 */
export function reconcile(s, { kas = true } = {}) {
  const orders = s.orders || [];
  const tanggal = [...new Set(orders.map((o) => o.tanggal))];
  let posHarian = { ...(s.posHarian || {}) };
  // Pengeluaran dari laci kasir (shift) juga dihitung ulang di Kas.
  let transactions = kas && s.shifts?.length ? laciTransactions(s) : s.transactions || [];
  // Pelunasan kasbon (bisa dicatat akun kasir yang nggak boleh menulis Kas) juga dihitung ulang.
  if (kas && (s.kasbon?.length || transactions.some((t) => t.ref === "kasbon"))) transactions = kasbonKasSemua(transactions, s.kasbon || []);
  // Isi / tarik saldo pelanggan (bisa dicatat akun kasir) juga dihitung ulang.
  if (kas && (s.saldoPelanggan?.length || transactions.some((t) => t.ref === "saldo"))) transactions = saldoKasSemua(transactions, s.saldoPelanggan || []);
  if (!tanggal.length) return kas ? { ...s, transactions } : s;
  for (const t of tanggal) {
    posHarian = rekapPatch({ posHarian }, t, orders);
    if (kas) transactions = kasPatch(transactions, orders, t);
  }
  return kas ? { ...s, posHarian, transactions } : { ...s, posHarian };
}

/** Penjualan per orang yang mencatat (mode tim). */
export function perKasir(list) {
  const m = new Map();
  for (const o of list) {
    const k = o.kasir?.id || "-";
    const cur = m.get(k) || { nama: o.kasir?.nama || "Tanpa nama", n: 0, total: 0 };
    cur.n += 1;
    cur.total += o.total;
    m.set(k, cur);
  }
  return [...m.values()].sort((a, b) => b.total - a.total);
}

/** Ringkasan hari ini untuk layar rekap. */
export function rekapHari(s, tanggal = todayISO()) {
  const semua = ordersOn(s, tanggal);
  const aktif = semua.filter((o) => o.status !== "batal");
  const omzet = sum(aktif, (o) => o.total);
  const perMetode = SEMUA_METODE.map((m) => {
    const list = aktif.filter((o) => pakaiMetode(o, m.id));
    return { ...m, total: jumlahMetode(list, m.id), komisi: sum(list, (o) => o.komisi || 0), n: list.length };
  }).filter((m) => m.n);
  const komisi = sum(aktif, (o) => o.komisi || 0);
  const items = {};
  const opsi = {};
  for (const o of aktif)
    for (const it of o.items) {
      items[it.nama] = (items[it.nama] || 0) + it.qty;
      for (const x of it.opsi || []) opsi[x.nama] = (opsi[x.nama] || 0) + it.qty;
    }
  const terlaris = Object.entries(items).sort((a, b) => b[1] - a[1]);
  const opsiLaris = Object.entries(opsi).sort((a, b) => b[1] - a[1]);
  return { semua, aktif, omzet, komisi, bersih: omzet - komisi, n: aktif.length, rata: aktif.length ? omzet / aktif.length : 0, perMetode, terlaris, opsiLaris, batal: semua.length - aktif.length };
}

/** Teks struk untuk WhatsApp. */
export function struk(o, bisnis, rp) {
  const lines = [
    `*${bisnis}*`,
    `Order #${o.no} · ${o.waktu.replace("T", " ")}`,
    "",
    ...o.items.map((i) => `${i.qty}× ${namaLengkap(i)}  ${rp(i.harga * i.qty)}`),
    "",
    o.diskon || o.promo ? `Subtotal ${rp(o.subtotal)}` : null,
    o.promo ? `Promo ${o.promo.nama} -${rp(o.promo.potongan)}` : null,
    o.diskon ? `Diskon -${rp(o.diskon)}` : null,
    `*Total ${rp(o.total)}*`,
    isOnline(o.channel) ? `Pesanan ${channelNama(o.channel)}` : o.pembayaran ? `Bayar ${o.pembayaran.map((x) => `${metodeNama(x.metode)} ${rp(x.jumlah)}`).join(" + ")}` : `Bayar ${metodeNama(o.metode)}${o.metode === "tunai" ? ` ${rp(o.bayar)} · Kembali ${rp(o.kembali)}` : ""}`,
    o.simpanSaldo ? `Kembalian ${rp(o.simpanSaldo)} disimpan jadi saldo` : null,
    "",
    "Terima kasih, ditunggu lagi ya!",
  ];
  return lines.filter((l) => l !== null).join("\n");
}
