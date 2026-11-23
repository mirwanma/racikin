// Satuan bahan & kemasan dari admin: rapikan data server, satuan inti selalu ada, simpan di HP, pilihan dropdown tetap
// memuat satuan lama yang dipakai bahan, impor teks mengenali satuan & kata lain buatan admin (konversi bawaan tetap).
import assert from "node:assert/strict";
const mem = new Map();
globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
const S = await import("../../js/satuan.js");
const { parseBahanLokal } = await import("../../js/impor.js");
const { SATUAN } = await import("../../js/stok-utils.js");

// Bawaan (belum pernah ambil dari server)
assert.deepEqual(S.daftarSatuan(), SATUAN);
assert.ok(S.daftarKemasan().includes("dus"));
assert.deepEqual(S.BAWAAN.satuan.find((x) => x.nama === "renceng").alias, ["rencengan", "renteng", "rentengan"]);
assert.deepEqual(S.BAWAAN.satuan.filter((x) => x.inti).map((x) => x.nama), S.INTI);

// Rapikan: huruf kecil, buang dobel / nggak valid, inti selalu ada
const r = S.rapikan({ satuan: [{ nama: "Butir" }, { nama: "butir" }, { nama: "" }, { nama: "sendok teh", alias: ["sdt", "SDT", "dua kata", "butir"] }, { nama: "slop", alias: [] }], kemasan: ["Dus", "dus", "", "karton"] });
assert.deepEqual(r.satuan.map((x) => x.nama), ["gram", "ml", "pcs", "butir", "sendok teh", "slop"]);
assert.deepEqual(r.satuan.find((x) => x.nama === "sendok teh").alias, ["sdt"]);
assert.ok(r.satuan.find((x) => x.nama === "gram").inti && !r.satuan.find((x) => x.nama === "slop").inti);
assert.deepEqual(r.kemasan, ["dus", "karton"]);
assert.equal(S.rapikan(null), null);
assert.equal(S.rapikan({ satuan: "x" }), null);

// Daftar dari server dipakai & disimpan di HP
const server = { satuan: [...S.BAWAAN.satuan, { nama: "slop", alias: ["slof"] }, { nama: "sendok teh", alias: ["sdt"] }], kemasan: ["dus", "krat"] };
assert.equal(S.setDaftar(server), true);
assert.equal(S.setDaftar(server), false, "isi sama -> nggak berubah");
assert.ok(S.daftarSatuan().includes("slop") && S.daftarSatuan().includes("sendok teh"));
assert.deepEqual(S.daftarKemasan(), ["dus", "krat"]);
assert.ok(JSON.parse(mem.get("racikin:satuan")).satuan.some((x) => x.nama === "slop"), "tersimpan di HP");
assert.equal(S.setDaftar({ rusak: true }), false, "data rusak diabaikan");
assert.ok(S.daftarSatuan().includes("slop"));

// Dropdown: satuan yang lagi dipakai bahan tetap muncul walau sudah dihapus admin
assert.deepEqual(S.opsiSatuan("pcs"), S.daftarSatuan());
assert.equal(S.opsiSatuan("kaleng").at(-1), "kaleng");

// Impor teks: satuan & kata lain dari admin dikenali, konversi bawaan tetap jalan
const hasil = parseBahanLokal("rokok kretek 3 slof @25000\nvanili 4 sdt\ncabai rawit 1 kg 80rb\nkopi sachet 2 rentengan 15rb").bahan;
assert.deepEqual(hasil.map((x) => [x.nama.toLowerCase(), x.satuan, x.stok]), [["rokok kretek", "slop", 3], ["vanili", "sendok teh", 4], ["cabai rawit", "gram", 1000], ["kopi sachet", "renceng", 2]]);
assert.equal(hasil[0].harga_per_satuan, 25000);

console.log("satuan OK");
