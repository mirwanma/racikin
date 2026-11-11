import { store } from "../store.js";
import { esc, list, loading, empty, copy, toast } from "../ui.js";
import { ai } from "../ai.js";
import { render } from "../app.js";
import { busy, runAI, head } from "./_shared.js";

const validHex = (h) => (/^#[0-9a-f]{6}$/i.test(h) ? h : "#999999");

export const brand = {
  render(s) {
    if (busy.brand) return head("Brand Kit") + loading("AI lagi nyari nama & warna yang kece…");
    const b = s.brand;
    if (!b)
      return (
        head("Brand Kit") +
        empty({ icon: "🎨", title: "Kasih identitas ke bisnismu", text: "Nama, tagline, brand story, warna, font, konsep logo, sampai ide nama menu.", action: "gen", label: "Racik brand kit" })
      );
    const t = b.terpilih || {};
    return `
      ${head("Brand Kit")}
      <section class="card brand-preview" style="--b1:${validHex(b.palet[0]?.hex)};--b2:${validHex(b.palet[1]?.hex)};--b3:${validHex(b.palet[2]?.hex)};--b4:${validHex(b.palet[3]?.hex)}">
        <div class="bp-logo">${esc((t.nama || b.opsi_nama[0].nama).slice(0, 1))}</div>
        <h2>${esc(t.nama || "Pilih nama di bawah")}</h2>
        <p>${esc(t.tagline || "Pilih tagline")}</p>
      </section>

      <section class="card">
        <h2 class="card-title">🏷️ Pilih nama</h2>
        ${b.opsi_nama.map((n) => `
          <button class="option ${t.nama === n.nama ? "on" : ""}" data-action="pick" data-field="nama" data-value="${esc(n.nama)}">
            <b>${esc(n.nama)}</b><span class="muted small">${esc(n.alasan)}</span>
          </button>`).join("")}
      </section>

      <section class="card">
        <h2 class="card-title">💬 Pilih tagline</h2>
        ${b.tagline.map((x) => `<button class="option ${t.tagline === x ? "on" : ""}" data-action="pick" data-field="tagline" data-value="${esc(x)}"><b>${esc(x)}</b></button>`).join("")}
      </section>

      <section class="card">
        <h2 class="card-title">📖 Brand story</h2>
        <p>${esc(b.brand_story)}</p>
        <button class="btn ghost sm" data-action="copy" data-text="${esc(b.brand_story)}">Salin</button>
        <h4>Tone of voice</h4>${list(b.tone_of_voice, "checks")}
      </section>

      <section class="card">
        <h2 class="card-title">🎨 Palet warna</h2>
        <div class="palette">
          ${b.palet.map((c) => `<button class="swatch" style="--c:${validHex(c.hex)}" data-action="copy" data-text="${esc(c.hex)}"><span></span><b>${esc(c.nama)}</b><small>${esc(c.hex)} · ${esc(c.peran)}</small></button>`).join("")}
        </div>
        <h4>Font</h4>
        <p>Judul: <b>${esc(b.font.judul)}</b> · Isi: <b>${esc(b.font.isi)}</b></p>
      </section>

      <section class="card">
        <h2 class="card-title">✏️ Konsep logo</h2>
        <p>${esc(b.konsep_logo)}</p>
        <button class="btn ghost sm" data-action="copy" data-text="${esc(b.konsep_logo)}">Salin brief buat desainer / AI gambar</button>
      </section>

      <section class="card">
        <h2 class="card-title">🍽️ Ide nama menu</h2>
        ${b.ide_menu.map((m) => `<p><b>${esc(m.nama)}</b> <span class="muted small">— ${esc(m.deskripsi)}</span></p>`).join("")}
        <h4>Ide kemasan</h4>${list(b.kemasan)}
      </section>

      <div class="row2">
        <button class="btn ghost" data-action="gen">↻ Racik ulang</button>
        <a href="#/aktivasi" class="btn primary">Lanjut aktivasi →</a>
      </div>`;
  },
  actions: {
    gen: () =>
      runAI("brand", async () => {
        const b = await ai("generate_brand", { analisa: store.get().idea ? { pembeda: store.get().idea.pembeda } : null });
        store.set({ brand: { ...b, terpilih: { nama: b.opsi_nama[0]?.nama, tagline: b.tagline[0] } } });
      }),
    pick(el) {
      const b = store.get().brand;
      store.set({ brand: { ...b, terpilih: { ...b.terpilih, [el.dataset.field]: el.dataset.value } } });
      if (el.dataset.field === "nama") toast(`Nama "${el.dataset.value}" dipilih`);
      render();
    },
    copy: (el) => copy(el.dataset.text),
  },
};
