// Cek kesehatan usaha (#/sehat): skor + pemeriksaan dari data asli 30 hari terakhir (lihat js/sehat.js).
import { icon } from "../icons.js";
import { esc, fmtDate } from "../ui.js";
import { head } from "./_shared.js";
import { cekKesehatan, HARI } from "../sehat.js";

export const STATUS = {
  baik: { nama: "Bagus", cls: "pos" },
  waspada: { nama: "Waspada", cls: "warn" },
  bahaya: { nama: "Bahaya", cls: "neg" },
  kosong: { nama: "Belum ada data", cls: "muted" },
  info: { nama: "Info", cls: "info" },
};

export const TANYA_SEHAT = "Ini hasil cek kesehatan usahaku. Apa 3 hal yang paling penting dibenerin duluan minggu ini, dan gimana caranya?";

const pill = (st) => `<span class="sehat-pill ${STATUS[st].cls}">${STATUS[st].nama}</span>`;

function kartu(c) {
  return `<section class="card sehat-cek ${c.status}">
    <div class="row-between"><h3>${esc(c.judul)}</h3>${pill(c.status)}</div>
    <b class="sehat-nilai">${esc(c.nilai)}</b>
    <p class="small">${esc(c.detail)}</p>
    <p class="small sehat-saran">${icon("bulb", 14)} ${esc(c.saran)}</p>
    <a href="${c.href}" class="link small">Buka ${icon("chevron", 12)}</a>
  </section>`;
}

/** Kartu ringkas untuk Beranda. */
export function sehatCard(s) {
  const h = cekKesehatan(s);
  if (!h.dinilai) return "";
  const top = h.prioritas[0];
  return `<a href="#/sehat" class="card sehat-mini">
    <span class="sehat-skor sm ${h.skor >= 80 ? "pos" : h.skor >= 60 ? "warn" : "neg"}">${h.skor}</span>
    <span><b>Kesehatan usaha: ${esc(h.label)}</b><small class="muted">${top ? `Beresin dulu: ${esc(top.judul.toLowerCase())}` : `${h.dinilai} hal dicek, aman semua`}</small></span>
    ${icon("chevron", 18)}
  </a>`;
}

export const sehat = {
  render(s) {
    const h = cekKesehatan(s);
    const warna = h.skor === null ? "muted" : h.skor >= 80 ? "pos" : h.skor >= 60 ? "warn" : "neg";
    return `
      ${head("Cek Kesehatan Usaha", "#/bisnis")}
      <section class="card sehat-head">
        <div class="sehat-skor ${warna}">${h.skor ?? "–"}</div>
        <div>
          <h2 class="card-title" style="margin:0">${esc(h.label)}</h2>
          <p class="small muted">Dari data ${HARI} hari terakhir (${esc(fmtDate(h.dari))} – ${esc(fmtDate(h.sampai))}). ${h.dinilai} hal dinilai.</p>
          <p class="small">Dihitung dari Kasir, Kas, resep, stok, pelanggan & shift. Makin lengkap datanya, makin akurat.</p>
        </div>
      </section>
      ${
        h.prioritas.length
          ? `<section class="card accent">
              <h2 class="card-title">Beresin dulu</h2>
              <ol class="sehat-prioritas">${h.prioritas.map((c) => `<li><a href="${c.href}"><b>${esc(c.judul)}</b> ${pill(c.status)}<span class="small">${esc(c.saran)}</span></a></li>`).join("")}</ol>
              <a href="#/mentor?tanya=sehat" class="btn soft block">${icon("chat", 16)} Diskusiin sama Mentor AI</a>
            </section>`
          : h.dinilai
            ? `<section class="card accent"><h2 class="card-title">Mantap, nggak ada yang mendesak</h2><p class="small">Pertahankan kebiasaan nyatet & cek lagi minggu depan.</p></section>`
            : ""
      }
      ${h.cek.map(kartu).join("")}`;
  },
};
