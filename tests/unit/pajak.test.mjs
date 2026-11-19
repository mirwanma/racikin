// Pajak UMKM: PPh Final 0,5%, bebas Rp500 juta (orang pribadi), jatuh tempo, status, catat bayar ke Kas.
import assert from "node:assert/strict";
globalThis.localStorage = { getItem: () => null, setItem() {} };
const P = await import("../../js/pajak.js");

const tx = (tanggal, nominal, kategori = "Penjualan", jenis = "masuk") => ({ id: tanggal + nominal + kategori, tanggal, jenis, kategori, nominal });
const s = {
  transactions: [
    tx("2026-01-10", 200_000_000),
    tx("2026-02-03", 100_000_000, "Pre-order"),
    tx("2026-03-05", 300_000_000),
    tx("2026-03-06", 50_000_000, "Lainnya"), // bukan omzet usaha
    tx("2026-03-07", 9_000_000, "Bahan Baku", "keluar"),
    tx("2026-04-01", 100_000_000, "Katering/pesanan"),
    tx("2025-12-30", 999_000_000), // tahun lain
  ],
};

// Jatuh tempo
assert.equal(P.jatuhTempo("2026-03"), "2026-04-15");
assert.equal(P.jatuhTempo("2026-12"), "2027-01-15");

// Orang pribadi: 500jt pertama bebas
let h = P.hitungPajak(s, 2026, "2026-05-20");
const by = Object.fromEntries(h.bulan.map((b) => [b.ym, b]));
assert.equal(h.omzet, 700_000_000);
assert.equal(by["2026-01"].pph, 0);
assert.equal(by["2026-01"].status, "nol");
assert.equal(by["2026-03"].dpp, 100_000_000, "Maret: cuma bagian yang lewat 500jt");
assert.equal(by["2026-03"].pph, 500_000);
assert.equal(by["2026-04"].dpp, 100_000_000);
assert.equal(h.pph, 1_000_000);
assert.equal(h.sisaBebas, 0);
assert.equal(by["2026-03"].status, "telat", "lewat 15 April");
assert.equal(by["2026-04"].status, "telat", "tempo 15 Mei sudah lewat");
assert.equal(by["2026-05"].status, "berjalan");
assert.equal(by["2026-06"].status, "nanti");
assert.equal(by["2026-02"].status, "nol");
assert.equal(h.total.belum, 1_000_000);

// Sebelum jatuh tempo April -> "belum"; pengingat ambil bulan tertua
h = P.hitungPajak(s, 2026, "2026-05-10");
assert.equal(h.bulan[3].status, "belum");
assert.deepEqual(P.tagihanPajak(s, "2026-05-10"), { ym: "2026-03", pph: 500_000, tempo: "2026-04-15", telat: true });

// Catat bayar -> lunas + Kas keluar kategori Pajak (id tetap, nggak dobel)
let s2 = { ...s, ...P.catatBayar(s, "2026-03", { tanggal: "2026-05-10", nominal: "500000", ntpn: " ABCD1234 " }) };
s2 = { ...s2, ...P.catatBayar(s2, "2026-03", { tanggal: "2026-05-11", nominal: 510000, ntpn: "ABCD1234" }) };
const kas = s2.transactions.filter((t) => t.ref === "pajak");
assert.equal(kas.length, 1);
assert.deepEqual([kas[0].jenis, kas[0].kategori, kas[0].nominal, kas[0].tanggal], ["keluar", "Pajak", 510000, "2026-05-11"]);
assert.equal(s2.pajak.bayar["2026-03"].ntpn, "ABCD1234");
h = P.hitungPajak(s2, 2026, "2026-05-10");
assert.equal(h.bulan[2].status, "lunas");
assert.equal(h.total.lunas, 510000);
assert.equal(h.omzet, 700_000_000, "bayar pajak bukan omzet");
assert.equal(P.tagihanPajak(s2, "2026-05-10").ym, "2026-04");
assert.throws(() => P.catatBayar(s, "2026-03", { tanggal: "2026-05-10", nominal: 0 }), /jumlah/);

// Tanpa catat Kas
const s3 = { ...s, ...P.catatBayar(s, "2026-04", { tanggal: "2026-05-10", nominal: 500000, catatKas: false }) };
assert.equal(s3.transactions.length, s.transactions.length);
assert.equal(P.hitungPajak(s3, 2026, "2026-05-10").bulan[3].status, "lunas");

// Batal
const s4 = { ...s2, ...P.batalBayar(s2, "2026-03") };
assert.equal(s4.transactions.some((t) => t.ref === "pajak"), false);
assert.equal(P.hitungPajak(s4, 2026, "2026-05-10").bulan[2].status, "telat");

// PT perorangan: semua omzet kena, nggak ada bebas 500jt
h = P.hitungPajak({ ...s, pajak: { bentuk: "ptp" } }, 2026, "2026-05-20");
assert.equal(h.pph, 3_500_000);
assert.equal(h.bulan[0].pph, 1_000_000);
assert.equal(h.sisaBebas, 0);

// CV / PT biasa: di luar PPh Final
h = P.hitungPajak({ ...s, pajak: { bentuk: "lain" } }, 2026, "2026-05-20");
assert.equal(h.umum, true);
assert.equal(h.pph, 0);
assert.equal(P.tagihanPajak({ ...s, pajak: { bentuk: "lain" } }, "2026-05-20"), null);

// Bentuk nggak dikenal -> orang pribadi; batas omzet 4,8 M
assert.equal(P.bentukDari({ pajak: { bentuk: "x" } }), "op");
assert.equal(P.hitungPajak({ transactions: [tx("2026-01-02", 5_000_000_000)] }, 2026, "2026-02-01").lewatBatas, true);

// Januari: tagihan Desember tahun lalu ikut diingatkan
const sDes = { transactions: [tx("2025-12-05", 600_000_000)] };
assert.deepEqual(P.tagihanPajak(sDes, "2026-01-08"), { ym: "2025-12", pph: 500_000, tempo: "2026-01-15", telat: false });

// Rekap SPT
const teks = P.teksSpt(P.hitungPajak(s2, 2026, "2026-05-10"), (n) => `Rp${n}`);
assert.match(teks, /Maret 2026: omzet Rp300000000 · PPh Rp500000 · NTPN ABCD1234/);
assert.match(teks, /Total omzet: Rp700000000 · Total PPh: Rp1000000/);
assert.equal(P.namaBulan("2026-11"), "November 2026");

console.log("pajak OK");
