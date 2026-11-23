// Multi-cabang: dokumen cabang baru disalin dari data contoh (menu, bahan stok 0, transaksi kosong, token meja baru),
// kirim menu ke cabang lain (stok & Kas tujuan tetap, bahan baru masuk stok 0), ringkasan gabungan per cabang + total.
import assert from "node:assert/strict";
globalThis.localStorage = { getItem: () => null, setItem() {} };
const C = await import("../../js/cabang.js");
const { buatDataDummy } = await import("../../js/dummy.js");
const { addDays } = await import("../../js/ui.js");

const today = "2026-11-22";
const src = buatDataDummy({ today, jam: "20:00", skala: 0.3 });

// --- Cabang baru
const doc = C.docCabangBaru(src, "Cabang Dago", today);
assert.equal(doc.profile.cabang, "Cabang Dago");
assert.equal(doc.profile.nama, src.profile.nama, "nama usaha tetap");
assert.deepEqual(doc.resep.map((r) => r.id), src.resep.map((r) => r.id));
assert.deepEqual(doc.opsi, src.opsi);
assert.deepEqual(doc.promo, src.promo);
assert.deepEqual(doc.online, src.online);
assert.equal(doc.bahan.length, src.bahan.length);
assert.ok(doc.bahan.every((b) => b.stok === 0), "stok mulai 0");
assert.equal(doc.bahan[0].harga, src.bahan[0].harga);
assert.deepEqual(doc.transactions, []);
assert.deepEqual(doc.stokLog, []);
assert.equal(doc.orders, undefined);
assert.equal(doc.pelanggan, undefined, "pelanggan tiap cabang sendiri");
assert.equal(doc.karyawan, undefined);
assert.equal(doc.kasAwal.nominal, 0);
assert.equal(doc.absenSetting.aktif, false);
assert.deepEqual(doc.jadwal.shift, src.jadwal.shift);
assert.deepEqual(doc.jadwal.hari, {});
assert.equal(doc.meja.length, src.meja.length);
assert.ok(doc.meja.every((m, i) => m.token !== src.meja[i].token && m.nama === src.meja[i].nama), "token meja baru");
doc.resep[0].nama = "ubah";
assert.notEqual(src.resep[0].nama, "ubah", "salinan, bukan referensi");

// --- Kirim menu ke cabang lain
const tujuan = {
  ...C.docCabangBaru(src, "Cabang Dago", today),
  bahan: [{ ...src.bahan[0], stok: 77, min: 5, harga: 1 }, { id: "lokal", nama: "Bahan lokal", stok: 3 }],
  transactions: [{ id: "t1", tanggal: today, jenis: "masuk", kategori: "Penjualan", nominal: 1000 }],
  promo: [],
  loyalty: null,
};
const sumber = { ...src, resep: src.resep.map((r, i) => (i === 0 ? { ...r, harga: r.harga + 1000 } : r)) };
const hasil = C.kirimMenu(tujuan, sumber, ["menu"]);
assert.equal(hasil.resep[0].harga, src.resep[0].harga + 1000, "harga baru terkirim");
assert.equal(hasil.bahan.find((b) => b.id === src.bahan[0].id).stok, 77, "stok tujuan tetap");
assert.equal(hasil.bahan.find((b) => b.id === src.bahan[0].id).min, 5, "batas minimum tujuan tetap");
assert.equal(hasil.bahan.find((b) => b.id === src.bahan[0].id).harga, src.bahan[0].harga, "info bahan ikut sumber");
assert.ok(hasil.bahan.some((b) => b.id === "lokal"), "bahan khusus cabang tujuan tetap");
assert.equal(hasil.bahan.find((b) => b.id === src.bahan[1].id).stok, 0, "bahan baru stok 0");
assert.deepEqual(hasil.transactions, tujuan.transactions, "Kas tujuan tetap");
assert.deepEqual(hasil.promo, [], "promo nggak ikut kalau nggak dipilih");
const semua = C.kirimMenu(tujuan, sumber, ["menu", "online", "promo", "loyalty"]);
assert.deepEqual(semua.promo, src.promo);
assert.deepEqual(semua.loyalty, src.loyalty);
assert.deepEqual(semua.online, src.online);

// --- Ringkasan gabungan
const ph = (o) => Object.fromEntries(o.map(([t, order, omzet]) => [t, { order, omzet, items: {} }]));
const rows = [
  { id: "u", nama: "TAHGUY", utama: true, data: { posHarian: ph([[today, 10, 200000], [addDays(today, -3), 5, 100000], [addDays(today, -20), 4, 80000], [addDays(today, -40), 9, 999999]]), transactions: [{ id: "a", tanggal: today, jenis: "masuk", kategori: "Katering/pesanan", nominal: 50000 }, { id: "b", tanggal: today, jenis: "keluar", kategori: "Operasional", nominal: 20000 }], resep: [], bahan: [], opsi: [] } },
  { id: "d", nama: "Cabang Dago", utama: false, data: { posHarian: ph([[today, 3, 60000]]), transactions: [], resep: [], bahan: [], opsi: [] } },
  { id: "k", nama: "Cabang Kosong", utama: false, data: null },
];
const r = C.ringkasCabang(rows, today);
assert.equal(r.list.length, 3);
assert.deepEqual(r.list[0].hari, { omzet: 200000, order: 10 });
assert.deepEqual(r.list[0].minggu, { omzet: 300000, order: 15 });
assert.deepEqual(r.list[0].bulan30, { omzet: 380000, order: 19 }, "40 hari lalu nggak masuk");
assert.equal(r.list[0].laba, 30000, "laba = pendapatan lain 50rb - biaya 20rb (penjualan tanpa Kas pos)");
assert.equal(r.list[2].kosong, true);
assert.deepEqual(r.total.hari, { omzet: 260000, order: 13 });
assert.equal(r.total.laba, 30000);
assert.equal(r.terbaik.id, "u");
assert.equal(C.ringkasCabang([rows[0]], today).terbaik, null, "satu cabang: tanpa pembanding");
assert.equal(C.dariRingkasan("2026-11-22"), "2026-10-24");
assert.equal(C.dariRingkasan("2026-12-31"), "2026-12-01");
assert.equal(C.namaCabang({ nama: "", utama: true }), "Cabang utama");

// --- Data contoh cabang muda (opsi hari / seed / denganTim di dummy.js)
const muda = buatDataDummy({ today, jam: "20:00", hari: 21, seed: 7, denganTim: false, tumbuh: 1.8, skala: 0.45, tim: [{ id: "o", nama: "Pemilik" }] });
const hariMuda = Object.keys(muda.posHarian).sort();
assert.equal(hariMuda[0], addDays(today, -20), "21 hari data");
assert.ok(muda.transactions.every((t) => t.tanggal <= today), "nggak ada Kas di masa depan");
assert.ok(!muda.karyawan?.length && !muda.gajian?.length, "tanpa karyawan");
assert.ok(muda.orders.every((o) => o.kasir?.id === "o"), "order atas nama pemilik");
for (const [t, r] of Object.entries(muda.posHarian)) {
  const kas = muda.transactions.filter((x) => x.ref === "pos" && x.tanggal === t && x.jenis === "masuk").reduce((a, x) => a + x.nominal, 0);
  assert.equal(kas, r.omzet, `Kas = omzet ${t}`);
}
assert.ok(Object.keys(Object.values(muda.posHarian).reduce((a, r) => ({ ...a, ...r.items }), {})).length >= 12, "menu baru tetap terjual di cabang muda");
assert.notEqual(JSON.stringify(muda.orders.slice(0, 3).map((o) => o.total)), JSON.stringify(src.orders.slice(0, 3).map((o) => o.total)), "seed beda = pola beda");

console.log("cabang OK");
