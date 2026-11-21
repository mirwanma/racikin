// Sinkron detail order kasir lewat tabel pos_orders (bukan di dokumen usaha). Murni (tanpa I/O).
//
// - Tarik: orders_pull(owner, since) -> baris yang berubah sejak `since` (updated_at server). Daftar order "versi cloud"
//   = order versi sinkron terakhir (base) + baris yang ditarik; lalu digabung dengan lokal lewat 3-way merge biasa.
// - Kirim: order hasil gabungan yang beda dari versi cloud -> orders_push.
// - since disimpan mundur 2 menit dari updated_at terbaru, supaya order yang ter-commit sedikit telat tetap ketarik
//   (dobel nggak masalah: digabung per id).
import { addDays } from "./ui.js";

export const MUNDUR_MS = 120_000;

/** Order versi cloud: base + baris yang ditarik (per id), dibuang yang lebih tua dari `hari` hari. */
export function ordersDariPull(baseOrders, rows, today, hari = 30) {
  const map = new Map((baseOrders || []).map((o) => [o.id, o]));
  for (const r of rows || []) if (r?.data?.id) map.set(r.data.id, r.data);
  const batas = addDays(today, -hari);
  return [...map.values()].filter((o) => o.tanggal >= batas).sort((a, b) => String(a.waktu).localeCompare(String(b.waktu)) || String(a.id).localeCompare(String(b.id)));
}

/** Order yang perlu dikirim: ada di hasil gabungan tapi beda / belum ada di versi cloud. */
export function ordersBerubah(merged, remote) {
  const r = new Map((remote || []).map((o) => [o.id, JSON.stringify(o)]));
  return (merged || []).filter((o) => r.get(o.id) !== JSON.stringify(o));
}

/** since berikutnya (ISO): updated_at terbaru yang ditarik dikurangi 2 menit; kalau nggak ada baris, pakai yang lama / waktu server. */
export function sinceBaru(rows, lama, serverNow) {
  const max = (rows || []).reduce((a, r) => (r.updated_at && r.updated_at > a ? r.updated_at : a), "");
  const acuan = max || lama || serverNow;
  if (!acuan) return null;
  const t = Date.parse(acuan);
  if (Number.isNaN(t)) return lama || null;
  return new Date(max || !lama ? t - MUNDUR_MS : t).toISOString();
}
