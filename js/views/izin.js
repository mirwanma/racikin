// Panduan perizinan (#/izin): NIB, PIRT, Halal, SLHS, Merek. Isi panduan & rekomendasi di js/izin.js.
import { icon } from "../icons.js";
import { esc, fmtDate, todayISO } from "../ui.js";
import { store } from "../store.js";
import { render } from "../app.js";
import { head } from "./_shared.js";
import { rekomendasi, ringkasIzin, berlakuSampai, STATUS, RELEVANSI_NAMA, DICEK } from "../izin.js";

const CLS = { wajib: "neg", disarankan: "warn", opsional: "info", belum: "muted" };
const buka = new Set();

const tgl = (iso) => fmtDate(iso, { day: "numeric", month: "short", year: "numeric" });

/** Pengingat izin yang mau habis (untuk Beranda). */
export function izinCard(s) {
  const r = ringkasIzin(s, todayISO());
  const p = r.pengingat[0];
  if (!p) return "";
  return `<a href="#/izin" class="card izin-mini ${p.sisa < 0 ? "neg" : "warn"}">
    ${icon("doc", 22)}
    <span><b>${p.sisa < 0 ? `${esc(p.nama)} sudah habis` : `${esc(p.nama)} habis ${p.sisa} hari lagi`}</b><small class="muted">Berlaku sampai ${esc(tgl(p.sampai))}. Urus perpanjangannya ya.</small></span>
    ${icon("chevron", 18)}
  </a>`;
}

function kartu(z, d, today) {
  const st = d.status || "belum";
  const sampai = st === "selesai" ? berlakuSampai(z, d) : null;
  const sisa = sampai ? Math.round((new Date(sampai + "T00:00:00") - new Date(today + "T00:00:00")) / 864e5) : null;
  const dok = new Set(d.dok || []);
  const terbuka = buka.has(z.id) || (st !== "selesai" && buka.size === 0 && z.relevan === "wajib" && z.id === "nib");
  return `<section class="card izin ${st}" data-izin="${z.id}">
    <div class="row-between izin-head">
      <h3>${st === "selesai" ? icon("check", 16) + " " : ""}${esc(z.nama)}</h3>
      <span class="sehat-pill ${CLS[z.relevan]}">${RELEVANSI_NAMA[z.relevan]}</span>
    </div>
    <p class="small">${esc(z.singkat)}</p>
    <p class="small izin-alasan">${icon("bulb", 14)} ${esc(z.alasan)}</p>
    <div class="izin-meta small"><span><b>Biaya</b> ${esc(z.biaya)}</span><span><b>Lama</b> ${esc(z.lama)}</span><span><b>Berlaku</b> ${z.berlakuTahun ? `${z.berlakuTahun} tahun` : "selama usaha / produk tidak berubah"}</span></div>
    <label class="field"><span>Status</span>
      <select data-change="status" data-id="${z.id}">${Object.entries(STATUS).map(([k, v]) => `<option value="${k}" ${st === k ? "selected" : ""}>${v}</option>`).join("")}</select>
    </label>
    ${
      st === "selesai"
        ? `<div class="row2">
            <label class="field"><span>Nomor izin</span><input value="${esc(d.nomor || "")}" maxlength="60" placeholder="cth: 1234567890123" data-change="f" data-f="nomor" data-id="${z.id}"></label>
            <label class="field"><span>Tanggal terbit</span><input type="date" value="${esc(d.terbit || "")}" data-change="f" data-f="terbit" data-id="${z.id}"></label>
          </div>
          ${z.berlakuTahun ? `<label class="field"><span>Berlaku sampai (kosongin = otomatis ${z.berlakuTahun} tahun dari terbit)</span><input type="date" value="${esc(d.berlaku || "")}" data-change="f" data-f="berlaku" data-id="${z.id}"></label>` : ""}
          ${sampai ? `<p class="small ${sisa < 0 ? "neg" : sisa <= 90 ? "warn" : "muted"}">${sisa < 0 ? "Sudah habis sejak" : "Berlaku sampai"} ${esc(tgl(sampai))}${sisa >= 0 && sisa <= 90 ? ` (${sisa} hari lagi, siapin perpanjangan)` : ""}</p>` : ""}`
        : ""
    }
    <details class="izin-detail" ${terbuka ? "open" : ""} data-id="${z.id}">
      <summary>Cara ngurusnya & dokumen</summary>
      <h4>Dokumen yang disiapin</h4>
      <div class="izin-dok">${z.dokumen.map((x, i) => `<label class="chk"><input type="checkbox" data-change="dok" data-id="${z.id}" value="${i}" ${dok.has(i) ? "checked" : ""}><span>${esc(x)}</span></label>`).join("")}</div>
      <h4>Langkah</h4>
      <ol class="izin-langkah">${z.langkah.map((x) => `<li>${esc(x)}</li>`).join("")}</ol>
      ${z.catatan ? `<p class="small izin-catatan">${icon("alert", 14)} ${esc(z.catatan)}</p>` : ""}
      <a href="${z.link.url}" target="_blank" rel="noopener" class="btn soft block">Buka situs resmi: ${esc(z.link.label)}</a>
    </details>
    <label class="field"><span>Catatan</span><input value="${esc(d.catatan || "")}" maxlength="140" placeholder="cth: nunggu jadwal penyuluhan" data-change="f" data-f="catatan" data-id="${z.id}"></label>
  </section>`;
}

const ubah = (id, patch) =>
  store.set((s) => ({ izin: { ...(s.izin || {}), [id]: { ...(s.izin?.[id] || {}), ...patch } } }));

export const izin = {
  render(s) {
    const today = todayISO();
    const list = rekomendasi(s);
    const r = ringkasIzin(s, today);
    const d = s.izin || {};
    return `
      ${head("Panduan Perizinan", "#/bisnis")}
      <section class="card accent">
        <h2 class="card-title" style="margin:0">Izin usahamu: ${r.selesai}/${r.total} beres</h2>
        <div class="progress"><span style="width:${r.total ? (r.selesai / r.total) * 100 : 0}%"></span></div>
        <p class="small">${r.berikut ? `Urus berikutnya: <b>${esc(r.berikut.nama)}</b>${r.proses ? ` · ${r.proses} lagi diurus` : ""}` : "Izin wajib & yang disarankan udah beres semua. Mantap!"}</p>
        ${r.pengingat.map((p) => `<p class="small ${p.sisa < 0 ? "neg" : "warn"}">${icon("alert", 14)} ${esc(p.nama)} ${p.sisa < 0 ? "sudah habis" : `habis ${p.sisa} hari lagi`} (${esc(tgl(p.sampai))})</p>`).join("")}
        <a href="#/mentor?tanya=izin" class="btn soft block">${icon("chat", 16)} Tanya Mentor AI soal izin</a>
      </section>
      <p class="small muted">Urutan disesuaikan sama jenis usaha & menu di profilmu. NIB dulu, karena izin lain butuh NIB.</p>
      ${list.map((z) => kartu(z, d[z.id] || {}, today)).join("")}
      <p class="small muted izin-disclaimer">Panduan umum, bukan nasihat hukum. Terakhir dicek: ${DICEK}. Aturan & biaya bisa beda per daerah dan bisa berubah, selalu cek situs resmi atau tanya dinas setempat sebelum ngurus.</p>`;
  },
  after(root) {
    root.querySelectorAll("details.izin-detail").forEach((el) =>
      el.addEventListener("toggle", () => (el.open ? buka.add(el.dataset.id) : buka.delete(el.dataset.id))),
    );
  },
  changes: {
    status(el) {
      ubah(el.dataset.id, { status: el.value });
      render();
    },
    f(el) {
      ubah(el.dataset.id, { [el.dataset.f]: el.value.trim() });
      if (el.dataset.f !== "catatan" && el.dataset.f !== "nomor") render();
    },
    dok(el) {
      const id = el.dataset.id;
      const cur = new Set(store.get().izin?.[id]?.dok || []);
      el.checked ? cur.add(Number(el.value)) : cur.delete(Number(el.value));
      ubah(id, { dok: [...cur].sort((a, b) => a - b) });
    },
  },
};
