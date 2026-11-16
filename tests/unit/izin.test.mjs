// Panduan perizinan: rekomendasi per jenis usaha, masa berlaku, pengingat, progres.
import assert from "node:assert/strict";
globalThis.localStorage = { getItem: () => null, setItem() {} };
const { IZIN, rekomendasi, ringkasIzin, berlakuSampai, konteksIzin } = await import("../../js/izin.js");
const { buatDataDummy } = await import("../../js/dummy.js");

const T = "2026-11-16";
const rel = (s) => Object.fromEntries(rekomendasi(s).map((z) => [z.id, z.relevan]));

// Semua izin punya isi lengkap & link resmi (https, domain .go.id)
for (const z of IZIN) {
  assert.ok(z.nama && z.singkat && z.biaya && z.lama, z.id);
  assert.ok(z.dokumen.length >= 3 && z.langkah.length >= 3, z.id);
  assert.match(z.link.url, /^https:\/\/[a-z.]+\.go\.id/, z.id);
}

// Warung makan siap saji (gerobak): NIB & halal wajib, PIRT belum perlu
const warung = { profile: { jenis: "Makanan berat", konsep: "Gerobak / booth", menu: "nasi goreng, es teh" }, resep: [] };
let r = rel(warung);
assert.equal(r.nib, "wajib");
assert.equal(r.halal, "wajib");
assert.equal(r.pirt, "belum");
assert.equal(rekomendasi(warung)[0].relevan, "wajib", "urut: wajib duluan");

// Frozen food dari rumah: PIRT disarankan
r = rel({ profile: { jenis: "Frozen food", konsep: "Online / dari rumah" }, resep: [] });
assert.equal(r.pirt, "disarankan");
// Dessert online dari rumah juga kemasan
assert.equal(rel({ profile: { jenis: "Dessert", konsep: "Online / dari rumah" }, resep: [] }).pirt, "disarankan");
// Dessert di kios: tidak
assert.equal(rel({ profile: { jenis: "Dessert", konsep: "Kios / ruko" }, resep: [] }).pirt, "belum");

// Katering: SLHS disarankan
assert.equal(rel({ profile: { jenis: "Katering", konsep: "Cloud kitchen" }, resep: [] }).slhs, "disarankan");

// Menu daging: alasan halal menyebut daging
const bakso = rekomendasi({ profile: { jenis: "Makanan berat" }, resep: [{ nama: "Bakso Urat" }] }).find((z) => z.id === "halal");
assert.match(bakso.alasan, /daging/);
const teh = rekomendasi({ profile: { jenis: "Minuman / kopi" }, resep: [{ nama: "Es Teh Manis" }] }).find((z) => z.id === "halal");
assert.doesNotMatch(teh.alasan, /daging/);

// Brand sudah ada: merek disarankan
assert.equal(rel({ profile: { nama: "Kopi Senja" }, resep: [] }).merek, "disarankan");
assert.equal(rel({ profile: {}, resep: [] }).merek, "opsional");

// Masa berlaku: otomatis dari terbit, atau manual
const pirt = IZIN.find((z) => z.id === "pirt");
const nib = IZIN.find((z) => z.id === "nib");
assert.equal(berlakuSampai(pirt, { terbit: "2022-01-10" }), "2027-01-10");
assert.equal(berlakuSampai(pirt, { terbit: "2022-01-10", berlaku: "2026-12-31" }), "2026-12-31");
assert.equal(berlakuSampai(nib, { terbit: "2022-01-10" }), null, "NIB tanpa masa berlaku");
assert.equal(berlakuSampai(pirt, {}), null);

// Ringkasan & pengingat
const s = {
  profile: { jenis: "Frozen food", konsep: "Online / dari rumah", nama: "Dimsum Mama" },
  resep: [],
  izin: {
    nib: { status: "selesai", terbit: "2024-01-01" },
    pirt: { status: "selesai", terbit: "2021-12-20" }, // habis 2026-12-20 -> 34 hari lagi
    halal: { status: "proses" },
    slhs: { status: "selesai", berlaku: "2026-11-01" }, // sudah habis
    merek: { status: "selesai", terbit: "2020-01-01" }, // habis 2030 -> tidak diingatkan
  },
};
const g = ringkasIzin(s, T);
// wajib/disarankan: nib, halal, pirt, merek (slhs opsional untuk non-katering)
assert.equal(g.total, 4);
assert.equal(g.selesai, 3);
assert.equal(g.proses, 1);
assert.equal(g.berikut.id, "halal");
assert.deepEqual(g.pengingat.map((p) => [p.id, p.sisa]), [["slhs", -15], ["pirt", 34]]);

// Kosong
const k = ringkasIzin({ profile: { jenis: "Makanan berat" }, resep: [] }, T);
assert.equal(k.selesai, 0);
assert.equal(k.berikut.id, "nib");
assert.deepEqual(k.pengingat, []);

// Konteks mentor
const kt = konteksIzin(s);
assert.equal(kt.length, IZIN.length);
assert.ok(kt.some((x) => x.izin.startsWith("Sertifikat Halal") && x.status === "Lagi diurus"));

// Data contoh tidak error
const d = buatDataDummy({ today: T });
assert.equal(rekomendasi(d).length, IZIN.length);
assert.equal(ringkasIzin(d, T).selesai, 0);

console.log("izin: semua tes lulus");
