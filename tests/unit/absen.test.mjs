// Karyawan & absen: posisi custom, catat absen, telat, otomatis dari shift kasir, rekap, impor file mesin absen
// (log attlog ZKTeco, CSV "AC-No./Name/Time", laporan Fingerspot dengan judul, rekap jam masuk/pulang, sel Excel).
import assert from "node:assert/strict";
globalThis.localStorage = { getItem: () => null, setItem() {} };
const A = await import("../../js/absen.js");

let s = { karyawan: [], absen: {}, shifts: [], absenSetting: { aktif: true, jamMasuk: "08:00", toleransi: 10 } };

// Posisi bisa diatur sendiri
assert.ok(A.setelan(s).posisi.includes("Barista"));
let pos = A.tambahPosisi(A.setelan(s).posisi, "  Cuci   piring ");
assert.equal(pos[pos.length - 1], "Cuci piring");
assert.throws(() => A.tambahPosisi(pos, "cuci PIRING"), /sudah ada/);
assert.throws(() => A.tambahPosisi(pos, " "), /Isi nama/);
pos = A.hapusPosisi(pos, "Kurir");
assert.ok(!pos.includes("Kurir"));

// Karyawan
let r = A.simpanKaryawan(s, { nama: "Ujang", posisi: "Cuci piring", pin: "001" });
s = { ...s, karyawan: r.karyawan };
const ujang = r.karyawanBaru;
assert.equal(ujang.pin, "1", "nol di depan PIN dibuang (mesin sering menulis 001)");
r = A.simpanKaryawan(s, { nama: "Siti", posisi: "Kasir", akunId: "akun-siti" });
s = { ...s, karyawan: r.karyawan };
const siti = r.karyawanBaru;
assert.throws(() => A.simpanKaryawan(s, { nama: "ujang" }), /sudah ada/);
assert.throws(() => A.simpanKaryawan(s, { nama: "Budi", pin: "01" }), /PIN 1 sudah dipakai/);
assert.deepEqual(A.hitungPosisi(s), { "Cuci piring": 1, Kasir: 1 });

// Absen manual + telat + hapus
s = { ...s, ...A.catatAbsen(s, "2026-11-18", ujang.id, { status: "hadir", masuk: "08:15", pulang: "16:00" }) };
let h = A.absenHari(s, "2026-11-18");
assert.equal(h[ujang.id].telat, true, "08:15 > 08:00 + 10 menit");
s = { ...s, ...A.catatAbsen(s, "2026-11-18", ujang.id, { status: "izin" }) };
assert.deepEqual(s.absen["2026-11-18"][ujang.id], { status: "izin", sumber: "manual" }, "jam dibuang kalau bukan hadir");
s = { ...s, ...A.catatAbsen(s, "2026-11-18", ujang.id, null) };
assert.equal(s.absen["2026-11-18"], undefined);

// Otomatis dari shift kasir
s.shifts = [{ id: "sh", kasir: { id: "akun-siti", nama: "Siti" }, buka: "2026-11-18T07:55", tutup: "2026-11-18T15:30" }];
h = A.absenHari(s, "2026-11-18");
assert.deepEqual([h[siti.id].status, h[siti.id].masuk, h[siti.id].pulang, h[siti.id].sumber, h[siti.id].telat], ["hadir", "07:55", "15:30", "shift", false]);
assert.equal(A.ringkasHari(s, "2026-11-18").tercatat, 1);
s = { ...s, ...A.semuaHadir(s, "2026-11-18") };
assert.equal(s.absen["2026-11-18"][ujang.id].status, "hadir");
assert.equal(s.absen["2026-11-18"][siti.id], undefined, "yang dari shift nggak ditimpa");

// Rekap
s = { ...s, ...A.catatAbsen(s, "2026-11-19", ujang.id, { status: "sakit" }) };
s = { ...s, ...A.catatAbsen(s, "2026-11-20", ujang.id, { status: "hadir", masuk: "08:30", pulang: "17:00" }) };
const rk = A.rekapAbsen(s, "2026-11-01", "2026-11-30");
assert.deepEqual([rk[ujang.id].hadir, rk[ujang.id].sakit, rk[ujang.id].telat, rk[ujang.id].menit], [2, 1, 1, 510]);
assert.deepEqual([rk[siti.id].hadir, rk[siti.id].menit], [1, 455]);

// ---------- Impor mesin ----------
assert.equal(A.jamDari("0.33333"), "08:00");
assert.equal(A.jamDari("7.58"), "07:58");
assert.equal(A.jamDari("2026-11-18 17:02:59"), "17:02");
assert.equal(A.jamDari("5:05 PM"), "17:05");
assert.equal(A.selTeks(new Date(2026, 10, 18, 17, 1, 59, 900)), "2026-11-18 17:02", "pecahan detik Excel dibulatkan");
assert.equal(A.selTeks(new Date(1899, 11, 30, 7, 58)), "07:58", "sel jam saja");

// 1) attlog ZKTeco (tanpa judul)
const dat = "     1\t2026-11-21 07:58:12\t1\t0\t1\t0\n     1\t2026-11-21 12:01:00\t1\t2\t1\t0\n     1\t2026-11-21 17:02:01\t1\t1\t1\t0\n     7\t2026-11-21 08:20:00\t1\t0\t1\t0";
let k = A.kenaliTabel(dat.split("\n").map((l) => l.split("\t")));
assert.equal(k.tanpaJudul, true);
let o = A.olahAbsen(s, k.data, k.map);
assert.deepEqual(o.hari.map((x) => [x.pin, x.masuk, x.pulang, x.scan, x.karyawanId]), [["1", "07:58", "17:02", 3, ujang.id], ["7", "08:20", "", 1, null]]);
assert.deepEqual(o.belumKenal, [{ kunci: "p:7", pin: "7", nama: "", hari: 1 }]);

// 2) ZKTeco CSV
k = A.kenaliTabel([["AC-No.", "Name", "Time", "State"], ["1", "Ujang", "21/11/2026 07:58", "C/In"], ["1", "Ujang", "21/11/2026 17:05", "C/Out"]]);
o = A.olahAbsen(s, k.data, k.map);
assert.deepEqual(o.hari.map((x) => [x.tanggal, x.masuk, x.pulang]), [["2026-11-21", "07:58", "17:05"]]);

// 3) Laporan Fingerspot (ada judul di atas, sel Excel berupa Date)
k = A.kenaliTabel([["Laporan Scan Log"], ["Periode 01-11-2026 s/d 21-11-2026"], [], ["Tanggal scan", "Tanggal", "Jam", "PIN", "NIP", "Nama"], [new Date(2026, 10, 21, 7, 58), new Date(2026, 10, 21), "07:58:12", "1", "", "Ujang"], [new Date(2026, 10, 21, 16, 59, 59, 950), new Date(2026, 10, 21), "17:00", 1, "", "Ujang"]]);
assert.equal(k.map.pin, 3);
o = A.olahAbsen(s, k.data, k.map);
assert.deepEqual(o.hari.map((x) => [x.tanggal, x.masuk, x.pulang]), [["2026-11-21", "07:58", "17:00"]]);

// 4) Rekap jam masuk / pulang per nama
k = A.kenaliTabel([["No", "Nama", "Tanggal", "Jam Masuk", "Jam Pulang"], ["1", "Ujang", "22-11-2026", "07:50", "16:00"], ["2", "Rina", "22-11-2026", "08:30", ""], ["3", "", "", "", ""]]);
o = A.olahAbsen(s, k.data, k.map);
assert.deepEqual(o.hari.map((x) => [x.nama, x.masuk, x.pulang, !!x.karyawanId]), [["Rina", "08:30", "", false], ["Ujang", "07:50", "16:00", true]]);

// Simpan: Rina jadi karyawan baru, PIN 7 dipetakan ke Siti (PIN-nya ikut tersimpan), izin manual dipertahankan
s = { ...s, ...A.catatAbsen(s, "2026-11-21", ujang.id, { status: "izin" }) };
const gabung = { hari: [...A.olahAbsen(s, A.kenaliTabel(dat.split("\n").map((l) => l.split("\t"))).data, A.kenaliTabel(dat.split("\n").map((l) => l.split("\t"))).map).hari, ...o.hari], belumKenal: [{ kunci: "p:7", pin: "7", nama: "", hari: 1 }, ...o.belumKenal] };
let sv = A.simpanImpor(s, gabung, { tambah: ["n:rina"], petakan: { "p:7": siti.id } });
let s2 = { ...s, ...sv.patch };
assert.equal(sv.dilewati, 1, "izin Ujang 21 Nov dipertahankan");
assert.equal(s2.absen["2026-11-21"][ujang.id].status, "izin");
assert.equal(s2.karyawan.find((x) => x.id === siti.id).pin, "7");
const rina = s2.karyawan.find((x) => x.nama === "Rina");
assert.deepEqual(s2.absen["2026-11-22"][rina.id], { status: "hadir", masuk: "08:30", sumber: "mesin" });
assert.equal(s2.absen["2026-11-21"][siti.id].masuk, "08:20");
sv = A.simpanImpor(s, gabung, { tambah: ["n:rina"], timpa: true });
assert.equal({ ...s, ...sv.patch }.absen["2026-11-21"][ujang.id].status, "hadir", "timpa");
// Impor ulang file yang sama nggak bikin dobel karyawan
const s3 = { ...s2, ...A.simpanImpor(s2, A.olahAbsen(s2, k.data, k.map), {}).patch };
assert.equal(s3.karyawan.filter((x) => x.nama === "Rina").length, 1);

console.log("absen OK");
