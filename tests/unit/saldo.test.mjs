// Saldo pelanggan: isi (Kas titipan, bukan omzet), simpan kembalian, bayar pakai saldo (penuh & kurang + sisa
// QRIS/tunai), batal order (saldo balik), tarik, hapus, laci shift, reconcile (dicatat akun kasir), laba rugi & pajak.
import assert from "node:assert/strict";
globalThis.localStorage = { getItem: () => null, setItem() {} };
const S = await import("../../js/saldo.js");
const { buatOrder, batalOrder, reconcile, struk } = await import("../../js/pos.js");
const { ringkasan } = await import("../../js/shift.js");
const { omzetBulanan } = await import("../../js/pajak.js");
const { todayISO } = await import("../../js/ui.js");
const { labaRugi } = await import("../../js/laporan.js");
const { cardData } = await import("../../js/loyalty.js");

const T = todayISO();
const ym = T.slice(0, 7);
const resep = [{ id: "tg", nama: "Tahu Guyur", harga: 12000, hasil: 1, items: [] }];
const s0 = {
  bahan: [], resep, opsi: [], orders: [], transactions: [], posHarian: {}, stokLog: [], stempelLog: [], promo: [], kasbon: [], saldoPelanggan: [],
  pelanggan: [{ id: "budi", nama: "Budi Santoso", wa: "6281", token: "t1" }, { id: "sari", nama: "Sari", wa: "" }],
  posSetting: { saldo: true },
};
const cart = (n) => [{ resepId: "tg", nama: "Tahu Guyur", harga: 12000, qty: n }];
const kas = (s, f) => s.transactions.filter(f).reduce((a, t) => a + (t.jenis === "masuk" ? 1 : -1) * t.nominal, 0);
const kasTotal = (s) => kas(s, () => true);
const penjualan = (s) => kas(s, (t) => t.kategori === "Penjualan");
const titipan = (s) => kas(s, (t) => t.kategori === S.KAT_SALDO);
const shift = { id: "sh1", modal: 100000, laci: [] };

assert.equal(S.saldoAktif(s0), true);
assert.equal(S.saldoAktif({}), false);
assert.equal(S.saldoOf(s0, "budi"), 0);

// Isi saldo 50rb tunai di shift -> Kas titipan, bukan penjualan
let s = { ...s0, shifts: [shift] };
let r = S.isiSaldo(s, "budi", { nominal: 50000, metode: "tunai", tanggal: T, shiftId: "sh1" });
s = { ...s, saldoPelanggan: r.saldoPelanggan, transactions: r.transactions };
assert.equal(S.saldoOf(s, "budi"), 50000);
assert.equal(titipan(s), 50000);
assert.equal(penjualan(s), 0);
assert.deepEqual(s.transactions.map((t) => t.id), [`saldo-${T}-tunai`]);
assert.equal(ringkasan(s, shift).saldo, 50000);
assert.equal(ringkasan(s, shift).seharusnya, 150000, "isi tunai masuk laci");
assert.throws(() => S.isiSaldo(s, "budi", { nominal: 0, tanggal: T }), /Isi jumlah/);
assert.throws(() => S.isiSaldo(s, "x", { nominal: 1000, tanggal: T }), /nggak ketemu/);
assert.throws(() => S.isiSaldo(s, "budi", { nominal: 9_000_000, tanggal: T }), /Maksimal/);
assert.throws(() => S.isiSaldo(s, "budi", { nominal: 1000, metode: "kasbon", tanggal: T }), /Metode/);

// Bayar penuh pakai saldo: penjualan 24rb tercatat, titipan berkurang 24rb, uang Kas nggak berubah
const kasSebelum = kasTotal(s);
r = buatOrder(s, { cart: cart(2), metode: "saldo", pelangganId: "budi", shiftId: "sh1" });
s = { ...s, ...r.patch };
const o1 = r.order;
assert.equal(o1.metode, "saldo");
assert.equal(o1.pembayaran, undefined);
assert.equal(S.porsiSaldo(o1), 24000);
assert.equal(S.saldoOf(s, "budi"), 26000);
assert.equal(s.posHarian[T].omzet, 24000);
assert.equal(penjualan(s), 24000, "omzet saldo tercatat waktu jual");
assert.equal(titipan(s), 26000);
assert.equal(kasTotal(s), kasSebelum, "uang nggak berubah");
assert.equal(ringkasan(s, shift).seharusnya, 150000, "saldo bukan tunai");
assert.ok(s.transactions.some((t) => t.id === `pos-${T}-saldo-pakai` && t.jenis === "keluar" && t.nominal === 24000));
assert.deepEqual(s.saldoPelanggan.find((k) => k.id === `o-${o1.id}`), { id: `o-${o1.id}`, jenis: "pakai", pelangganId: "budi", tanggal: T, waktu: o1.waktu, nominal: 24000, orderId: o1.id, no: o1.no });
assert.throws(() => buatOrder(s, { cart: cart(1), metode: "saldo" }), /pelanggan/);
assert.throws(() => buatOrder(s, { cart: cart(1), metode: "saldo", pelangganId: "sari" }), /kosong/);
assert.throws(() => buatOrder(s, { cart: cart(3), metode: "saldo", pelangganId: "budi", saldoPakai: 30000 }), /Saldo cuma/);

// Saldo kurang (26rb) untuk 36rb: sisa 10rb QRIS
r = buatOrder(s, { cart: cart(3), metode: "saldo", pelangganId: "budi", sisaMetode: "qris", shiftId: "sh1" });
s = { ...s, ...r.patch };
const o2 = r.order;
assert.equal(o2.metode, "campur");
assert.deepEqual(o2.pembayaran, [{ metode: "qris", jumlah: 10000 }, { metode: "saldo", jumlah: 26000 }]);
assert.equal(S.saldoOf(s, "budi"), 0);
assert.equal(penjualan(s), 60000);
assert.equal(titipan(s), 0);
assert.equal(ringkasan(s, shift).seharusnya, 150000, "QRIS nggak masuk laci");
assert.match(struk(o2, "TAHGUY", (n) => `Rp${n}`), /QRIS Rp10000 \+ Saldo Rp26000/);
assert.throws(() => buatOrder(s, { cart: cart(1), metode: "saldo", pelangganId: "budi", sisaMetode: "kasbon", saldoPakai: 0 }), /kosong/);

// Batal order o2: saldo balik 26rb, penjualan & titipan menyesuaikan
s = { ...s, ...batalOrder(s, o2.id) };
assert.equal(S.saldoOf(s, "budi"), 26000);
assert.equal(penjualan(s), 24000);
assert.equal(titipan(s), 26000);

// Simpan kembalian: bayar 50rb untuk 12rb, 30rb disimpan, 8rb dikembalikan
assert.throws(() => buatOrder(s, { cart: cart(1), metode: "tunai", bayar: 50000, simpanKembalian: 1000 }), /pelanggan/);
assert.throws(() => buatOrder(s, { cart: cart(1), metode: "qris", pelangganId: "sari", simpanKembalian: 1000 }), /tunai/);
assert.throws(() => buatOrder(s, { cart: cart(1), metode: "tunai", bayar: 50000, pelangganId: "sari", simpanKembalian: 40000 }), /lebih besar/);
r = buatOrder(s, { cart: cart(1), metode: "tunai", bayar: 50000, pelangganId: "sari", simpanKembalian: 30000, shiftId: "sh1", kasir: { id: "k1", nama: "Rina" } });
s = { ...s, ...r.patch };
const o3 = r.order;
assert.equal(o3.kembali, 8000);
assert.equal(o3.simpanSaldo, 30000);
assert.equal(S.saldoOf(s, "sari"), 30000);
const k3 = s.saldoPelanggan.find((k) => k.id === `k-${o3.id}`);
assert.equal(k3.sumber, "kembalian");
assert.equal(k3.shiftId, "sh1");
assert.deepEqual(k3.oleh, { id: "k1", nama: "Rina" });
assert.equal(S.labelSaldo(k3), `Kembalian disimpan (order #${o3.no})`);
assert.equal(penjualan(s), 36000);
assert.equal(titipan(s), 56000, "kembalian disimpan = titipan");
// laci: 100rb + isi 50rb + jual tunai 12rb + kembalian disimpan 30rb
assert.equal(ringkasan(s, shift).seharusnya, 192000);
assert.match(struk(o3, "TAHGUY", (n) => `Rp${n}`), /Kembalian Rp30000 disimpan jadi saldo/);
// Batal order o3: kembalian yang disimpan tetap jadi saldo (uangnya ada di laci)
s = { ...s, ...batalOrder(s, o3.id) };
assert.equal(S.saldoOf(s, "sari"), 30000);
assert.equal(ringkasan(s, shift).seharusnya, 180000);

// Tarik saldo Sari 10rb tunai
assert.throws(() => S.tarikSaldo(s, "sari", { nominal: 40000, tanggal: T }), /Maksimal Rp30\.000/);
r = S.tarikSaldo(s, "sari", { nominal: 10000, metode: "tunai", tanggal: T, shiftId: "sh1" });
s = { ...s, saldoPelanggan: r.saldoPelanggan, transactions: r.transactions };
assert.equal(S.saldoOf(s, "sari"), 20000);
assert.equal(titipan(s), 46000);
assert.ok(s.transactions.some((t) => t.id === `saldo-${T}-tarik-tunai` && t.jenis === "keluar"));
assert.equal(ringkasan(s, shift).seharusnya, 170000);

// Daftar & ringkasan
assert.deepEqual(S.daftarSaldo(s).map((x) => [x.p.id, x.saldo]), [["budi", 26000], ["sari", 20000]]);
assert.deepEqual(S.ringkasSaldo(s), { n: 2, total: 46000 });
assert.equal(S.riwayatSaldo(s, "sari").length, 2);

// Hapus: isi yang sudah terpakai nggak boleh dihapus; tarik boleh; pemakaian & kembalian nggak bisa
const isiBudi = s.saldoPelanggan.find((k) => k.pelangganId === "budi" && k.jenis === "isi");
assert.throws(() => S.hapusSaldo(s, isiBudi.id), /terpakai/);
assert.equal(S.hapusSaldo(s, `o-${o1.id}`), null);
assert.equal(S.hapusSaldo(s, k3.id), null);
const tarik = s.saldoPelanggan.find((k) => k.jenis === "tarik");
const h = S.hapusSaldo(s, tarik.id);
assert.equal(S.saldoOf({ ...s, ...h }, "sari"), 30000);
assert.equal(kas({ ...s, ...h }, (t) => t.kategori === S.KAT_SALDO), 56000);

// Reconcile: isi saldo dicatat akun kasir (tanpa Kas) -> Kas titipan muncul setelah sinkron di HP pemilik
r = S.isiSaldo(s, "budi", { nominal: 20000, metode: "qris", tanggal: T });
const kasir = { ...s, saldoPelanggan: r.saldoPelanggan };
assert.equal(titipan(kasir), 46000);
const rec = reconcile(kasir);
assert.equal(titipan(rec), 66000);
assert.ok(rec.transactions.some((t) => t.id === `saldo-${T}-qris`));
assert.deepEqual(reconcile(rec).transactions, rec.transactions, "stabil");

// Laba rugi: titipan nggak dihitung pendapatan / lain-lain; penjualan saldo masuk pendapatan
const lr = labaRugi(rec, ym, "belanja");
assert.equal(lr.pendapatan, 24000, "cuma penjualan (o1)");
assert.equal(lr.lain, 0, "titipan bukan pendapatan lain");
assert.equal(lr.biaya, 0, "titipan terpakai bukan biaya");
// Pajak: omzet = penjualan (termasuk yang dibayar saldo), titipan nggak ikut
assert.equal(omzetBulanan(rec, T.slice(0, 4))[ym], 24000);

// Kartu publik: saldo tampil kalau fitur aktif
assert.equal(cardData({ ...rec, loyalty: { target: 6 } }, rec.pelanggan[0]).saldo, 46000);
assert.equal(cardData({ ...rec, posSetting: {}, loyalty: { target: 6 } }, rec.pelanggan[0]).saldo, undefined);

console.log("saldo ok");
