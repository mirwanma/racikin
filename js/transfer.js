// Transfer stok antar cabang (multi-cabang, paket Max). Murni (tanpa I/O).
//
// - Cabang asal (dokumen yang lagi dibuka): stok bahan berkurang, riwayat stok alasan "transfer" (delta negatif).
// - Cabang tujuan (dokumen cabang lain, ditulis lewat doc_get_v2 / doc_save di js/views/cabang.js): stok bertambah,
//   riwayat stok alasan "transfer" (delta positif). Bahan yang belum ada di tujuan ikut ditambahkan (info dari asal).
// - Kas nggak berubah (barang cuma pindah tempat). Nilai barang (qty x harga) dicatat di riwayat sebagai info.
// - Id riwayat "tf-<transferId>-<bahanId>" di kedua cabang, jadi kirim ulang (mis. koneksi putus) nggak dobel.
//
// stokLog transfer = { id, tanggal, bahanId, delta, alasan: "transfer", catatan, transfer: { id, arah: "keluar"|"masuk",
//   cabang: { id, nama } (cabang lawan), nilai } }

const round2 = (n) => Math.round(n * 100) / 100;
const logId = (tfId, bahanId) => `tf-${tfId}-${bahanId}`;

/** Rapikan isian transfer: [{ bahanId, qty }] -> hanya qty > 0, digabung per bahan. */
export function rapikan(items) {
  const m = new Map();
  for (const it of items || []) {
    const q = round2(Number(it?.qty) || 0);
    if (!it?.bahanId || !(q > 0)) continue;
    m.set(it.bahanId, round2((m.get(it.bahanId) || 0) + q));
  }
  return [...m].map(([bahanId, qty]) => ({ bahanId, qty }));
}

/** Cek transfer dari cabang asal. Return pesan error, atau "" kalau boleh. */
export function cekTransfer(s, items, ke) {
  if (!ke?.id) return "Pilih cabang tujuan dulu";
  const list = rapikan(items);
  if (!list.length) return "Isi jumlah bahan yang mau dikirim";
  for (const it of list) {
    const b = (s.bahan || []).find((x) => x.id === it.bahanId);
    if (!b) return "Ada bahan yang nggak ketemu";
    const ada = Number(b.stok) || 0;
    if (it.qty > ada + 1e-9) return `Stok ${b.nama} cuma ${round2(ada)} ${b.satuan || ""}`.trim();
  }
  return "";
}

/** Nilai barang yang dikirim (qty x harga bahan). */
export const nilaiTransfer = (s, items) =>
  Math.round(rapikan(items).reduce((a, it) => a + it.qty * (Number((s.bahan || []).find((b) => b.id === it.bahanId)?.harga) || 0), 0));

/** Patch cabang asal: stok berkurang + riwayat keluar. Return { bahan, stokLog }. */
export function keluarStok(s, items, { tfId, tanggal, ke }) {
  const list = rapikan(items);
  const ada = new Set((s.stokLog || []).map((l) => l.id));
  const qty = new Map(list.filter((it) => !ada.has(logId(tfId, it.bahanId))).map((it) => [it.bahanId, it.qty]));
  const bahan = (s.bahan || []).map((b) => (qty.has(b.id) ? { ...b, stok: round2((Number(b.stok) || 0) - qty.get(b.id)), tracked: true } : b));
  const log = [...qty].map(([bahanId, q]) => {
    const b = s.bahan.find((x) => x.id === bahanId);
    return {
      id: logId(tfId, bahanId),
      tanggal,
      bahanId,
      delta: -q,
      alasan: "transfer",
      catatan: `Ke ${ke.nama}`,
      transfer: { id: tfId, arah: "keluar", cabang: { id: ke.id, nama: ke.nama }, nilai: Math.round(q * (Number(b?.harga) || 0)) },
    };
  });
  return { bahan, stokLog: [...(s.stokLog || []), ...log] };
}

/**
 * Dokumen cabang tujuan setelah menerima transfer: stok bertambah + riwayat masuk. Bahan yang belum ada disalin dari
 * cabang asal (stok = jumlah yang dikirim). Kalau transfer ini sudah pernah tercatat, nggak ditambah lagi.
 */
export function masukStok(doc, items, { tfId, tanggal, dari, bahanAsal = [] }) {
  const d = { ...(doc || {}) };
  const list = rapikan(items);
  const ada = new Set((d.stokLog || []).map((l) => l.id));
  const baru = list.filter((it) => !ada.has(logId(tfId, it.bahanId)));
  if (!baru.length) return d;
  const bahan = [...(d.bahan || [])];
  for (const it of baru) {
    const i = bahan.findIndex((b) => b.id === it.bahanId);
    if (i >= 0) bahan[i] = { ...bahan[i], stok: round2((Number(bahan[i].stok) || 0) + it.qty), tracked: true };
    else {
      const asal = bahanAsal.find((b) => b.id === it.bahanId);
      if (!asal) continue;
      bahan.push({ ...JSON.parse(JSON.stringify(asal)), stok: it.qty, tracked: true });
    }
  }
  const log = baru
    .filter((it) => bahan.some((b) => b.id === it.bahanId))
    .map((it) => {
      const b = bahan.find((x) => x.id === it.bahanId);
      return {
        id: logId(tfId, it.bahanId),
        tanggal,
        bahanId: it.bahanId,
        delta: it.qty,
        alasan: "transfer",
        catatan: `Dari ${dari.nama}`,
        transfer: { id: tfId, arah: "masuk", cabang: { id: dari.id, nama: dari.nama }, nilai: Math.round(it.qty * (Number(b?.harga) || 0)) },
      };
    });
  return { ...d, bahan, stokLog: [...(d.stokLog || []), ...log] };
}

/** Riwayat transfer (dari riwayat stok), dikelompokkan per transfer, terbaru dulu. */
export function riwayatTransfer(s, batas = 20) {
  const m = new Map();
  for (const l of s.stokLog || []) {
    if (l.alasan !== "transfer" || !l.transfer?.id) continue;
    const t = m.get(l.transfer.id) || { id: l.transfer.id, tanggal: l.tanggal, arah: l.transfer.arah, cabang: l.transfer.cabang, items: [], nilai: 0 };
    const b = (s.bahan || []).find((x) => x.id === l.bahanId);
    t.items.push({ bahanId: l.bahanId, nama: b?.nama || "(bahan dihapus)", satuan: b?.satuan || "", qty: Math.abs(l.delta) });
    t.nilai += Number(l.transfer.nilai) || 0;
    m.set(l.transfer.id, t);
  }
  return [...m.values()].sort((a, b) => b.tanggal.localeCompare(a.tanggal) || b.id.localeCompare(a.id)).slice(0, batas);
}
