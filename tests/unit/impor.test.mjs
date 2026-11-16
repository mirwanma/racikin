// Input cepat menu & bahan (parser lokal Mode Demo, review, simpan) + saldo kas awal.
import assert from "node:assert/strict";
globalThis.localStorage = { getItem: () => null, setItem() {} };
const I = await import("../../js/impor.js");

// --- angka ---
for (const [x, n] of [["15rb", 15000], ["15k", 15000], ["15.000", 15000], ["Rp 15,000", 15000], ["1,5jt", 1500000], ["12,5rb", 12500], ["Rp20.000", 20000]]) assert.equal(I.angka(x), n, x);
assert.equal(I.angka("15", { ribuan: true }), 15000); // papan warung: 15 = 15 ribu
assert.equal(I.angka("15"), 15);

// --- parser menu ---
const m = I.parseMenuLokal(`MAKANAN
1. Bakso Urat - 15rb
2. Mie ayam bakso 18.000
Bakso jumbo (isi telur) 25k
MINUMAN
Es teh manis 4
Es jeruk ........ 6rb
Kerupuk`).menu;
assert.deepEqual(m.map((x) => [x.nama, x.harga, x.kategori]), [
  ["Bakso Urat", 15000, "makanan"],
  ["Mie ayam bakso", 18000, "makanan"],
  ["Bakso jumbo", 25000, "makanan"],
  ["Es teh manis", 4000, "minuman"],
  ["Es jeruk", 6000, "minuman"],
  ["Kerupuk", 0, "minuman"],
]);
assert.equal(m[2].catatan, "isi telur");
assert.equal(I.parseMenuLokal("Nasi goreng spesial Rp 20.000").menu[0].nama, "Nasi goreng spesial");
assert.equal(I.parseMenuLokal("teh tarik 7rb").menu[0].nama, "Teh Tarik"); // huruf kecil semua -> dirapikan
assert.equal(I.parseMenuLokal("").menu.length, 0);

// --- parser bahan ---
const b = I.parseBahanLokal(`tahu 200 pcs @600
cabai rawit 1 kg 80rb
minyak goreng 5 liter 90.000
telur 2 tray
daun bawang 10 ikat @3rb
kaldu bubuk`).bahan;
assert.deepEqual(b.map((x) => [x.nama, x.stok, x.satuan, x.harga_per_satuan]), [
  ["Tahu", 200, "pcs", 600],
  ["Cabai Rawit", 1000, "gram", 80],
  ["Minyak Goreng", 5000, "ml", 18],
  ["Telur", 60, "butir", 0],
  ["Daun Bawang", 10, "ikat", 3000],
  ["Kaldu Bubuk", 0, "pcs", 0],
]);
assert.equal(I.parseBahanLokal("gula 2 kg @15rb").bahan[0].harga_per_satuan, 15); // @ per kg -> per gram

// --- review & simpan menu ---
const s = { resep: [{ id: "r1", nama: "Bakso Urat", harga: 14000, hasil: 1, items: [{ bahanId: "x", qty: 1 }] }, { id: "r2", nama: "Es Jeruk", harga: 6000, hasil: 1, items: [] }], bahan: [], stokLog: [] };
const rows = I.barisMenu(s, [...m, { nama: "bakso urat", harga: 99 }]); // duplikat dibuang
assert.equal(rows.length, 6);
assert.deepEqual(rows.slice(0, 2).map((r) => r.aksi), ["harga", "baru"]); // harga beda -> update
assert.equal(rows.find((r) => r.nama === "Es jeruk").aksi, "lewati"); // harga sama -> lewati
const sm = I.simpanMenu(s, rows);
assert.equal(sm.baru, 4);
assert.equal(sm.ubah, 1);
assert.equal(sm.patch.resep.length, 6);
const urat = sm.patch.resep.find((r) => r.id === "r1");
assert.equal(urat.harga, 15000);
assert.equal(urat.items.length, 1); // resep lama tidak hilang
assert.deepEqual(sm.patch.resep.find((r) => r.nama === "Mie ayam bakso").items, []);

// --- review & simpan bahan: stok = total stokLog ---
const s2 = { bahan: [{ id: "b1", nama: "Tahu", satuan: "pcs", harga: 500, stok: 50, min: 0, tracked: true }], stokLog: [{ id: "l0", tanggal: "2026-11-01", bahanId: "b1", delta: 50, alasan: "opname" }], resep: [] };
const rb = I.barisBahan(s2, b);
assert.equal(rb[0].adaId, "b1");
assert.equal(rb[0].stokLama, 50);
rb[5].aksi = "lewati";
const sb = I.simpanBahan(s2, rb, "2026-11-16");
assert.equal(sb.baru, 4);
assert.equal(sb.ubah, 1);
const tahu = sb.patch.bahan.find((x) => x.id === "b1");
assert.equal(tahu.stok, 200);
assert.equal(tahu.harga, 600);
for (const x of sb.patch.bahan) {
  const total = sb.patch.stokLog.filter((l) => l.bahanId === x.id).reduce((a, l) => a + l.delta, 0);
  assert.equal(Math.round(total * 100) / 100, x.stok, x.nama);
  assert.equal(x.tracked, true);
}
assert.equal(sb.patch.bahan.some((x) => x.nama === "Kaldu Bubuk"), false);
const telur = sb.patch.bahan.find((x) => x.nama === "Telur");
assert.equal(telur.harga, 0); // harga belum diisi

// --- saldo kas ---
assert.equal(I.saldoKas({ transactions: [] }), null);
const tx = [
  { tanggal: "2026-10-31", jenis: "masuk", nominal: 999999 },
  { tanggal: "2026-11-01", jenis: "masuk", nominal: 300000 },
  { tanggal: "2026-11-02", jenis: "keluar", nominal: 50000 },
];
assert.equal(I.saldoKas({ kasAwal: { tanggal: "2026-11-01", nominal: 1000000 }, transactions: tx }), 1250000);

console.log("impor OK");
