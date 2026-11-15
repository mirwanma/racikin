import { mergeDocs } from "../../js/merge.js";
import assert from "node:assert/strict";
const base = { shifts: [{ id: "s1", modal: 200000, tutup: null, laci: [{ id: "a", jenis: "keluar", nominal: 10000 }] }] };
const local = structuredClone(base); local.shifts[0].laci.push({ id: "b", jenis: "keluar", nominal: 5000 });
const remote = structuredClone(base); remote.shifts[0].laci.push({ id: "c", jenis: "ambil", nominal: 300000 }); remote.shifts.push({ id: "s2", modal: 100000, tutup: null, laci: [] });
const m = mergeDocs(base, local, remote);
assert.deepEqual(m.shifts.map(s => s.id), ["s1", "s2"]);
assert.deepEqual(m.shifts[0].laci.map(l => l.id).sort(), ["a", "b", "c"]);
// tutup di satu HP, catat laci di HP lain
const l2 = structuredClone(base); l2.shifts[0].tutup = "2026-11-15T22:00"; l2.shifts[0].hasil = { selisih: 0 };
const r2 = structuredClone(base); r2.shifts[0].laci.push({ id: "d", jenis: "tambah", nominal: 50000 });
const m2 = mergeDocs(base, l2, r2);
assert.equal(m2.shifts[0].tutup, "2026-11-15T22:00"); assert.equal(m2.shifts[0].laci.length, 2);
console.log("merge shift OK");
