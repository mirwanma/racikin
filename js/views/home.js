import { esc, rupiah, todayISO, addDays, fmtDate } from "../ui.js";
import { monthStats } from "./_shared.js";
import { store } from "../store.js";
import { render } from "../app.js";

export function journey(s) {
  const steps = [
    { key: "ide", icon: "💡", label: "Analisa ide", done: !!s.idea, href: "#/ide" },
    { key: "rab", icon: "🧮", label: "RAB & modal", done: !!s.rab, href: "#/rab" },
    { key: "brand", icon: "🎨", label: "Brand kit", done: !!s.brand?.terpilih, href: "#/brand" },
    { key: "aktivasi", icon: "🚀", label: "Aktivasi jualan", done: !!s.activation, href: "#/aktivasi" },
    { key: "kas", icon: "📒", label: "Mulai nyatet kas", done: s.transactions.length > 0, href: "#/kas" },
    { key: "konten", icon: "📅", label: "Jadwal konten", done: !!s.calendar, href: "#/konten" },
  ];
  return steps;
}

export function todayContent(s) {
  if (!s.calendar) return [];
  const today = todayISO();
  return s.calendar.jadwal.filter((j) => addDays(s.calendar.start, j.hari_ke - 1) === today);
}

export const home = {
  render(s) {
    const p = s.profile;
    const steps = journey(s);
    const done = steps.filter((x) => x.done).length;
    const next = steps.find((x) => !x.done);
    const st = monthStats(s.transactions, todayISO().slice(0, 7));
    const today = todayContent(s);
    const hour = new Date().getHours();
    const sapa = hour < 11 ? "Pagi" : hour < 15 ? "Siang" : hour < 18 ? "Sore" : "Malam";

    return `
      <section class="greet">
        <div>
          <p class="muted">${sapa}, ${esc(p.owner)} 👋</p>
          <h1>${esc(s.brand?.terpilih?.nama || p.nama || "Bisnismu")}</h1>
          <p class="muted small">${esc(p.jenis)} · ${esc([p.area, p.kota].filter(Boolean).join(", "))}</p>
        </div>
        <a href="#/setelan" class="icon-btn" aria-label="Setelan">⚙️</a>
      </section>

      <section class="card journey">
        <div class="row-between">
          <h2 class="card-title">Perjalanan bisnismu</h2>
          <span class="pill">${done}/${steps.length}</span>
        </div>
        <div class="progress"><span style="width:${(done / steps.length) * 100}%"></span></div>
        <div class="steps">
          ${steps.map((x) => `<a href="${x.href}" class="step ${x.done ? "done" : ""} ${x === next ? "next" : ""}"><span class="step-icon">${x.done ? "✓" : x.icon}</span><span>${x.label}</span></a>`).join("")}
        </div>
        ${next ? `<a href="${next.href}" class="btn primary block">Lanjut: ${next.label} →</a>` : `<p class="center">Semua langkah awal beres! Sekarang konsisten nyatet & posting ya 💪</p>`}
      </section>

      <section class="card">
        <div class="row-between">
          <h2 class="card-title">📒 Kas bulan ini</h2>
          <a href="#/kas" class="link">Detail →</a>
        </div>
        <div class="stats3">
          <div><small>Masuk</small><b class="pos">${rupiah(st.masuk)}</b></div>
          <div><small>Keluar</small><b class="neg">${rupiah(st.keluar)}</b></div>
          <div><small>Laba</small><b class="${st.laba >= 0 ? "pos" : "neg"}">${rupiah(st.laba)}</b></div>
        </div>
        <a href="#/kas?add=1" class="btn soft block">+ Catat transaksi</a>
      </section>

      <section class="card">
        <div class="row-between">
          <h2 class="card-title">📅 Konten hari ini</h2>
          <a href="#/konten" class="link">Kalender →</a>
        </div>
        ${
          !s.calendar
            ? `<p class="muted">Belum ada jadwal konten. <a href="#/konten" class="link">Bikin sekarang</a></p>`
            : today.length
              ? today.map((j) => `
                <div class="task ${j.done ? "done" : ""}">
                  <button class="check" data-action="toggle" data-hari="${j.hari_ke}" aria-label="Tandai selesai">${j.done ? "✓" : ""}</button>
                  <div><b>${esc(j.ide)}</b><p class="muted small">${esc(j.platform)} · ${esc(j.format)} · ${esc(j.jam)}</p><p class="small">“${esc(j.hook)}”</p></div>
                </div>`).join("")
              : `<p class="muted">Hari ini libur posting (${fmtDate(todayISO())}). Istirahat juga penting 😌</p>`
        }
      </section>

      <section class="quick">
        <a href="#/mentor" class="quick-item">🤖<span>Tanya Mentor</span></a>
        <a href="#/konten?caption=1" class="quick-item">✍️<span>Bikin caption</span></a>
        <a href="#/profil" class="quick-item">🧾<span>Edit profil</span></a>
      </section>`;
  },
  actions: {
    toggle(el) {
      const hari = Number(el.dataset.hari);
      const cal = store.get().calendar;
      store.set({ calendar: { ...cal, jadwal: cal.jadwal.map((j) => (j.hari_ke === hari ? { ...j, done: !j.done } : j)) } });
      render();
    },
  },
};
