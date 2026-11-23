// Transfer stok antar cabang: validasi, stok asal berkurang & tujuan bertambah (stok = total riwayat di dua cabang),
// bahan baru di tujuan, kirim ulang nggak dobel, nilai barang, riwayat per transfer, gabung 3-way dengan HP di tujuan.
import assert from "node:assert/strict";
globalThis.localStorage = { getItem: () => null, setItem() {} };
const T = await import("../../js/transfer.js");
const { mergeDocs } = await import("../../js/merge.js");

const tanggal = "2026-11-23";
const asal = {
  bahan: [
    { id: "tahu", nama: "Tahu putih", satuan: "pcs", harga: 1000, stok: 100, tracked: true },
    { id: "cabai", nama: "Cabai rawit", satuan: "gr", harga: 80, stok: 500, tracked: true },
    { id: "keju", nama: "Keju", satuan: "gr", harga: 200, stok: 0, tracked: true },
  ],
  stokLog: [
    { id: "a1", tanggal: "2026-11-01", bahanId: "tahu", delta: 100, alasan: "opname" },
    { id: "a2", tanggal: "2026-11-01", bahanId: "cabai", delta: 500, alasan: "opname" },
  ],
};
const tujuan = {
  bahan: [{ id: "tahu", nama: "Tahu putih", satuan: "pcs", harga: 1000, stok: 10, min: 30, tracked: true }],
  stokLog: [{ id: "b1", tanggal: "2026-11-01", bahanId: "tahu", delta: 10, alasan: "opname" }],
};
const ke = { id: "dago", nama: "Cabang Dago" };
const dari = { id: "utama", nama: "TAHGUY" };
const totalLog = (d, id) => Math.round(d.stokLog.filter((l) => l.bahanId === id).reduce((a, l) => a + l.delta, 0) * 100) / 100;

// Validasi & rapikan
assert.deepEqual(T.rapikan([{ bahanId: "tahu", qty: 10 }, { bahanId: "tahu", qty: "5" }, { bahanId: "cabai", qty: 0 }, { bahanId: "", qty: 3 }]), [{ bahanId: "tahu", qty: 15 }]);
assert.match(T.cekTransfer(asal, [{ bahanId: "tahu", qty: 1 }], null), /cabang tujuan/);
assert.match(T.cekTransfer(asal, [], ke), /Isi jumlah/);
assert.match(T.cekTransfer(asal, [{ bahanId: "tahu", qty: 101 }], ke), /Stok Tahu putih cuma 100 pcs/);
assert.match(T.cekTransfer(asal, [{ bahanId: "x", qty: 1 }], ke), /nggak ketemu/);
const items = [{ bahanId: "tahu", qty: 40 }, { bahanId: "cabai", qty: 150 }];
assert.equal(T.cekTransfer(asal, items, ke), "");
assert.equal(T.nilaiTransfer(asal, items), 40 * 1000 + 150 * 80);

// Asal: stok berkurang, riwayat keluar
const a = { ...asal, ...T.keluarStok(asal, items, { tfId: "t1", tanggal, ke }) };
assert.equal(a.bahan.find((b) => b.id === "tahu").stok, 60);
assert.equal(a.bahan.find((b) => b.id === "cabai").stok, 350);
assert.equal(totalLog(a, "tahu"), 60, "stok = total riwayat (asal)");
const k = a.stokLog.find((l) => l.id === "tf-t1-tahu");
assert.deepEqual(k, { id: "tf-t1-tahu", tanggal, bahanId: "tahu", delta: -40, alasan: "transfer", catatan: "Ke Cabang Dago", transfer: { id: "t1", arah: "keluar", cabang: ke, nilai: 40000 } });
assert.deepEqual(T.keluarStok(a, items, { tfId: "t1", tanggal, ke }).bahan, a.bahan, "ulang: nggak dobel");

// Tujuan: stok bertambah, bahan baru disalin, batas minimum tetap
const t = T.masukStok(tujuan, items, { tfId: "t1", tanggal, dari, bahanAsal: asal.bahan });
assert.equal(t.bahan.find((b) => b.id === "tahu").stok, 50);
assert.equal(t.bahan.find((b) => b.id === "tahu").min, 30);
const cabai = t.bahan.find((b) => b.id === "cabai");
assert.equal(cabai.stok, 150);
assert.equal(cabai.harga, 80);
assert.equal(cabai.tracked, true);
assert.equal(totalLog(t, "tahu"), 50, "stok = total riwayat (tujuan)");
assert.equal(totalLog(t, "cabai"), 150);
assert.equal(t.stokLog.find((l) => l.id === "tf-t1-cabai").catatan, "Dari TAHGUY");
assert.deepEqual(T.masukStok(t, items, { tfId: "t1", tanggal, dari, bahanAsal: asal.bahan }), t, "kirim ulang: nggak dobel");
assert.equal(tujuan.bahan[0].stok, 10, "dokumen asli nggak diubah");

// Total barang di dua cabang tetap
const total = (id) => (a.bahan.find((b) => b.id === id)?.stok || 0) + (t.bahan.find((b) => b.id === id)?.stok || 0);
assert.equal(total("tahu"), 110);
assert.equal(total("cabai"), 500);

// HP kasir di cabang tujuan jualan (stok tahu -5) sebelum sinkron: digabung 3-way, transfer nggak hilang
const lokal = { ...tujuan, bahan: [{ ...tujuan.bahan[0], stok: 5 }], stokLog: [...tujuan.stokLog, { id: "pos-x-tahu", tanggal, bahanId: "tahu", delta: -5, alasan: "jual" }] };
const gabung = mergeDocs(tujuan, lokal, t);
assert.equal(gabung.bahan.find((b) => b.id === "tahu").stok, 45, "10 + 40 transfer - 5 jual");
assert.equal(totalLog(gabung, "tahu"), 45);

// Riwayat
const r = T.riwayatTransfer(a);
assert.equal(r.length, 1);
assert.equal(r[0].arah, "keluar");
assert.equal(r[0].nilai, 52000);
assert.deepEqual(r[0].items.map((x) => [x.nama, x.qty]), [["Tahu putih", 40], ["Cabai rawit", 150]]);
assert.equal(T.riwayatTransfer(t)[0].arah, "masuk");

console.log("transfer OK");
