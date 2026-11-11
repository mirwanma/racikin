import { icon } from "../icons.js";
import { store } from "../store.js";
import { esc, loading, todayISO, addDays, fmtDate, copy } from "../ui.js";
import { ai } from "../ai.js";
import { render } from "../app.js";
import { busy, runAI, head } from "./_shared.js";

let captions = null;

const ctx = (s) => ({
  brand: s.brand?.terpilih || null,
  tone: s.brand?.tone_of_voice || null,
  menu_ide: s.brand?.ide_menu?.map((m) => m.nama) || null,
});

export const konten = {
  render(s) {
    if (busy.cal) return head("Jadwal Konten", "#/") + loading("AI lagi nyusun kalender konten…");
    const c = s.calendar;
    const today = todayISO();
    const capOpen = location.hash.includes("caption=1");

    const capSection = `
      <details class="card" ${capOpen || captions ? "open" : ""} id="caption">
        <summary><b>Generator caption</b></summary>
        <form data-form="caption" class="stack">
          <input name="topik" placeholder="Topik, cth: promo beli 2 gratis 1 weekend ini" required>
          <select name="platform"><option>Instagram</option><option>TikTok</option><option>WhatsApp Status</option></select>
          <button class="btn primary" ${busy.cap ? "disabled" : ""}>${busy.cap ? "Lagi nulis…" : "Bikinin caption"}</button>
        </form>
        ${(captions || [])
          .map((x) => {
            const full = `${x.hook}\n\n${x.caption}\n\n${x.hashtag}`;
            return `<div class="copy-block"><b>${esc(x.hook)}</b><p>${esc(x.caption)}</p><p class="muted small">${esc(x.hashtag)}</p><button class="btn ghost sm" data-action="copy" data-text="${esc(full)}">Salin</button></div>`;
          })
          .join("")}
      </details>`;

    if (!c)
      return `
        ${head("Jadwal Konten", "#/")}
        <section class="card empty">
          <div class="empty-icon">${icon("calendar", 30)}</div>
          <h3>Biar nggak bingung mau posting apa</h3>
          <p>AI bikinin kalender konten lengkap: ide, hook, caption, hashtag, dan jam posting.</p>
          <form data-form="gen" class="stack">
            <div class="row2">
              <label class="field"><span>Mulai</span><input type="date" name="start" value="${today}" required></label>
              <label class="field"><span>Durasi</span><select name="hari"><option value="14">2 minggu</option><option value="30">30 hari</option></select></label>
            </div>
            <button class="btn primary block">Bikin kalender</button>
          </form>
        </section>
        ${capSection}`;

    const done = c.jadwal.filter((j) => j.done).length;
    return `
      ${head("Jadwal Konten", "#/")}
      <section class="card">
        <div class="row-between"><h2 class="card-title">Progres posting</h2><span class="pill">${done}/${c.jadwal.length}</span></div>
        <div class="progress"><span style="width:${(done / c.jadwal.length) * 100}%"></span></div>
        <div class="pillars">${c.pilar.map((p) => `<span class="tag" title="${esc(p.deskripsi)}">${esc(p.nama)}</span>`).join("")}</div>
      </section>

      ${capSection}

      <div class="stack">
        ${c.jadwal
          .map((j) => {
            const d = addDays(c.start, j.hari_ke - 1);
            const full = `${j.hook}\n\n${j.caption}\n\n${j.hashtag}`;
            return `
          <details class="card post ${j.done ? "done" : ""} ${d === today ? "today" : ""} ${d < today && !j.done ? "late" : ""}" ${d === today ? "open" : ""}>
            <summary>
              <button class="check" data-action="toggle" data-hari="${j.hari_ke}" aria-label="Tandai selesai">${j.done ? icon("check", 15) : ""}</button>
              <div class="post-head"><small>${fmtDate(d)} · ${esc(j.jam)}${d === today ? " · <b>HARI INI</b>" : ""}</small><b>${esc(j.ide)}</b><small class="muted">${esc(j.platform)} · ${esc(j.format)} · ${esc(j.pilar)}</small></div>
            </summary>
            <div class="post-body">
              <p><b>Hook:</b> ${esc(j.hook)}</p>
              <p><b>Caption:</b> ${esc(j.caption)}</p>
              <p class="muted small">${esc(j.hashtag)}</p>
              <button class="btn ghost sm" data-action="copy" data-text="${esc(full)}">Salin caption</button>
            </div>
          </details>`;
          })
          .join("")}
      </div>
      <button class="btn ghost block" data-action="reset">Bikin kalender baru</button>`;
  },

  actions: {
    toggle(el, ev) {
      ev.preventDefault(); // jangan buka/tutup details
      const hari = Number(el.dataset.hari);
      const cal = store.get().calendar;
      store.set({ calendar: { ...cal, jadwal: cal.jadwal.map((j) => (j.hari_ke === hari ? { ...j, done: !j.done } : j)) } });
      render();
    },
    copy: (el) => copy(el.dataset.text),
    reset() {
      if (!confirm("Kalender sekarang akan dihapus. Lanjut?")) return;
      store.set({ calendar: null });
      render();
    },
  },
  forms: {
    gen(form) {
      const fd = new FormData(form);
      const start = fd.get("start");
      const hari = Number(fd.get("hari"));
      return runAI("cal", async () => {
        const r = await ai("content_calendar", { hari, tanggal_mulai: start, ...ctx(store.get()) });
        const jadwal = r.jadwal
          .filter((j) => j.hari_ke >= 1 && j.hari_ke <= hari)
          .sort((a, b) => a.hari_ke - b.hari_ke)
          .map((j) => ({ ...j, done: false }));
        store.set({ calendar: { start, pilar: r.pilar, jadwal } });
      });
    },
    caption(form) {
      const fd = new FormData(form);
      return runAI("cap", async () => {
        const r = await ai("caption", { topik: fd.get("topik"), platform: fd.get("platform"), ...ctx(store.get()) });
        captions = r.captions;
      });
    },
  },
};
