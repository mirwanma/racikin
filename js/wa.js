// Integrasi WhatsApp lewat link wa.me (gratis, tanpa akun API): pesan dikirim dari WA di HP masing-masing.
// Murni (tanpa UI): baca chat order, teks menu, link "Pesan via WA", broadcast pelanggan, ringkasan untuk pemilik.
import { normWa, program, siapTukar, perluDiajak, isiPesan, cardUrl } from "./loyalty.js";
import { hargaDi } from "./online.js";
import { grupMenu } from "./varian.js";
import { promoHariIni, ketPromo } from "./promo.js";
import { metodeNama, rekapHari } from "./pos.js";

const rp = (n) => "Rp" + Math.round(Number(n) || 0).toLocaleString("id-ID");
const norm = (t) =>
  String(t || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

export const bisnisOf = (s) => s.brand?.terpilih?.nama || s.profile?.nama || "Usaha kami";
/** Nomor WA usaha: setelan WA > Studio Brand. */
export const nomorUsaha = (s) => s.wa?.usaha || s.studio?.wa || "";
export const nomorPemilik = (s) => s.wa?.pemilik || "";
/** Link wa.me ke nomor tertentu (atau pilih kontak sendiri kalau nomor kosong). */
export const linkWa = (nomor, text) => (nomor ? `https://wa.me/${normWa(nomor)}?text=${encodeURIComponent(text)}` : `https://wa.me/?text=${encodeURIComponent(text)}`);

// ---------- Baca chat order ----------

const ANGKA = { satu: 1, se: 1, sebiji: 1, dua: 2, tiga: 3, empat: 4, lima: 5, enam: 6, tujuh: 7, delapan: 8, sembilan: 9, sepuluh: 10 };
const ABAI = new Set(["kak", "ka", "mas", "mbak", "bang", "pak", "bu", "min", "admin", "halo", "hai", "pesen", "pesan", "order", "mau", "minta", "tolong", "ya", "yaa", "dong", "deh", "porsi", "pcs", "bungkus", "gelas", "cup", "biji", "buah", "x", "yg", "yang", "sama", "juga", "dan", "nya", "aku", "saya", "lagi", "aja", "ajah", "saja", "nih", "ni", "kakak", "gan", "sis", "bro", "ok", "oke", "pls", "please", "tambah", "dulu", "buat", "untuk", "punya", "lg", "sm", "dg", "dgn", "pake", "pakai"]);
const CATATAN = /\b(pedes|pedas|level|lvl|tanpa|gak pake|nggak pake|ga pake|jangan|ambil|jam|pukul|bungkus|makan sini|dine in|antar|kirim|sambal|kuah|anget|dingin|less|extra|ekstra)\b/;

/** Ambil jumlah dari potongan teks ("2", "x2", "2x", "dua"), abaikan jam ("jam 5") & harga ("15rb"). */
function qtyDari(seg) {
  const t = seg.replace(/\b(jam|pukul)\s*\d{1,2}([.:]\d{2})?/g, " ").replace(/\b\d+([.,]\d+)?\s*(rb|ribu|k|jt)\b/g, " ").replace(/\b\d{4,}\b/g, " ");
  const m = t.match(/(?:^|\s)x?\s*(\d{1,2})\s*x?(?=\s|$)/);
  if (m) return Math.max(1, Number(m[1]));
  for (const w of t.split(" ")) if (ANGKA[w]) return ANGKA[w];
  return null;
}

/**
 * Cocokkan chat pelanggan ke menu. Return { items: [{ resepId, nama, qty, seg }], sisa: [teks tak dikenali], atasNama, catatan }.
 * Pencocokan: per potongan (baris / koma / "dan" / "+"), menu dengan kata paling banyak cocok (min. 60% kata nama menu).
 */
export function bacaChatOrder(text, resep) {
  const raw = String(text || "");
  let atasNama = "";
  const an = raw.match(/\b(?:atas nama|a\.?n\.?|nama(?:nya)?)\s*[:\-]?\s*([A-Za-z][A-Za-z .']{1,30})/i);
  if (an) atasNama = an[1].trim().replace(/\s+(ya|yaa|kak|ka|ambil|jam|pukul|dong)\b.*$/i, "").trim();
  const catatan = [];
  const menu = (resep || []).map((r) => ({ r, kata: [...new Set(norm(r.nama).split(" ").filter((w) => w.length > 1 && !ABAI.has(w)))] })).filter((m) => m.kata.length);
  // Bobot kata: kata yang dipakai banyak menu ("tahu", "guyur") kurang menentukan dibanding kata khas ("komplit").
  const df = {};
  for (const m of menu) for (const k of m.kata) df[k] = (df[k] || 0) + 1;
  const idf = (k) => Math.log(1 + menu.length / (df[k] || 1));
  for (const m of menu) m.langka = Math.min(...m.kata.map((k) => df[k]));
  const kenal = (w) => /^\d+x?$|^x\d+$/.test(w) || ABAI.has(w) || ANGKA[w] || df[w] || Object.keys(df).some((k) => w.length >= 4 && (w.startsWith(k) || k.startsWith(w)));
  const items = [];
  const sisa = [];
  const segs = raw
    .split(/\n|,|;|\+|\bdan\b|\bsama\b|\bplus\b|&|\.\s/i)
    .map((x) => x.trim())
    .filter(Boolean);
  for (const seg of segs) {
    const n = norm(seg);
    if (!n) continue;
    // Potongan yang isinya cuma nama pemesan ("an Rina", "atas nama Budi") dilewati.
    if ((/\b(atas nama|nama|a n|an)\b/.test(n) || (atasNama && n === norm(atasNama))) && !menu.some((m) => m.kata.every((k) => n.includes(k)))) continue;
    const kata = new Set(n.split(" "));
    const adaCatatan = CATATAN.test(n);
    // Ada kata asing (cth "martabak")? Jangan menebak dari 1 kata khas saja.
    const asing = [...kata].some((w) => w.length >= 3 && !kenal(w));
    let best = null;
    for (const m of menu) {
      const cocok = m.kata.filter((k) => kata.has(k) || [...kata].some((w) => w.length >= 4 && (w.startsWith(k) || k.startsWith(w))));
      const frac = cocok.length / m.kata.length;
      // Kandidat: ≥60% kata nama menu cocok, atau kata paling khas menu itu disebut (cth "komplit", "cireng").
      const khas = !adaCatatan && !asing && cocok.some((k) => df[k] === m.langka && m.langka <= 2);
      if (frac < 0.6 && !khas) continue;
      const bobot = cocok.reduce((a, k) => a + idf(k), 0);
      if (!best || bobot > best.bobot || (bobot === best.bobot && frac > best.frac)) best = { m, bobot, frac };
    }
    if (best) {
      const qty = qtyDari(n) || 1;
      const ada = items.find((i) => i.resepId === best.m.r.id);
      if (ada) ada.qty += qty;
      else items.push({ resepId: best.m.r.id, nama: best.m.r.nama, qty, seg });
    } else if (adaCatatan) catatan.push(seg);
    else if (!/^(halo|hai|kak|min|mas|mbak|permisi|pagi|siang|sore|malam|makasih|terima kasih|thanks|ok|oke)\b/.test(n)) sisa.push(seg);
  }
  return { items, sisa, atasNama, catatan: catatan.join(", ").slice(0, 200) };
}

// ---------- Menu & link pesan ----------

/** Teks menu siap kirim (chat / Status WA). */
export function teksMenu(s, { tanggal } = {}) {
  const st = s.studio || {};
  const lines = [`*${bisnisOf(s)}*`, st.headline || "", ""];
  lines.push("*MENU*");
  for (const r of s.resep || []) {
    const g = grupMenu(s, r);
    lines.push(`- ${r.nama} ${rp(hargaDi(s, r, "toko"))}${g.length ? ` (${g.map((x) => x.nama.toLowerCase()).join(", ")})` : ""}`);
  }
  const promo = tanggal ? promoHariIni(s, tanggal) : [];
  if (promo.length) {
    lines.push("", "*PROMO HARI INI*");
    for (const p of promo) lines.push(`- ${p.nama}: ${ketPromo(p, s)}`);
  }
  const info = [st.jam ? `Buka ${st.jam}` : "", st.alamat || [s.profile?.area, s.profile?.kota].filter(Boolean).join(", ")].filter(Boolean);
  if (info.length) lines.push("", ...info);
  if (nomorUsaha(s)) lines.push("", `Pesan langsung: ${linkPesan(s)}`);
  return lines
    .filter((l, i, a) => !(l === "" && a[i - 1] === ""))
    .join("\n")
    .trim();
}

/** Template pesan yang terisi saat pelanggan klik "Pesan via WA". */
export const templatePesan = (s) => `Halo ${bisnisOf(s)}, mau pesan:\n- \n\nAtas nama: \nAmbil / antar jam: `;

/** Link "Pesan via WA" ke nomor usaha. */
export const linkPesan = (s) => (nomorUsaha(s) ? linkWa(nomorUsaha(s), templatePesan(s)) : "");

// ---------- Broadcast pelanggan ----------

export const SEGMEN = [
  { id: "semua", nama: "Semua pelanggan" },
  { id: "lama", nama: "Lama nggak balik" },
  { id: "hampir", nama: "Stempel hampir penuh" },
  { id: "hadiah", nama: "Hadiah siap diambil" },
  { id: "baru", nama: "Pelanggan baru (30 hari)" },
];

/** Pelanggan dalam segmen (yang punya nomor WA). Return { list, tanpaWa }. */
export function pelangganSegmen(s, segmen, today) {
  const prog = program(s);
  const semua = s.pelanggan || [];
  const batasBaru = new Date(today + "T00:00:00");
  batasBaru.setDate(batasBaru.getDate() - 30);
  const baru = batasBaru.toISOString().slice(0, 10);
  const lama = new Set(perluDiajak(semua).map((p) => p.id));
  const pilih = semua.filter((p) => {
    if (segmen === "lama") return lama.has(p.id);
    if (segmen === "hampir") return !siapTukar(p, prog) && (Number(p.stempel) || 0) >= prog.target - 2 && (Number(p.stempel) || 0) > 0;
    if (segmen === "hadiah") return siapTukar(p, prog);
    if (segmen === "baru") return (p.dibuat || "") >= baru;
    return true;
  });
  return { list: pilih.filter((p) => normWa(p.wa)).sort((a, b) => a.nama.localeCompare(b.nama, "id")), tanpaWa: pilih.filter((p) => !normWa(p.wa)).length };
}

/** Template broadcast bawaan: promo hari ini kalau ada. */
export function templateBroadcast(s, tanggal) {
  const promo = promoHariIni(s, tanggal)[0];
  return promo
    ? `Halo {nama}! Ada ${promo.nama} di ${bisnisOf(s)}: ${ketPromo(promo, s)}. Stempelmu sekarang {stempel}, tinggal {sisa} lagi dapat {hadiah}. Ditunggu ya!`
    : `Halo {nama}! Kangen nih, mampir lagi ke ${bisnisOf(s)} ya. Stempelmu sekarang {stempel}, tinggal {sisa} lagi dapat {hadiah}.`;
}

/** Isi pesan per pelanggan ({nama}, {stempel}, {sisa}, {hadiah}, {link}). */
export const pesanUntuk = (s, tpl, p) => isiPesan(tpl, p, program(s), bisnisOf(s), p.token ? cardUrl(p.token) : "");

// ---------- Ringkasan untuk pemilik ----------

/** Rekap kasir 1 hari untuk dikirim ke pemilik. */
export function teksRekapHari(s, tanggal) {
  const r = rekapHari(s, tanggal);
  const promo = r.aktif.filter((o) => o.promo).reduce((a, o) => a + o.promo.potongan, 0);
  return [
    `*Rekap ${bisnisOf(s)}* · ${tanggal}`,
    `Omzet ${rp(r.omzet)} · ${r.n} order${r.batal ? ` · ${r.batal} batal` : ""}`,
    `Rata-rata ${rp(r.rata)}/order`,
    ...r.perMetode.map((m) => `- ${m.nama}: ${rp(m.total)} (${m.n})`),
    r.komisi ? `Komisi online -${rp(r.komisi)} · bersih ${rp(r.bersih)}` : null,
    promo ? `Potongan promo ${rp(promo)}` : null,
    r.terlaris.length ? `Terlaris: ${r.terlaris.slice(0, 3).map(([n, q]) => `${n} (${q})`).join(", ")}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

/** Ringkasan shift yang sudah ditutup. */
export function teksShift(s, sh) {
  const h = sh.hasil || {};
  const jam = (w) => String(w || "").slice(11, 16);
  const sel = h.selisih;
  return [
    `*Tutup shift ${bisnisOf(s)}*`,
    `${sh.kasir?.nama || "Kasir"} · ${String(sh.buka).slice(0, 10)} ${jam(sh.buka)}–${jam(sh.tutup)}`,
    `${h.order ?? 0} order · omzet ${rp(h.omzet)}`,
    `Tunai ${rp(h.tunai)} · QRIS/transfer ${rp(h.nonTunai)}${h.online ? ` · online ${rp(h.online)}` : ""}`,
    `Modal ${rp(h.modal)}${h.keluar ? ` · keluar laci ${rp(h.keluar)}` : ""}${h.ambil ? ` · diambil ${rp(h.ambil)}` : ""}`,
    `Seharusnya di laci ${rp(h.seharusnya)}`,
    h.setor === null || h.setor === undefined ? "Uang laci tidak dihitung" : `Dihitung ${rp(h.setor)} · selisih ${sel === 0 ? "pas" : `${sel > 0 ? "+" : "-"}${rp(Math.abs(sel))}`}`,
    sh.catatan ? `Catatan: ${sh.catatan}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

export { metodeNama };
