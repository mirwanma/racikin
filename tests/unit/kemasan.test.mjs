// Kemasan beli (isi per dus / tray / kotak): teks jumlah, patch dari form, daftar belanja dibulatkan per kemasan,
// pesan WA ke supplier menyebut kemasan, data contoh.
import assert from "node:assert/strict";
globalThis.localStorage = { getItem: () => null, setItem() {} };
const K = await import("../../js/stok-utils.js");
const { bulatkan, rencanaBelanja, pesanWA } = await import("../../js/belanja.js");
const { buatDataDummy } = await import("../../js/dummy.js");

const air = { id: "air", nama: "Air mineral 600 ml", satuan: "pcs", harga: 2500, stok: 10, min: 12, tracked: true, pack: 24, packNama: "dus" };
assert.deepEqual(K.kemasanOf(air), { isi: 24, nama: "dus" });
assert.equal(K.kemasanOf({ pack: 0 }), null);
assert.deepEqual(K.kemasanOf({ pack: 30 }), { isi: 30, nama: "dus" }, "nama default dus");
assert.equal(K.teksKemasan(48, air), "2 dus");
assert.equal(K.teksKemasan(30, air), "1 dus + 6 pcs");
assert.equal(K.teksKemasan(12, air), "0,5 dus");
assert.equal(K.teksKemasan(0, air), "");
assert.equal(K.teksKemasan(48, { satuan: "pcs" }), "", "tanpa kemasan");

// Patch dari form: isi & nama, kosong = hapus
assert.deepEqual(K.patchKemasan({ id: "x", nama: "Telur" }, "30", " tray "), { id: "x", nama: "Telur", pack: 30, packNama: "tray" });
assert.deepEqual(K.patchKemasan({ id: "x", pack: 30, packNama: "tray" }, "", "tray"), { id: "x" }, "dikosongkan = dihapus");
assert.equal(K.patchKemasan({ id: "x" }, "12", "").packNama, "dus");

// Daftar belanja dibulatkan per kemasan & pesan WA menyebut kemasan
assert.equal(bulatkan(30, "pcs", 24), 48);
const s = { bahan: [air], stokLog: [{ id: "j", tanggal: "2026-11-20", bahanId: "air", delta: -42, alasan: "jual" }] };
const plan = rencanaBelanja(s, 3, "2026-11-23");
assert.equal(plan[0].beli % 24, 0, "dibeli per dus");
const wa = pesanWA({ supplier: { nama: "Agen Jaya" }, items: [{ bahan: air, qty: 48 }, { bahan: { nama: "Cabai", satuan: "gram" }, qty: 500 }] }, "TAHGUY");
assert.match(wa, /1\. Air mineral 600 ml: 2 dus \(48 pcs\)/);
assert.match(wa, /2\. Cabai: 500 gram/);

// Data contoh: air per dus, telur per tray, teh per kotak
const d = buatDataDummy({ today: "2026-11-23", jam: "20:00", skala: 0.3 });
const nama = (n) => d.bahan.find((b) => b.nama.startsWith(n));
assert.deepEqual([nama("Air mineral").pack, nama("Air mineral").packNama], [24, "dus"]);
assert.deepEqual([nama("Telur").pack, nama("Telur").packNama], [30, "tray"]);
assert.equal(nama("Teh").packNama, "kotak");

// Satuan renceng (kopi / susu / sampo sachet): ada di pilihan satuan & dikenali impor teks; juga bisa jadi nama kemasan.
assert.ok(K.SATUAN.includes("renceng") && K.KEMASAN.includes("renceng"));
const { parseBahanLokal } = await import("../../js/impor.js");
const imp = parseBahanLokal("kopi sachet 5 renceng @12000\nsusu kental 2 rentengan 15rb");
const daftarImp = imp.bahan ?? imp;
assert.deepEqual(daftarImp.map((x) => [x.satuan, x.stok]), [["renceng", 5], ["renceng", 2]]);
const kopi = { nama: "Kopi sachet", satuan: "bungkus", pack: 10, packNama: "renceng" };
assert.equal(K.teksKemasan(25, kopi), "2 renceng + 5 bungkus", "sachet dibeli per renceng isi 10");

console.log("kemasan OK");
