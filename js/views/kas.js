import { icon } from "../icons.js";
import { store, uid } from "../store.js";
import { esc, rupiah, short, todayISO, fmtDate, list, download, toast } from "../ui.js";
import { ai } from "../ai.js";
import { render } from "../app.js";
import { busy, runAI, head, monthStats } from "./_shared.js";

export const KATEGORI = {
  masuk: ["Penjualan", "Pre-order", "Katering/pesanan", "Lainnya"],
  keluar: ["Bahan Baku", "Kemasan", "Operasional", "Gaji", "Marketing", "Komisi Ojol", "Peralatan", "Lainnya"],
};

let ym = todayISO().slice(0, 7);
let draft = null; // hasil parse AI yang belum disimpan
let jenisForm = "masuk";

function shiftMonth(delta) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function chart(harian) {
  const [y, m] = ym.split("-").map(Number);
  const days = new Date(y, m, 0).getDate();
  const vals = Array.from({ length: days }, (_, i) => harian[`${ym}-${String(i + 1).padStart(2, "0")}`] || { masuk: 0, keluar: 0 });
  const max = Math.max(1, ...vals.flatMap((v) => [v.masuk, v.keluar]));
  const W = 320, H = 120, bw = W / days;
  const bars = vals
    .map((v, i) => {
      const hm = (v.masuk / max) * (H - 16), hk = (v.keluar / max) * (H - 16);
      return `<rect x="${i * bw + 1}" y="${H - hm}" width="${bw / 2 - 1}" height="${hm}" class="b-in"><title>${i + 1}: masuk ${rupiah(v.masuk)}</title></rect>
              <rect x="${i * bw + bw / 2}" y="${H - hk}" width="${bw / 2 - 1}" height="${hk}" class="b-out"><title>${i + 1}: keluar ${rupiah(v.keluar)}</title></rect>`;
    })
    .join("");
  return `<svg viewBox="0 0 ${W} ${H + 14}" class="chart" role="img" aria-label="Grafik kas harian">
    <line x1="0" x2="${W}" y1="${H}" y2="${H}" class="axis"/>${bars}
    <text x="0" y="${H + 12}" class="lbl">1</text><text x="${W / 2}" y="${H + 12}" class="lbl" text-anchor="middle">${Math.ceil(days / 2)}</text><text x="${W}" y="${H + 12}" class="lbl" text-anchor="end">${days}</text>
    <text x="0" y="10" class="lbl">${short(max)}</text></svg>`;
}

function catBars(obj, cls) {
  const entries = Object.entries(obj).sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((a, [, v]) => a + v, 0) || 1;
  if (!entries.length) return `<p class="muted small">Belum ada data.</p>`;
  return entries
    .map(([k, v]) => `<div class="cat"><div class="row-between small"><span>${esc(k)}</span><b>${rupiah(v)}</b></div><div class="bar thin"><span class="${cls}" style="width:${(v / total) * 100}%"></span></div></div>`)
    .join("");
}

export const kas = {
  render(s) {
    const st = monthStats(s.transactions, ym);
    const bulan = new Date(ym + "-01T00:00:00").toLocaleDateString("id-ID", { month: "long", year: "numeric" });
    const byDate = {};
    [...st.tx].sort((a, b) => b.tanggal.localeCompare(a.tanggal)).forEach((t) => (byDate[t.tanggal] ??= []).push(t));
    const openAdd = location.hash.includes("add=1");
    const ins = s.insight?.ym === ym ? s.insight : null;

    return `
      ${head("Kas & Laporan", "#/")}
      <div class="month-nav">
        <button class="icon-btn" data-action="prev" aria-label="Bulan sebelumnya">‹</button>
        <b>${bulan}</b>
        <button class="icon-btn" data-action="next" aria-label="Bulan berikutnya">›</button>
      </div>

      <section class="card">
        <div class="stats3">
          <div><small>Masuk</small><b class="pos">${rupiah(st.masuk)}</b></div>
          <div><small>Keluar</small><b class="neg">${rupiah(st.keluar)}</b></div>
          <div><small>Laba</small><b class="${st.laba >= 0 ? "pos" : "neg"}">${rupiah(st.laba)}</b></div>
        </div>
        ${chart(st.harian)}
        <div class="legend small"><span><i class="dot in"></i>Masuk</span><span><i class="dot out"></i>Keluar</span></div>
      </section>

      <section class="card accent">
        <h2 class="card-title">Catat cepat</h2>
        <p class="muted small">Ketik bebas kayak chat, AI yang rapihin.</p>
        <form data-form="parse" class="stack">
          <textarea name="text" rows="2" placeholder="cth: jual 25 porsi @12rb, beli tahu 50rb, gas 22rb" required></textarea>
          <button class="btn primary" ${busy.parse ? "disabled" : ""}>${busy.parse ? "Lagi dibaca…" : "Rapihin"}</button>
        </form>
        ${
          draft
            ? `<div class="draft">
            ${draft.map((t, i) => `<div class="tx ${t.jenis}"><div><b>${esc(t.kategori)}</b><p class="muted small">${esc(t.catatan)}</p></div><b>${t.jenis === "masuk" ? "+" : "−"}${rupiah(t.nominal)}</b><button class="icon-btn sm" data-action="dropDraft" data-i="${i}" aria-label="Buang">${icon("x", 14)}</button></div>`).join("") || `<p class="muted small">Nggak ada nominal yang kebaca. Coba tulis angkanya, cth "50rb".</p>`}
            <div class="row2"><button class="btn ghost" data-action="cancelDraft">Batal</button><button class="btn primary" data-action="saveDraft" ${draft.length ? "" : "disabled"}>Simpan ${draft.length} transaksi</button></div>
          </div>`
            : ""
        }
      </section>

      <details class="card" ${openAdd ? "open" : ""}>
        <summary><b>Input manual</b></summary>
        <form data-form="add" class="stack">
          <div class="seg">
            <label><input type="radio" name="jenis" value="masuk" data-change="jenis" ${jenisForm === "masuk" ? "checked" : ""}><span>Pemasukan</span></label>
            <label><input type="radio" name="jenis" value="keluar" data-change="jenis" ${jenisForm === "keluar" ? "checked" : ""}><span>Pengeluaran</span></label>
          </div>
          <div class="row2">
            <input name="nominal" type="number" inputmode="numeric" min="1" placeholder="Nominal (Rp)" required>
            <select name="kategori">${KATEGORI[jenisForm].map((k) => `<option>${k}</option>`).join("")}</select>
          </div>
          <div class="row2">
            <input name="tanggal" type="date" value="${todayISO()}" required>
            <input name="catatan" placeholder="Catatan (opsional)">
          </div>
          <button class="btn primary">Simpan</button>
        </form>
      </details>

      <section class="card">
        <h2 class="card-title">Insight AI</h2>
        ${
          busy.insight
            ? `<p class="muted">AI lagi baca pembukuanmu…</p>`
            : ins
              ? `<h3>${esc(ins.headline)}</h3>${list(ins.insight)}<h4>Aksi minggu ini</h4>${list(ins.saran, "checks")}`
              : `<p class="muted small">${st.tx.length ? "Minta AI baca angka bulan ini & kasih saran." : "Catat transaksi dulu, nanti AI kasih insight."}</p>`
        }
        ${st.tx.length ? `<button class="btn soft block" data-action="insight" ${busy.insight ? "disabled" : ""}>${ins ? "↻ Perbarui insight" : "Minta insight"}</button>` : ""}
      </section>

      <section class="card">
        <h2 class="card-title">Per kategori</h2>
        <h4>Pengeluaran</h4>${catBars(st.kategori_keluar, "out")}
        <h4>Pemasukan</h4>${catBars(st.kategori_masuk, "in")}
      </section>

      <section class="card">
        <div class="row-between"><h2 class="card-title">Transaksi (${st.tx.length})</h2>${st.tx.length ? `<button class="btn ghost sm" data-action="csv">${icon("download", 14)} CSV</button>` : ""}</div>
        ${
          Object.keys(byDate).length
            ? Object.entries(byDate)
                .map(
                  ([d, txs]) => `<h4 class="date-h">${fmtDate(d, { weekday: "long", day: "numeric", month: "short" })}</h4>
              ${txs.map((t) => `<div class="tx ${t.jenis}"><div><b>${esc(t.kategori)}</b>${t.catatan ? `<p class="muted small">${esc(t.catatan)}</p>` : ""}</div><b>${t.jenis === "masuk" ? "+" : "−"}${rupiah(t.nominal)}</b>${
                t.ref === "pos"
                  ? `<a href="#/kasir?tab=rekap" class="tag" title="Otomatis dari Kasir">Kasir</a>`
                  : `<button class="icon-btn sm" data-action="del" data-id="${t.id}" aria-label="Hapus">${icon("x", 14)}</button>`
              }</div>`).join("")}`,
                )
                .join("")
            : `<p class="muted">Belum ada transaksi bulan ini.</p>`
        }
      </section>`;
  },

  actions: {
    prev() { shiftMonth(-1); render(); },
    next() { shiftMonth(1); render(); },
    dropDraft(el) { draft.splice(Number(el.dataset.i), 1); render(); },
    cancelDraft() { draft = null; render(); },
    saveDraft() {
      const tanggal = ym === todayISO().slice(0, 7) ? todayISO() : `${ym}-01`;
      const add = draft.map((t) => ({ id: uid(), tanggal, jenis: t.jenis, kategori: t.kategori, nominal: Math.round(t.nominal), catatan: t.catatan }));
      store.set((s) => ({ transactions: [...s.transactions, ...add] }));
      toast(`${add.length} transaksi disimpan`);
      draft = null;
      render();
    },
    del(el) {
      if (!confirm("Hapus transaksi ini?")) return;
      store.set((s) => ({ transactions: s.transactions.filter((t) => t.id !== el.dataset.id) }));
      render();
    },
    insight() {
      const st = monthStats(store.get().transactions, ym);
      const [y, m] = ym.split("-").map(Number);
      const prevYm = `${m === 1 ? y - 1 : y}-${String(m === 1 ? 12 : m - 1).padStart(2, "0")}`;
      const prev = monthStats(store.get().transactions, prevYm);
      return runAI("insight", async () => {
        const r = await ai("cashflow_insight", {
          bulan: ym,
          masuk: st.masuk,
          keluar: st.keluar,
          laba: st.laba,
          kategori_keluar: st.kategori_keluar,
          kategori_masuk: st.kategori_masuk,
          harian: st.harian,
          hari_aktif: st.hari_aktif,
          bulan_lalu: { masuk: prev.masuk, keluar: prev.keluar, laba: prev.laba },
        });
        store.set({ insight: { ...r, ym } });
      });
    },
    csv() {
      const st = monthStats(store.get().transactions, ym);
      const rows = [["Tanggal", "Jenis", "Kategori", "Nominal", "Catatan"], ...st.tx.map((t) => [t.tanggal, t.jenis, t.kategori, t.nominal, t.catatan])];
      download(`kas-${ym}.csv`, rows.map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n"), "text/csv");
    },
  },
  changes: {
    jenis(el) {
      jenisForm = el.value;
      const sel = el.form.querySelector("select[name=kategori]");
      sel.innerHTML = KATEGORI[jenisForm].map((k) => `<option>${k}</option>`).join("");
    },
  },
  forms: {
    parse(form) {
      const text = new FormData(form).get("text").trim();
      return runAI("parse", async () => {
        const r = await ai("parse_transactions", { text });
        draft = (r.transaksi || []).filter((t) => t.nominal > 0);
      });
    },
    add(form) {
      const fd = new FormData(form);
      const t = { id: uid(), tanggal: fd.get("tanggal"), jenis: fd.get("jenis"), kategori: fd.get("kategori"), nominal: Number(fd.get("nominal")), catatan: fd.get("catatan").trim() };
      store.set((s) => ({ transactions: [...s.transactions, t] }));
      ym = t.tanggal.slice(0, 7);
      toast("Tersimpan");
      render();
    },
  },
};
