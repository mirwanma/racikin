// Perhitungan stok & resep (murni, tanpa UI).

export const SATUAN = ["gram", "ml", "pcs", "butir", "lembar", "bungkus", "ikat", "sdm", "porsi"];

export const bahanMap = (bahan) => Object.fromEntries((bahan || []).map((b) => [b.id, b]));

const round = (n, d = 2) => Math.round(n * 10 ** d) / 10 ** d;
export const fmtQty = (n) => (Number.isInteger(n) ? String(n) : String(round(n, 2)).replace(".", ","));

// Kemasan beli (opsional): bahan yang dibeli per dus / pak / tray. b.pack = isi per kemasan (dalam satuan bahan),
// b.packNama = nama kemasannya. Dipakai daftar belanja (dibulatkan per kemasan), pesan WA ke supplier & form beli.
export const KEMASAN = ["dus", "pak", "karton", "tray", "kotak", "bal", "karung", "renteng", "lusin", "jeriken"];
/** { isi, nama } kemasan beli bahan, atau null kalau dibeli satuan. */
export const kemasanOf = (b) => (Number(b?.pack) > 0 ? { isi: Number(b.pack), nama: String(b.packNama || "dus").trim() || "dus" } : null);
/** Jumlah dalam kemasan: "2 dus", "1 dus + 6 pcs", "0,5 dus". "" kalau bahan nggak punya kemasan. */
export function teksKemasan(qty, b) {
  const k = kemasanOf(b);
  const q = Number(qty) || 0;
  if (!k || q <= 0) return "";
  const n = Math.floor(q / k.isi + 1e-9);
  const sisa = round(q - n * k.isi, 2);
  if (!n) return `${fmtQty(round(q / k.isi, 2))} ${k.nama}`;
  return sisa > 0 ? `${n} ${k.nama} + ${fmtQty(sisa)} ${b.satuan || ""}`.trim() : `${n} ${k.nama}`;
}
/** Patch kemasan dari isian form (isi kosong / 0 = hapus kemasan). */
export function patchKemasan(b, isi, nama) {
  const n = Number(isi) || 0;
  const { pack, packNama, ...rest } = b;
  return n > 0 ? { ...rest, pack: round(n, 2), packNama: String(nama || "").trim().slice(0, 20) || "dus" } : rest;
}

/** Rincian biaya resep per porsi. */
export function hppOf(resep, map) {
  const hasil = Math.max(1, Number(resep.hasil) || 1);
  let total = 0;
  let kurangHarga = 0;
  const rows = (resep.items || []).map((it) => {
    const b = map[it.bahanId];
    const biaya = b ? (Number(it.qty) || 0) * (Number(b.harga) || 0) : 0;
    if (!b || !b.harga) kurangHarga++;
    total += biaya;
    return { ...it, bahan: b, biaya: biaya / hasil };
  });
  const hpp = total / hasil;
  const harga = Number(resep.harga) || 0;
  return { hpp, rows, kurangHarga, margin: harga ? ((harga - hpp) / harga) * 100 : 0, untung: harga - hpp };
}

/**
 * Berapa porsi yang bisa dibuat dari stok sekarang + bahan pembatasnya.
 * Hanya bahan yang stoknya sudah diisi (tracked) yang dihitung.
 */
export function bisaDibuat(resep, map) {
  const hasil = Math.max(1, Number(resep.hasil) || 1);
  let min = Infinity;
  let pembatas = null;
  let belumDiisi = 0;
  for (const it of resep.items || []) {
    const b = map[it.bahanId];
    const perPorsi = (Number(it.qty) || 0) / hasil;
    if (!b || perPorsi <= 0) continue;
    if (!b.tracked) {
      belumDiisi++;
      continue;
    }
    const n = Math.floor(Math.max(0, b.stok || 0) / perPorsi);
    if (n < min) {
      min = n;
      pembatas = b;
    }
  }
  return { porsi: min === Infinity ? null : min, pembatas, belumDiisi };
}

/** Bahan yang stoknya sudah diisi & sudah di bawah/sama dengan batas minimum. */
export const menipis = (bahan) => (bahan || []).filter((b) => b.tracked && (Number(b.stok) || 0) <= (Number(b.min) || 0));

/** Bahan yang stoknya belum pernah diisi. */
export const belumDiisi = (bahan) => (bahan || []).filter((b) => !b.tracked);

/** Rata-rata HPP semua resep (dipakai default kalkulator BEP). */
export function rataHpp(state) {
  const map = bahanMap(state.bahan);
  const list = (state.resep || []).map((r) => hppOf(r, map).hpp).filter((n) => n > 0);
  return list.length ? Math.round(list.reduce((a, n) => a + n, 0) / list.length) : null;
}

/** Kebutuhan bahan untuk n porsi menu. */
export function kebutuhan(resep, porsi) {
  const hasil = Math.max(1, Number(resep.hasil) || 1);
  return (resep.items || []).map((it) => ({ bahanId: it.bahanId, qty: ((Number(it.qty) || 0) * porsi) / hasil }));
}
