// Gaji karyawan: periode mingguan/bulanan, skema harian & bulanan (potong alpa/izin), uang makan, bonus,
// kasbon karyawan (pinjam -> Kas keluar, potong saat gajian), Kas & laba rugi, batal, pengingat, slip.
import assert from "node:assert/strict";
globalThis.localStorage = { getItem: () => null, setItem() {} };
const G = await import("../../js/gaji.js");
const A = await import("../../js/absen.js");
const { labaRugi } = await import("../../js/laporan.js");

// Periode
assert.deepEqual(G.periodeDi("mingguan", "2026-11-20"), { dari: "2026-11-16", sampai: "2026-11-22" }, "Jumat -> Senin–Minggu");
assert.deepEqual(G.periodeDi("mingguan", "2026-11-16"), { dari: "2026-11-16", sampai: "2026-11-22" });
assert.deepEqual(G.periodeDi("mingguan", "2026-11-22"), { dari: "2026-11-16", sampai: "2026-11-22" });
assert.deepEqual(G.periodeLalu("mingguan", "2026-11-20"), { dari: "2026-11-09", sampai: "2026-11-15" });
assert.deepEqual(G.periodeDi("bulanan", "2026-02-10"), { dari: "2026-02-01", sampai: "2026-02-28" });
assert.deepEqual(G.periodeLalu("bulanan", "2027-01-05"), { dari: "2026-12-01", sampai: "2026-12-31" });

let s = { karyawan: [], absen: {}, shifts: [], transactions: [], gajian: [], kasbonKaryawan: [], absenSetting: { aktif: true } };
s = { ...s, karyawan: A.simpanKaryawan(s, { nama: "Ujang", gaji: { skema: "harian", nominal: 80000, makan: 10000, periode: "mingguan" } }).karyawan };
s = { ...s, karyawan: A.simpanKaryawan(s, { nama: "Siti", gaji: { skema: "bulanan", nominal: 2600000, periode: "bulanan", potong: true, hariKerja: 26 } }).karyawan };
const [ujang, siti] = s.karyawan;
assert.equal(ujang.gaji.nominal, 80000, "gaji ikut tersimpan");
// edit tanpa field gaji -> gaji lama tetap
s = { ...s, karyawan: A.simpanKaryawan(s, { id: ujang.id, nama: "Ujang", pin: "1" }).karyawan };
assert.equal(s.karyawan[0].gaji.nominal, 80000);

// Absen minggu 9–15 Nov: Ujang hadir 5, izin 1, libur 1
const set = (t, id, st) => (s = { ...s, ...A.catatAbsen(s, t, id, { status: st }) });
["2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13"].forEach((t) => set(t, ujang.id, "hadir"));
set("2026-11-14", ujang.id, "izin");
set("2026-11-15", ujang.id, "libur");
let h = G.hitungGaji(s, s.karyawan[0], "2026-11-09", "2026-11-15", { bonus: 25000 });
assert.deepEqual([h.hadir, h.pokok, h.makan, h.bonus, h.kotor], [5, 400000, 50000, 25000, 475000]);

// Siti bulanan Oktober: alpa 1 + izin 1 + sakit 1 -> potong 2 × 100rb
set("2026-10-05", siti.id, "alpa");
set("2026-10-06", siti.id, "izin");
set("2026-10-07", siti.id, "sakit");
h = G.hitungGaji(s, siti, "2026-10-01", "2026-10-31");
assert.deepEqual([h.pokok, h.perHari, h.potongAbsen, h.kotor], [2600000, 100000, 200000, 2400000]);
assert.equal(G.hitungGaji(s, { ...siti, gaji: { ...siti.gaji, potong: false } }, "2026-10-01", "2026-10-31").kotor, 2600000);
// Bulanan dibayar mingguan: proporsional
assert.equal(G.hitungGaji(s, { ...siti, gaji: { ...siti.gaji, periode: "mingguan", potong: false } }, "2026-11-09", "2026-11-15").pokok, Math.round((2600000 * 7) / 30));

// Kasbon karyawan
assert.throws(() => G.pinjamKasbon(s, ujang.id, { nominal: 0, tanggal: "2026-11-10" }), /jumlah/);
s = { ...s, ...G.pinjamKasbon(s, ujang.id, { nominal: 150000, tanggal: "2026-11-10", catatan: "bayar kos" }) };
assert.equal(G.saldoKasbonKaryawan(s, ujang.id), 150000);
assert.deepEqual(s.transactions.map((t) => [t.jenis, t.kategori, t.nominal]), [["keluar", "Kasbon karyawan", 150000]]);

// Bayar gaji Ujang: potong kasbon 100rb (diminta 999rb -> dibatasi sisa kasbon)
let r = G.bayarGaji(s, ujang.id, { dari: "2026-11-09", sampai: "2026-11-15", bonus: 25000, potongKasbon: 100000, tanggal: "2026-11-16", metode: "transfer" });
s = { ...s, gajian: r.gajian, kasbonKaryawan: r.kasbonKaryawan, transactions: r.transactions };
assert.deepEqual([r.entri.kotor, r.entri.potongKasbon, r.entri.bersih], [475000, 100000, 375000]);
assert.equal(G.saldoKasbonKaryawan(s, ujang.id), 50000);
assert.throws(() => G.bayarGaji(s, ujang.id, { dari: "2026-11-09", sampai: "2026-11-15", tanggal: "2026-11-16" }), /sudah dibayar/);
const kasNov = s.transactions.filter((t) => t.tanggal.startsWith("2026-11"));
const net = kasNov.reduce((a, t) => a + (t.jenis === "masuk" ? t.nominal : -t.nominal), 0);
assert.equal(net, -150000 - 375000, "uang keluar = kasbon + gaji bersih");
const lr = labaRugi(s, "2026-11", "belanja");
assert.deepEqual(lr.biayaKat, [["Gaji", 475000]], "biaya gaji = kotor, kasbon karyawan bukan biaya");
assert.equal(lr.biaya, 475000);
assert.equal(lr.lain, 0, "potong kasbon bukan pendapatan");

const slip = G.teksSlip(s.karyawan[0], r.entri, "Warung X", (n) => `Rp${n}`);
assert.match(slip, /Gaji harian 5 × Rp80000 = Rp400000/);
assert.match(slip, /Potong kasbon -Rp100000/);
assert.match(slip, /\*Diterima Rp375000\*/);

// Batal gajian -> Kas & potongan hilang
const sB = { ...s, ...G.batalGajian(s, r.entri.id) };
assert.equal(G.saldoKasbonKaryawan(sB, ujang.id), 150000);
assert.equal(sB.transactions.length, 1);
assert.equal(sB.gajian.length, 0);
// Hapus pinjam
const pid = s.kasbonKaryawan.find((x) => x.jenis === "pinjam").id;
assert.equal(G.hapusPinjam(sB, pid).transactions.length, 0);

// Pengingat: Siti (bulanan) Oktober belum dibayar pada 5 Nov; Ujang minggu 9–15 sudah dibayar pada 20 Nov
let b = G.belumGajian(s, "2026-11-05");
assert.deepEqual(b.map((x) => [x.k.nama, x.dari, x.kotor]), [["Siti", "2026-10-01", 2400000]]);
b = G.belumGajian(s, "2026-11-20");
assert.ok(!b.some((x) => x.k.nama === "Ujang"), "Ujang minggu lalu sudah dibayar");
// Karyawan baru mulai setelah periode -> nggak diingatkan
const s2 = { ...s, karyawan: s.karyawan.map((k) => (k.id === siti.id ? { ...k, mulai: "2026-11-01" } : k)) };
assert.ok(!G.belumGajian(s2, "2026-11-05").length);

// ---------- Lembur ----------
const kHarian = { id: "h", nama: "H", gaji: { skema: "harian", nominal: 100000, lembur: "tetap", tarifLembur: 15000 } };
assert.deepEqual(G.lemburHari(kHarian, 8 * 60 + 59, 8), { jam: 0, rp: 0 }, "belum 1 jam penuh");
assert.deepEqual(G.lemburHari(kHarian, 10 * 60 + 30, 8), { jam: 2, rp: 30000 });
assert.deepEqual(G.lemburHari(kHarian, 15 * 60, 8), { jam: 4, rp: 60000 }, "maks 4 jam/hari");
assert.deepEqual(G.lemburHari({ ...kHarian, gaji: { ...kHarian.gaji, lembur: "tidak" } }, 12 * 60, 8), { jam: 0, rp: 0 });
const kDep = { id: "d", nama: "D", gaji: { skema: "bulanan", nominal: 3460000, lembur: "depnaker" } };
assert.equal(G.upahBulanan(kDep), 3460000);
assert.equal(G.upahBulanan(kHarian), 2600000, "harian × 26");
assert.deepEqual(G.lemburHari(kDep, 11 * 60, 8), { jam: 3, rp: Math.round(1.5 * 20000 + 2 * 2 * 20000) }, "1/173 = 20rb: 1,5× + 2× + 2×");

// Lembur masuk ke gaji dari jam masuk-pulang di absen (jam kerja normal dari setelan)
let sl = { karyawan: [], absen: {}, shifts: [], gajian: [], kasbonKaryawan: [], absenSetting: { aktif: true, jamKerja: 8 } };
sl = { ...sl, karyawan: A.simpanKaryawan(sl, { nama: "Budi", gaji: { skema: "harian", nominal: 80000, periode: "mingguan", lembur: "tetap", tarifLembur: 10000 } }).karyawan };
const budi = sl.karyawan[0];
sl = { ...sl, ...A.catatAbsen(sl, "2026-11-09", budi.id, { status: "hadir", masuk: "08:00", pulang: "19:10" }) }; // 11j10m -> 3 jam
sl = { ...sl, ...A.catatAbsen(sl, "2026-11-10", budi.id, { status: "hadir", masuk: "08:00", pulang: "16:00" }) };
sl = { ...sl, ...A.catatAbsen(sl, "2026-11-11", budi.id, { status: "hadir", masuk: "08:00" }) }; // tanpa jam pulang
let hl = G.hitungGaji(sl, budi, "2026-11-09", "2026-11-15");
assert.deepEqual([hl.hadir, hl.lemburJam, hl.lembur, hl.kotor], [3, 3, 30000, 270000]);
assert.deepEqual(hl.lemburHari, [{ tanggal: "2026-11-09", jam: 3, rp: 30000 }]);
const rl = G.bayarGaji(sl, budi.id, { dari: "2026-11-09", sampai: "2026-11-15", tanggal: "2026-11-16" });
assert.deepEqual([rl.entri.rincian.lemburJam, rl.entri.rincian.lembur], [3, 30000]);
assert.match(G.teksSlip(budi, rl.entri, "W", (n) => `Rp${n}`), /Lembur 3 jam Rp30000/);
sl = { ...sl, absenSetting: { ...sl.absenSetting, jamKerja: 10 } };
assert.equal(G.hitungGaji(sl, budi, "2026-11-09", "2026-11-15").lemburJam, 1, "jam kerja normal 10 jam");

// ---------- THR ----------
assert.equal(G.masaKerja(null, "2027-03-10"), null);
assert.equal(G.masaKerja("2026-03-10", "2027-03-10"), 12);
assert.equal(G.masaKerja("2026-03-11", "2027-03-10"), 11);
assert.equal(G.masaKerja("2027-02-15", "2027-03-10"), 0);
assert.equal(G.batasThr("2027-03-10"), "2027-03-03");
const hr = "2027-03-10";
let st = { karyawan: [
  { id: "a", nama: "Lama", mulai: "2025-01-01", gaji: { skema: "bulanan", nominal: 2400000 } },
  { id: "b", nama: "Baru", mulai: "2026-09-10", gaji: { skema: "bulanan", nominal: 2400000 } },
  { id: "c", nama: "Harian", mulai: "2026-01-01", gaji: { skema: "harian", nominal: 80000 } },
  { id: "d", nama: "Kemarin", mulai: "2027-03-01", gaji: { skema: "bulanan", nominal: 2400000 } },
  { id: "e", nama: "TanpaTgl", gaji: { skema: "bulanan", nominal: 2400000 } },
], gajian: [
  { karyawanId: "c", dari: "2027-01-01", sampai: "2027-01-31", rincian: { pokok: 2000000, potongAbsen: 0 } },
  { karyawanId: "c", dari: "2027-02-01", sampai: "2027-02-07", rincian: { pokok: 500000, potongAbsen: 0 } },
  { karyawanId: "c", dari: "2027-02-08", sampai: "2027-02-28", rincian: { pokok: 1700000, potongAbsen: 0 } },
], thr: [], transactions: [], absenSetting: { aktif: true, hariRaya: hr } };
const thr = (id) => G.hitungThr(st, st.karyawan.find((k) => k.id === id), hr);
assert.equal(thr("a").nominal, 2400000, "≥ 12 bulan: 1 bulan upah");
assert.deepEqual([thr("b").masa, thr("b").nominal], [6, 1200000], "6/12 × upah");
assert.deepEqual([thr("c").upah, thr("c").estimasi, thr("c").nominal, thr("c").kurang], [2100000, false, 2100000, true], "harian: rata-rata (2jt + 2,2jt) / 2, data baru 2 bulan");
assert.equal(thr("a").kurang, false);
assert.equal(thr("d").nominal, 0, "belum sebulan");
assert.equal(thr("e").masa, null);
// Harian tanpa riwayat gaji -> perkiraan nominal × 26
assert.deepEqual([G.upahThr({ gajian: [] }, st.karyawan[2], hr).upah, G.upahThr({ gajian: [] }, st.karyawan[2], hr).estimasi], [2080000, true]);
// Pengingat
assert.equal(G.pengingatThr(st, "2027-01-01"), null, "lebih dari 30 hari lagi");
let pg = G.pengingatThr(st, "2027-02-20");
assert.deepEqual([pg.batas, pg.telat, pg.list.map((x) => x.k.id).sort().join(""), pg.total], ["2027-03-03", false, "abce", 5700000]);
assert.equal(G.pengingatThr(st, "2027-03-05").telat, true);
// Bayar & batal
const bt = G.bayarThr(st, "b", { hariRaya: hr, nominal: 1200000, tanggal: "2027-03-01" });
st = { ...st, thr: bt.thr, transactions: bt.transactions };
assert.deepEqual(st.transactions.map((t) => [t.kategori, t.nominal, t.ref]), [["THR", 1200000, "gaji"]]);
assert.throws(() => G.bayarThr(st, "b", { hariRaya: hr, nominal: 1, tanggal: "2027-03-01" }), /sudah dibayar/);
assert.ok(!G.pengingatThr(st, "2027-02-20").list.some((x) => x.k.id === "b"));
const sbt = { ...st, ...G.batalThr(st, bt.entri.id) };
assert.deepEqual([sbt.thr.length, sbt.transactions.length], [0, 0]);
// Rekap CSV
const csv = G.rekapGajiCsv({ ...s, thr: st.thr, karyawan: [...s.karyawan, ...st.karyawan] });
assert.equal(csv[0][0], "Tanggal bayar");
assert.ok(csv.some((r) => r[2] === "Gaji" && r[1] === "Ujang" && r[14] === s.gajian[0].kotor && r[16] === s.gajian[0].bersih), "baris gaji: total & diterima");
assert.ok(csv.some((r) => r[2] === "THR" && r[16] === 1200000));

// ---------- Siapa boleh atur gaji & lembur ----------
assert.equal(G.bolehAturGaji({}, "owner"), true);
assert.equal(G.bolehAturGaji({}, "manajer"), false, "default: manajer nggak boleh");
assert.equal(G.bolehAturGaji({ absenSetting: { manajerAturGaji: true } }, "manajer"), true);
assert.equal(G.bolehAturGaji({ absenSetting: { manajerAturGaji: true } }, "kasir"), false);

console.log("gaji OK");
