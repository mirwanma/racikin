// Cek kesehatan usaha: status tiap pemeriksaan, skor, prioritas sesuai masalah utama, data contoh.
import assert from "node:assert/strict";
globalThis.localStorage = { getItem: () => null, setItem() {} };
const { cekKesehatan, ringkasSehat } = await import("../../js/sehat.js");
const { buatDataDummy } = await import("../../js/dummy.js");
const { addDays } = await import("../../js/ui.js");

const T = "2026-11-16";
const by = (h, id) => h.cek.find((c) => c.id === id);

// Data kosong: semua "kosong", skor null
const kosong = cekKesehatan({ profile: { tahap: "jalan" }, resep: [], bahan: [], transactions: [], orders: [], posHarian: {}, stokLog: [], pelanggan: [], shifts: [] }, T);
assert.equal(kosong.skor, null);
assert.equal(kosong.label, "Belum cukup data");
assert.ok(kosong.cek.every((c) => c.status === "kosong"));

// Usaha kecil buatan: 1 menu rugi, 1 menu tanpa resep, omzet turun, kas minus, susut stok tinggi
const bahan = [{ id: "b", nama: "Daging", satuan: "gram", harga: 150, stok: 100, min: 500, tracked: true }];
const resep = [
  { id: "r1", nama: "Bakso", harga: 15000, hasil: 1, items: [{ bahanId: "b", qty: 120 }] }, // HPP 18rb > harga -> rugi
  { id: "r2", nama: "Es Teh", harga: 5000, hasil: 1, items: [] },
];
const posHarian = {};
const transactions = [];
for (let i = 0; i < 28; i++) {
  const t = addDays(T, -i);
  const baru = i < 14;
  posHarian[t] = { order: 10, omzet: baru ? 150000 : 300000, items: { Bakso: baru ? 10 : 20, "Es Teh": 5 } };
  transactions.push({ id: "m" + i, tanggal: t, jenis: "masuk", kategori: "Penjualan", nominal: baru ? 150000 : 300000, ref: "pos" });
  transactions.push({ id: "k" + i, tanggal: t, jenis: "keluar", kategori: "Bahan Baku", nominal: 400000 });
}
const stokLog = [
  { id: "j", tanggal: addDays(T, -3), bahanId: "b", delta: -10000, alasan: "jual" },
  { id: "o", tanggal: addDays(T, -1), bahanId: "b", delta: -2000, alasan: "opname", catatan: "Hitung ulang" },
  { id: "a", tanggal: addDays(T, -20), bahanId: "b", delta: -5000, alasan: "opname", catatan: "Stok awal (input cepat)" }, // bukan susut
];
const s = { profile: { tahap: "jalan", masalah: ["stok"], karyawan: 1 }, resep, bahan, posHarian, transactions, stokLog, orders: [], pelanggan: [], shifts: [], loyalty: null };
const h = cekKesehatan(s, T);
assert.equal(by(h, "margin").status, "bahaya"); // HPP 18rb vs harga 15rb
assert.equal(by(h, "menu").status, "bahaya");
assert.match(by(h, "menu").detail, /Bakso/);
assert.equal(by(h, "resep").status, "bahaya"); // Es Teh tanpa resep: 25% porsi terjual belum kehitung HPP-nya
assert.match(by(h, "resep").saran, /Es Teh/);
assert.equal(by(h, "tren").status, "bahaya"); // turun 50%
assert.equal(by(h, "kas").status, "bahaya"); // keluar > masuk
const stok = by(h, "stok");
assert.equal(stok.status, "bahaya"); // susut 20% (opname "Stok awal" tidak dihitung)
assert.match(stok.nilai, /Susut 20%/);
assert.equal(by(h, "kasir").status, "kosong"); // punya karyawan tapi belum pakai shift
assert.equal(by(h, "jam"), undefined); // order detail < 50
assert.ok(h.skor < 40);
assert.equal(h.label, "Perlu perhatian");
// Masalah utama "stok" -> stok didahulukan di antara yang bahaya
assert.equal(h.prioritas[0].id, "stok");
assert.equal(h.prioritas.length, 3);
assert.ok(h.cek.findIndex((c) => c.status === "baik") === -1 || h.cek.findIndex((c) => c.status === "bahaya") < h.cek.findIndex((c) => c.status === "baik"));

// Ringkasan untuk Mentor AI
const r = ringkasSehat(h);
assert.equal(r.skor, h.skor);
assert.ok(r.temuan.length >= 5 && r.belum_ada_data.includes("Selisih kas kasir"));

// Data contoh: semua pemeriksaan punya data & skornya sehat
const d = cekKesehatan(buatDataDummy({ today: T }), T);
assert.equal(d.cek.filter((c) => c.status === "kosong").length, 0);
assert.ok(d.skor >= 70, "skor data contoh " + d.skor);
assert.equal(by(d, "jam").status, "info");
assert.ok(["baik", "waspada"].includes(by(d, "online").status));

console.log("sehat OK");
