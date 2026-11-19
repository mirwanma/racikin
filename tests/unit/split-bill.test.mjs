// Open bill tahap 2: batal sebagian jumlah, bayar sebagian (split bill per orang), gabung bill, pindah meja.
// Cek juga Kas & stok tetap konsisten (stok dipotong sekali per ronde, Kas per pembayaran).
import assert from "node:assert/strict";
globalThis.localStorage = { getItem: () => null, setItem() {} };
const B = await import("../../js/bill.js");
const { buatOrder } = await import("../../js/pos.js");
const { todayISO } = await import("../../js/ui.js");

const T = todayISO();
const bahan = [{ id: "teh", nama: "Teh", satuan: "pcs", harga: 250, stok: 50, min: 0, tracked: true }];
const resep = [
  { id: "et", nama: "Es Teh", harga: 4000, hasil: 1, items: [{ bahanId: "teh", qty: 1 }] },
  { id: "tg", nama: "Tahu Guyur", harga: 12000, hasil: 1, items: [] },
];
const s0 = { bahan, resep, opsi: [], orders: [], transactions: [], posHarian: {}, stokLog: [], pelanggan: [], stempelLog: [], promo: [], bills: [], meja: [{ id: "m1", nama: "Meja 1" }, { id: "m2", nama: "Meja 2" }], posSetting: { openBill: true } };
const teh = (s) => s.bahan.find((b) => b.id === "teh").stok;
const tehLog = (s) => s.stokLog.filter((l) => l.bahanId === "teh").reduce((a, l) => a + l.delta, 0);

// Bill Meja 1: 3 es teh + 2 tahu guyur (Budi & Sari makan bareng)
let r = B.bukaBill(s0, { nama: "Meja 1", meja: { id: "m1", nama: "Meja 1" }, waktu: `${T}T12:00` });
let s = { ...s0, ...r.patch };
const id = r.bill.id;
s = { ...s, ...B.tambahRonde(s, id, [{ resepId: "et", nama: "Es Teh", harga: 4000, qty: 3 }, { resepId: "tg", nama: "Tahu Guyur", harga: 12000, qty: 2 }], { waktu: `${T}T12:05` }).patch };
assert.equal(teh(s), 47);
const [itTeh, itTahu] = B.cariBill(s, id).ronde[0].items;

// --- Batal sebagian jumlah: 1 dari 3 es teh
assert.throws(() => B.hapusItem(s, id, B.cariBill(s, id).ronde[0].id, itTeh.id, { alasan: "x", qty: 4 }), /1 sampai 3/);
s = { ...s, ...B.hapusItem(s, id, B.cariBill(s, id).ronde[0].id, itTeh.id, { alasan: "Kebanyakan", qty: 1, stokKembali: true }) };
let b = B.cariBill(s, id);
assert.equal(b.ronde[0].items.find((x) => x.id === itTeh.id).qty, 2, "sisa 2 es teh");
assert.equal(b.hapus[0].item.qty, 1, "riwayat batal: 1 es teh");
assert.equal(teh(s), 48, "stok 1 es teh kembali");
assert.equal(B.totalBill(b), 2 * 4000 + 2 * 12000);

// --- Bayar sebagian: Budi bayar 1 es teh + 1 tahu guyur
const pilihBudi = { [itTeh.id]: 1, [itTahu.id]: 1, ngasal: 5 };
assert.deepEqual(B.rapikanPilih(b, { [itTeh.id]: 9 }), { [itTeh.id]: 2 }, "dibatasi qty yang ada");
assert.deepEqual(B.rapikanPilih(b, pilihBudi), { [itTeh.id]: 1, [itTahu.id]: 1 });
assert.equal(B.totalPilih(b, pilihBudi), 16000);
assert.equal(B.semuaDipilih(b, pilihBudi), false);
assert.deepEqual(B.keranjangPilih(b, pilihBudi).map((x) => [x.nama, x.qty]), [["Es Teh", 1], ["Tahu Guyur", 1]]);
let o = buatOrder(s, { cart: B.keranjangPilih(b, pilihBudi), metode: "tunai", bayar: 20000, stok: false, bill: { id, nama: b.nama, ronde: 1, sebagian: true } });
let sisa = B.bayarSebagian(s, id, pilihBudi, { orderId: o.order.id, total: o.order.total });
s = { ...s, ...o.patch, bills: sisa.bills };
assert.equal(sisa.lunas, false);
b = B.cariBill(s, id);
assert.equal(B.totalBill(b), 16000, "sisa bill punya Sari");
assert.deepEqual(b.dibayar.map((x) => [x.total, x.n]), [[16000, 2]]);
assert.equal(teh(s), 48, "stok nggak dipotong lagi saat bayar");
assert.equal(s.posHarian[T].omzet, 16000, "Kas/rekap baru sebesar yang dibayar");

// --- Sari bayar sisanya -> bill tutup
const pilihSari = { [itTeh.id]: 1, [itTahu.id]: 1 };
assert.equal(B.semuaDipilih(b, pilihSari), true);
o = buatOrder(s, { cart: B.keranjangPilih(b, pilihSari), metode: "qris", stok: false, bill: { id, nama: b.nama, ronde: 1, sebagian: true } });
sisa = B.bayarSebagian(s, id, pilihSari, { orderId: o.order.id, total: o.order.total });
s = { ...s, ...o.patch, bills: sisa.bills };
assert.equal(sisa.lunas, true);
assert.equal(B.cariBill(s, id), null, "bill ditutup setelah lunas");
assert.equal(s.posHarian[T].omzet, 32000);
assert.equal(s.posHarian[T].order, 2);
assert.deepEqual(s.posHarian[T].items, { "Es Teh": 2, "Tahu Guyur": 2 });
assert.equal(tehLog(s), teh(s) - 50, "stok = total stokLog");
const kas = s.transactions.filter((x) => x.ref === "pos" && x.jenis === "masuk").reduce((a, x) => a + x.nominal, 0);
assert.equal(kas, 32000, "Kas = jumlah semua pembayaran");

// --- Gabung bill
let s2 = { ...s0 };
const a = B.bukaBill(s2, { nama: "Budi", waktu: `${T}T13:00` });
s2 = { ...s2, ...a.patch };
s2 = { ...s2, ...B.tambahRonde(s2, a.bill.id, [{ resepId: "et", nama: "Es Teh", harga: 4000, qty: 1 }], { waktu: `${T}T13:01` }).patch };
const m = B.bukaBill(s2, { nama: "Meja 2", meja: { id: "m2", nama: "Meja 2" }, waktu: `${T}T12:30` });
s2 = { ...s2, ...m.patch };
s2 = { ...s2, ...B.tambahRonde(s2, m.bill.id, [{ resepId: "tg", nama: "Tahu Guyur", harga: 12000, qty: 1 }], { waktu: `${T}T12:31` }).patch };
s2 = { ...s2, ...B.voucherBill(s2, a.bill.id, { kode: "HEMAT5", wa: "6281" }) };
assert.throws(() => B.gabungBill(s2, a.bill.id, a.bill.id), /bill lain/);
const g = B.gabungBill(s2, a.bill.id, m.bill.id);
const s3 = { ...s2, ...g };
const gb = B.cariBill(s3, m.bill.id);
assert.equal(B.cariBill(s3, a.bill.id), null, "bill asal hilang");
assert.deepEqual(gb.ronde.map((x) => x.waktu.slice(11)), ["12:31", "13:01"], "ronde urut waktu");
assert.equal(B.totalBill(gb), 16000);
assert.equal(gb.kode, "HEMAT5", "voucher ikut pindah");
assert.equal(gb.dibuka, `${T}T12:30`);

// --- Pindah meja: ke meja kosong (nama ikut), ke meja yang sudah ada bill (digabung)
let p = B.pindahMeja(s2, m.bill.id, { id: "m1", nama: "Meja 1" });
assert.equal(p.digabung, null);
let s4 = { ...s2, bills: p.bills };
assert.deepEqual([B.cariBill(s4, m.bill.id).nama, B.cariBill(s4, m.bill.id).meja.id], ["Meja 1", "m1"]);
assert.equal(B.billMeja(s4, "m1").id, m.bill.id);
const ab = B.cariBill(s4, a.bill.id);
p = B.pindahMeja({ ...s4, bills: s4.bills.map((x) => (x.id === ab.id ? { ...x, meja: { id: "m2", nama: "Meja 2" } } : x)) }, ab.id, { id: "m1", nama: "Meja 1" });
assert.equal(p.digabung, m.bill.id, "meja tujuan sudah ada bill -> digabung");
// Nama custom tetap dipertahankan (ganti bagian nama meja saja)
const s5 = { ...s2, bills: s2.bills.map((x) => (x.id === m.bill.id ? { ...x, nama: "Meja 2 (rombongan)" } : x)) };
assert.equal(B.cariBill({ ...s5, bills: B.pindahMeja(s5, m.bill.id, { id: "m1", nama: "Meja 1" }).bills }, m.bill.id).nama, "Meja 1 (rombongan)");

console.log("split-bill OK");
