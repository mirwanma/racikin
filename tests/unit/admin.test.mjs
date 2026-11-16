// Dashboard admin: status merchant, ringkasan platform, filter/urut, CSV.
import assert from "node:assert/strict";
const A = await import("../../js/admin.js");

const T = "2026-11-16";
const fitur = (on) => Object.fromEntries(A.FITUR.map(([k]) => [k, on.includes(k)]));
const M = [
  { id: "1", nama: "Bakso Bu Sari", email: "sari@contoh.id", kota: "Bandung", jenis: "Makanan berat", tahap: "jalan", daftar: "2026-09-01T10:00:00Z", diubah: "2026-11-16T08:00:00Z", jualan_terakhir: "2026-11-16", order7: 70, omzet7: 1400000, order30: 300, omzet30: 6000000, order_prev30: 250, omzet_prev30: 5000000, hari_jualan30: 28, menu: 12, bahan: 20, pelanggan: 40, tim: 2, ai30: 15, meja_order30: 30, fitur: fitur(["kasir", "tim", "shift", "stempel", "promo", "wa", "meja", "varian"]) },
  { id: "2", nama: "Kopi Senja", email: "senja@contoh.id", kota: "Bandung", jenis: "Minuman / kopi", tahap: "jalan", daftar: "2026-08-01T10:00:00Z", diubah: "2026-10-20T08:00:00Z", jualan_terakhir: "2026-10-20", order7: 0, omzet7: 0, order30: 10, omzet30: 200000, order_prev30: 400, omzet_prev30: 8000000, hari_jualan30: 3, menu: 8, bahan: 5, pelanggan: 0, tim: 0, ai30: 0, meja_order30: 0, fitur: fitur(["kasir"]) },
  { id: "3", nama: "Dimsum Mama", email: "mama@contoh.id", kota: "Depok", jenis: "Jajanan / snack", tahap: "ide", daftar: "2026-11-10T10:00:00Z", diubah: "2026-11-12T08:00:00Z", jualan_terakhir: null, order7: 0, omzet7: 0, order30: 0, omzet30: 0, order_prev30: 0, omzet_prev30: 0, hari_jualan30: 0, menu: 0, bahan: 0, pelanggan: 0, tim: 0, ai30: 6, meja_order30: 0, fitur: fitur([]) },
  { id: "4", nama: "Seblak Lama", email: "lama@contoh.id", kota: "Cimahi", jenis: "Jajanan / snack", tahap: "ide", daftar: "2026-07-01T10:00:00Z", diubah: "2026-07-05T08:00:00Z", jualan_terakhir: null, order7: 0, omzet7: 0, order30: 0, omzet30: 0, order_prev30: 0, omzet_prev30: 0, hari_jualan30: 0, menu: 2, bahan: 0, pelanggan: 0, tim: 0, ai30: 0, meja_order30: 0, fitur: fitur([]) },
  { id: "5", nama: "Akun Tes", email: "racikin-tim-owner@racikin.test", kota: "Cimahi", jenis: "Jajanan / snack", tahap: "jalan", daftar: "2026-11-11T10:00:00Z", diubah: "2026-11-15T08:00:00Z", jualan_terakhir: "2026-11-15", order7: 50, omzet7: 1000000, order30: 50, omzet30: 1000000, order_prev30: 0, omzet_prev30: 0, hari_jualan30: 5, menu: 15, bahan: 25, pelanggan: 35, tim: 3, ai30: 40, meja_order30: 5, fitur: fitur(["kasir", "tim"]) },
];

// --- status ---
const st = (i) => A.statusMerchant(M[i], T);
assert.equal(st(0).status, "aktif");
assert.equal(Math.round(st(0).tren), 20);
assert.ok(st(0).skor >= 90);
assert.equal(st(1).status, "berisiko"); // dulu ramai, 27 hari sepi
assert.equal(Math.round(st(1).tren), -97); // (10 - 400) / 400 = -97,5%
assert.equal(st(2).status, "baru");
assert.equal(st(3).status, "tidur");
assert.equal(st(4).tren, null); // baru mulai jualan (belum ada pembanding)
assert.equal(st(4).status, "aktif");
assert.equal(A.isTes(M[4]), true);

// --- ringkasan (tanpa akun tes) ---
const r = A.ringkasPlatform(M.slice(0, 4), T);
assert.equal(r.total, 4);
assert.equal(r.aktif7, 2); // Bakso (jualan) + Dimsum (baru ubah data 4 hari lalu)
assert.equal(r.berisiko, 1);
assert.equal(r.baru30, 1);
assert.deepEqual(r.tahap, { ide: 2, jalan: 2 });
assert.equal(r.order30, 310);
assert.equal(r.omzet30, 6200000);
assert.equal(r.fitur.find((x) => x.k === "kasir").n, 2);
assert.deepEqual(r.kota[0], ["Bandung", 2]);
assert.equal(r.daftarMinggu.length, 8);
assert.equal(r.daftarMinggu[r.daftarMinggu.length - 1].minggu, "2026-11-16"); // Senin minggu ini
assert.equal(r.daftarMinggu[r.daftarMinggu.length - 2].n, 1); // Dimsum Mama daftar 10 Nov

// --- filter & urut ---
const ids = (f) => A.saringMerchant(M, f, T).map((m) => m.id);
assert.deepEqual(ids({}), ["1", "3", "2", "4"]); // akun tes disembunyikan, urut terakhir aktif (jualan / ubah data)
assert.deepEqual(ids({ tes: true }).includes("5"), true);
assert.deepEqual(ids({ urut: "omzet30" }), ["1", "2", "3", "4"]);
assert.deepEqual(ids({ status: "berisiko" }), ["2"]);
assert.deepEqual(ids({ tahap: "ide", urut: "nama" }), ["3", "4"]);
assert.deepEqual(ids({ q: "bandung", urut: "nama" }), ["1", "2"]);
assert.deepEqual(ids({ q: "senja@" }), ["2"]);

// --- CSV ---
const csv = A.toCSV(A.saringMerchant(M, { urut: "nama" }, T));
const baris = csv.replace(/^﻿/, "").split("\n");
assert.equal(baris.length, 5);
assert.ok(baris[0].startsWith("nama,pemilik,email,kota"));
assert.match(baris[1], /^Bakso Bu Sari,,sari@contoh\.id,Bandung,Makanan berat,jalan,Aktif,/);
assert.match(baris[3], /^Kopi Senja,.*Berisiko berhenti/); // urut nama: Bakso, Dimsum, Kopi, Seblak

// --- Periode 7 / 30 / 90 dari deret harian platform
const H = Array.from({ length: 60 }, (_, i) => ({ tgl: `d${i}`, order: i < 30 ? 5 : 10, omzet: (i < 30 ? 5 : 10) * 20000, jualan: i < 30 ? 1 : 2, daftar: i === 59 ? 2 : 0, ai: i >= 50 ? 3 : 0 }));
const r30 = A.ringkasHarian(H, 30);
assert.equal(r30.seri.length, 30);
assert.equal(r30.order, 300);
assert.equal(r30.prev.order, 150);
assert.equal(Math.round(A.persen(r30.order, r30.prev.order)), 100);
assert.equal(r30.rata, 20000);
assert.equal(r30.jualanRata, 2);
assert.equal(r30.daftar, 2);
assert.equal(r30.ai, 30);
assert.equal(r30.adaPrev, true);
const r7 = A.ringkasHarian(H, 7);
assert.equal(r7.order, 70);
assert.equal(r7.prev.order, 70);
assert.equal(A.ringkasHarian(H, 90).adaPrev, false); // data kurang dari 180 hari
assert.equal(A.ringkasHarian(null, 30).order, 0);
assert.equal(A.persen(5, 0), null);

// Angka per periode merchant
const bakso = { ...M[0], order90: 600, omzet90: 12000000 };
assert.deepEqual(A.angkaPeriode(bakso, 7), { order: 70, omzet: 1400000 });
assert.deepEqual(A.angkaPeriode(bakso, 30), { order: 300, omzet: 6000000 });
assert.deepEqual(A.angkaPeriode(bakso, 90), { order: 600, omzet: 12000000 });
assert.deepEqual(A.angkaPeriode(M[0], 90), { order: 300, omzet: 6000000 }); // data lama tanpa order90

// Perlu disapa: berisiko dulu, lalu pendaftar baru yang menunya kosong, lalu order turun tajam
const turun = { id: "t", nama: "Es Kopi Turun", email: "t@contoh.id", tahap: "jalan", daftar: "2026-06-01T00:00:00Z", jualan_terakhir: "2026-11-15", order30: 40, order_prev30: 100, hari_jualan30: 20, menu: 5, fitur: {} };
const kosong = { id: "k", nama: "Baru Banget", email: "k@contoh.id", tahap: "ide", daftar: "2026-11-14T00:00:00Z", jualan_terakhir: null, order30: 0, order_prev30: 0, menu: 0, fitur: {} };
const sapa = A.perluDisapa([...M, turun, kosong], T);
console.log("sapa:", sapa.map((x) => `${x.m.nama} (${x.jenis})`).join(", "));
assert.equal(sapa[0].jenis, "berisiko");
assert.deepEqual(sapa.map((x) => x.jenis).slice(-2), ["setup", "turun"]);
assert.match(sapa.find((x) => x.jenis === "turun").teks, /turun 60%/);
assert.ok(!sapa.some((x) => x.m.nama === "Bakso Bu Sari"));

console.log("admin OK");
