import { store } from "../store.js";
import { esc, rupiah, list, loading, empty } from "../ui.js";
import { ai } from "../ai.js";
import { busy, runAI, head, disclaimer } from "./_shared.js";

export const ide = {
  render(s) {
    const r = s.idea;
    if (busy.ide) return head("Analisa Ide") + loading("AI lagi bedah ide kamu…");
    if (!r)
      return (
        head("Analisa Ide") +
        empty({
          icon: "💡",
          title: "Ide kamu layak nggak, ya?",
          text: `AI bakal analisa "${s.profile.ide}" berdasarkan lokasi, target pasar, dan modalmu.`,
          action: "run",
          label: "Analisa ideku",
        })
      );
    const color = r.skor >= 75 ? "var(--good)" : r.skor >= 55 ? "var(--warn)" : "var(--bad)";
    return `
      ${head("Analisa Ide")}
      <section class="card score">
        <div class="ring" style="--p:${r.skor};--c:${color}"><b>${Math.round(r.skor)}</b><small>/100</small></div>
        <div><h2>${esc(r.verdict)}</h2><p>${esc(r.ringkasan)}</p></div>
      </section>

      <section class="card">
        <h2 class="card-title">💸 Harga & margin</h2>
        <div class="stats3">
          <div><small>Harga jual</small><b>${rupiah(r.harga.harga_jual)}</b></div>
          <div><small>HPP/porsi</small><b>${rupiah(r.harga.hpp)}</b></div>
          <div><small>Margin</small><b class="pos">${Math.round(r.harga.margin_persen)}%</b></div>
        </div>
        <p class="muted small">${esc(r.harga.catatan)}</p>
      </section>

      <section class="card">
        <h2 class="card-title">🙋 Calon pembelimu</h2>
        ${r.persona.map((x) => `<div class="persona"><b>${esc(x.nama)}</b><p class="small">${esc(x.deskripsi)}</p></div>`).join("")}
      </section>

      <section class="card">
        <h2 class="card-title">🧭 SWOT</h2>
        <div class="swot">
          <div class="s"><h4>Kekuatan</h4>${list(r.swot.kekuatan)}</div>
          <div class="w"><h4>Kelemahan</h4>${list(r.swot.kelemahan)}</div>
          <div class="o"><h4>Peluang</h4>${list(r.swot.peluang)}</div>
          <div class="t"><h4>Ancaman</h4>${list(r.swot.ancaman)}</div>
        </div>
      </section>

      <section class="card">
        <h2 class="card-title">⚔️ Kompetitor & pembeda</h2>
        ${r.kompetitor.map((k) => `<p><b>${esc(k.nama)}</b> <span class="muted small">— ${esc(k.catatan)}</span></p>`).join("")}
        <h4>Cara kamu menang:</h4>${list(r.pembeda, "checks")}
      </section>

      <section class="card">
        <h2 class="card-title">⚠️ Risiko</h2>${list(r.risiko)}
      </section>

      <section class="card accent">
        <h2 class="card-title">🧪 Validasi minggu ini</h2>${list(r.validasi, "checks")}
      </section>

      <div class="row2">
        <button class="btn ghost" data-action="run">↻ Analisa ulang</button>
        <a href="#/rab" class="btn primary">Lanjut ke RAB →</a>
      </div>
      ${disclaimer}`;
  },
  actions: {
    run: () =>
      runAI("ide", async () => {
        const idea = await ai("analyze_idea");
        store.set({ idea });
      }),
  },
};
