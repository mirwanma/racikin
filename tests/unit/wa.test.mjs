// Integrasi WhatsApp (wa.me): baca chat order, teks menu, link pesan, broadcast pelanggan, ringkasan untuk pemilik.
import assert from "node:assert/strict";
globalThis.localStorage = { getItem: () => null, setItem() {} };
globalThis.location = { origin: "https://racikin.vercel.app", pathname: "/" };
const W = await import("../../js/wa.js");
const { buatDataDummy } = await import("../../js/dummy.js");

const T = "2026-11-16";
const s = buatDataDummy({ today: T });
const nama = (r) => r.items.map((i) => `${i.qty}× ${i.nama}`);

// --- baca chat order (menu data contoh: banyak "Tahu Guyur ...") ---
let r = W.bacaChatOrder("kak pesen tahu guyur bakso 2, es teh 1, atas nama Budi, ambil jam 5 ya", s.resep);
assert.deepEqual(nama(r), ["2× Tahu Guyur Bakso", "1× Es Teh Manis"]);
assert.equal(r.atasNama, "Budi");
assert.equal(r.catatan, "ambil jam 5 ya");
assert.deepEqual(r.sisa, []);
r = W.bacaChatOrder("Halo min\n2x komplit\n1 es jeruk\n3 air mineral\npedes level 3\nnama: Sinta", s.resep);
assert.deepEqual(nama(r), ["2× Tahu Guyur Komplit", "1× Es Jeruk Peras", "3× Air Mineral"]);
assert.equal(r.catatan, "pedes level 3"); // "level" tidak dianggap menu "Pedas Level"
assert.equal(r.atasNama, "Sinta");
r = W.bacaChatOrder("mau tahu crispy dua sama teh susu gula aren satu dong. an Rina", s.resep);
assert.deepEqual(nama(r), ["2× Tahu Crispy Sambal Matah", "1× Es Teh Susu Gula Aren"]);
assert.equal(r.atasNama, "Rina");
assert.deepEqual(r.sisa, []);
r = W.bacaChatOrder("pesan original 1 + walik 2, tanpa bawang", s.resep);
assert.deepEqual(nama(r), ["1× Tahu Guyur Original", "2× Tahu Walik Aci"]);
r = W.bacaChatOrder("cireng 4 kak\ncireng 1 lagi", s.resep);
assert.deepEqual(nama(r), ["5× Cireng Isi Ayam Suwir"]); // menu sama digabung
r = W.bacaChatOrder("martabak manis 2", s.resep);
assert.deepEqual(r.items, []);
assert.deepEqual(r.sisa, ["martabak manis 2"]);
r = W.bacaChatOrder("bakso tahu kuah 2 jam 7 malam", s.resep); // "jam 7" bukan jumlah
assert.deepEqual(nama(r), ["2× Bakso Tahu Kuah"]);

// --- link & teks ---
assert.equal(W.linkWa("0812-3456-7890", "halo kak"), "https://wa.me/6281234567890?text=halo%20kak");
assert.equal(W.linkWa("", "hai"), "https://wa.me/?text=hai");
const s2 = { ...s, wa: { usaha: "081234567890", pemilik: "6289900001111" } };
assert.equal(W.nomorUsaha(s2), "081234567890");
assert.match(W.linkPesan(s2), /^https:\/\/wa\.me\/6281234567890\?text=Halo%20TAHGUY/);
assert.equal(W.linkPesan({ ...s, wa: null, studio: null }), "");
const menu = W.teksMenu(s2, { tanggal: T });
assert.match(menu, /\*TAHGUY\*/);
assert.match(menu, /- Tahu Guyur Original Rp12\.000 \(level pedas, topping tambahan\)/);
assert.match(menu, /\*PROMO HARI INI\*\n- Happy hour sore/); // 16 Nov 2026 = Senin
assert.doesNotMatch(menu, /TAHGUY5/); // kode voucher tidak diumumkan
assert.match(menu, /Pesan langsung: https:\/\/wa\.me\/6281234567890/);

// --- broadcast ---
const semua = W.pelangganSegmen(s, "semua", T);
assert.equal(semua.list.length + semua.tanpaWa, s.pelanggan.length);
assert.ok(semua.list.every((p) => p.wa));
const lama = W.pelangganSegmen(s, "lama", T).list;
assert.ok(lama.length > 0 && lama.length < semua.list.length);
const tpl = W.templateBroadcast(s, T);
assert.match(tpl, /Happy hour sore/);
const p = semua.list[0];
const isi = W.pesanUntuk(s, tpl, p);
assert.ok(isi.startsWith(`Halo ${p.nama.split(" ")[0]}!`));
assert.doesNotMatch(isi, /\{|\}/);

// --- ringkasan untuk pemilik ---
const kemarin = "2026-11-15";
const rekap = W.teksRekapHari(s, kemarin);
assert.match(rekap, /^\*Rekap TAHGUY\* · 2026-11-15\nOmzet Rp[\d.]+ · \d+ order/);
assert.match(rekap, /Terlaris: /);
const sh = s.shifts.find((x) => x.tutup && x.hasil);
const ts = W.teksShift(s, sh);
assert.match(ts, /^\*Tutup shift TAHGUY\*/);
assert.match(ts, /Seharusnya di laci Rp/);
assert.match(ts, /selisih (pas|[+-]Rp)/);

console.log("wa OK");
