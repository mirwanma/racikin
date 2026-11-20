// Utang ke supplier: belanja tempo (stok masuk, Kas belum), status jatuh tempo, bayar cicil (Kas per kategori
// proporsional), lunasi semua, hapus bayar / nota, pengingat, laporan arus kas.
import assert from "node:assert/strict";
globalThis.localStorage = { getItem: () => null, setItem() {} };
const U = await import("../../js/utang.js");
const { catatBelanja } = await import("../../js/belanja.js");

const s0 = {
  bahan: [
    { id: "tahu", nama: "Tahu", satuan: "pcs", harga: 500, stok: 10, tracked: true },
    { id: "cup", nama: "Cup", satuan: "pcs", harga: 300, stok: 0, tracked: true, kemasan: true },
  ],
  stokLog: [], transactions: [], utangSupplier: [],
  supplier: [{ id: "pak", nama: "Pak Darto" }, { id: "toko", nama: "Toko Plastik" }],
};
const keluar = (s) => s.transactions.filter((t) => t.jenis === "keluar").reduce((a, t) => a + t.nominal, 0);

// Tanpa supplier nggak bisa utang
assert.throws(() => catatBelanja(s0, [{ bahanId: "tahu", qty: 100, total: 50000 }], { utang: { tempo: "2026-11-27" }, tanggal: "2026-11-20" }), /supplier/);
assert.throws(() => catatBelanja(s0, [{ bahanId: "tahu", qty: 100, total: 50000 }], { supplierId: "pak", utang: { tempo: "2026-11-19" }, tanggal: "2026-11-20" }), /Jatuh tempo/);
assert.throws(() => catatBelanja(s0, [{ bahanId: "tahu", qty: 100, total: 0 }], { supplierId: "pak", utang: { tempo: "2026-11-27" }, tanggal: "2026-11-20" }), /total bayar/);

// Belanja tempo: stok & harga update, Kas belum
let s = { ...s0, ...catatBelanja(s0, [{ bahanId: "tahu", qty: 100, total: 60000 }, { bahanId: "cup", qty: 100, total: 30000 }], { supplierId: "pak", utang: { tempo: "2026-11-27" }, tanggal: "2026-11-20" }) };
assert.equal(s.bahan[0].stok, 110);
assert.equal(s.bahan[0].harga, 600);
assert.equal(s.transactions.length, 0, "Kas belum dicatat");
const n = s.utangSupplier[0];
assert.deepEqual([n.total, n.tempo, n.rincian], [90000, "2026-11-27", [{ kategori: "Bahan Baku", nominal: 60000 }, { kategori: "Kemasan", nominal: 30000 }]]);
assert.equal(n.catatan, "tahu, cup");

// Status
assert.equal(U.statusNota(n, "2026-11-20"), "belum");
assert.equal(U.statusNota(n, "2026-11-25"), "segera");
assert.equal(U.statusNota(n, "2026-11-28"), "telat");
assert.equal(U.pengingatUtang(s, "2026-11-20"), null);
assert.deepEqual(U.pengingatUtang(s, "2026-11-28"), { n: 1, total: 90000, telat: 1, tempo: "2026-11-27", nama: "Pak Darto" });

// Cicil 30rb: Kas dibagi proporsional 2:1
let b = U.bayarUtang(s, n.id, { nominal: 30000, tanggal: "2026-11-22", metode: "transfer" });
s = { ...s, ...b };
assert.deepEqual(s.transactions.map((t) => [t.kategori, t.nominal, t.ref, t.tanggal]), [["Bahan Baku", 20000, "utang", "2026-11-22"], ["Kemasan", 10000, "utang", "2026-11-22"]]);
assert.equal(U.sisaNota(s.utangSupplier[0]), 60000);
assert.throws(() => U.bayarUtang(s, n.id, { nominal: 70000, tanggal: "2026-11-22" }), /Maksimal Rp60\.000/);
assert.throws(() => U.hapusNota(s, n.id), /catatan bayar/);

// Pembulatan: total Kas = yang dibayar
b = U.bayarUtang(s, n.id, { nominal: 10001, tanggal: "2026-11-23" });
const s1 = { ...s, ...b };
assert.equal(keluar(s1), 40001);

// Hapus bayar terakhir -> Kas ikut hilang
const bid = s1.utangSupplier[0].bayar[1].id;
const s2 = { ...s1, ...U.hapusBayarUtang(s1, n.id, bid) };
assert.equal(keluar(s2), 30000);
assert.equal(U.sisaNota(s2.utangSupplier[0]), 60000);

// Nota kedua, lunasi semua ke Pak Darto
s = { ...s2, ...catatBelanja(s2, [{ bahanId: "tahu", qty: 50, total: 25000 }], { supplierId: "pak", utang: { tempo: "2026-11-30" }, tanggal: "2026-11-21" }) };
const r = U.ringkasUtang(s, "2026-11-28");
assert.equal(r.total, 85000);
assert.equal(r.supplier.length, 1);
assert.equal(r.supplier[0].nota.length, 2);
assert.equal(r.telat.length, 1);
assert.equal(r.segera.length, 1);
s = { ...s, ...U.lunasiSupplier(s, "pak", { tanggal: "2026-11-28" }) };
assert.equal(U.ringkasUtang(s, "2026-11-28").total, 0);
assert.equal(keluar(s), 115000, "semua belanja akhirnya tercatat di Kas");
assert.equal(U.statusNota(s.utangSupplier[0], "2026-12-30"), "lunas");
assert.throws(() => U.lunasiSupplier(s, "pak", { tanggal: "2026-11-28" }), /Nggak ada utang/);

// Ubah tempo, hapus nota tanpa bayar
let s3 = { ...s0, ...catatBelanja(s0, [{ bahanId: "tahu", qty: 10, total: 6000 }], { supplierId: "toko", utang: { tempo: "2026-11-27" }, tanggal: "2026-11-20" }) };
s3 = { ...s3, ...U.ubahTempo(s3, s3.utangSupplier[0].id, "2026-12-05") };
assert.equal(s3.utangSupplier[0].tempo, "2026-12-05");
s3 = { ...s3, ...U.hapusNota(s3, s3.utangSupplier[0].id) };
assert.equal(s3.utangSupplier.length, 0);
assert.equal(s3.bahan[0].stok, 20, "stok tetap");

// Belanja biasa (tanpa utang) tetap langsung ke Kas
const s4 = { ...s0, ...catatBelanja(s0, [{ bahanId: "tahu", qty: 10, total: 6000 }], { supplierId: "pak", tanggal: "2026-11-20" }) };
assert.equal(keluar(s4), 6000);
assert.deepEqual(s4.utangSupplier, [], "nggak ada nota");

assert.equal(U.tambahHari("2026-11-28", 7), "2026-12-05");
console.log("utang OK");
