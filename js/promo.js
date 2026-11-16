// Promo & voucher. Murni (tanpa UI).
//
// state.promo = [{
//   id, nama, aktif,
//   jenis: "order" | "menu" | "bxgy",
//   tipe: "persen" | "rp" | "harga",   // order: persen/rp; menu: persen/rp (potongan per porsi)/harga (harga spesial per porsi)
//   nilai, minBelanja, maks,            // order: syarat & batas potongan
//   resepIds: [],                       // menu & bxgy: menu yang ikut promo
//   beli, gratis,                       // bxgy: beli X gratis Y (menu yang ikut promo, yang termurah yang gratis)
//   waktu: { dari, sampai, hari: [0-6], jamDari: "HH:MM", jamSampai: "HH:MM" },
//   saluran: ["toko", "gofood", ...],   // default hanya toko
//   kode, kuota,                        // voucher (opsional): promo aktif kalau kode dimasukkan; kuota = total pemakaian
// }]
// Aturan: promo TIDAK numpuk. Tiap order otomatis memakai 1 promo dengan potongan terbesar (+ diskon manual kasir).
// Pemakaian dihitung dari rekap harian (posHarian[tgl].promo = { promoId: { n, rp } }), jadi ikut benar setelah sinkron.
import { channelNama } from "./online.js";

export const HARI = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
const sum = (arr, f) => arr.reduce((a, x) => a + f(x), 0);
const rp = (n) => "Rp" + Math.round(Number(n) || 0).toLocaleString("id-ID");
export const normKode = (k) => String(k || "").trim().toUpperCase().replace(/\s+/g, "");

/** Pemakaian promo sepanjang waktu dari rekap harian: { promoId: { n, rp } }. */
export function pemakaian(s) {
  const out = {};
  for (const r of Object.values(s.posHarian || {})) {
    for (const [id, x] of Object.entries(r.promo || {})) {
      const cur = (out[id] ||= { n: 0, rp: 0, omzet: 0 });
      cur.n += Number(x.n) || 0;
      cur.rp += Number(x.rp) || 0;
      cur.omzet += Number(x.omzet) || 0;
    }
  }
  return out;
}

/** Apakah promo berlaku pada waktu "YYYY-MM-DDTHH:MM" & saluran tsb (tanpa cek kode/kuota). */
export function berlakuPada(p, waktu, channel = "toko") {
  if (!p.aktif) return false;
  const tgl = String(waktu).slice(0, 10);
  const jam = String(waktu).slice(11, 16);
  const w = p.waktu || {};
  if (w.dari && tgl < w.dari) return false;
  if (w.sampai && tgl > w.sampai) return false;
  if (w.hari?.length && !w.hari.includes(new Date(tgl + "T00:00:00").getDay())) return false;
  if (w.jamDari && jam < w.jamDari) return false;
  if (w.jamSampai && jam >= w.jamSampai) return false;
  return (p.saluran?.length ? p.saluran : ["toko"]).includes(channel || "toko");
}

const harga = (i) => Number(i.harga) || 0;
const tambahan = (i) => sum(i.opsi || [], (o) => Number(o.harga) || 0);

/** Potongan (Rp) promo untuk isi keranjang. Return { potongan, kurang } (kurang = sisa belanja ke syarat minimal). */
export function potonganPromo(p, cart) {
  const items = (cart || []).filter((i) => Number(i.qty) > 0);
  const sub = sum(items, (i) => harga(i) * i.qty);
  if (!sub) return { potongan: 0, kurang: 0 };
  const ikut = new Set(p.resepIds || []);
  let pot = 0;
  if (p.jenis === "order") {
    const min = Number(p.minBelanja) || 0;
    if (sub < min) return { potongan: 0, kurang: min - sub };
    pot = p.tipe === "persen" ? (sub * (Number(p.nilai) || 0)) / 100 : Number(p.nilai) || 0;
    if (Number(p.maks) > 0) pot = Math.min(pot, Number(p.maks));
  } else if (p.jenis === "menu") {
    for (const i of items) {
      if (!i.resepId || !ikut.has(i.resepId)) continue;
      const per =
        p.tipe === "persen" ? (harga(i) * (Number(p.nilai) || 0)) / 100 : p.tipe === "harga" ? Math.max(0, harga(i) - tambahan(i) - (Number(p.nilai) || 0)) : Math.min(harga(i), Number(p.nilai) || 0);
      pot += per * i.qty;
    }
  } else if (p.jenis === "bxgy") {
    const beli = Math.max(1, Number(p.beli) || 1);
    const gratis = Math.max(1, Number(p.gratis) || 1);
    const unit = items.filter((i) => i.resepId && ikut.has(i.resepId)).flatMap((i) => Array(i.qty).fill(harga(i)));
    const nGratis = Math.floor(unit.length / (beli + gratis)) * gratis;
    pot = unit.sort((a, b) => a - b).slice(0, nGratis).reduce((a, x) => a + x, 0);
    if (!nGratis && unit.length) return { potongan: 0, kurang: 0, kurangPorsi: beli + gratis - unit.length };
  }
  return { potongan: Math.round(Math.min(pot, sub)), kurang: 0 };
}

/**
 * Promo terbaik untuk keranjang. opsi = { channel, waktu ("YYYY-MM-DDTHH:MM"), kode }.
 * Return { promo: { id, nama, potongan, kode? } | null, hint: string, kodeError: string, berlaku: [...] }.
 */
export function pilihPromo(s, cart, { channel = "toko", waktu, kode = "" } = {}) {
  const pakai = pemakaian(s);
  const k = normKode(kode);
  let kodeError = "";
  if (k) {
    const p = (s.promo || []).find((x) => normKode(x.kode) === k);
    if (!p) kodeError = "Kode voucher nggak ditemukan";
    else if (!p.aktif) kodeError = "Voucher ini lagi nonaktif";
    else if (!berlakuPada(p, waktu, channel)) kodeError = "Voucher ini nggak berlaku sekarang / di saluran ini";
    else if (Number(p.kuota) > 0 && (pakai[p.id]?.n || 0) >= Number(p.kuota)) kodeError = "Kuota voucher ini sudah habis";
  }
  const kandidat = (s.promo || []).filter((p) => {
    if (!berlakuPada(p, waktu, channel)) return false;
    if (p.kode) return normKode(p.kode) === k && !(Number(p.kuota) > 0 && (pakai[p.id]?.n || 0) >= Number(p.kuota));
    return true;
  });
  let best = null;
  let hint = "";
  for (const p of kandidat) {
    const r = potonganPromo(p, cart);
    if (r.potongan > (best?.potongan || 0)) best = { id: p.id, nama: p.nama, potongan: r.potongan, ...(p.kode ? { kode: normKode(p.kode) } : {}) };
    else if (!r.potongan && r.kurang && !hint) hint = `Tambah ${rp(r.kurang)} lagi biar dapat ${p.nama}`;
    else if (!r.potongan && r.kurangPorsi && !hint) hint = `Tambah ${r.kurangPorsi} porsi lagi biar dapat ${p.nama}`;
  }
  if (k && !kodeError && best?.kode !== k) {
    const p = (s.promo || []).find((x) => normKode(x.kode) === k);
    const r = potonganPromo(p, cart);
    if (!r.potongan) kodeError = r.kurang ? `Voucher butuh min. belanja ${rp(p.minBelanja)}` : "Voucher ini belum kepakai di pesanan ini";
    else kodeError = "Ada promo lain yang lebih untung, jadi voucher ini nggak dipakai (promo nggak numpuk)";
  }
  return { promo: best, hint: best ? "" : hint, kodeError, berlaku: kandidat };
}

/** Rekap harian promo dari order aktif: { promoId: { n, rp, omzet } } atau null. */
export function rekapPromo(orders) {
  const out = {};
  for (const o of orders) {
    if (!o.promo?.id) continue;
    const cur = (out[o.promo.id] ||= { n: 0, rp: 0, omzet: 0 });
    cur.n += 1;
    cur.rp += Number(o.promo.potongan) || 0;
    cur.omzet += Number(o.total) || 0;
  }
  return Object.keys(out).length ? out : null;
}

const jamTxt = (w) => (w.jamDari || w.jamSampai ? ` · jam ${(w.jamDari || "00:00").replace(":", ".")}–${(w.jamSampai || "24:00").replace(":", ".")}` : "");
function hariTxt(w) {
  const h = [...(w.hari || [])].sort((a, b) => a - b);
  if (!h.length || h.length === 7) return "";
  if (h.join() === "1,2,3,4,5") return " · Senin–Jumat";
  if (h.join() === "0,6") return " · Sabtu & Minggu";
  return " · " + h.map((x) => HARI[x]).join(", ");
}

/** Keterangan promo untuk pelanggan, cth "Diskon 10% min. belanja Rp50.000 · Senin–Jumat · jam 14.00–16.00". */
export function ketPromo(p, s) {
  const nama = (id) => (s?.resep || []).find((r) => r.id === id)?.nama || "menu";
  const menu = (p.resepIds || []).map(nama);
  const menuTxt = menu.length > 2 ? `${menu.slice(0, 2).join(", ")} +${menu.length - 2}` : menu.join(" & ");
  let t = "";
  if (p.jenis === "order") t = `Diskon ${p.tipe === "persen" ? `${p.nilai}%` : rp(p.nilai)}${Number(p.minBelanja) ? ` min. belanja ${rp(p.minBelanja)}` : ""}${p.tipe === "persen" && Number(p.maks) ? ` (maks ${rp(p.maks)})` : ""}`;
  else if (p.jenis === "menu") t = p.tipe === "harga" ? `${menuTxt} jadi ${rp(p.nilai)}` : `${menuTxt} diskon ${p.tipe === "persen" ? `${p.nilai}%` : rp(p.nilai)}`;
  else t = `Beli ${p.beli} gratis ${p.gratis} ${menuTxt}`;
  const w = p.waktu || {};
  const saluran = (p.saluran || ["toko"]).filter((c) => c !== "toko");
  return `${t}${hariTxt(w)}${jamTxt(w)}${w.sampai ? ` · s/d ${w.sampai.slice(8)}/${w.sampai.slice(5, 7)}` : ""}${saluran.length ? ` · juga di ${saluran.map(channelNama).join(", ")}` : ""}`;
}

/** Promo yang aktif hari ini (untuk ditampilkan ke pelanggan, tanpa kode voucher). */
export const promoHariIni = (s, tanggal) =>
  (s.promo || []).filter((p) => p.aktif && !p.kode && berlakuPada({ ...p, waktu: { ...p.waktu, jamDari: "", jamSampai: "" } }, `${tanggal}T12:00`, "toko"));
