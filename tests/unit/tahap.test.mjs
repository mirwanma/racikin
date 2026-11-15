// Tahap usaha: langkah Beranda untuk usaha baru vs yang sudah jalan, urutan sesuai masalah utama, tawaran naik tahap.
import assert from "node:assert/strict";
globalThis.localStorage = { getItem: () => null, setItem() {} };
const T = await import("../../js/tahap.js");

const kosong = { profile: { owner: "A" }, resep: [], bahan: [], transactions: [], orders: [], posHarian: {}, online: null };
const keys = (s, opt) => T.langkah(s, opt).map((x) => x.key);

// Profil lama tanpa tahap = ide (alur lama tidak berubah)
assert.equal(T.tahapOf(kosong), "ide");
assert.deepEqual(keys(kosong), ["ide", "rab", "brand", "aktivasi", "kas", "konten"]);

// Udah jalan, tanpa karyawan, tanpa ojol, tanpa masalah: langkah inti saja
const jalan = { ...kosong, profile: { tahap: "jalan", karyawan: 0, saluran: ["Jualan langsung"], masalah: [] } };
assert.equal(T.isJalan(jalan), true);
assert.deepEqual(keys(jalan), ["menu", "stok", "kasir", "laporan"]);

// Ada karyawan + GoFood -> langkah tim & harga online ikut
const j2 = { ...jalan, profile: { ...jalan.profile, karyawan: 2, saluran: ["Jualan langsung", "GoFood"] } };
assert.deepEqual(keys(j2), ["menu", "stok", "kasir", "online", "tim", "laporan"]);

// Masalah utama mendahulukan langkahnya (menu tetap pertama)
const j3 = { ...jalan, profile: { ...jalan.profile, masalah: ["untung", "sepi"] } };
assert.deepEqual(keys(j3), ["menu", "pelanggan", "konten", "laporan", "stok", "kasir"]);
assert.equal(T.langkah(j3).find((x) => x.key === "laporan").utama, true);
const j4 = { ...jalan, profile: { ...jalan.profile, masalah: ["karyawan"] } };
assert.deepEqual(keys(j4), ["menu", "kasir", "tim", "stok", "laporan"]);

// Status selesai
const isi = {
  ...j2,
  resep: [{ id: "r" }],
  bahan: [{ id: "b", tracked: true }],
  orders: [{ id: "o" }],
  online: { channels: { gofood: { aktif: true } } },
  posHarian: Object.fromEntries(Array.from({ length: 7 }, (_, i) => [`2026-11-0${i + 1}`, { order: 3 }])),
};
const done = Object.fromEntries(T.langkah(isi, { anggotaTim: 1 }).map((x) => [x.key, x.done]));
assert.deepEqual(done, { menu: true, stok: true, kasir: true, online: true, tim: true, laporan: true });
assert.equal(T.langkah(isi).find((x) => x.key === "tim").done, false);

// Naik tahap: ditawarkan setelah 14 hari jualan, tidak lagi kalau ditolak / sudah jalan
const rame = { ...kosong, posHarian: Object.fromEntries(Array.from({ length: 14 }, (_, i) => [`2026-10-${String(i + 1).padStart(2, "0")}`, { order: 5 }])) };
assert.equal(T.hariJualan(rame), 14);
assert.equal(T.tawarNaik(rame), true);
assert.equal(T.tawarNaik({ ...rame, posHarian: { ...rame.posHarian, "2026-10-01": { order: 0 } } }), false);
assert.equal(T.tawarNaik({ ...rame, profile: { tolakNaik: true } }), false);
assert.equal(T.tawarNaik({ ...rame, profile: { tahap: "jalan" } }), false);

// Fokus = masalah dipilih; "Lainnya" diganti isiannya
assert.deepEqual(T.fokus({ masalah: ["stok", "lain"], masalahLain: "  kuah sering habis " }), ["Stok sering habis atau bocor", "kuah sering habis"]);
assert.deepEqual(T.fokus({ masalah: ["stok"], masalahLain: "sisa lama" }), ["Stok sering habis atau bocor"]); // Lainnya tidak dicentang
assert.deepEqual(T.fokus({ masalah: ["lain"], masalahLain: "   " }), []);
assert.deepEqual(T.fokus(null), []);

console.log("tahap OK");
