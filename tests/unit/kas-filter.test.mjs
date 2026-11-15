import assert from "node:assert/strict";
globalThis.localStorage = { getItem: () => null, setItem() {} };
const { filterTx, ringkas, cocok, rentang } = await import("../../js/kas-filter.js");
const T = [
  { id: 1, tanggal: "2026-11-15", jenis: "keluar", kategori: "Operasional", nominal: 22000, catatan: "Isi ulang gas LPG 3 kg" },
  { id: 2, tanggal: "2026-11-15", jenis: "masuk", kategori: "Penjualan", nominal: 954000, catatan: "Kasir · Tunai · 41 order", ref: "pos" },
  { id: 3, tanggal: "2026-11-12", jenis: "keluar", kategori: "Bahan Baku", nominal: 150500, catatan: "Belanja: tahu putih" },
  { id: 4, tanggal: "2026-11-01", jenis: "keluar", kategori: "Bahan Baku", nominal: 20000, catatan: "Dari laci · beli es", ref: "laci" },
  { id: 5, tanggal: "2026-10-20", jenis: "keluar", kategori: "Operasional", nominal: 22000, catatan: "Isi ulang gas LPG 3 kg" },
];
const today = "2026-11-15", ym = "2026-11";
const ids = (f) => filterTx(T, f, today, ym).map((t) => t.id);
assert.deepEqual(ids({ periode: "hari" }), [2, 1]);
assert.deepEqual(ids({ periode: "7" }), [2, 1, 3]);
assert.deepEqual(ids({ periode: "bulan" }), [2, 1, 3, 4]);
assert.deepEqual(ids({ periode: "semua" }), [2, 1, 3, 4, 5]);
assert.deepEqual(ids({ periode: "rentang", dari: "2026-11-12", sampai: "2026-10-01" }), [3, 4, 5]); // dibalik otomatis
assert.deepEqual(ids({ periode: "semua", q: "gas" }), [1, 5]);
assert.deepEqual(ids({ periode: "semua", q: "22rb" }), [1, 5]);
assert.deepEqual(ids({ periode: "semua", q: "150" }), [3]);
assert.deepEqual(ids({ periode: "semua", q: "GoFood" }), []);
assert.deepEqual(ids({ periode: "semua", sumber: "laci" }), [4]);
assert.deepEqual(ids({ periode: "semua", sumber: "manual", jenis: "keluar", kategori: "Bahan Baku" }), [3]);
assert.deepEqual(ids({ periode: "semua", q: "beli tahu" }), []);
assert.deepEqual(ids({ periode: "semua", q: "belanja tahu" }), [3]);
assert.deepEqual(ringkas(filterTx(T, { periode: "hari" }, today, ym)), { n: 2, masuk: 954000, keluar: 22000, selisih: 932000 });
console.log("kas-filter OK");
