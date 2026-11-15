// Varian & topping menu. Murni (tanpa UI).
//
// Model:
//   state.opsi = [{ id, nama: "Topping", tipe: "satu" | "banyak", wajib, maks,
//                   pilihan: [{ id, nama: "Keju", harga: 3000, items: [{ bahanId, qty }], habis }] }]
//   resep.opsiIds = [grupId, ...]   // grup yang dipakai menu itu (urutan = urutan tampil)
//
// Item order/keranjang yang memakai pilihan:
//   { resepId, nama, harga (per porsi, sudah termasuk tambahan), qty, opsi: [{ g, id, nama, harga }] }
//   opsi[].harga = harga tambahan di toko (harga online dihitung ulang dari sini).
// Pilihan hanya MENAMBAH harga & bahan (per porsi), tidak mengganti bahan resep.
import { kebutuhan } from "./stok-utils.js";
import { channelCfg, hargaDi } from "./online.js";

export const MAKS_GRUP = 8;
export const MAKS_PILIHAN = 12;

/** Grup pilihan yang dipakai menu (urutan sesuai resep.opsiIds). */
export const grupMenu = (s, r) => (r?.opsiIds || []).map((id) => (s.opsi || []).find((g) => g.id === id)).filter((g) => g && g.pilihan?.length);

export const punyaOpsi = (s, r) => grupMenu(s, r).length > 0;

/** Teks aturan grup, cth: "Wajib · pilih 1" / "Opsional · maks. 3". */
export function aturan(g) {
  const w = g.wajib ? "Wajib" : "Opsional";
  if (g.tipe === "satu") return `${w} · pilih 1`;
  return `${w} · ${g.maks ? `maks. ${g.maks}` : "boleh lebih dari 1"}`;
}

/** Bahan yang dipakai 1× pilihan. */
const pakaiPilihan = (p) => (p.items || []).filter((it) => it.bahanId && Number(it.qty) > 0).map((it) => ({ bahanId: it.bahanId, qty: Number(it.qty) }));

/** HPP tambahan 1× pilihan. */
export const hppPilihan = (p, map) => pakaiPilihan(p).reduce((a, it) => a + it.qty * (Number(map[it.bahanId]?.harga) || 0), 0);

/** Pilihan habis: ditandai manual, atau stok bahannya (yang sudah diisi) tidak cukup untuk 1 porsi. */
export function pilihanHabis(p, map) {
  if (p.habis) return true;
  return pakaiPilihan(p).some((it) => {
    const b = map[it.bahanId];
    return b && b.tracked && (Number(b.stok) || 0) < it.qty;
  });
}

/**
 * Cek pilihan untuk menu. ids = id pilihan yang dicentang.
 * Return { ok, error, opsi } dengan opsi = [{ g, id, nama, harga }] urut sesuai grup.
 */
export function cekPilihan(s, r, ids, map = null) {
  const pilih = new Set(ids || []);
  const opsi = [];
  for (const g of grupMenu(s, r)) {
    const dipilih = g.pilihan.filter((p) => pilih.has(p.id));
    if (g.wajib && !dipilih.length) return { ok: false, error: `Pilih ${g.nama} dulu`, opsi };
    if (g.tipe === "satu" && dipilih.length > 1) return { ok: false, error: `${g.nama}: pilih satu aja`, opsi };
    if (g.tipe !== "satu" && g.maks && dipilih.length > g.maks) return { ok: false, error: `${g.nama}: maksimal ${g.maks}`, opsi };
    for (const p of dipilih) {
      if (map && pilihanHabis(p, map)) return { ok: false, error: `${p.nama} lagi habis`, opsi };
      opsi.push({ g: g.id, id: p.id, nama: p.nama, harga: Math.round(Number(p.harga) || 0) });
    }
  }
  return { ok: true, error: "", opsi };
}

/** Pilihan default untuk sheet: grup wajib + pilih satu -> pilihan pertama yang tersedia. */
export function pilihanAwal(s, r, map) {
  const ids = [];
  for (const g of grupMenu(s, r)) {
    if (!(g.wajib && g.tipe === "satu")) continue;
    const p = g.pilihan.find((x) => !pilihanHabis(x, map));
    if (p) ids.push(p.id);
  }
  return ids;
}

const roundUp = (n, step) => Math.ceil(n / step) * step;

/** Total harga tambahan di saluran (online: ikut markup saluran, dibulatkan ke atas). */
export function tambahanDi(s, opsi, channelId) {
  const t = (opsi || []).reduce((a, o) => a + (Number(o.harga) || 0), 0);
  if (!t || !channelId || channelId === "toko") return t;
  const c = channelCfg(s, channelId);
  return roundUp(t * (1 + c.markup / 100), c.bulat);
}

/** Harga per porsi menu + pilihan di saluran. */
export const hargaItem = (s, r, opsi, channelId) => hargaDi(s, r, channelId) + tambahanDi(s, opsi, channelId);

/** Kunci baris keranjang: menu yang sama dengan pilihan berbeda = baris berbeda. */
export const kunciItem = (resepId, opsi) => [resepId, ...(opsi || []).map((o) => o.id).sort()].join("|");

/** "Pedas Lv 3, Keju" */
export const labelOpsi = (item) => (item?.opsi || []).map((o) => o.nama).join(", ");

/** "Tahu Guyur (Pedas Lv 3, Keju)" untuk struk & teks. */
export const namaLengkap = (item) => (item?.opsi?.length ? `${item.nama} (${labelOpsi(item)})` : item.nama);

/** Bahan yang dipakai item (resep dasar + pilihan) untuk item.qty porsi. */
export function pakaiItem(s, item) {
  const r = (s.resep || []).find((x) => x.id === item.resepId);
  if (!r) return [];
  const out = kebutuhan(r, item.qty);
  for (const o of item.opsi || []) {
    const g = (s.opsi || []).find((x) => x.id === o.g);
    const p = g?.pilihan.find((x) => x.id === o.id);
    if (!p) continue;
    for (const it of pakaiPilihan(p)) out.push({ bahanId: it.bahanId, qty: it.qty * item.qty });
  }
  return out;
}

/** Cari pilihan berdasarkan id (di semua grup). */
export function cariPilihan(s, id) {
  for (const g of s.opsi || []) {
    const p = g.pilihan?.find((x) => x.id === id);
    if (p) return { g, p };
  }
  return null;
}
