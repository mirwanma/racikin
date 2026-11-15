import assert from "node:assert/strict";
import { dueNotifs, localNow } from "../../supabase/functions/racikin-push/notif.ts";

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
console.log("notif OK");
