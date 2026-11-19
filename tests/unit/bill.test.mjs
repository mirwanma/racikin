// Open bill: buka bill, ronde (stok dipotong saat dikirim), batalkan item/bill, bayar (Kas baru masuk saat bayar,
// stok nggak dipotong dua kali), pembayaran campuran (tunai + QRIS) di Kas, rekap & laci shift, data contoh.
import assert from "node:assert/strict";
globalThis.localStorage = { getItem: () => null, setItem() {} };
const B = await import("../../js/bill.js");
const { buatOrder, batalOrder, rekapHari, porsiMetode, struk } = await import("../../js/pos.js");
const { ringkasan } = await import("../../js/shift.js");
const { merge3 } = await import("../../js/merge.js");
const { todayISO } = await import("../../js/ui.js");

const T = todayISO();
const bahan = [
  { id: "tahu", nama: "Tahu", satuan: "pcs", harga: 600, stok: 100, min: 0, tracked: true },
  { id: "teh", nama: "Teh", satuan: "pcs", harga: 250, stok: 50, min: 0, tracked: true },
];
const resep = [
  { id: "tg", nama: "Tahu Guyur", harga: 12000, hasil: 1, items: [{ bahanId: "tahu", qty: 3 }] },
  { id: "et", nama: "Es Teh", harga: 4000, hasil: 1, items: [{ bahanId: "teh", qty: 1 }] },
];
const s0 = { bahan, resep, opsi: [], orders: [], transactions: [], posHarian: {}, stokLog: [], pelanggan: [], stempelLog: [], promo: [], bills: [], shifts: [], posSetting: { openBill: true } };
const stokDari = (s, id) => s.bahan.find((b) => b.id === id).stok;
const logTotal = (s, id) => s.stokLog.filter((l) => l.bahanId === id).reduce((a, l) => a + l.delta, 0);

assert.equal(B.billAktif(s0), true);
assert.equal(B.billAktif({}), false);
assert.throws(() => B.bukaBill(s0, { nama: "  " }), /nama bill/);

// --- Buka bill + ronde 1 (2 tahu guyur, 2 es teh)
let r = B.bukaBill(s0, { nama: "Meja 3", oleh: { id: "k1", nama: "Kasir A" }, waktu: `${T}T12:00` });
let s = { ...s0, ...r.patch };
const id = r.bill.id;
assert.equal(B.billTerbuka(s).length, 1);
let t = B.tambahRonde(s, id, [{ resepId: "tg", nama: "Tahu Guyur", harga: 12000, qty: 2 }, { resepId: "et", nama: "Es Teh", harga: 4000, qty: 2 }], { waktu: `${T}T12:05` });
s = { ...s, ...t.patch };
assert.equal(stokDari(s, "tahu"), 94, "stok dipotong waktu ronde dikirim");
assert.equal(stokDari(s, "teh"), 48);
assert.equal(s.transactions.length, 0, "belum ada uang masuk Kas");
assert.equal(Object.keys(s.posHarian).length, 0, "belum masuk rekap");
assert.equal(B.totalBill(B.cariBill(s, id)), 32000);

// Ronde 2 (nambah 1 es teh + 1 tahu guyur)
t = B.tambahRonde(s, id, [{ resepId: "et", nama: "Es Teh", harga: 4000, qty: 1 }, { resepId: "tg", nama: "Tahu Guyur", harga: 12000, qty: 1 }], { waktu: `${T}T12:40` });
s = { ...s, ...t.patch };
const b = B.cariBill(s, id);
assert.equal(b.ronde.length, 2);
assert.equal(B.jumlahItem(b), 6);
assert.equal(B.totalBill(b), 48000);
assert.equal(B.lamaBuka(b, `${T}T13:25`), "1 jam 25 mnt");
assert.deepEqual(B.keranjangBill(b).map((x) => [x.nama, x.qty]), [["Tahu Guyur", 3], ["Es Teh", 3]], "keranjang bayar: item sama digabung");
assert.throws(() => B.tambahRonde(s, id, []), /kosong/);

// Batalkan 1 item (alasan wajib, stok kembali)
assert.throws(() => B.hapusItem(s, id, b.ronde[1].id, b.ronde[1].items[0].id, { alasan: " " }), /alasan/);
s = { ...s, ...B.hapusItem(s, id, b.ronde[1].id, b.ronde[1].items[0].id, { alasan: "Salah input", oleh: { id: "o", nama: "Pemilik" }, stokKembali: true }) };
assert.equal(stokDari(s, "teh"), 48, "stok es teh kembali");
assert.equal(B.totalBill(B.cariBill(s, id)), 44000);
assert.equal(B.cariBill(s, id).hapus[0].alasan, "Salah input");
assert.equal(logTotal(s, "teh"), -2, "stokLog ikut");

// --- Bayar: campuran tunai 20rb + QRIS sisanya; stok TIDAK dipotong lagi
const bb = B.cariBill(s, id);
const bayar = buatOrder(s, { cart: B.keranjangBill(bb), metode: "qris", tunaiSebagian: 20000, stok: false, bill: { id, nama: bb.nama, ronde: bb.ronde.length } });
s = { ...s, ...bayar.patch, ...B.tutupBill(s, id) };
const o = bayar.order;
assert.equal(o.total, 44000);
assert.equal(o.metode, "campur");
assert.deepEqual(o.pembayaran, [{ metode: "tunai", jumlah: 20000 }, { metode: "qris", jumlah: 24000 }]);
assert.deepEqual(o.bill, { id, nama: "Meja 3", ronde: 2 });
assert.equal(stokDari(s, "tahu"), 91, "stok nggak dipotong dua kali");
assert.equal(logTotal(s, "tahu"), -9);
assert.equal(B.billTerbuka(s).length, 0, "bill hilang setelah dibayar");
const kas = s.transactions.filter((x) => x.ref === "pos");
assert.deepEqual(kas.map((x) => [x.id.split("-").pop(), x.nominal]).sort(), [["qris", 24000], ["tunai", 20000]], "Kas per metode dari porsi pembayaran");
assert.equal(s.posHarian[T].omzet, 44000);
assert.deepEqual(s.posHarian[T].items, { "Tahu Guyur": 3, "Es Teh": 2 });
const rh = rekapHari(s, T);
assert.deepEqual(rh.perMetode.map((m) => [m.id, m.total]), [["tunai", 20000], ["qris", 24000]]);
assert.match(struk(o, "Tahguy", (n) => "Rp" + n), /Bayar Tunai Rp20000 \+ QRIS Rp24000/);
assert.deepEqual(porsiMetode({ metode: "tunai", total: 5000 }), [{ metode: "tunai", jumlah: 5000 }]);

// Laci shift: hanya bagian tunai
const sh = { id: "sh1", kasir: null, buka: `${T}T08:00`, modal: 100000, laci: [] };
const o2 = { ...o, shiftId: "sh1" };
const ring = ringkasan({ ...s, orders: [o2] }, sh);
assert.equal(ring.tunai, 20000);
assert.equal(ring.nonTunai, 24000);
assert.equal(ring.seharusnya, 120000);

// Batal order bill -> stok kembali & Kas hilang
const s3 = { ...s, ...batalOrder(s, o.id) };
assert.equal(stokDari(s3, "tahu"), 100);
assert.equal(s3.transactions.filter((x) => x.ref === "pos").length, 0);

// Pembayaran campuran tidak valid -> diabaikan (jadi 1 metode)
const x1 = buatOrder(s0, { cart: [{ resepId: "et", nama: "Es Teh", harga: 4000, qty: 1 }], metode: "qris", tunaiSebagian: 4000 });
assert.equal(x1.order.metode, "qris");
assert.equal(x1.order.pembayaran, undefined);
const x2 = buatOrder(s0, { cart: [{ resepId: "et", nama: "Es Teh", harga: 4000, qty: 1 }], metode: "tunai", tunaiSebagian: 1000, bayar: 5000 });
assert.equal(x2.order.metode, "tunai");

// --- Batalkan seluruh bill (stok nggak kembali kalau sudah dibuat)
r = B.bukaBill(s0, { nama: "Budi" });
let s4 = { ...s0, ...r.patch };
s4 = { ...s4, ...B.tambahRonde(s4, r.bill.id, [{ resepId: "tg", nama: "Tahu Guyur", harga: 12000, qty: 1 }]).patch };
assert.throws(() => B.batalBill(s4, r.bill.id, { alasan: "" }), /alasan/);
s4 = { ...s4, ...B.batalBill(s4, r.bill.id, { alasan: "Pembeli pergi", stokKembali: false }) };
assert.equal(B.billTerbuka(s4).length, 0);
assert.equal(s4.bills[0].status, "batal");
assert.equal(stokDari(s4, "tahu"), 97, "sudah dibuat: stok tetap terpakai");
assert.equal(s4.transactions.length, 0);
assert.throws(() => B.tambahRonde(s4, r.bill.id, [{ resepId: "et", nama: "Es Teh", harga: 4000, qty: 1 }]), /ditutup/);

// --- Bill meja & voucher
r = B.bukaBill(s0, { nama: "Meja 1", meja: { id: "m1", nama: "Meja 1" } });
let s5 = { ...s0, ...r.patch };
assert.equal(B.billMeja(s5, "m1").id, r.bill.id);
assert.equal(B.billMeja(s5, "m2"), null);
s5 = { ...s5, ...B.voucherBill(s5, r.bill.id, { kode: "HEMAT5", wa: "6281" }) };
assert.equal(B.cariBill(s5, r.bill.id).kode, "HEMAT5");
s5 = { ...s5, ...B.ubahBill(s5, r.bill.id, { nama: "Meja 1 (Budi)" }) };
assert.equal(B.cariBill(s5, r.bill.id).nama, "Meja 1 (Budi)");

// --- Sinkron dari 2 HP: dua ronde baru di bill yang sama tidak saling timpa
const base = s;
r = B.bukaBill(base, { nama: "Meja 5" });
const awal = { ...base, ...r.patch };
const hpA = { ...awal, ...B.tambahRonde(awal, r.bill.id, [{ resepId: "et", nama: "Es Teh", harga: 4000, qty: 1 }]).patch };
const hpB = { ...awal, ...B.tambahRonde(awal, r.bill.id, [{ resepId: "tg", nama: "Tahu Guyur", harga: 12000, qty: 1 }]).patch };
const gab = merge3(awal, hpA, hpB);
assert.equal(B.cariBill(gab, r.bill.id).ronde.length, 2, "ronde dari 2 HP digabung");
assert.equal(B.totalBill(B.cariBill(gab, r.bill.id)), 16000);

console.log("bill OK");
