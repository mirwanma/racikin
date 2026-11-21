// Sinkron order lewat tabel pos_orders: gabung base + baris tarikan, order yang perlu dikirim, since berikutnya.
import assert from "node:assert/strict";
globalThis.localStorage = { getItem: () => null, setItem() {} };
const S = await import("../../js/ordersync.js");
const { mergeDocs } = await import("../../js/merge.js");

const o = (id, tanggal, extra = {}) => ({ id, tanggal, waktu: `${tanggal}T15:${id.slice(-2)}`, total: 10000, status: "selesai", ...extra });
const base = [o("a01", "2026-11-20"), o("a02", "2026-11-20"), o("lama", "2026-10-01")];

// Tarik: baris baru & perubahan (batal) masuk, order > 30 hari dibuang, urut waktu
const rows = [{ data: o("b03", "2026-11-21"), updated_at: "2026-11-21T08:00:00.5+00:00" }, { data: o("a02", "2026-11-20", { status: "batal" }), updated_at: "2026-11-21T08:01:00+00:00" }];
const remote = S.ordersDariPull(base, rows, "2026-11-21");
assert.deepEqual(remote.map((x) => [x.id, x.status]), [["a01", "selesai"], ["a02", "batal"], ["b03", "selesai"]]);
assert.deepEqual(S.ordersDariPull(null, rows, "2026-11-21").map((x) => x.id), ["a02", "b03"], "tarik penuh tanpa base");

// 3-way merge dokumen: lokal nambah order, HP lain membatalkan a02 -> dua-duanya masuk
const local = [...base.filter((x) => x.id !== "lama"), o("c04", "2026-11-21")];
const merged = mergeDocs({ orders: base }, { orders: local }, { orders: remote }).orders;
assert.deepEqual(merged.map((x) => [x.id, x.status]).sort(), [["a01", "selesai"], ["a02", "batal"], ["b03", "selesai"], ["c04", "selesai"]]);

// Kirim: cuma yang beda dari versi cloud
assert.deepEqual(S.ordersBerubah(merged, remote).map((x) => x.id), ["c04"]);
assert.deepEqual(S.ordersBerubah(remote, remote), []);
assert.deepEqual(S.ordersBerubah([o("a01", "2026-11-20", { total: 12000 })], remote).map((x) => x.id), ["a01"], "berubah isi");

// since: updated_at terbaru - 2 menit; kosong -> tetap since lama; pertama kali -> waktu server - 2 menit
assert.equal(S.sinceBaru(rows, null, "2026-11-21T09:00:00Z"), "2026-11-21T07:59:00.000Z");
assert.equal(S.sinceBaru([], "2026-11-21T07:00:00.000Z", "2026-11-21T09:00:00Z"), "2026-11-21T07:00:00.000Z");
assert.equal(S.sinceBaru([], null, "2026-11-21T09:00:00Z"), "2026-11-21T08:58:00.000Z");
assert.equal(S.sinceBaru([], null, null), null);

console.log("ordersync OK");
