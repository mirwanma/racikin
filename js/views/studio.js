import { store } from "../store.js";
import { esc, toast } from "../ui.js";
import { render } from "../app.js";
import { ai } from "../ai.js";
import { icon } from "../icons.js";
import { busy, runAI, head } from "./_shared.js";
import { theme, loadFonts, downloadPng, downloadSvg, slug } from "../studio/theme.js";
import { ASSETS, LOGO_STYLES, logoDoc, render as draw } from "../studio/art.js";

let grup = "Semua";
const GRUP = ["Semua", "Identitas", "Kemasan", "Outlet", "Promosi", "Sosmed"];
const namaAset = (a, t) => (typeof a.nama === "function" ? a.nama(t) : a.nama);

export const studio = {
  render(s) {
    if (!s.brand?.terpilih) {
      return `${head("Studio Brand", "#/bisnis")}
        <section class="card empty">
          <div class="empty-icon">${icon("palette", 30)}</div>
          <h3>Bikin brand kit dulu</h3>
          <p>Studio memakai nama, tagline, warna, dan font dari Brand Kit untuk membuat logo, kemasan, spanduk, poster, dan konten sosmed.</p>
          <a href="#/brand" class="btn primary">Buka Brand Kit</a>
        </section>`;
    }
    const t = theme(s);
    const st = s.studio || {};
    const list = ASSETS.filter((a) => grup === "Semua" || a.grup === grup);
    return `
      ${head("Studio Brand", "#/bisnis")}
      <p class="muted small">Semua desain dibuat otomatis dari brand kit <b>${esc(t.name)}</b>: warna, font, menu & harga. Unduh PNG untuk dicetak / diposting, atau SVG (vektor) untuk percetakan.</p>

      <section class="card">
        <h2 class="card-title">Logo</h2>
        <div class="logo-grid">
          ${LOGO_STYLES.map(
            (l) => `<button class="logo-opt ${t.logo === l.id ? "on" : ""}" data-action="logo" data-id="${l.id}" aria-pressed="${t.logo === l.id}">
              <span class="art">${logoDoc(t, l.id)}</span><small>${esc(l.nama)}</small></button>`,
          ).join("")}
        </div>
        <p class="muted small">Logo terpilih dipakai di semua desain. Mau ganti warna/font? Ubah di <a href="#/brand" class="link">Brand Kit</a>.</p>
      </section>

      <details class="card" ${st.headline ? "" : "open"}>
        <summary><b>Teks promosi & kontak</b></summary>
        <form class="stack" data-form="copy">
          <button type="button" class="btn soft" data-action="aiCopy" ${busy.copy ? "disabled" : ""}>${icon("spark", 16)} ${busy.copy ? "Lagi nulis…" : "Tulis teks promosi pakai AI"}</button>
          <label class="field"><span>Headline (poster & sosmed)</span><input name="headline" maxlength="40" value="${esc(st.headline || "")}" placeholder="${esc(t.copy.headline)}"></label>
          <label class="field"><span>Sub-headline</span><input name="sub" maxlength="70" value="${esc(st.sub || "")}" placeholder="${esc(t.copy.sub || "cth: Kuah kaldu pedas, porsi kenyang")}"></label>
          <div class="row2">
            <label class="field"><span>Promo</span><input name="promo" maxlength="36" value="${esc(st.promo || "")}" placeholder="cth: Beli 2 gratis 1"></label>
            <label class="field"><span>Ajakan (tombol)</span><input name="cta" maxlength="28" value="${esc(st.cta || "")}" placeholder="Pesan sekarang"></label>
          </div>
          <label class="field"><span>Tagline pendek (stiker & logo)</span><input name="short" maxlength="30" value="${esc(st.short || "")}" placeholder="${esc((t.tagline || "").slice(0, 30))}"></label>
          <div class="row2">
            <label class="field"><span>No. WhatsApp</span><input name="wa" type="tel" value="${esc(st.wa || "")}" placeholder="0812…"></label>
            <label class="field"><span>Instagram</span><input name="ig" value="${esc(st.ig || "")}" placeholder="@usahamu"></label>
          </div>
          <div class="row2">
            <label class="field"><span>Jam buka</span><input name="jam" value="${esc(st.jam || "")}" placeholder="14.00–22.00"></label>
            <label class="field"><span>Alamat singkat</span><input name="alamat" value="${esc(st.alamat || "")}" placeholder="${esc(t.lokasi)}"></label>
          </div>
          <button class="btn primary">Pakai teks ini</button>
        </form>
      </details>

      <div class="chips studio-filter">${GRUP.map((g) => `<button class="chip-btn ${g === grup ? "on" : ""}" data-action="grup" data-g="${g}">${g}</button>`).join("")}</div>

      ${list
        .map((a) => {
          const r = draw(a, t);
          return `<section class="card asset">
            <div class="row-between"><div><h3>${esc(namaAset(a, t))}</h3><p class="mono muted">${esc(a.size)}</p></div><span class="tag opsional">${esc(a.grup)}</span></div>
            <div class="art asset-art ${a.transparent ? "checker" : ""}">${r.svg}</div>
            <div class="row2">
              <button class="btn primary" data-action="png" data-id="${a.id}">${icon("download", 16)} PNG</button>
              <button class="btn ghost" data-action="svg" data-id="${a.id}">${icon("download", 16)} SVG</button>
            </div>
          </section>`;
        })
        .join("")}

      <section class="card info-card">
        <h2 class="card-title">Tips cetak</h2>
        <ul class="checks small">
          <li>Spanduk: kirim PNG 6000×2000 ke percetakan, minta bahan MMT/flexi ukuran 300×100 cm.</li>
          <li>Stiker kemasan: cetak di kertas stiker vinyl/chromo, potong bulat Ø5 cm (bisa minta "cutting" ke percetakan).</li>
          <li>Poster & papan menu: cetak A4 / A3, kertas art paper 150 gr ke atas biar tidak tembus.</li>
          <li>Mau diedit lagi di Canva? Unggah file SVG atau PNG-nya sebagai bahan.</li>
        </ul>
      </section>`;
  },

  after() {
    const s = store.get();
    if (s.brand?.terpilih) loadFonts(theme(s)).catch(() => {});
  },

  actions: {
    logo(el) {
      store.set((s) => ({ studio: { ...(s.studio || {}), logo: el.dataset.id } }));
      render();
    },
    grup(el) {
      grup = el.dataset.g;
      render();
    },
    async png(el) {
      const s = store.get();
      const t = theme(s);
      const a = ASSETS.find((x) => x.id === el.dataset.id);
      const r = draw(a, t);
      toast("Menyiapkan file PNG…");
      el.disabled = true;
      try {
        await downloadPng(r.svg, t, r.w, r.h, a.png, `${slug(t.name)}-${a.id}.png`, !!a.transparent);
        toast("PNG terunduh");
      } catch (err) {
        toast(err.message || "Gagal membuat PNG", "err");
      } finally {
        el.disabled = false;
      }
    },
    async svg(el) {
      const t = theme(store.get());
      const a = ASSETS.find((x) => x.id === el.dataset.id);
      await downloadSvg(draw(a, t).svg, t, `${slug(t.name)}-${a.id}.svg`);
      toast("SVG terunduh");
    },
    aiCopy() {
      const s = store.get();
      const t = theme(s);
      return runAI("copy", async () => {
        const r = await ai("marketing_copy", {
          brand: t.name,
          tagline: t.tagline,
          tone: s.brand?.tone_of_voice || [],
          menu: t.menu,
          promo_sekarang: s.studio?.promo || "",
        });
        store.set({ studio: { ...(s.studio || {}), headline: r.headline, sub: r.sub, promo: r.promo, cta: r.cta, short: r.tagline_pendek } });
        toast("Teks promosi dari AI dipasang ke semua desain");
      });
    },
  },

  forms: {
    copy(form) {
      const fd = new FormData(form);
      const val = (k) => String(fd.get(k) || "").trim();
      store.set((s) => ({
        studio: { ...(s.studio || {}), headline: val("headline"), sub: val("sub"), promo: val("promo"), cta: val("cta"), short: val("short"), wa: val("wa"), ig: val("ig"), jam: val("jam"), alamat: val("alamat") },
      }));
      toast("Teks dipasang ke semua desain");
      render();
    },
  },
};
