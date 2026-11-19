// Paket Gratis / Pro: label, sisa hari, pengingat, hemat tahunan, link upgrade WA, ringkasan langganan admin (MRR).
import assert from "node:assert/strict";
globalThis.localStorage = { getItem: () => null, setItem() {} };
const P = await import("../../js/paket.js");
const A = await import("../../js/admin.js");

const NOW = "2026-11-20T10:00:00Z";

// Fitur Pro & Gratis lengkap
assert.deepEqual(P.FITUR_PRO.map((f) => f.id), ["tim", "meja", "dapur", "bill", "foto", "imporJual", "ai"]);
assert.equal(P.namaFitur("bill"), "Open bill");
assert.ok(P.FITUR_GRATIS.some((f) => f.startsWith("Kasir")));

// Label & sisa hari
const coba = { paket: "pro", sumber: "coba", sampai: "2026-11-25T10:00:00Z" };
const transisi = { paket: "pro", sumber: "transisi", sampai: "2027-02-20T16:59:59Z" };
const bayar = { paket: "pro", sumber: "bayar", sampai: "2026-11-23T10:00:00Z", periode: "bulan" };
const gratis = { paket: "gratis", pro_terakhir: "2026-11-15T10:00:00Z" };
assert.equal(P.sisaHari(coba, NOW), 5);
assert.equal(P.sisaHari(gratis, NOW), null);
assert.equal(P.labelPaket(coba, NOW), "Pro · masa coba (sisa 5 hari)");
assert.equal(P.labelPaket(transisi, NOW), "Pro · gratis masa transisi (sisa 93 hari)");
assert.equal(P.labelPaket(bayar, NOW), "Pro");
assert.equal(P.labelPaket(gratis, NOW), "Gratis");
assert.equal(P.labelPaket({ paket: "lokal" }), "Mode coba di HP ini");

// Pengingat
assert.deepEqual(P.perluIngat(coba, NOW), { jenis: "habis", sisa: 5 });
assert.equal(P.perluIngat(transisi, NOW), null, "transisi masih lama");
assert.deepEqual(P.perluIngat(bayar, NOW), { jenis: "habis", sisa: 3 });
assert.equal(P.perluIngat({ ...bayar, sampai: "2026-12-20T10:00:00Z" }, NOW), null);
assert.deepEqual(P.perluIngat(gratis, NOW), { jenis: "turun", sejak: gratis.pro_terakhir });
assert.equal(P.perluIngat({ paket: "gratis", pro_terakhir: "2026-10-01T00:00:00Z" }, NOW), null, "sudah lama gratis");
assert.equal(P.perluIngat({ paket: "lokal" }, NOW), null);

// Hemat tahunan: 12 x 49rb - 490rb = 98rb (±2 bulan)
assert.deepEqual(P.hematTahun(), { rp: 98000, bulan: 2 });

// Link upgrade
const link = P.linkUpgrade({ wa: "0812-3456-7890", harga_bulan: 49000, harga_tahun: 490000 }, { email: "a@b.id", usaha: "Tahguy", periode: "tahun" });
assert.ok(link.startsWith("https://wa.me/6281234567890?text="));
const teks = decodeURIComponent(link.split("text=")[1]);
assert.match(teks, /tahunan, Rp490\.000/);
assert.match(teks, /Usaha: Tahguy/);
assert.match(teks, /Email akun: a@b\.id/);
assert.equal(P.linkUpgrade({ wa: "" }), "", "tanpa nomor admin: tidak ada link");

// Tanpa akun = mode coba lokal, fitur Pro boleh dicoba (server tetap mengunci yang butuh server)
assert.equal(P.paketKini().paket, "lokal");
assert.equal(P.bolehPro(), true);

// --- Admin: ringkasan langganan & MRR
const list = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }, { id: "e" }, { id: "f" }];
const paket = { a: { paket: "pro", sumber: "bayar", periode: "bulan" }, b: { paket: "pro", sumber: "bayar", periode: "tahun" }, c: { paket: "pro", sumber: "coba" }, d: { paket: "pro", sumber: "transisi" }, e: { paket: "gratis" } };
const r = A.ringkasPaket(list, paket, { harga_bulan: 49000, harga_tahun: 490000 });
assert.deepEqual(r, { bayar: 2, coba: 1, transisi: 1, gratis: 2, mrr: Math.round(49000 + 490000 / 12), tahunan: 1, konversi: 50 });
assert.equal(A.jenisPaket(undefined), "gratis");
// Perpanjang dari sisa Pro berbayar, atau dari sekarang
assert.equal(A.perpanjang({ paket: "pro", sumber: "bayar", sampai: "2027-01-10T00:00:00.000Z" }, "bulan", new Date("2026-12-01T00:00:00Z")), "2027-02-10T00:00:00.000Z");
assert.equal(A.perpanjang({ paket: "pro", sumber: "coba", sampai: "2026-12-05T00:00:00Z" }, "tahun", new Date("2026-12-01T00:00:00Z")), "2027-12-01T00:00:00.000Z");
assert.equal(A.perpanjang({ paket: "gratis" }, "bulan", new Date("2026-01-31T00:00:00Z")).slice(0, 7), "2026-03", "Date overflow wajar (31 Jan + 1 bulan)");

// --- Konfigurasi dari admin: fitur Gratis/Pro & kuota AI
assert.deepEqual(P.aturFitur(null), P.FITUR_DEFAULT);
const atur = { paket: "gratis", fitur: { meja: "gratis", foto: "gratis" }, ai_gratis: 50, ai_pro: 400 };
assert.equal(P.bolehFitur("meja", atur), true, "meja diatur Gratis");
assert.equal(P.bolehFitur("bill", atur), false, "bill tetap Pro");
assert.equal(P.bolehFitur("bill", { paket: "pro" }), true);
assert.equal(P.bolehFitur("tim", { paket: "lokal" }), true, "tanpa akun boleh dicoba");
assert.deepEqual(P.kuotaAi(atur), { gratis: 50, pro: 400 });
const isi = P.isiPaket(atur);
assert.ok(isi.gratis.includes("Pesan lewat QR meja") && isi.gratis.includes("Foto menu AI") && isi.gratis.at(-1) === "Mentor & AI 50x/hari");
assert.deepEqual(isi.pro.map((f) => f.id), ["tim", "dapur", "bill", "imporJual", "ai"]);
assert.equal(isi.pro.at(-1).nama, "Kuota AI 400/hari");
assert.ok(!P.isiPaket({ ai_gratis: 300, ai_pro: 300 }).pro.some((f) => f.id === "ai"), "kuota sama: AI bukan pembeda Pro");
assert.deepEqual(P.FITUR.map((f) => f.id), ["tim", "meja", "dapur", "bill", "foto", "imporJual"], "sama dengan paket_fitur_ids() di SQL");

console.log("paket OK");
