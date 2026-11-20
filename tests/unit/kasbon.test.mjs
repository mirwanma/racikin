// Kasbon pelanggan: order kasbon (akrual: rekap naik, Kas belum), DP tunai, batas, cicilan -> Kas, batal order,
// FIFO "sejak", reconcile setelah sinkron (pelunasan dari akun kasir), laci shift, pajak.
import assert from "node:assert/strict";
globalThis.localStorage = { getItem: () => null, setItem() {} };
const K = await import("../../js/kasbon.js");
const { buatOrder, batalOrder, reconcile } = await import("../../js/pos.js");
const { ringkasan } = await import("../../js/shift.js");
const { hitungPajak } = await import("../../js/pajak.js");
const { todayISO } = await import("../../js/ui.js");
const { labaRugi } = await import("../../js/laporan.js");

const T = todayISO();
const resep = [{ id: "tg", nama: "Tahu Guyur", harga: 12000, hasil: 1, items: [] }];
const s0 = {
  bahan: [], resep, opsi: [], orders: [], transactions: [], posHarian: {}, stokLog: [], stempelLog: [], promo: [], kasbon: [],
  pelanggan: [{ id: "budi", nama: "Budi", wa: "6281" }, { id: "sari", nama: "Sari", wa: "", batasKasbon: 20000 }],
  posSetting: { kasbon: true, kasbonBatas: 50000 },
};
const cart = (n) => [{ resepId: "tg", nama: "Tahu Guyur", harga: 12000, qty: n }];
const kasPos = (s) => s.transactions.filter((t) => t.ref === "pos" && t.jenis === "masuk").reduce((a, t) => a + t.nominal, 0);
const kasKb = (s) => s.transactions.filter((t) => t.ref === "kasbon").reduce((a, t) => a + t.nominal, 0);

// Batas
assert.equal(K.batasKasbon(s0, s0.pelanggan[0]), 50000);
assert.equal(K.batasKasbon(s0, s0.pelanggan[1]), 20000, "batas khusus");
assert.equal(K.batasKasbon({}, {}), K.BATAS_DEFAULT);
assert.match(K.cekKasbon(s0, "", 1000), /Pilih pelanggan/);
assert.equal(K.cekKasbon(s0, "budi", 48000), "");
assert.match(K.cekKasbon(s0, "sari", 24000), /Lewat batas kasbon Sari/);

// Order kasbon penuh: rekap naik, Kas belum
assert.throws(() => buatOrder(s0, { cart: cart(1), metode: "kasbon" }), /pelanggan/);
let r = buatOrder(s0, { cart: cart(2), metode: "kasbon", pelangganId: "budi" });
let s = { ...s0, ...r.patch };
const o1 = r.order;
assert.equal(s.posHarian[T].omzet, 24000, "omzet akrual");
assert.equal(kasPos(s), 0, "Kas belum naik");
assert.equal(K.saldoKasbon(s, "budi"), 24000);
assert.deepEqual(s.kasbon[0], { id: `o-${o1.id}`, jenis: "utang", pelangganId: "budi", tanggal: T, waktu: o1.waktu, nominal: 24000, orderId: o1.id, no: o1.no });

// DP tunai 5rb + sisa kasbon
r = buatOrder(s, { cart: cart(1), metode: "kasbon", pelangganId: "budi", tunaiSebagian: 5000 });
s = { ...s, ...r.patch };
assert.equal(r.order.metode, "campur");
assert.equal(K.porsiKasbon(r.order), 7000);
assert.equal(K.saldoKasbon(s, "budi"), 31000);
assert.equal(kasPos(s), 5000, "DP tunai masuk Kas");
assert.equal(s.posHarian[T].omzet, 36000);
assert.match(K.cekKasbon(s, "budi", 20000), /Maksimal kasbon lagi Rp19\.000/);

// Cicil 10rb tunai di shift, 21rb QRIS -> lunas
const shift = { id: "sh1", modal: 100000, laci: [] };
s.shifts = [shift];
let b = K.bayarKasbon(s, "budi", { nominal: 10000, metode: "tunai", tanggal: T, shiftId: "sh1" });
s = { ...s, kasbon: b.kasbon, transactions: b.transactions };
assert.equal(K.saldoKasbon(s, "budi"), 21000);
assert.equal(kasKb(s), 10000);
assert.equal(ringkasan(s, shift).kasbon, 10000);
assert.equal(ringkasan(s, shift).seharusnya, 110000, "pelunasan tunai masuk laci");
assert.throws(() => K.bayarKasbon(s, "budi", { nominal: 22000, tanggal: T }), /Maksimal Rp21\.000/);
assert.throws(() => K.bayarKasbon(s, "budi", { nominal: 0, tanggal: T }), /Isi jumlah/);
b = K.bayarKasbon(s, "budi", { nominal: 21000, metode: "qris", tanggal: T });
s = { ...s, kasbon: b.kasbon, transactions: b.transactions };
assert.equal(K.saldoKasbon(s, "budi"), 0);
assert.equal(K.sejakKasbon(s, "budi"), null);
const tx = s.transactions.filter((t) => t.ref === "kasbon");
assert.deepEqual(tx.map((t) => [t.id, t.nominal, t.kategori]), [[`kasbon-${T}-tunai`, 10000, "Pelunasan kasbon"], [`kasbon-${T}-qris`, 21000, "Pelunasan kasbon"]]);
assert.equal(kasPos(s) + kasKb(s), s.posHarian[T].omzet, "akhirnya Kas = omzet");
assert.equal(hitungPajak(s, Number(T.slice(0, 4)), T).omzet, 36000, "omzet pajak dari uang yang diterima");

// Laporan laba rugi: kasbon dihitung penjualan saat order (akrual), pelunasan nggak dobel
const lr = labaRugi(s, T.slice(0, 7), "belanja");
assert.equal(lr.rincianPendapatan.kasirToko, 36000);
assert.equal(lr.rincianPendapatan.kasbon, 31000);
assert.equal(lr.lain, 0, "pelunasan bukan pendapatan lain");

// Hapus catatan bayar -> Kas dihitung ulang
const h = K.hapusBayar(s, b.entri.id);
assert.equal(K.saldoKasbon({ ...s, ...h }, "budi"), 21000);
assert.equal(kasKb({ ...s, ...h }), 10000);

// Batal order kasbon -> utangnya hilang; kalau sudah dibayar jadi lebih bayar (negatif)
let s2 = { ...s0, ...buatOrder(s0, { cart: cart(1), metode: "kasbon", pelangganId: "sari" }).patch };
const oid = s2.orders[0].id;
s2 = { ...s2, ...batalOrder(s2, oid) };
assert.equal(K.saldoKasbon(s2, "sari"), 0);
assert.equal(s2.kasbon.length, 0);
assert.equal(s.kasbon.length, 4);
const s3 = { ...s, ...batalOrder(s, o1.id) };
assert.equal(K.saldoKasbon(s3, "budi"), -24000, "lebih bayar");
assert.equal(K.daftarKasbon(s3, T).length, 0);

// FIFO sejak & daftar
const sF = {
  pelanggan: s0.pelanggan, posSetting: s0.posSetting,
  kasbon: [
    { id: "a", jenis: "utang", pelangganId: "budi", tanggal: "2026-10-01", nominal: 10000 },
    { id: "b", jenis: "utang", pelangganId: "budi", tanggal: "2026-10-20", nominal: 15000 },
    { id: "c", jenis: "bayar", pelangganId: "budi", tanggal: "2026-10-25", nominal: 12000 },
    { id: "d", jenis: "utang", pelangganId: "sari", tanggal: "2026-11-18", nominal: 8000 },
  ],
};
assert.equal(K.sejakKasbon(sF, "budi"), "2026-10-20", "utang 1 Okt sudah ketutup");
const d = K.daftarKasbon(sF, "2026-11-20");
assert.deepEqual(d.map((x) => [x.p.nama, x.saldo, x.umur]), [["Budi", 13000, 31], ["Sari", 8000, 2]]);
assert.deepEqual(K.ringkasKasbon(sF, "2026-11-20"), { n: 2, total: 21000, lama: 1, totalLama: 13000 });
assert.match(K.teksTagih(sF, sF.pelanggan[0], "Warung X", (n) => `Rp${n}`), /Warung X[\s\S]*\*Rp13000\*[\s\S]*2026-10-20: Rp15000/);

// Reconcile (HP pemilik setelah sinkron): pelunasan dari akun kasir (tanpa Kas) jadi transaksi Kas
const sK = { ...s, transactions: s.transactions.filter((t) => t.ref !== "kasbon") };
const rec = reconcile(sK);
assert.equal(kasKb(rec), 31000);
assert.equal(kasPos(rec), 5000);
const rec2 = reconcile({ ...rec, kasbon: rec.kasbon.filter((k) => k.jenis !== "bayar") });
assert.equal(kasKb(rec2), 0, "Kas pelunasan yang sudah dihapus ikut hilang");

console.log("kasbon OK");
