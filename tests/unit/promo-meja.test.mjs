// Promo di server untuk pesan meja + kuota voucher per pelanggan (sisi app):
// pilihPromo dengan nomor WA, order & rekap per nomor WA, aturan promo yang diunggah, hash nomor WA (sama dengan SQL).
import assert from "node:assert/strict";
globalThis.localStorage = { getItem: () => null, setItem() {} };
const P = await import("../../js/promo.js");
const { buatOrder, batalOrder } = await import("../../js/pos.js");
const { menuPublik, hashWa, hashPakaiWa } = await import("../../js/meja.js");
const { todayISO } = await import("../../js/ui.js");

const resep = [{ id: "teh", nama: "Es Teh", harga: 5000, hasil: 1, items: [] }];
const auto = { id: "a", nama: "Diskon 1rb", aktif: true, jenis: "order", tipe: "rp", nilai: 1000, minBelanja: 0, waktu: {}, saluran: ["toko"] };
const vc = { id: "v", nama: "Voucher 5rb", aktif: true, jenis: "order", tipe: "rp", nilai: 5000, minBelanja: 10000, kode: "HEMAT5", kuota: 10, maksPerPelanggan: 1, waktu: {}, saluran: ["toko"] };
const online = { id: "o", nama: "Khusus GoFood", aktif: true, jenis: "order", tipe: "rp", nilai: 2000, waktu: {}, saluran: ["gofood"] };
const mati = { ...auto, id: "x", nama: "Mati", aktif: false };
const pelanggan = [
  { id: "p1", nama: "Budi", wa: "6281200001111", stempel: 0 },
  { id: "p2", nama: "Sari", wa: "", stempel: 0 },
];
const s0 = { resep, promo: [auto, vc, online, mati], posHarian: {}, orders: [], transactions: [], bahan: [], stokLog: [], pelanggan, stempelLog: [], online: null };
const cart = [{ resepId: "teh", nama: "Es Teh", harga: 5000, qty: 3 }];
const W = `${todayISO()}T12:00`;

// --- Voucher per pelanggan butuh nomor WA
assert.equal(P.maksPelanggan(vc), 1);
assert.equal(P.maksPelanggan(auto), 0); // promo otomatis tidak dibatasi per pelanggan
assert.equal(P.maksPelanggan({ maksPerPelanggan: 2 }), 0); // tanpa kode: diabaikan
let r = P.pilihPromo(s0, cart, { waktu: W, kode: "HEMAT5" });
assert.equal(r.promo.id, "a", "tanpa WA voucher tidak kepakai, promo otomatis tetap jalan");
assert.match(r.kodeError, /per pelanggan.*nomor WA/);
r = P.pilihPromo(s0, cart, { waktu: W, kode: "hemat5", wa: "0812-0000-1111" });
assert.deepEqual(r.promo, { id: "v", nama: "Voucher 5rb", potongan: 5000, kode: "HEMAT5", wa: "6281200001111" });
assert.equal(r.kodeError, "");

// Order mencatat nomor WA -> rekap per nomor -> pakai kedua kali ditolak
const { patch, order } = buatOrder(s0, { cart, promo: r.promo, metode: "tunai", bayar: 20000, pelangganId: "p1" });
assert.equal(order.promo.wa, "6281200001111");
const s1 = { ...s0, ...patch };
const hari = s1.posHarian[todayISO()];
assert.deepEqual(hari.promo.v, { n: 1, rp: 5000, omzet: 10000, wa: { "6281200001111": 1 } });
assert.deepEqual(P.pemakaian(s1).v.wa, { "6281200001111": 1 });
assert.equal(P.pakaiPelanggan(P.pemakaian(s1), "v", "6281200001111"), 1);
r = P.pilihPromo(s1, cart, { waktu: W, kode: "HEMAT5", wa: "6281200001111" });
assert.equal(r.promo.id, "a");
assert.match(r.kodeError, /sudah pakai voucher ini 1x \(maks\. 1x\)/);
// Pelanggan lain masih boleh
assert.equal(P.pilihPromo(s1, cart, { waktu: W, kode: "HEMAT5", wa: "081299998888" }).promo.id, "v");
// Batal order -> jatah balik
const s2 = { ...s1, ...batalOrder(s1, order.id) };
assert.equal(P.pilihPromo(s2, cart, { waktu: W, kode: "HEMAT5", wa: "6281200001111" }).promo.id, "v");
// Voucher tanpa batas per pelanggan: order tidak menyimpan WA
const vc2 = { ...vc, id: "v2", kode: "BEBAS", maksPerPelanggan: 0 };
const r2 = P.pilihPromo({ ...s0, promo: [vc2] }, cart, { waktu: W, kode: "BEBAS", wa: "6281200001111" });
assert.equal(r2.promo.wa, undefined);

// --- Aturan promo untuk server: hanya aktif & saluran toko; kode dinormalisasi; pakai & pakaiWa ikut
const at = P.aturanPromoMeja({ ...s1, promo: [auto, { ...vc, kode: " hemat5 " }, online, mati] });
assert.deepEqual(at.map((a) => a.id), ["a", "v"]);
assert.equal(at[0].kode, undefined);
assert.equal(at[0].pakai, undefined);
assert.deepEqual({ kode: at[1].kode, kuota: at[1].kuota, pakai: at[1].pakai, maks: at[1].maksPerPelanggan, wa: at[1].pakaiWa }, { kode: "HEMAT5", kuota: 10, pakai: 1, maks: 1, wa: { "6281200001111": 1 } });

// --- Menu publik: kode voucher hanya di promoAturan (bukan di info promo untuk pelanggan)
const pub = menuPublik({ ...s1, meja: [{ id: "m", nama: "Meja 1", token: "t" }], posSetting: { pesanMeja: true } });
assert.ok(pub.promoAturan.some((a) => a.kode === "HEMAT5"));
assert.ok(!JSON.stringify(pub.promo).includes("HEMAT5"));

// --- Hash nomor WA sebelum diunggah (sama dengan meja_hash_wa di SQL)
assert.equal(await hashWa("6281200001111"), "0cb70cfde7f5a33002f64e10cfa0842042f5a26a2dbbbb56023983013aa9a858");
assert.equal(await hashWa(""), "");
const ter = await hashPakaiWa(pub);
const v = ter.promoAturan.find((a) => a.id === "v");
assert.deepEqual(v.pakaiWa, { "0cb70cfde7f5a33002f64e10cfa0842042f5a26a2dbbbb56023983013aa9a858": 1 });
assert.ok(!JSON.stringify(ter).includes("6281200001111"), "nomor WA asli tidak ikut diunggah");

console.log("promo-meja OK");
