import { mergeDocs, same } from "../../js/merge.js";
import assert from "node:assert/strict";

const base = {
  profile: { nama: "Tahu Guyur", kota: "Bdg" },
  bahan: [{ id: "b1", nama: "Tahu", stok: 100, harga: 500 }, { id: "b2", nama: "Kecap", stok: 10, harga: 20 }],
  orders: [{ id: "o1", no: 1, total: 10000, status: "selesai" }],
  pelanggan: [{ id: "p1", nama: "Ani", stempel: 3, kunjungan: 3 }],
  stokLog: [{ id: "pos-2026-11-11-b1", delta: -4 }],
  chat: [{ role: "user", content: "a" }],
};
const clone = (x) => structuredClone(x);

// Kasir A (local): jual 1 order, stok tahu -5, stempel Ani +1, log delta -5
const local = clone(base);
local.orders.push({ id: "oA", no: 2, total: 12000, status: "selesai" });
local.bahan[0].stok = 95;
local.pelanggan[0].stempel = 4; local.pelanggan[0].kunjungan = 4;
local.stokLog[0].delta = -9;
// Pemilik (remote): jual 1 order, stok tahu -3, ganti harga kecap, hapus order o1? (batal) , ubah kota, tambah chat
const remote = clone(base);
remote.orders.push({ id: "oB", no: 2, total: 8000, status: "selesai" });
remote.orders[0].status = "batal";
remote.bahan[0].stok = 97;
remote.bahan[1].harga = 25;
remote.pelanggan[0].stempel = 4; remote.pelanggan[0].kunjungan = 4;
remote.stokLog[0].delta = -7;
remote.profile.kota = "Bandung";
remote.chat.push({ role: "assistant", content: "b" });

const m = mergeDocs(base, local, remote);
assert.deepEqual(m.orders.map((o) => o.id).sort(), ["o1", "oA", "oB"]);
assert.equal(m.orders.find((o) => o.id === "o1").status, "batal");
assert.equal(m.bahan[0].stok, 92, "stok 100-5-3");
assert.equal(m.bahan[1].harga, 25);
assert.equal(m.pelanggan[0].stempel, 5);
assert.equal(m.pelanggan[0].kunjungan, 5);
assert.equal(m.stokLog[0].delta, -12, "-4 -5 -3");
assert.equal(m.profile.kota, "Bandung");
assert.equal(m.chat.length, 2);

// Hapus di satu pihak, tidak diubah pihak lain -> terhapus
const l2 = clone(base); l2.pelanggan = [];
const m2 = mergeDocs(base, l2, clone(base));
assert.equal(m2.pelanggan.length, 0);
// Hapus lokal tapi remote mengubah -> dipertahankan
const r3 = clone(base); r3.pelanggan[0].stempel = 9;
const m3 = mergeDocs(base, l2, r3);
assert.equal(m3.pelanggan[0].stempel, 9);
// Item baru dengan id sama di dua pihak (log POS harian dibuat dua HP) -> delta dijumlah
const b4 = { stokLog: [] };
const m4 = mergeDocs(b4, { stokLog: [{ id: "pos-x", delta: -2, alasan: "jual" }] }, { stokLog: [{ id: "pos-x", delta: -3, alasan: "jual" }] });
assert.equal(m4.stokLog[0].delta, -5);
// Tidak ada perubahan -> sama
assert.ok(same(mergeDocs(base, clone(base), clone(base)), base));
// Urutan key tidak berpengaruh
assert.ok(same({ a: 1, b: { c: 2, d: 3 } }, { b: { d: 3, c: 2 }, a: 1 }));
assert.ok(same({ a: 1, x: undefined }, { a: 1 }));
console.log("merge OK");
