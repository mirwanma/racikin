// Varian yang mengubah resep dasar: pengali porsi (jumbo), bahan kemasan tidak ikut dikali, ganti / tanpa bahan.
// Cek: stok terpakai, HPP per menu, rekap per menu, laporan, pilihan habis, data contoh tetap konsisten.
import assert from "node:assert/strict";
globalThis.localStorage = { getItem: () => null, setItem() {} };
const V = await import("../../js/varian.js");
const { buatOrder, batalOrder } = await import("../../js/pos.js");
const { labaRugi } = await import("../../js/laporan.js");
const { bahanMap } = await import("../../js/stok-utils.js");
const { menuPublik } = await import("../../js/meja.js");
const { todayISO } = await import("../../js/ui.js");
const { buatDataDummy } = await import("../../js/dummy.js");

const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6, `${msg}: ${a} != ${b}`);

const bahan = [
  { id: "teh", nama: "Teh celup", satuan: "pcs", harga: 250, stok: 100, min: 0, tracked: true },
  { id: "gula", nama: "Gula pasir", satuan: "gram", harga: 16, stok: 5000, min: 0, tracked: true },
  { id: "susu", nama: "Susu sapi", satuan: "ml", harga: 20, stok: 5000, min: 0, tracked: true },
  { id: "oat", nama: "Susu oat", satuan: "ml", harga: 50, stok: 1000, min: 0, tracked: true },
  { id: "es", nama: "Es batu", satuan: "gram", harga: 2, stok: 20000, min: 0, tracked: true },
  { id: "cup", nama: "Cup plastik + tutup", satuan: "pcs", harga: 600, stok: 100, min: 0, tracked: true },
  { id: "boba", nama: "Boba", satuan: "gram", harga: 40, stok: 1000, min: 0, tracked: true },
];
const map = bahanMap(bahan);
const resep = [
  // HPP dasar: teh 250 + gula 20×16=320 + susu 100×20=2000 + es 150×2=300 + cup 600 = 3470
  { id: "mt", nama: "Milk Tea", harga: 12000, hasil: 1, items: [{ bahanId: "teh", qty: 1 }, { bahanId: "gula", qty: 20 }, { bahanId: "susu", qty: 100 }, { bahanId: "es", qty: 150 }, { bahanId: "cup", qty: 1 }], opsiIds: ["uk", "su", "mn", "tp"] },
  // Resep 2 porsi per batch: per porsi teh 1, gula 15, cup 1
  { id: "et", nama: "Es Teh", harga: 5000, hasil: 2, items: [{ bahanId: "teh", qty: 2 }, { bahanId: "gula", qty: 30 }, { bahanId: "cup", qty: 2 }], opsiIds: ["uk", "mn"] },
];
const opsi = [
  { id: "uk", nama: "Ukuran", tipe: "satu", wajib: true, pilihan: [{ id: "reg", nama: "Reguler", harga: 0, items: [] }, { id: "jmb", nama: "Jumbo", harga: 4000, items: [], porsi: 1.5, tetap: ["cup"] }] },
  { id: "su", nama: "Susu", tipe: "satu", wajib: false, pilihan: [{ id: "oatp", nama: "Susu oat", harga: 5000, items: [], ganti: [{ dari: "susu", ke: "oat" }] }] },
  { id: "mn", nama: "Manis", tipe: "satu", wajib: false, pilihan: [{ id: "tg", nama: "Tanpa gula", harga: 0, items: [], ganti: [{ dari: "gula", ke: "" }] }] },
  { id: "tp", nama: "Topping", tipe: "banyak", wajib: false, pilihan: [{ id: "bb", nama: "Boba", harga: 3000, items: [{ bahanId: "boba", qty: 30 }] }] },
];

// --- Helper dasar
assert.equal(V.porsiPilihan({}), 1);
assert.equal(V.porsiPilihan({ porsi: 1.5 }), 1.5);
assert.equal(V.porsiPilihan({ porsi: 0 }), 1);
assert.equal(V.porsiPilihan({ porsi: 99 }), 10);
assert.equal(V.ubahResep(opsi[0].pilihan[0]), false);
assert.equal(V.ubahResep(opsi[0].pilihan[1]), true);
assert.equal(V.ubahResep(opsi[1].pilihan[0]), true);
assert.equal(V.ubahResep({ ganti: [{ dari: "a", ke: "a" }] }), false);
assert.ok(V.tebakKemasan({ nama: "Cup plastik + tutup" }) && V.tebakKemasan({ nama: "Mangkok kertas" }) && V.tebakKemasan({ nama: "Sendok plastik" }));
assert.ok(!V.tebakKemasan({ nama: "Susu sapi" }) && !V.tebakKemasan({ nama: "Teh celup" }));

// --- HPP per menu
const [jmb, oatp, tg, bb] = [opsi[0].pilihan[1], opsi[1].pilihan[0], opsi[2].pilihan[0], opsi[3].pilihan[0]];
// Jumbo Milk Tea: (3470 - cup 600) × 0.5 = 1435
near(V.hppPilihanDi(resep[0], jmb, map), 1435, "jumbo milk tea");
// Jumbo Es Teh: per porsi teh 250 + gula 240 = 490, × 0.5 = 245 (cup tetap)
near(V.hppPilihanDi(resep[1], jmb, map), 245, "jumbo es teh");
// Oat: 100 ml × (50 - 20) = 3000
near(V.hppPilihanDi(resep[0], oatp, map), 3000, "susu oat");
// Tanpa gula: −320 di Milk Tea, −240 di Es Teh
near(V.hppPilihanDi(resep[0], tg, map), -320, "tanpa gula milk tea");
near(V.hppPilihanDi(resep[1], tg, map), -240, "tanpa gula es teh");
// Topping biasa sama seperti sebelumnya
near(V.hppPilihanDi(resep[0], bb, map), 1200, "boba");
// Tanpa menu: hanya bahan tambahan
assert.equal(V.hppPilihanDi(undefined, jmb, map), 0);

// --- Bahan terpakai (stok)
const s0 = { bahan, resep, opsi, orders: [], transactions: [], posHarian: {}, stokLog: [], pelanggan: [], stempelLog: [], promo: [] };
const pakai = (item) => Object.fromEntries(V.pakaiItem(s0, item).reduce((m, x) => m.set(x.bahanId, (m.get(x.bahanId) || 0) + x.qty), new Map()));
const opsiOf = (...ids) => ids.map((id) => { const f = V.cariPilihan(s0, id); return { g: f.g.id, id, nama: f.p.nama, harga: f.p.harga }; });
// 2 Milk Tea Jumbo + oat + tanpa gula + boba
assert.deepEqual(pakai({ resepId: "mt", nama: "Milk Tea", qty: 2, opsi: opsiOf("jmb", "oatp", "tg", "bb") }), { teh: 3, oat: 300, es: 450, cup: 2, boba: 60 });
// Es Teh reguler (hasil 2): per porsi
assert.deepEqual(pakai({ resepId: "et", nama: "Es Teh", qty: 4, opsi: opsiOf("reg") }), { teh: 4, gula: 60, cup: 4 });

// --- Order: stok, rekap per menu, laporan
const cek = V.cekPilihan(s0, resep[0], ["jmb", "oatp"], map);
assert.ok(cek.ok);
const cart = [
  { resepId: "mt", nama: "Milk Tea", harga: V.hargaItem(s0, resep[0], cek.opsi, "toko"), qty: 2, opsi: cek.opsi },
  { resepId: "et", nama: "Es Teh", harga: 9000, qty: 1, opsi: opsiOf("jmb") },
];
assert.equal(cart[0].harga, 21000);
const r1 = buatOrder(s0, { cart, metode: "tunai", bayar: 60000 });
const s1 = { ...s0, ...r1.patch };
const stok = Object.fromEntries(s1.bahan.map((b) => [b.id, b.stok]));
// Milk Tea jumbo oat ×2: teh 3, gula 60, oat 300, es 450, cup 2 · Es Teh jumbo ×1: teh 1.5, gula 22.5, cup 1
near(stok.teh, 100 - 4.5, "stok teh");
near(stok.gula, 5000 - 82.5, "stok gula");
assert.equal(stok.susu, 5000);
assert.equal(stok.oat, 700);
assert.equal(stok.cup, 97);
const hari = s1.posHarian[todayISO()];
assert.deepEqual(hari.opsi, { jmb: 3, oatp: 2 });
assert.deepEqual(hari.opsiMenu, { jmb: { "Milk Tea": 2, "Es Teh": 1 }, oatp: { "Milk Tea": 2 } });

const lr = labaRugi(s1, todayISO().slice(0, 7), "resep");
const lJmb = lr.opsi.find((o) => o.nama === "Jumbo");
near(lJmb.hpp, (2 * 1435 + 245) / 3, "laporan: HPP rata-rata jumbo per menu");
near(lJmb.untung, 3 * 4000 - (2 * 1435 + 245), "laporan: untung jumbo");
const lOat = lr.opsi.find((o) => o.nama === "Susu oat");
near(lOat.hpp, 3000, "laporan: HPP oat");

// Batal: stok balik, rekap kosong
const s2 = { ...s1, ...batalOrder(s1, r1.order.id) };
assert.equal(s2.bahan.find((b) => b.id === "oat").stok, 1000);
near(s2.bahan.find((b) => b.id === "gula").stok, 5000, "stok gula balik");
assert.equal(s2.posHarian[todayISO()].opsiMenu, undefined);

// Rekap lama (tanpa opsiMenu) tetap kebaca: HPP hanya bahan tambahan
const acc = V.kumpulOpsi({}, { opsi: { bb: 4, jmb: 2 } });
assert.deepEqual(acc, { bb: { "": 4 }, jmb: { "": 2 } });
const t = V.hppOpsiTerjual(s0, acc, map);
assert.deepEqual(t.map((x) => [x.p.id, x.q, x.hpp]), [["bb", 4, 4800], ["jmb", 2, 0]]);
V.kumpulOpsi(acc, { opsi: { jmb: 1 }, opsiMenu: { jmb: { "Milk Tea": 1 } } });
assert.deepEqual(acc.jmb, { "": 2, "Milk Tea": 1 });

// --- Pilihan habis kalau bahan pengganti stoknya 0
const mapOat0 = bahanMap(bahan.map((b) => (b.id === "oat" ? { ...b, stok: 0 } : b)));
assert.equal(V.pilihanHabis(oatp, mapOat0), true);
assert.equal(V.pilihanHabis(oatp, map), false);
assert.equal(V.pilihanHabis(tg, mapOat0), false); // dihilangkan: tidak butuh stok
// Menu publik: porsi / ganti tidak bocor
const pub = menuPublik({ ...s0, meja: [], posSetting: { pesanMeja: true } });
assert.equal(JSON.stringify(pub).includes("ganti") || JSON.stringify(pub).includes("tetap"), false);
assert.equal(pub.opsi.find((g) => g.id === "su").pilihan[0].habis, false);

// --- Data contoh: Jumbo 1,5× porsi (cup tidak dikali) & Tanpa gula; stok tetap = total stokLog
const d = buatDataDummy({ today: "2026-11-16" });
const jumbo = d.opsi.flatMap((g) => g.pilihan).find((p) => p.nama === "Jumbo");
assert.equal(jumbo.porsi, 1.5);
assert.equal(d.bahan.find((b) => b.id === jumbo.tetap[0]).nama, "Cup plastik + tutup");
assert.ok(d.opsi.flatMap((g) => g.pilihan).some((p) => p.nama === "Tanpa gula" && p.ganti.length === 2));
const logStok = {};
for (const l of d.stokLog) logStok[l.bahanId] = (logStok[l.bahanId] || 0) + l.delta;
for (const b of d.bahan) near(b.stok, logStok[b.id] || 0, `dummy stok ${b.nama} = total stokLog`);
const esteh = d.resep.find((r) => r.nama === "Es Teh Manis");
assert.ok(V.hppPilihanDi(esteh, jumbo, bahanMap(d.bahan)) > 0);

console.log("varian-resep OK");
