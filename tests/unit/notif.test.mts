import assert from "node:assert/strict";
import { dueNotifs, dueNotifsCabang, urlCabang, namaCabang, localNow, pphBulan, pajakTagihan, utangTagihan, kasbonTagihan, gajiTagihan, jadwalBesok } from "../../supabase/functions/racikin-push/notif.ts";

const doc = {
  calendar: { start: "2026-11-09", jadwal: [
    { hari_ke: 1, ide: "Kemarin", platform: "IG", jam: "19.00", done: false },
    { hari_ke: 7, ide: "Behind the scene goreng tahu", platform: "TikTok", jam: "18.00", done: false },
    { hari_ke: 7, ide: "Sudah", platform: "IG", jam: "12.00", done: true },
  ] },
  bahan: [
    { nama: "Tahu", tracked: true, stok: 10, min: 20 },
    { nama: "Kecap", tracked: true, stok: 5, min: 2 },
    { nama: "Cabai", tracked: false, stok: 0, min: 5 },
  ],
  loyalty: { target: 5 },
  pelanggan: [
    { nama: "Ani Rahma", kunjungan: 3, terakhir: "2026-10-01" },
    { nama: "Budi", kunjungan: 1, terakhir: "2026-11-10" },
    { nama: "Cici", kunjungan: 0, terakhir: "2026-01-01" },
  ],
  posHarian: { "2026-11-15": { order: 23, omzet: 345000, items: { "Tahu Guyur": 12, "Es Teh": 20 } } },
};
// 2026-11-15 = Minggu; 2026-11-16 = Senin. WIB = UTC+7.
const at = (iso: string) => new Date(iso);

assert.deepEqual(localNow(at("2026-11-15T01:30:00Z"), "Asia/Jakarta"), { tanggal: "2026-11-15", jam: 8, hari: 0 });
assert.equal(localNow(at("2026-11-15T01:30:00Z"), "Not/AZone").jam, 8); // zona tidak valid -> WIB

// Minggu jam 08.30 WIB, pemilik: konten + stok (ajak hanya Senin)
let d = dueNotifs(doc, { role: "owner", prefs: {}, tz: "Asia/Jakarta", now: at("2026-11-15T01:30:00Z"), sent: {} });
assert.deepEqual(d.map((n) => n.kind), ["konten", "stok"]);
assert.match(d[0].body, /Behind the scene/); assert.doesNotMatch(d[0].body, /Sudah|Kemarin/);
assert.equal(d[1].title, "1 bahan menipis"); assert.match(d[1].body, /^Tahu\./);
console.log(d);

// Sudah terkirim hari ini -> tidak diulang
d = dueNotifs(doc, { role: "owner", prefs: {}, tz: "Asia/Jakarta", now: at("2026-11-15T02:30:00Z"), sent: { konten: "2026-11-15", stok: "2026-11-15" } });
assert.equal(d.length, 0);
// Di luar jendela (jam 12) -> tidak ada
assert.equal(dueNotifs(doc, { role: "owner", prefs: {}, tz: "Asia/Jakarta", now: at("2026-11-15T05:00:00Z"), sent: {} }).length, 0);
// Malam jam 21.10 -> rekap
d = dueNotifs(doc, { role: "owner", prefs: {}, tz: "Asia/Jakarta", now: at("2026-11-15T14:10:00Z"), sent: {} });
assert.deepEqual(d.map((n) => n.kind), ["rekap"]); assert.equal(d[0].title, "Tutup kasir: Rp 345.000"); assert.match(d[0].body, /23 order · terlaris Es Teh \(20\)/);
// Kasir: tanpa konten/ajak
d = dueNotifs(doc, { role: "kasir", prefs: {}, tz: "Asia/Jakarta", now: at("2026-11-15T01:30:00Z"), sent: {} });
assert.deepEqual(d.map((n) => n.kind), ["stok"]);
// Senin pagi: ajak balik (Ani 46 hari), pref stok dimatikan, jam pagi 6
const senin = { ...doc, calendar: null };
d = dueNotifs(senin, { role: "manajer", prefs: { stok: false, pagi: 6 }, tz: "Asia/Jakarta", now: at("2026-11-15T23:15:00Z"), sent: {} });
assert.deepEqual(d.map((n) => n.kind), ["ajak"]); assert.match(d[0].body, /^Ani\./);
// Zona waktu lain (WITA, UTC+8): 08.30 WITA = 00.30Z
d = dueNotifs(doc, { role: "owner", prefs: {}, tz: "Asia/Makassar", now: at("2026-11-15T00:30:00Z"), sent: {} });
assert.deepEqual(d.map((n) => n.kind), ["konten", "stok"]);

// ---------- Tagihan & jadwal ----------
const tx = (tanggal: string, nominal: number, kategori = "Penjualan") => ({ tanggal, jenis: "masuk", kategori, nominal });
const uang = {
  transactions: [tx("2026-09-10", 450_000_000), tx("2026-10-05", 150_000_000), tx("2026-10-06", 9_999, "Lainnya")],
  pajak: { bayar: {} },
  supplier: [{ id: "s1", nama: "Pak Darto" }, { id: "s2", nama: "Toko Plastik" }],
  utangSupplier: [
    { id: "n1", supplierId: "s1", tanggal: "2026-11-01", tempo: "2026-11-12", total: 300000, bayar: [{ nominal: 100000 }] },
    { id: "n2", supplierId: "s2", tanggal: "2026-11-05", tempo: "2026-11-30", total: 50000, bayar: [] },
    { id: "n3", supplierId: "s2", tanggal: "2026-11-05", tempo: "2026-11-10", total: 80000, bayar: [{ nominal: 80000 }] },
  ],
  posSetting: { kasbon: true },
  pelanggan: [{ id: "p1", nama: "Joko Susilo" }, { id: "p2", nama: "Rina" }],
  kasbon: [
    { pelangganId: "p1", jenis: "utang", tanggal: "2026-10-20", nominal: 20000 },
    { pelangganId: "p1", jenis: "utang", tanggal: "2026-11-14", nominal: 15000 },
    { pelangganId: "p1", jenis: "bayar", tanggal: "2026-11-01", nominal: 20000 },
    { pelangganId: "p2", jenis: "utang", tanggal: "2026-10-01", nominal: 30000 },
  ],
  absenSetting: { aktif: true, hariRaya: "2027-03-10" },
  karyawan: [
    { id: "k1", nama: "Ujang", gaji: { nominal: 80000, periode: "mingguan" } },
    { id: "k2", nama: "Siti", gaji: { nominal: 2600000, periode: "bulanan" }, mulai: "2026-01-01" },
    { id: "k3", nama: "Baru", gaji: { nominal: 80000, periode: "mingguan" }, mulai: "2026-11-15" },
    { id: "k4", nama: "Tanpa gaji" },
  ],
  gajian: [{ karyawanId: "k1", dari: "2026-11-09", sampai: "2026-11-15" }],
  thr: [],
  jadwal: {
    shift: [{ id: "pagi", nama: "Pagi", mulai: "07:00", selesai: "15:00" }, { id: "x", nama: "Malam", mulai: "18:00", selesai: "02:00" }],
    hari: { "2026-11-17": { k1: "pagi", k2: "x", k3: "libur" } },
    akun: { "akun-u": "k1", "akun-b": "k3" },
  },
};
// PPh: Sept 450jt bebas, Okt kumulatif 600jt -> kena 100jt -> 500rb
assert.equal(pphBulan(uang, "2026-09"), 0);
assert.equal(pphBulan(uang, "2026-10"), 500000);
assert.equal(pphBulan({ ...uang, pajak: { bentuk: "ptp" } }, "2026-10"), 750000);
assert.equal(pphBulan({ ...uang, pajak: { bentuk: "lain" } }, "2026-10"), 0);
assert.equal(pajakTagihan(uang, "2026-11-09", 1), null, "belum tanggal 10");
assert.match(pajakTagihan(uang, "2026-11-10", 2)!.title, /Setor PPh Oktober 2026: Rp 500\.000/);
assert.equal(pajakTagihan(uang, "2026-11-18", 3), null, "lewat tempo: cuma Senin");
assert.match(pajakTagihan(uang, "2026-11-23", 1)!.title, /lewat jatuh tempo/);
assert.equal(pajakTagihan({ ...uang, pajak: { bayar: { "2026-10": { nominal: 500000 } } } }, "2026-11-10", 2), null, "sudah lunas");
// Utang: n1 sisa 200rb lewat tempo, n2 masih lama, n3 lunas
let u = utangTagihan(uang, "2026-11-16")!;
assert.match(u.title, /lewat tempo: Rp 200\.000/); assert.match(u.body, /^Pak Darto · 1 nota lewat tempo/);
u = utangTagihan(uang, "2026-11-28")!;
assert.match(u.body, /Pak Darto, Toko Plastik/);
assert.equal(utangTagihan({ ...uang, utangSupplier: [uang.utangSupplier[1]] }, "2026-11-20"), null, "tempo masih 10 hari");
// Kasbon: Senin 16 Nov -> Rina (sejak 1 Okt); Joko: utang 20 Okt sudah tertutup, sisa sejak 14 Nov (2 hari) -> nggak
const kb = kasbonTagihan(uang, "2026-11-16", 1)!;
assert.match(kb.title, /Kasbon Rp 30\.000/); assert.match(kb.body, /^Rina\./);
assert.equal(kasbonTagihan(uang, "2026-11-17", 2), null, "cuma Senin");
assert.equal(kasbonTagihan({ ...uang, posSetting: {} }, "2026-11-16", 1), null, "kasbon nonaktif");
// Gaji: 16 Nov -> minggu 9–15: Ujang sudah dibayar, Baru mulai 15 Nov (masuk periode), Siti bulanan (Okt selesai 31 Okt, > 3 hari) -> Baru
let g = gajiTagihan(uang, "2026-11-16")!;
assert.match(g.title, /1 karyawan/); assert.match(g.body, /Baru/); assert.doesNotMatch(g.body, /Ujang|Siti/);
g = gajiTagihan(uang, "2026-12-02")!; // bulan Nov selesai 30 Nov, Siti belum
assert.match(g.body, /Siti/);
assert.equal(gajiTagihan(uang, "2026-11-20"), null, "lewat 3 hari setelah periode");
g = gajiTagihan({ ...uang, gajian: [] }, "2027-02-26")!; // THR: batas 3 Mar
assert.match(g.body, /THR Ujang, Siti, Baru paling lambat 3 Mar/);
assert.equal(gajiTagihan({ ...uang, absenSetting: { aktif: false } }, "2026-11-16"), null);
// Jadwal besok (16 Nov malam -> 17 Nov)
assert.equal(jadwalBesok(uang, "2026-11-16", { role: "kasir", userId: "akun-u" })!.title, "Besok masuk Pagi 07:00–15:00");
assert.equal(jadwalBesok(uang, "2026-11-16", { role: "dapur", userId: "akun-b" })!.title, "Besok kamu libur");
assert.equal(jadwalBesok(uang, "2026-11-16", { role: "kasir", userId: "akun-lain" }), null, "kasir tanpa jadwal: nggak dikirim ringkasan");
const jo = jadwalBesok(uang, "2026-11-16", { role: "owner", userId: "pemilik" })!;
assert.equal(jo.title, "Besok masuk 2 orang"); assert.equal(jo.body, "Ujang (Pagi), Siti (Malam).");
assert.equal(jadwalBesok(uang, "2026-11-20", { role: "owner" }), null);
// Lewat dueNotifs: Selasa 10 Nov 08.10 WIB pemilik -> pajak + utang + gaji (Ujang minggu 2–8 Nov belum dibayar);
// kasir nggak dapat tagihan; malam -> jadwal besok
d = dueNotifs(uang, { role: "owner", prefs: {}, tz: "Asia/Jakarta", now: at("2026-11-10T01:10:00Z"), sent: {} });
assert.deepEqual(d.map((n) => n.kind), ["pajak", "utang", "gaji"]);
assert.match(d[2].body, /Ujang/);
d = dueNotifs(uang, { role: "owner", prefs: { pajak: false, gaji: false }, tz: "Asia/Jakarta", now: at("2026-11-10T01:10:00Z"), sent: {} });
assert.deepEqual(d.map((n) => n.kind), ["utang"]);
d = dueNotifs(uang, { role: "kasir", prefs: {}, tz: "Asia/Jakarta", now: at("2026-11-10T01:10:00Z"), sent: {}, userId: "akun-u" });
assert.deepEqual(d.map((n) => n.kind), []);
d = dueNotifs(uang, { role: "kasir", prefs: {}, tz: "Asia/Jakarta", now: at("2026-11-16T14:05:00Z"), sent: {}, userId: "akun-u" });
assert.deepEqual(d.map((n) => n.kind), ["jadwal"]);
d = dueNotifs(uang, { role: "dapur", prefs: {}, tz: "Asia/Jakarta", now: at("2026-11-16T14:05:00Z"), sent: {}, userId: "akun-b" });
assert.deepEqual(d.map((n) => [n.kind, n.title]), [["jadwal", "Besok kamu libur"]]);

console.log("notif OK");

// ---------- Multi-cabang: pengingat per cabang untuk pemilik ----------
{
  const pagi = at("2026-11-15T01:30:00Z"); // Minggu 08.30 WIB
  const dago = { bahan: [{ nama: "Keju", tracked: true, stok: 1, min: 10 }], posHarian: {} };
  const cab = [
    { id: "u1", nama: "TAHGUY", utama: true, doc },
    { id: "c2", nama: "Cabang Dago", utama: false, doc: dago },
    { id: "c3", nama: "Cabang Kosong", utama: false, doc: null },
  ];
  let c = dueNotifsCabang(cab, { role: "owner", prefs: {}, tz: "Asia/Jakarta", now: pagi, sent: {} });
  assert.deepEqual(c.map((n) => n.kind), ["konten", "stok", "stok@c2"]);
  assert.equal(c[1].title, "TAHGUY · 1 bahan menipis");
  assert.equal(c[2].title, "Cabang Dago · 1 bahan menipis");
  assert.match(c[2].body, /^Keju/);
  assert.equal(c[2].url, "#/stok?tab=bahan&cabang=c2");
  assert.equal(c[0].url, "#/konten?cabang=u1");
  // Penanda terkirim per cabang: stok utama sudah, stok Dago belum
  c = dueNotifsCabang(cab, { role: "owner", prefs: {}, tz: "Asia/Jakarta", now: pagi, sent: { konten: "2026-11-15", stok: "2026-11-15" } });
  assert.deepEqual(c.map((n) => n.kind), ["stok@c2"]);
  c = dueNotifsCabang(cab, { role: "owner", prefs: {}, tz: "Asia/Jakarta", now: pagi, sent: { konten: "2026-11-15", stok: "2026-11-15", "stok@c2": "2026-11-15" } });
  assert.equal(c.length, 0);
  // Penanda cabang lain nggak memblokir cabang utama
  c = dueNotifsCabang(cab, { role: "owner", prefs: {}, tz: "Asia/Jakarta", now: pagi, sent: { "stok@c2": "2026-11-15" } });
  assert.deepEqual(c.map((n) => n.kind), ["konten", "stok"]);
  // Satu cabang (utama) saja = sama persis seperti dueNotifs (judul tanpa nama cabang)
  assert.deepEqual(dueNotifsCabang([cab[0]], { role: "owner", prefs: {}, tz: "Asia/Jakarta", now: pagi, sent: {} }), dueNotifs(doc, { role: "owner", prefs: {}, tz: "Asia/Jakarta", now: pagi, sent: {} }));
  assert.equal(urlCabang("#/kasbon", "x y"), "#/kasbon?cabang=x%20y");
  assert.equal(namaCabang({ nama: "", utama: true }, { profile: { nama: "TAHGUY" } }), "TAHGUY");
  assert.equal(namaCabang({ nama: "", utama: false }, { profile: { cabang: "Dago", nama: "TAHGUY" } }), "Dago");
}
