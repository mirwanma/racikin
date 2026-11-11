// Perhitungan stok & resep (murni, tanpa UI).

export const SATUAN = ["gram", "ml", "pcs", "butir", "lembar", "bungkus", "ikat", "sdm", "porsi"];

export const bahanMap = (bahan) => Object.fromEntries((bahan || []).map((b) => [b.id, b]));

const round = (n, d = 2) => Math.round(n * 10 ** d) / 10 ** d;
export const fmtQty = (n) => (Number.isInteger(n) ? String(n) : String(round(n, 2)).replace(".", ","));

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
