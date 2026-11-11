import { render } from "../app.js";
import { toast, esc } from "../ui.js";
import { isDemo, AuthRequiredError } from "../ai.js";

// Status loading per-kunci, dipakai semua view AI.
export const busy = {};

export async function runAI(key, fn) {
  if (busy[key]) return;
  busy[key] = true;
  render();
  try {
    await fn();
  } catch (err) {
    if (!(err instanceof AuthRequiredError)) console.error(err);
    toast(err.message || "AI gagal, coba lagi ya", "err");
    if (err instanceof AuthRequiredError) location.hash = "#/akun";
  } finally {
    busy[key] = false;
    render();
  }
}

export const head = (title, back = "#/bisnis") =>
  `<header class="page-head"><a href="${back}" class="back" aria-label="Kembali">←</a><h1>${esc(title)}</h1>${
    isDemo() ? `<a href="#/setelan" class="pill demo" title="Hasil dari template lokal">Mode Demo</a>` : `<span class="pill ai">AI Online</span>`
  }</header>`;

export const disclaimer = `<p class="muted small center">Angka dari AI adalah estimasi. Cek ulang dengan harga belanja nyata di daerahmu ya.</p>`;

// Ringkasan kas untuk satu bulan (YYYY-MM)
export function monthStats(transactions, ym) {
  const tx = transactions.filter((t) => t.tanggal.startsWith(ym));
  const masuk = tx.filter((t) => t.jenis === "masuk").reduce((a, t) => a + t.nominal, 0);
  const keluar = tx.filter((t) => t.jenis === "keluar").reduce((a, t) => a + t.nominal, 0);
  const kategori_keluar = {};
  const kategori_masuk = {};
  const harian = {};
  for (const t of tx) {
    const bucket = t.jenis === "masuk" ? kategori_masuk : kategori_keluar;
    bucket[t.kategori] = (bucket[t.kategori] || 0) + t.nominal;
    harian[t.tanggal] ??= { masuk: 0, keluar: 0 };
    harian[t.tanggal][t.jenis] += t.nominal;
  }
  return { tx, masuk, keluar, laba: masuk - keluar, kategori_keluar, kategori_masuk, harian, hari_aktif: Object.keys(harian).length };
}
