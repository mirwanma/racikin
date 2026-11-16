// Promo & voucher: aturan waktu/saluran, potongan 3 jenis promo, pilih yang terbaik (tidak numpuk), voucher & kuota,
// order + Kas + rekap, laporan, data contoh.
import assert from "node:assert/strict";
globalThis.localStorage = { getItem: () => null, setItem() {} };
const P = await import("../../js/promo.js");
const { buatOrder, batalOrder, reconcile, struk } = await import("../../js/pos.js");
const { labaRugi } = await import("../../js/laporan.js");
const { buatDataDummy } = await import("../../js/dummy.js");
const { todayISO } = await import("../../js/ui.js");

const resep = [
  { id: "bakso", nama: "Bakso", harga: 15000, hasil: 1, items: [] },
  { id: "teh", nama: "Es Teh", harga: 4000, hasil: 1, items: [] },
];
const happy = { id: "h", nama: "Happy hour", aktif: true, jenis: "order", tipe: "persen", nilai: 10, maks: 3000, waktu: { hari: [1, 2, 3, 4, 5], jamDari: "15:00", jamSampai: "16:00" }, saluran: ["toko"] };
const teh = { id: "t", nama: "Beli 2 gratis 1 Es Teh", aktif: true, jenis: "bxgy", beli: 2, gratis: 1, resepIds: ["teh"], waktu: {}, saluran: ["toko"] };
const spesial = { id: "s", nama: "Bakso 12rb", aktif: true, jenis: "menu", tipe: "harga", nilai: 12000, resepIds: ["bakso"], waktu: { dari: "2026-11-01", sampai: "2026-11-30" } };
const voucher = { id: "v", nama: "Voucher HEMAT", aktif: true, jenis: "order", tipe: "rp", nilai: 8000, minBelanja: 30000, kode: "HEMAT", kuota: 2, waktu: {}, saluran: ["toko", "gofood"] };
const s = { resep, promo: [happy, teh, spesial, voucher], posHarian: {}, orders: [], transactions: [], bahan: [], stokLog: [], pelanggan: [], stempelLog: [], online: null };
const cart = [
  { resepId: "bakso", nama: "Bakso", harga: 15000, qty: 2 },
  { resepId: "teh", nama: "Es Teh", harga: 4000, qty: 3 },
];

// --- waktu & saluran (16 Nov 2026 = Senin) ---
assert.equal(P.berlakuPada(happy, "2026-11-16T15:30"), true);
assert.equal(P.berlakuPada(happy, "2026-11-16T16:00"), false); // jamSampai eksklusif
assert.equal(P.berlakuPada(happy, "2026-11-15T15:30"), false); // Minggu
assert.equal(P.berlakuPada(happy, "2026-11-16T15:30", "gofood"), false);
assert.equal(P.berlakuPada(spesial, "2026-12-01T10:00"), false);
assert.equal(P.berlakuPada({ ...happy, aktif: false }, "2026-11-16T15:30"), false);

// --- potongan per jenis ---
assert.equal(P.potonganPromo(happy, cart).potongan, 3000); // 10% dari 42rb = 4.2rb, maks 3rb
assert.equal(P.potonganPromo(teh, cart).potongan, 4000); // 3 teh -> 1 gratis
assert.equal(P.potonganPromo(teh, [{ resepId: "teh", harga: 4000, qty: 2 }]).kurangPorsi, 1);
assert.equal(P.potonganPromo(spesial, cart).potongan, 6000); // (15rb - 12rb) × 2
assert.equal(P.potonganPromo(spesial, [{ resepId: "bakso", harga: 18000, qty: 1, opsi: [{ harga: 3000 }] }]).potongan, 3000); // tambahan varian tetap dibayar
assert.equal(P.potonganPromo({ ...spesial, tipe: "persen", nilai: 50 }, cart).potongan, 15000);
assert.deepEqual(P.potonganPromo(voucher, [{ resepId: "teh", harga: 4000, qty: 1 }]), { potongan: 0, kurang: 26000 });

// --- pilih yang terbaik, tidak numpuk ---
let r = P.pilihPromo(s, cart, { waktu: "2026-11-16T15:30" });
assert.deepEqual(r.promo, { id: "s", nama: "Bakso 12rb", potongan: 6000 }); // 6rb > 4rb > 3rb
r = P.pilihPromo(s, cart, { waktu: "2026-11-16T15:30", kode: "hemat" }); // kode tidak peka huruf
assert.equal(r.promo.id, "v");
assert.equal(r.promo.kode, "HEMAT");
assert.equal(r.kodeError, "");
r = P.pilihPromo(s, [{ resepId: "bakso", harga: 15000, qty: 1 }], { waktu: "2026-11-16T10:00", kode: "HEMAT" });
assert.match(r.kodeError, /min\. belanja/);
assert.equal(r.promo.id, "s");
assert.match(P.pilihPromo(s, cart, { waktu: "2026-11-16T10:00", kode: "NGASAL" }).kodeError, /nggak ditemukan/);
assert.match(P.pilihPromo(s, cart, { waktu: "2026-11-16T10:00", kode: "HEMAT", channel: "grabfood" }).kodeError, /nggak berlaku/);
assert.equal(P.pilihPromo({ ...s, promo: [happy] }, [{ resepId: "teh", harga: 4000, qty: 1 }], { waktu: "2026-11-16T10:00" }).promo, null); // di luar jam: tidak ada promo
const minOnly = { ...s, promo: [{ ...voucher, kode: "" }] };
assert.match(P.pilihPromo(minOnly, [{ resepId: "teh", harga: 4000, qty: 2 }], { waktu: "2026-11-16T10:00" }).hint, /Tambah Rp22\.000 lagi/);

// --- order: total, Kas, rekap, struk, batal ---
const promoPakai = P.pilihPromo(s, cart, { waktu: "2026-11-16T10:00", kode: "HEMAT" }).promo;
const { patch, order } = buatOrder(s, { cart, promo: promoPakai, diskon: 1000, metode: "tunai", bayar: 50000 });
assert.equal(order.subtotal, 42000);
assert.equal(order.total, 42000 - 8000 - 1000);
assert.deepEqual(order.promo, { id: "v", nama: "Voucher HEMAT", potongan: 8000, kode: "HEMAT" });
const st = { ...s, ...patch };
const tgl = todayISO();
assert.equal(st.transactions.find((t) => t.ref === "pos").nominal, 33000);
assert.deepEqual(st.posHarian[tgl].promo, { v: { n: 1, rp: 8000, omzet: 33000 } });
assert.match(struk(order, "Warung", (n) => `Rp${n}`), /Promo Voucher HEMAT -Rp8000/);
// diskon manual tidak bisa bikin total minus
assert.equal(buatOrder(s, { cart: [{ resepId: "teh", nama: "Es Teh", harga: 4000, qty: 1 }], promo: { id: "x", nama: "X", potongan: 3000 }, diskon: 5000 }).order.total, 0);
// kuota: dipakai 2× -> habis
const st2 = { ...st, ...buatOrder(st, { cart, promo: promoPakai }).patch };
assert.equal(P.pemakaian(st2).v.n, 2);
assert.match(P.pilihPromo(st2, cart, { waktu: "2026-11-16T10:00", kode: "HEMAT" }).kodeError, /Kuota/);
// batal mengurangi pemakaian
const st3 = { ...st2, ...batalOrder(st2, order.id) };
assert.equal(P.pemakaian(st3).v.n, 1);
// reconcile menghitung ulang rekap promo dari order
assert.deepEqual(reconcile({ ...st, posHarian: {} }).posHarian[tgl].promo, { v: { n: 1, rp: 8000, omzet: 33000 } });
// laporan menampilkan potongan promo bulan itu
assert.equal(labaRugi(st, tgl.slice(0, 7)).potonganPromo, 8000);

// --- keterangan untuk pelanggan ---
assert.equal(P.ketPromo(happy, s), "Diskon 10% (maks Rp3.000) · Senin–Jumat · jam 15.00–16.00");
assert.equal(P.ketPromo(teh, s), "Beli 2 gratis 1 Es Teh");
assert.equal(P.ketPromo(spesial, s), "Bakso jadi Rp12.000 · s/d 30/11");
assert.equal(P.ketPromo(voucher, s), "Diskon Rp8.000 min. belanja Rp30.000 · juga di GoFood");
assert.deepEqual(P.promoHariIni(s, "2026-11-16").map((p) => p.id), ["h", "t", "s"]); // voucher (berkode) tidak diumumkan

// --- data contoh: promo kepakai, Kas tetap = rekap ---
const d = buatDataDummy({ today: "2026-11-16" });
const u = P.pemakaian(d);
assert.equal(d.promo.length, 3);
assert.ok(d.promo.every((p) => (u[p.id]?.n || 0) > 0));
for (const [t, rr] of Object.entries(d.posHarian)) {
  const kas = d.transactions.filter((x) => x.ref === "pos" && x.tanggal === t && x.jenis === "masuk").reduce((a, x) => a + x.nominal, 0);
  assert.equal(kas, rr.omzet, t);
}

console.log("promo OK");
