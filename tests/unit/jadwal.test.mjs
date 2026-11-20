// Jadwal shift: template (default & custom), rentang minggu/bulan, kuas, pola mingguan & bergilir, salin, kosongkan,
// telat dari jam mulai shift, lembur dari jam selesai shift, sisanya hadir menghormati libur, jadwal akun kasir, WA.
import assert from "node:assert/strict";
globalThis.localStorage = { getItem: () => null, setItem() {} };
const J = await import("../../js/jadwal.js");
const A = await import("../../js/absen.js");
const G = await import("../../js/gaji.js");

let s = { karyawan: [], absen: {}, shifts: [], jadwal: null, absenSetting: { aktif: true, jamMasuk: "08:00", toleransi: 10, jamKerja: 8 } };
s = { ...s, karyawan: A.simpanKaryawan(s, { nama: "Ujang", akunId: "akun-u", gaji: { skema: "harian", nominal: 80000, lembur: "tetap", tarifLembur: 10000 } }).karyawan };
s = { ...s, karyawan: A.simpanKaryawan(s, { nama: "Siti" }).karyawan };
const [ujang, siti] = s.karyawan;

// Template default & custom
assert.deepEqual(J.templateShift(s).map((x) => [x.nama, x.mulai, x.selesai]), [["Pagi", "07:00", "15:00"], ["Siang", "11:00", "19:00"], ["Malam", "15:00", "23:00"]]);
s = { ...s, ...J.tambahShift(s, { nama: "Middle", mulai: "09:00", selesai: "17:00" }) };
const middle = J.templateShift(s)[3];
assert.throws(() => J.tambahShift(s, { nama: "middle", mulai: "09:00", selesai: "17:00" }), /sudah ada/);
assert.throws(() => J.tambahShift(s, { nama: "Libur", mulai: "09:00", selesai: "17:00" }), /Libur/);
assert.throws(() => J.tambahShift(s, { nama: "X", mulai: "09:00", selesai: "09:00" }), /nggak boleh sama/);
s = { ...s, ...J.ubahShift(s, "pagi", { nama: "Pagi", mulai: "06:00", selesai: "14:00" }) };
assert.equal(J.templateShift(s)[0].mulai, "06:00");
assert.equal(J.durasi({ mulai: "18:00", selesai: "02:00" }), 480, "lewat tengah malam");
assert.equal(J.kodeShift(J.templateShift(s), "malam"), "Ma", "Middle & Malam sama-sama M -> 2 huruf");
assert.equal(J.kodeShift(J.templateShift(s), "pagi"), "P");
assert.equal(J.kodeShift(J.templateShift(s), J.LIBUR), "L");

// Rentang
assert.deepEqual([J.rentang("minggu", "2026-11-20").dari, J.rentang("minggu", "2026-11-20").sampai], ["2026-11-16", "2026-11-22"]);
const bln = J.rentang("bulan", "2026-11-20");
assert.deepEqual([bln.dari, bln.sampai, bln.hari.length], ["2026-11-01", "2026-11-30", 30]);
assert.equal(J.geserAnchor("bulan", "2026-12-15", 1), "2027-01-01");
assert.equal(J.geserAnchor("minggu", "2026-11-20", -1), "2026-11-13");

// Kuas
s = { ...s, ...J.setSel(s, "2026-11-16", ujang.id, "pagi") };
s = { ...s, ...J.setSel(s, "2026-11-16", siti.id, J.LIBUR) };
assert.equal(J.shiftDi(s, "2026-11-16", ujang.id).nama, "Pagi");
assert.equal(J.shiftDi(s, "2026-11-16", siti.id).libur, true);
s = { ...s, ...J.setSel(s, "2026-11-16", siti.id, null) };
assert.equal(J.shiftDi(s, "2026-11-16", siti.id), null);

// Pola: Siti Pagi/Siang bergilir tiap minggu, libur Minggu, 2 minggu
s = { ...s, ...J.terapkanPola(s, { karyawanIds: [siti.id], dari: "2026-11-16", sampai: "2026-11-29", shiftIds: ["pagi", "siang"], libur: [6] }) };
assert.equal(J.shiftDi(s, "2026-11-17", siti.id).id, "pagi");
assert.equal(J.shiftDi(s, "2026-11-22", siti.id).libur, true, "Minggu libur");
assert.equal(J.shiftDi(s, "2026-11-24", siti.id).id, "siang", "minggu kedua gantian");
// timpa=false nggak mengubah kotak yang sudah diisi
s = { ...s, ...J.terapkanPola(s, { karyawanIds: [ujang.id], dari: "2026-11-16", sampai: "2026-11-22", shiftIds: [middle.id], libur: [], timpa: false }) };
assert.equal(J.shiftDi(s, "2026-11-16", ujang.id).id, "pagi");
assert.equal(J.shiftDi(s, "2026-11-17", ujang.id).id, middle.id);
assert.throws(() => J.terapkanPola(s, { karyawanIds: [], dari: "2026-11-16", sampai: "2026-11-22", shiftIds: ["pagi"] }), /karyawan/);

// Salin minggu lalu -> minggu ini (kotak terisi nggak ditimpa); bulan = 4 minggu lalu
let sal = J.salinSebelumnya(s, "minggu", "2026-11-30", "2026-12-06");
assert.equal(sal.n > 0, true);
assert.equal(J.shiftDi({ ...s, ...sal }, "2026-11-30", siti.id).id, "siang");
assert.throws(() => J.salinSebelumnya(s, "minggu", "2027-03-01", "2027-03-07"), /kosong/);
// Kosongkan
const kos = { ...s, ...J.kosongkan(s, "2026-11-16", "2026-11-22", [ujang.id]) };
assert.equal(J.shiftDi(kos, "2026-11-17", ujang.id), null);
assert.equal(J.shiftDi(kos, "2026-11-17", siti.id).id, "pagi");
// Hapus template -> kotaknya ikut kosong
const hs = { ...s, ...J.hapusShift(s, middle.id) };
assert.equal(J.shiftDi(hs, "2026-11-17", ujang.id), null);
assert.equal(J.pakaiShift(s, middle.id), 6);

// Telat dari jam mulai shift: Siti Siang 11:00 masuk 11:05 nggak telat; Pagi 06:00 masuk 06:20 telat
s = { ...s, ...A.catatAbsen(s, "2026-11-24", siti.id, { status: "hadir", masuk: "11:05" }) };
s = { ...s, ...A.catatAbsen(s, "2026-11-17", siti.id, { status: "hadir", masuk: "06:20" }) };
assert.equal(A.absenHari(s, "2026-11-24")[siti.id].telat, false);
assert.equal(A.absenHari(s, "2026-11-17")[siti.id].telat, true);
// Tanpa jadwal: jam masuk umum
s = { ...s, ...A.catatAbsen(s, "2026-12-20", siti.id, { status: "hadir", masuk: "08:05" }) };
assert.equal(A.absenHari(s, "2026-12-20")[siti.id].telat, false);

// Lembur dari jam selesai shift: Ujang Middle 09–17, pulang 19:30 -> 2 jam
s = { ...s, ...A.catatAbsen(s, "2026-11-18", ujang.id, { status: "hadir", masuk: "09:00", pulang: "19:30" }) };
let l = G.lemburPeriode(s, s.karyawan[0], "2026-11-18", "2026-11-18");
assert.deepEqual([l.jam, l.rp], [2, 20000]);
// Masuk telat 2 jam & pulang telat 2 jam: lembur tetap dari jam selesai shift
s = { ...s, ...A.catatAbsen(s, "2026-11-19", ujang.id, { status: "hadir", masuk: "11:00", pulang: "18:10" }) };
l = G.lemburPeriode(s, s.karyawan[0], "2026-11-19", "2026-11-19");
assert.equal(l.jam, 1);
// Shift malam lewat tengah malam: 18:00-02:00, pulang 03:30 -> 1 jam
s = { ...s, ...J.tambahShift(s, { nama: "Dini", mulai: "18:00", selesai: "02:00" }) };
const dini = J.templateShift(s).find((x) => x.nama === "Dini");
s = { ...s, ...J.setSel(s, "2026-11-20", ujang.id, dini.id) };
s = { ...s, ...A.catatAbsen(s, "2026-11-20", ujang.id, { status: "hadir", masuk: "18:00", pulang: "03:30" }) };
assert.equal(G.lemburPeriode(s, s.karyawan[0], "2026-11-20", "2026-11-20").jam, 1);

// Sisanya hadir: yang dijadwalkan libur -> libur
const sh = { ...s, ...A.semuaHadir(s, "2026-11-22") };
assert.equal(sh.absen["2026-11-22"][siti.id].status, "libur");
assert.equal(sh.absen["2026-11-22"][ujang.id].status, "hadir");

// Akun kasir lihat jadwalnya sendiri
s = { ...s, ...J.sinkronAkun(s) };
assert.deepEqual(J.jadwalOf(s).akun, { "akun-u": ujang.id });
const ja = J.jadwalAkun(s, "akun-u", "2026-11-16", "2026-11-18");
assert.deepEqual(ja.map((x) => x.shift?.nama ?? null), ["Pagi", "Middle", "Middle"]);
assert.equal(J.jadwalAkun(s, "akun-lain", "2026-11-16", "2026-11-18"), null);
// Karyawan keluar -> akun dilepas
assert.deepEqual(J.sinkronAkun({ ...s, karyawan: s.karyawan.map((k) => ({ ...k, aktif: false })) }).jadwal.akun, {});

// Ringkasan & WA
assert.deepEqual(J.masukHari(s, "2026-11-17").map((x) => [x.k.nama, x.shift.nama]), [["Siti", "Pagi"], ["Ujang", "Middle"]]);
assert.deepEqual(J.hitungPerHari(s, ["2026-11-22"])[0].total, 1);
const wa = J.teksJadwal(s, siti, "2026-11-16", "2026-11-22", "Warung X");
assert.match(wa, /Senin 16\/11: Pagi 06:00–14:00/);
assert.match(wa, /Minggu 22\/11: Libur/);

console.log("jadwal OK");
