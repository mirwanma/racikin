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

console.log("gaji OK");
