import { store } from "../store.js";
import { esc, list, loading, empty, copy } from "../ui.js";
import { ai } from "../ai.js";
import { busy, runAI, head } from "./_shared.js";

const prioOrder = { tinggi: 0, sedang: 1, rendah: 2 };

export const aktivasi = {
  render(s) {
    if (busy.aktivasi) return head("Aktivasi Jualan") + loading("AI lagi nyusun strategi launching…");
    const a = s.activation;
    if (!a)
      return (
        head("Aktivasi Jualan") +
        empty({ icon: "🚀", title: "Siap launching?", text: "Checklist setup Instagram, TikTok, Google Maps, WhatsApp, GoFood, GrabFood, ShopeeFood + rencana 4 minggu.", action: "gen", label: "Bikin rencana aktivasi" })
      );
    const checked = a.checked || {};
    const all = a.channels.flatMap((c) => c.langkah.map((_, i) => `${c.channel}#${i}`));
    const doneCount = all.filter((k) => checked[k]).length;
    return `
      ${head("Aktivasi Jualan")}
      <section class="card">
        <div class="row-between"><h2 class="card-title">Progres setup</h2><span class="pill" id="act-count">${doneCount}/${all.length}</span></div>
        <div class="progress"><span id="act-bar" style="width:${all.length ? (doneCount / all.length) * 100 : 0}%"></span></div>
      </section>

      ${[...a.channels]
        .sort((x, y) => (prioOrder[x.prioritas] ?? 3) - (prioOrder[y.prioritas] ?? 3))
        .map((c) => {
          const n = c.langkah.filter((_, i) => checked[`${c.channel}#${i}`]).length;
          return `
        <details class="card channel" ${n < c.langkah.length && c.prioritas === "tinggi" ? "open" : ""}>
          <summary><b>${esc(c.channel)}</b> <span class="tag ${c.prioritas}">${esc(c.prioritas)}</span><span class="muted small right" data-count="${esc(c.channel)}">${n}/${c.langkah.length}</span></summary>
          ${c.langkah
            .map((l, i) => {
              const k = `${c.channel}#${i}`;
              return `<label class="todo"><input type="checkbox" data-change="check" data-key="${esc(k)}" ${checked[k] ? "checked" : ""}><span>${esc(l)}</span></label>`;
            })
            .join("")}
          <p class="tip">💡 ${esc(c.tips)}</p>
        </details>`;
        })
        .join("")}

      <section class="card">
        <h2 class="card-title">🗓️ Rencana launching 4 minggu</h2>
        <div class="timeline">
          ${a.launching.map((w) => `<div class="tl-item"><span class="tl-dot">${esc(w.minggu)}</span><div><b>${esc(w.fokus)}</b>${list(w.aktivitas)}</div></div>`).join("")}
        </div>
      </section>

      <section class="card">
        <h2 class="card-title">🛵 Deskripsi menu buat ojol</h2>
        ${a.deskripsi_menu.map((m) => `<div class="copy-block"><b>${esc(m.menu)}</b><p>${esc(m.deskripsi)}</p><button class="btn ghost sm" data-action="copy" data-text="${esc(m.deskripsi)}">Salin</button></div>`).join("")}
      </section>

      <div class="row2">
        <button class="btn ghost" data-action="gen">↻ Bikin ulang</button>
        <a href="#/konten" class="btn primary">Jadwal konten →</a>
      </div>`;
  },
  actions: {
    gen() {
      if (store.get().activation && !confirm("Checklist lama akan diganti. Lanjut?")) return;
      return runAI("aktivasi", async () => {
        const a = await ai("activation_plan", { brand: store.get().brand?.terpilih || null });
        store.set({ activation: { ...a, checked: {} } });
      });
    },
    copy: (el) => copy(el.dataset.text),
  },
  changes: {
    check(el) {
      const a = store.get().activation;
      const checked = { ...a.checked, [el.dataset.key]: el.checked };
      store.set({ activation: { ...a, checked } });
      // Update angka progres tanpa render ulang (biar panel yang terbuka tetap terbuka)
      const all = a.channels.flatMap((c) => c.langkah.map((_, i) => `${c.channel}#${i}`));
      const done = all.filter((k) => checked[k]).length;
      document.getElementById("act-count").textContent = `${done}/${all.length}`;
      document.getElementById("act-bar").style.width = `${(done / all.length) * 100}%`;
      const ch = a.channels.find((c) => el.dataset.key.startsWith(c.channel + "#"));
      const n = ch.langkah.filter((_, i) => checked[`${ch.channel}#${i}`]).length;
      [...document.querySelectorAll("[data-count]")].find((x) => x.dataset.count === ch.channel).textContent = `${n}/${ch.langkah.length}`;
    },
  },
};
