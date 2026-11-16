// Impor riwayat penjualan: baca CSV/TSV, tebak kolom, tanggal, saluran, lewati hari yang sudah ada, simpan & batalkan.
import assert from "node:assert/strict";
globalThis.localStorage = { getItem: () => null, setItem() {} };
const J = await import("../../js/imporjual.js");
const { labaRugi } = await import("../../js/laporan.js");
const { cekKesehatan } = await import("../../js/sehat.js");

// --- parseTabel: pemisah, tanda kutip, BOM, baris kosong ---
const csv = J.parseTabel('﻿tanggal,menu,total\n01/10/2026,"Es teh, manis","8.000"\n\n02/10/2026,"Bakso ""Jumbo""",25000\n');
assert.equal(csv.delim, ",");
assert.deepEqual(csv.rows, [["01/10/2026", "Es teh, manis", "8.000"], ["02/10/2026", 'Bakso "Jumbo"', "25000"]]);
assert.equal(J.parseTabel("a;b\n1;2").delim, ";");
assert.equal(J.parseTabel("Tanggal\tTotal\n1/10/2026\tRp 10.000").delim, "\t"); // tempel dari Excel/Sheets

// --- tebak kolom (Indonesia & Inggris) ---
assert.deepEqual(J.tebakKolom(["Tanggal", "No Order", "Nama Produk", "Qty", "Harga", "Total", "Tipe Pesanan"]), { order: 1, tanggal: 0, qty: 3, harga: 4, total: 5, saluran: 6, menu: 2 });
assert.deepEqual(J.tebakKolom(["Order ID", "Created At", "Item Name", "Quantity", "Gross Sales", "Sales Type"]), { order: 0, tanggal: 1, qty: 3, harga: -1, total: 4, saluran: 5, menu: 2 });

// --- tanggal & saluran ---
for (const [x, t] of [["2026-10-01", "2026-10-01"], ["01/10/2026 12:30", "2026-10-01"], ["1-10-26", "2026-10-01"], ["1 Okt 2026", "2026-10-01"], ["Oct 3, 2026", "2026-10-03"], ["2026/02/30", null], ["kemarin", null]]) assert.equal(J.tanggalISO(x), t, x);
assert.equal(J.tanggalISO("10/13/2026", "mdy"), "2026-10-13");
assert.equal(J.urutanTanggal(["10/13/2026", "10/14/2026"]), "mdy");
assert.equal(J.urutanTanggal(["01/10/2026", "13/10/2026"]), "dmy");
assert.deepEqual(["GoFood", "Grab Food", "ShopeeFood", "Dine In", ""].map(J.saluranDari), ["gofood", "grabfood", "shopeefood", "toko", "toko"]);

// --- olah & simpan ---
const tabel = J.parseTabel(`Tanggal;No Order;Nama Produk;Qty;Harga;Total;Tipe Pesanan
01/10/2026 12:01;A1;bakso urat;2;15.000;30.000;Dine In
01/10/2026;A1;Es Teh;2;4.000;8.000;Dine In
01/10/2026;A2;Bakso Urat;1;15.000;18.000;GoFood
05/10/2026;A3;Mie Ayam;1;18.000;18.000;Dine In
xx;A4;Mie Ayam;1;18.000;18.000;Dine In
16/11/2026;A5;Mie Ayam;1;18.000;18.000;Dine In`);
const s = {
  resep: [{ id: "r1", nama: "Bakso Urat", harga: 15000, hasil: 1, items: [{ bahanId: "b", qty: 50 }] }],
  bahan: [{ id: "b", nama: "Daging", satuan: "gram", harga: 100, stok: 0, tracked: true }],
  posHarian: {},
  orders: [],
  transactions: [{ id: "m", tanggal: "2026-10-05", jenis: "masuk", kategori: "Penjualan", nominal: 50000 }], // 5 Okt sudah dicatat manual
  online: { channels: { gofood: { aktif: true, komisi: 20, markup: 25, bulat: 500 } } },
  imporJual: [],
};
const h = J.olahPenjualan(s, tabel, J.tebakKolom(tabel.header), "2026-11-16");
assert.equal(h.gagal, 1);
assert.equal(h.alasan.masaDepan, 1); // hari ini dilewati
assert.deepEqual(h.dilewati, ["2026-10-05"]);
const d1 = h.hari["2026-10-01"];
assert.equal(d1.omzet, 56000);
assert.equal(d1.order, 2); // no. order unik
assert.deepEqual(d1.items, { "Bakso Urat": 3, "Es Teh": 2 }); // nama dicocokkan ke resep yang ada (huruf besar/kecil)
assert.deepEqual(d1.saluran, { toko: 38000, gofood: 18000 });
assert.deepEqual(h.menu.map((m) => [m.nama, m.qty, !!m.adaId]), [["Bakso Urat", 3, true], ["Es Teh", 2, false]]); // Mie Ayam cuma di hari yang dilewati

const { patch, info } = J.simpanPenjualan(s, h, { kas: true, komisi: true, menuBaru: true, nama: "kasir-lama.csv" }, "2026-11-16T10:00:00Z");
assert.deepEqual(info, { hari: 1, omzet: 56000, menuBaru: 1, id: info.id });
const s2 = { ...s, ...patch };
assert.equal(s2.posHarian["2026-10-01"].omzet, 56000);
assert.equal(s2.posHarian["2026-10-05"], undefined);
const kas = s2.transactions.filter((t) => t.ref === "impor");
assert.deepEqual(kas.map((t) => [t.jenis, t.kategori, t.nominal]), [["masuk", "Penjualan", 38000], ["masuk", "Penjualan", 18000], ["keluar", "Komisi Order Online", 3600]]);
assert.equal(s2.resep.find((r) => r.nama === "Es Teh").harga, 4000);
assert.equal(s2.imporJual.length, 1);

// Laporan & cek kesehatan memakai data impor tanpa dobel
const lr = labaRugi(s2, "2026-10", "resep");
assert.equal(lr.rincianPendapatan.manual, 50000 + 56000);
assert.equal(lr.hppResep, 3 * 5000); // HPP Bakso Urat × 3 porsi (Es Teh belum ada resep)

// Impor ulang file yang sama -> semua hari dilewati
const h2 = J.olahPenjualan(s2, tabel, J.tebakKolom(tabel.header), "2026-11-16");
assert.deepEqual(h2.dilewati.sort(), ["2026-10-01", "2026-10-05"]);

// Batalkan
const s3 = { ...s2, ...J.batalImpor(s2, info.id) };
assert.equal(s3.posHarian["2026-10-01"], undefined);
assert.equal(s3.transactions.length, 1);
assert.equal(s3.imporJual.length, 0);
assert.ok(s3.resep.some((r) => r.nama === "Es Teh")); // menu tetap

// Tanpa kolom menu & total dari harga × qty; omzet impor tidak dihitung dobel di cek kesehatan
const t2 = J.parseTabel("tanggal,harga,qty\n2026-11-01,10000,3\n2026-11-02,5000,");
const m2 = J.tebakKolom(t2.header);
const h3 = J.olahPenjualan({ resep: [], posHarian: {}, orders: [], transactions: [] }, t2, m2, "2026-11-16");
assert.equal(h3.hari["2026-11-01"].omzet, 30000);
assert.equal(h3.hari["2026-11-02"].omzet, 5000); // qty kosong = 1
const s4 = { profile: {}, resep: [], bahan: [], posHarian: {}, orders: [], transactions: [], stokLog: [], pelanggan: [], shifts: [] };
const { addDays } = await import("../../js/ui.js");
const rows = Array.from({ length: 28 }, (_, i) => `${addDays("2026-11-15", -i)},100000`).join("\n"); // 28 hari sampai kemarin
const t3 = J.parseTabel("tanggal,total\n" + rows);
const h4 = J.olahPenjualan(s4, t3, J.tebakKolom(t3.header), "2026-11-16");
const s5 = { ...s4, ...J.simpanPenjualan(s4, h4, { kas: true }).patch };
const tren = cekKesehatan(s5, "2026-11-16").cek.find((c) => c.id === "tren");
assert.equal(tren.status, "baik");
assert.match(tren.detail, /Rp 100\.000\/hari, 2 minggu sebelumnya Rp 100\.000\/hari/);

console.log("imporjual OK");
