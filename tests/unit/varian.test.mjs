// Varian & topping: validasi pilihan, harga (toko & online), stok, batal order, rekap & laporan.
import assert from "node:assert/strict";
globalThis.localStorage = { getItem: () => null, setItem() {} };
const V = await import("../../js/varian.js");
const { buatOrder, batalOrder, reconcile, struk } = await import("../../js/pos.js");
const { labaRugi } = await import("../../js/laporan.js");
const { menuPublik } = await import("../../js/meja.js");
const { tiketDari } = await import("../../js/dapur.js");
const { todayISO } = await import("../../js/ui.js");

const bahan = [
  { id: "tahu", nama: "Tahu", satuan: "pcs", harga: 600, stok: 100, min: 0, tracked: true },
  { id: "cabai", nama: "Cabai", satuan: "gram", harga: 80, stok: 500, min: 0, tracked: true },
  { id: "keju", nama: "Keju", satuan: "gram", harga: 110, stok: 20, min: 0, tracked: true },
  { id: "telur", nama: "Telur", satuan: "butir", harga: 2200, stok: 0, min: 0, tracked: false },
];
const opsi = [
  { id: "lv", nama: "Level pedas", tipe: "satu", wajib: true, pilihan: [{ id: "l0", nama: "Tidak pedas", harga: 0, items: [] }, { id: "l3", nama: "Level 3", harga: 0, items: [{ bahanId: "cabai", qty: 8 }] }, { id: "l5", nama: "Level 5", harga: 1000, items: [{ bahanId: "cabai", qty: 15 }] }] },
  { id: "tp", nama: "Topping", tipe: "banyak", wajib: false, maks: 2, pilihan: [{ id: "kj", nama: "Keju", harga: 3000, items: [{ bahanId: "keju", qty: 15 }] }, { id: "tl", nama: "Telur", harga: 4000, items: [{ bahanId: "telur", qty: 1 }] }, { id: "bk", nama: "Bakso", harga: 4000, items: [], habis: true }] },
];
const resep = [
  { id: "ori", nama: "Tahu Guyur", harga: 12000, hasil: 1, items: [{ bahanId: "tahu", qty: 3 }], opsiIds: ["lv", "tp"] },
  { id: "teh", nama: "Es Teh", harga: 4000, hasil: 1, items: [] },
];
const online = { channels: { gofood: { aktif: true, komisi: 20, markup: 25, bulat: 500 } }, harga: {} };
const base = { bahan, opsi, resep, online, stokLog: [], orders: [], transactions: [], posHarian: {}, pelanggan: [], stempelLog: [], loyalty: null };
const map = Object.fromEntries(bahan.map((b) => [b.id, b]));
const ori = resep[0];

// --- grup & validasi ---
assert.deepEqual(V.grupMenu(base, ori).map((g) => g.id), ["lv", "tp"]);
assert.equal(V.punyaOpsi(base, resep[1]), false);
assert.equal(V.cekPilihan(base, ori, [], map).error, "Pilih Level pedas dulu");
assert.match(V.cekPilihan(base, ori, ["l0", "l3"], map).error, /pilih satu/);
assert.match(V.cekPilihan(base, ori, ["l0", "kj", "tl", "bk"], map).error, /maksimal 2|habis/);
assert.match(V.cekPilihan(base, ori, ["l0", "bk"], map).error, /habis/);
const c1 = V.cekPilihan(base, ori, ["kj", "l5"], map);
assert.ok(c1.ok);
assert.deepEqual(c1.opsi.map((o) => o.id), ["l5", "kj"]); // urut sesuai grup
assert.deepEqual(V.pilihanAwal(base, ori, map), ["l0"]);
// Keju habis kalau stok < 15 gram
assert.equal(V.pilihanHabis(opsi[1].pilihan[0], { keju: { ...bahan[2], stok: 10 } }), true);
assert.equal(V.pilihanHabis(opsi[1].pilihan[1], map), false); // telur belum tracked -> tidak dihitung habis
assert.equal(V.aturan(opsi[0]), "Wajib · pilih 1");
assert.equal(V.aturan(opsi[1]), "Opsional · maks. 2");

// --- harga ---
assert.equal(V.hargaItem(base, ori, c1.opsi, "toko"), 16000);
// GoFood: menu 12000*1.25=15000, tambahan 4000*1.25=5000
assert.equal(V.hargaItem(base, ori, c1.opsi, "gofood"), 20000);
assert.equal(V.tambahanDi(base, [{ harga: 1000 }], "gofood"), 1500); // 1250 dibulatkan ke 1500
assert.equal(V.kunciItem("ori", c1.opsi), V.kunciItem("ori", [...c1.opsi].reverse()));
assert.notEqual(V.kunciItem("ori", c1.opsi), V.kunciItem("ori", []));
assert.equal(V.namaLengkap({ nama: "Tahu Guyur", opsi: c1.opsi }), "Tahu Guyur (Level 5, Keju)");
assert.equal(V.hppPilihan(opsi[1].pilihan[0], map), 1650);

// --- order: stok, kas, rekap ---
const cart = [
  { key: V.kunciItem("ori", c1.opsi), resepId: "ori", nama: "Tahu Guyur", harga: 16000, qty: 2, opsi: c1.opsi },
  { key: "ori", resepId: "ori", nama: "Tahu Guyur", harga: 12000, qty: 1, opsi: V.cekPilihan(base, ori, ["l0"], map).opsi },
  { key: "teh", resepId: "teh", nama: "Es Teh", harga: 4000, qty: 1 },
];
const { patch, order } = buatOrder(base, { cart, metode: "qris" });
assert.equal(order.total, 16000 * 2 + 12000 + 4000);
assert.equal(order.items[0].opsi.length, 2);
assert.equal(order.items[2].opsi, undefined); // item tanpa varian tetap ringkas
const st = { ...base, ...patch };
const stok = (id) => st.bahan.find((b) => b.id === id).stok;
assert.equal(stok("tahu"), 100 - 9);
assert.equal(stok("cabai"), 500 - 30);
assert.equal(stok("keju"), 20 - 30); // boleh minus (stok fisik belum dihitung ulang)
assert.equal(stok("telur"), 0); // belum tracked -> tidak berubah
const tgl = todayISO();
assert.equal(st.stokLog.find((l) => l.id === `pos-${tgl}-cabai`).delta, -30);
assert.deepEqual(st.posHarian[tgl].items, { "Tahu Guyur": 3, "Es Teh": 1 });
assert.deepEqual(st.posHarian[tgl].opsi, { l5: 2, kj: 2, l0: 1 });
assert.equal(st.transactions.find((t) => t.ref === "pos").nominal, order.total);
assert.match(struk(order, "TAHGUY", (n) => `Rp${n}`), /2× Tahu Guyur \(Level 5, Keju\)/);

// stok = total stokLog (dari stok awal 0 + opname)
const awal = { ...base, bahan: bahan.map((b) => ({ ...b, stok: 0 })), stokLog: [] };
const p2 = buatOrder(awal, { cart, metode: "tunai", bayar: 100000 }).patch;
const s2 = { ...awal, ...p2 };
for (const b of s2.bahan) assert.equal(b.stok, s2.stokLog.filter((l) => l.bahanId === b.id).reduce((a, l) => a + l.delta, 0));

// batal: stok kembali, rekap bersih
const s3 = { ...st, ...batalOrder(st, order.id) };
assert.equal(s3.bahan.find((b) => b.id === "cabai").stok, 500);
assert.equal(s3.bahan.find((b) => b.id === "keju").stok, 20);
assert.equal(s3.posHarian[tgl].opsi, undefined);
assert.equal(s3.stokLog.find((l) => l.id === `pos-${tgl}-cabai`).delta, 0);

// reconcile menghitung ulang rekap opsi
const s4 = reconcile({ ...st, posHarian: {} });
assert.deepEqual(s4.posHarian[tgl].opsi, { l5: 2, kj: 2, l0: 1 });

// --- laporan: HPP tambahan pilihan ikut dihitung ---
const lr = labaRugi(st, tgl.slice(0, 7), "resep");
// HPP: 3 porsi ori × 1800 + 2× Level 5 (15g cabai = 1200) + 2× keju (1650)
assert.equal(lr.hppResep, Math.round(3 * 1800 + 2 * 1200 + 2 * 1650));
assert.equal(lr.opsi.find((o) => o.nama === "Keju").porsi, 2);

// --- dapur & menu publik ---
assert.equal(tiketDari(order).data.items[0].opsi, "Level 5, Keju");
assert.equal(tiketDari(order).data.items[2].opsi, undefined);
const pub = menuPublik({ ...st, meja: [], posSetting: { pesanMeja: true } });
assert.deepEqual(pub.menu.find((m) => m.id === "ori").opsi, ["lv", "tp"]);
assert.equal(pub.menu.find((m) => m.id === "teh").opsi, undefined);
assert.deepEqual(pub.opsi.map((g) => [g.id, g.maks]), [["lv", 1], ["tp", 2]]);
assert.equal(pub.opsi[1].pilihan.find((p) => p.id === "kj").habis, true); // stok keju minus -> habis
assert.equal(pub.opsi[1].pilihan.find((p) => p.id === "bk").habis, true);
assert.equal(JSON.stringify(pub).includes("bahanId"), false); // resep bahan tidak bocor ke publik

// Validasi di halaman pelanggan memakai data publik
const sv = { opsi: pub.opsi };
assert.match(V.cekPilihan(sv, { opsiIds: ["lv", "tp"] }, ["l0", "kj"], {}).error, /habis/);
assert.ok(V.cekPilihan(sv, { opsiIds: ["lv", "tp"] }, ["l3", "tl"], {}).ok);

console.log("varian OK");
