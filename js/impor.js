// Pindahan data usaha yang sudah jalan: input menu & bahan cepat (dari teks / foto lewat AI) + saldo kas awal.
// Murni (tanpa UI). Parser lokal di sini dipakai Mode Demo (teks saja); AI Online pakai task parse_menu / parse_bahan.
import { uid } from "./store.js";
import { daftarSatuan, kataSatuan } from "./satuan.js";

const key = (n) => String(n || "").trim().toLowerCase().replace(/\s+/g, " ");
const round2 = (n) => Math.round(n * 100) / 100;

/** "15rb" / "15k" / "15.000" / "Rp 15,000" / "1,5jt" / "15" (papan warung: 15 = 15 ribu) -> 15000 */
export function angka(raw, { ribuan = false } = {}) {
  let s = String(raw || "").toLowerCase().replace(/rp\.?\s*/g, "").replace(/\s+/g, "");
  let mult = 1;
  if (/(jt|juta)$/.test(s)) [mult, s] = [1e6, s.replace(/(jt|juta)$/, "")];
  else if (/(rb|ribu|k)$/.test(s)) [mult, s] = [1e3, s.replace(/(rb|ribu|k)$/, "")];
  // Pemisah ribuan (15.000 / 15,000) vs desimal (1,5 / 2.5)
  if (/^\d{1,3}([.,]\d{3})+$/.test(s)) s = s.replace(/[.,]/g, "");
  else s = s.replace(",", ".");
  let n = parseFloat(s);
  if (!Number.isFinite(n)) return 0;
  n *= mult;
  if (ribuan && mult === 1 && n > 0 && n < 1000) n *= 1000;
  return Math.round(n);
}

const HARGA_RE = /(?:rp\.?\s*)?\d{1,3}(?:[.,]\d{3})+(?:\s*(?:rb|ribu|k))?|(?:rp\.?\s*)?\d+(?:[.,]\d+)?\s*(?:rb|ribu|k|jt|juta)\b|(?:rp\.?\s*)\d+|\b\d+\b/gi;
const MINUM = /\b(es|ice|teh|tea|kopi|coffee|jus|juice|jeruk|air|mineral|milo|susu|milk|soda|lemon|thai|latte|cappuccino|boba|wedang|sirup|drink|minum)/i;

const rapikanNama = (t) => {
  const s = t
    .replace(/^[\s\-–•*·>#\d.)]+(?=\D)/, "")
    .replace(/[\s:=\-–.@,|/]+$/, "")
    .replace(/\s+/g, " ")
    .trim();
  return s === s.toLowerCase() ? s.replace(/\b\p{L}/gu, (c) => c.toUpperCase()) : s;
};

/** Parser lokal daftar menu: satu menu per baris, harga di akhir/tengah baris. Baris tanpa angka & huruf besar = judul kategori. */
export function parseMenuLokal(text) {
  const out = [];
  let kategori = null;
  for (const raw of String(text || "").split(/\n|;/)) {
    const line = raw.trim();
    if (!line) continue;
    const harga = [...line.matchAll(HARGA_RE)].map((m) => ({ m: m[0], i: m.index }));
    const pakai = harga.length ? harga[harga.length - 1] : null;
    const nilai = pakai ? angka(pakai.m, { ribuan: true }) : 0;
    if (!pakai || nilai < 500) {
      // Judul kategori ("MAKANAN", "Minuman:") atau menu tanpa harga
      const judul = line.replace(/[:\-–=*#]/g, "").trim();
      if (/^(makan|food|menu|snack|camilan|jajan)/i.test(judul) && judul.split(" ").length <= 3) {
        kategori = "makanan";
        continue;
      }
      if (/^(minum|drink|beverage)/i.test(judul) && judul.split(" ").length <= 3) {
        kategori = "minuman";
        continue;
      }
      if (judul === judul.toUpperCase() && /[A-Z]/.test(judul) && judul.split(" ").length <= 3) continue;
    }
    let sisa = pakai ? line.slice(0, pakai.i) + " " + line.slice(pakai.i + pakai.m.length) : line;
    const catatan = (sisa.match(/\(([^)]*)\)/) || [])[1]?.trim() || "";
    sisa = sisa.replace(/\([^)]*\)/g, " ");
    const nama = rapikanNama(sisa);
    if (!nama || nama.length < 2) continue;
    out.push({ nama, harga: nilai >= 500 ? nilai : 0, kategori: kategori || (MINUM.test(nama) ? "minuman" : "makanan"), catatan });
  }
  return { menu: out };
}

// Satuan tertulis -> [satuan Racikin, faktor]
const UNIT = [
  [/^(kg|kilo|kilogram)$/, "gram", 1000],
  [/^(ons)$/, "gram", 100],
  [/^(g|gr|gram)$/, "gram", 1],
  [/^(l|lt|ltr|liter)$/, "ml", 1000],
  [/^(ml)$/, "ml", 1],
  [/^(lusin)$/, "pcs", 12],
  [/^(tray|rak)$/, "butir", 30],
  [/^(butir|btr)$/, "butir", 1],
  [/^(pcs|biji|bj|buah|bh|potong|ptg|cup|botol|btl|kaleng)$/, "pcs", 1],
  [/^(bks|bungkus|pak|pack|sachet|saset|dus|box)$/, "bungkus", 1],
  [/^(renceng|rencengan|renteng|rentengan)$/, "renceng", 1],
  [/^(ikat|iket)$/, "ikat", 1],
  [/^(lembar|lbr)$/, "lembar", 1],
  [/^(sdm)$/, "sdm", 1],
  [/^(porsi)$/, "porsi", 1],
];
const KATA_BAWAAN = "kg|kilogram|kilo|ons|gram|gr|g|liter|ltr|lt|l|ml|lusin|tray|rak|butir|btr|pcs|biji|bj|buah|bh|potong|ptg|cup|botol|btl|kaleng|bungkus|bks|pack|pak|sachet|saset|dus|box|rencengan|renceng|rentengan|renteng|ikat|iket|lembar|lbr|sdm|porsi".split("|");
const escRe = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** Pola "angka + satuan": kata bawaan (dengan konversi) + satuan & kata lain yang diatur admin (js/satuan.js). */
function polaSatuan() {
  const kata = [...new Set([...KATA_BAWAAN, ...kataSatuan().map(([k]) => k)])].sort((a, b) => b.length - a.length);
  return new RegExp(`(\\d+(?:[.,]\\d+)?)\\s*(${kata.map(escRe).join("|")})\\b`, "i");
}
/** Satuan Racikin & faktor untuk kata tertulis: konversi bawaan dulu (kg -> gram x1000), lalu daftar dari admin. */
function cariSatuan(kata) {
  const k = kata.toLowerCase();
  const u = UNIT.find(([re]) => re.test(k));
  if (u) return [u[1], u[2]];
  const c = kataSatuan().find(([x]) => x === k);
  return c ? [c[1], 1] : ["pcs", 1];
}

/** Parser lokal daftar bahan: "tahu 200 pcs @600", "cabai rawit 1 kg 80rb", "minyak 5 liter 90.000". */
export function parseBahanLokal(text) {
  const out = [];
  for (const raw of String(text || "").split(/\n|;/)) {
    const line = raw.trim();
    if (!line) continue;
    const q = line.match(polaSatuan());
    let satuan = "pcs";
    let stok = 0;
    let faktor = 1;
    let nama = line;
    let sisa = "";
    if (q) {
      [satuan, faktor] = cariSatuan(q[2]);
      stok = round2(parseFloat(q[1].replace(",", ".")) * faktor);
      nama = line.slice(0, q.index);
      sisa = line.slice(q.index + q[0].length);
    }
    // Harga: "@600" = per satuan tertulis; angka lain = total
    let harga = 0;
    const at = sisa.match(/@\s*((?:rp\.?\s*)?\d[\d.,]*\s*(?:rb|ribu|k)?)/i);
    if (at) harga = angka(at[1]) / faktor;
    else {
      const h = [...sisa.matchAll(HARGA_RE)].map((m) => angka(m[0])).filter((n) => n > 0);
      if (h.length && stok) harga = h[h.length - 1] / stok;
    }
    nama = rapikanNama(nama.replace(/[@:]/g, " "));
    if (!nama || nama.length < 2) continue;
    out.push({ nama, stok, satuan, harga_per_satuan: round2(harga) });
  }
  return { bahan: out };
}

// ---------- Review & simpan ----------

/** Baris review menu: tandai yang sudah ada (nama sama) -> default update harga kalau beda, lewati kalau sama. */
export function barisMenu(s, menu) {
  const seen = new Set();
  return (menu || [])
    .map((m) => ({ nama: String(m.nama || "").trim().slice(0, 60), harga: Math.max(0, Math.round(Number(m.harga) || 0)), kategori: m.kategori || "makanan", catatan: String(m.catatan || "").trim() }))
    .filter((m) => m.nama && !seen.has(key(m.nama)) && seen.add(key(m.nama)))
    .map((m) => {
      const ada = (s.resep || []).find((r) => key(r.nama) === key(m.nama));
      const aksi = !ada ? "baru" : m.harga && m.harga !== Number(ada.harga) ? "harga" : "lewati";
      return { ...m, adaId: ada?.id || null, hargaLama: ada ? Number(ada.harga) || 0 : null, aksi };
    });
}

/** Simpan menu: menu baru jadi resep (tanpa bahan dulu), menu lama cuma diperbarui harganya. */
export function simpanMenu(s, rows) {
  let resep = [...(s.resep || [])];
  let baru = 0;
  let ubah = 0;
  for (const r of rows) {
    if (r.aksi === "baru" && r.nama) {
      resep.push({ id: uid(), nama: r.nama, harga: Math.round(Number(r.harga) || 0), hasil: 1, items: [] });
      baru++;
    } else if (r.aksi === "harga" && r.adaId) {
      resep = resep.map((x) => (x.id === r.adaId ? { ...x, harga: Math.round(Number(r.harga) || 0) } : x));
      ubah++;
    }
  }
  return { patch: { resep }, baru, ubah };
}

const satuanValid = (x) => (daftarSatuan().includes(x) ? x : "pcs");

/** Baris review bahan: cocokkan nama dengan bahan yang sudah ada (pakai satuannya). */
export function barisBahan(s, bahan) {
  const seen = new Set();
  return (bahan || [])
    .map((b) => ({ nama: String(b.nama || "").trim().slice(0, 60), stok: Math.max(0, round2(Number(b.stok) || 0)), satuan: satuanValid(b.satuan), harga: Math.max(0, round2(Number(b.harga_per_satuan ?? b.harga) || 0)) }))
    .filter((b) => b.nama && !seen.has(key(b.nama)) && seen.add(key(b.nama)))
    .map((b) => {
      const ada = (s.bahan || []).find((x) => key(x.nama) === key(b.nama));
      return { ...b, satuan: ada ? ada.satuan : b.satuan, adaId: ada?.id || null, stokLama: ada?.tracked ? Number(ada.stok) || 0 : null, aksi: "simpan" };
    });
}

/**
 * Simpan bahan + stok awal. Stok dicatat sebagai hitung fisik (opname) supaya stok = total riwayat stok.
 * Bahan lama: stok diganti angka baru (selisihnya jadi opname), harga diperbarui kalau diisi.
 */
export function simpanBahan(s, rows, tanggal) {
  let bahan = [...(s.bahan || [])];
  const stokLog = [...(s.stokLog || [])];
  let baru = 0;
  let ubah = 0;
  for (const r of rows) {
    if (r.aksi !== "simpan" || !r.nama) continue;
    const stok = Math.max(0, round2(Number(r.stok) || 0));
    const harga = Math.max(0, round2(Number(r.harga) || 0));
    if (r.adaId) {
      const b = bahan.find((x) => x.id === r.adaId);
      if (!b) continue;
      const delta = round2(stok - (b.tracked ? Number(b.stok) || 0 : 0));
      if (delta) stokLog.push({ id: uid(), tanggal, bahanId: b.id, delta, alasan: "opname", catatan: "Stok awal (input cepat)" });
      bahan = bahan.map((x) => (x.id === b.id ? { ...x, stok, tracked: true, ...(harga ? { harga, estimasi: false } : {}) } : x));
      ubah++;
    } else {
      const id = uid();
      bahan.push({ id, nama: r.nama, satuan: satuanValid(r.satuan), harga, stok, min: 0, estimasi: false, tracked: true });
      if (stok) stokLog.push({ id: uid(), tanggal, bahanId: id, delta: stok, alasan: "opname", catatan: "Stok awal (input cepat)" });
      baru++;
    }
  }
  return { patch: { bahan, stokLog }, baru, ubah };
}

// ---------- Saldo kas ----------

/** Saldo sekarang = saldo awal + uang masuk − uang keluar sejak tanggal saldo awal (termasuk hari itu). */
export function saldoKas(s) {
  const a = s.kasAwal;
  if (!a) return null;
  let saldo = Number(a.nominal) || 0;
  for (const t of s.transactions || []) {
    if (t.tanggal < a.tanggal) continue;
    saldo += t.jenis === "masuk" ? Number(t.nominal) || 0 : -(Number(t.nominal) || 0);
  }
  return Math.round(saldo);
}
