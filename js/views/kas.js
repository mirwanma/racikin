import { icon } from "../icons.js";
import { store, uid } from "../store.js";
import { esc, rupiah, short, todayISO, fmtDate, list, download, toast } from "../ui.js";
import { ai } from "../ai.js";
import { render } from "../app.js";
import { busy, runAI, head, monthStats } from "./_shared.js";
import { PERIODE, SUMBER, filterTx, ringkas, adaFilter, sumberOf } from "../kas-filter.js";
import { saldoKas } from "../impor.js";

export const KATEGORI = {
  masuk: ["Penjualan", "Pre-order", "Katering/pesanan", "Lainnya"],
  keluar: ["Bahan Baku", "Kemasan", "Operasional", "Gaji", "Marketing", "Komisi Order Online", "Peralatan", "Pajak", "Lainnya"],
};

let ym = todayISO().slice(0, 7);
let draft = null; // hasil parse AI yang belum disimpan
let jenisForm = "masuk";
// Daftar transaksi: default hanya hari ini (ringan); bisa diperluas, dicari & difilter.
let f = { periode: "hari", dari: "", sampai: "", q: "", jenis: "", kategori: "", sumber: "" };
const PER_HALAMAN = 50;
let limit = PER_HALAMAN;
let filterOpen = false; // panel filter tetap terbuka sampai ditutup sendiri
let saldoOpen = false; // form saldo awal

/** Saldo kas: saldo awal + masuk − keluar sejak tanggal itu. */
function saldoCard(s) {
  if (location.hash.includes("saldo=1")) {
    saldoOpen = true;
    history.replaceState(null, "", "#/kas");
  }
  const a = s.kasAwal;
  const form = `<form data-form="saldo" class="inline-form stack">
      <div class="row2">
        <label class="field"><span>Uang yang ada (Rp)</span><input name="nominal" type="number" inputmode="numeric" min="0" step="1000" value="${a ? a.nominal : ""}" placeholder="cth: 2500000" required autofocus></label>
        <label class="field"><span>Per tanggal</span><input name="tanggal" type="date" value="${a ? a.tanggal : todayISO()}" max="${todayISO()}" required></label>
      </div>
      <p class="small muted">Hitung semua uang usaha: laci kasir + rekening/e-wallet usaha, sebelum jualan hari itu.</p>
      <div class="row2"><button type="button" class="btn ghost" data-action="saldoTutup">Batal</button><button class="btn primary">Simpan saldo</button></div>
    </form>`;
  if (!a) {
    return `<section class="card saldo-card">
      <div class="row-between"><h2 class="card-title" style="margin:0">Saldo kas</h2>${saldoOpen ? "" : `<button class="btn soft sm" data-action="saldoBuka">Isi saldo awal</button>`}</div>
      ${saldoOpen ? form : `<p class="small muted">Isi uang yang ada sekarang biar saldo usahamu keitung otomatis dari kasir & catatan Kas.</p>`}
    </section>`;
  }
  const saldo = saldoKas(s);
  return `<section class="card saldo-card">
    <div class="row-between"><div><small class="muted">Saldo kas sekarang (perkiraan)</small><b class="saldo ${saldo < 0 ? "neg" : ""}">${rupiah(saldo)}</b></div>${saldoOpen ? "" : `<button class="btn ghost sm" data-action="saldoBuka">Ubah</button>`}</div>
    <p class="small muted">Saldo awal ${rupiah(a.nominal)} per ${esc(fmtDate(a.tanggal))} + uang masuk − keluar sejak itu.</p>
    ${saldoOpen ? form : ""}
  </section>`;
}
const namaBulan = () => new Date(ym + "-01T00:00:00").toLocaleDateString("id-ID", { month: "long", year: "numeric" });

// Transaksi otomatis dari fitur lain: diubah / dihapus dari halamannya supaya catatannya tetap cocok.
const TERKAIT = { utang: ["Utang", "#/belanja?tab=utang"], kasbon: ["Kasbon", "#/kasbon"], pajak: ["Pajak", "#/pajak"] };

function txRow(t) {
  return `<div class="tx ${t.jenis}"><div><b>${esc(t.kategori)}</b>${t.catatan ? `<p class="muted small">${esc(t.catatan)}</p>` : ""}</div><b>${t.jenis === "masuk" ? "+" : "−"}${rupiah(t.nominal)}</b>${
    sumberOf(t) === "kasir"
      ? `<a href="#/kasir?tab=rekap" class="tag" title="Otomatis dari Kasir">Kasir</a>`
      : sumberOf(t) === "laci"
        ? `<a href="#/shift" class="tag" title="Pengeluaran dari laci kasir">Laci</a>`
        : TERKAIT[t.ref]
          ? `<a href="${TERKAIT[t.ref][1]}" class="tag" title="Ubah / hapus dari halamannya">${TERKAIT[t.ref][0]}</a>`
          : `<button class="icon-btn sm" data-action="del" data-id="${t.id}" aria-label="Hapus">${icon("x", 14)}</button>`
  }</div>`;
}

const labelPeriode = () =>
  f.periode === "bulan" ? namaBulan() : f.periode === "rentang" ? (f.dari || f.sampai ? `${f.dari ? fmtDate(f.dari, { day: "numeric", month: "short" }) : "awal"} – ${f.sampai ? fmtDate(f.sampai, { day: "numeric", month: "short" }) : "sekarang"}` : "pilih tanggal") : PERIODE.find((p) => p.id === f.periode).nama.toLowerCase();

/** Isi daftar (ringkasan + baris per tanggal + tombol muat lagi). Dirender ulang sendiri saat mengetik di kolom cari. */
function txList(s) {
  const all = filterTx(s.transactions, f, todayISO(), ym);
  const r = ringkas(all);
  const shown = all.slice(0, limit);
  const byDate = {};
  for (const t of shown) (byDate[t.tanggal] ??= []).push(t);
  const kosong = adaFilter(f)
    ? `<p class="muted">Tidak ada transaksi yang cocok. <button class="link-btn" data-action="resetFilter">Hapus filter</button></p>`
    : `<p class="muted">Belum ada transaksi ${esc(labelPeriode())}.</p>${f.periode === "hari" ? `<button class="btn ghost sm" data-action="periode" data-p="7">Lihat 7 hari terakhir</button>` : ""}`;
  return `
    <div class="tx-sum"><span><b>${r.n}</b> transaksi · ${esc(labelPeriode())}</span>
      <span><b class="pos">+${short(r.masuk)}</b> <b class="neg">−${short(r.keluar)}</b> <b class="${r.selisih >= 0 ? "" : "neg"}">= ${r.selisih < 0 ? "−" : ""}${short(Math.abs(r.selisih))}</b></span></div>
    ${
      all.length
        ? Object.entries(byDate)
            .map(([d, txs]) => `<h4 class="date-h">${fmtDate(d, { weekday: "long", day: "numeric", month: "short" })}</h4>${txs.map(txRow).join("")}`)
            .join("")
        : kosong
    }
    ${all.length > limit ? `<button class="btn ghost block" data-action="more">Tampilkan ${Math.min(PER_HALAMAN, all.length - limit)} lagi <small class="muted">(${all.length - limit} tersisa)</small></button>` : ""}`;
}

function txSection(s) {
  const kats = [...new Set((s.transactions || []).map((t) => t.kategori))].sort((a, b) => a.localeCompare(b, "id"));
  const nFilter = [f.jenis, f.kategori, f.sumber].filter(Boolean).length;
  return `<section class="card tx-card">
    <div class="row-between"><h2 class="card-title" style="margin:0">Transaksi</h2><button class="btn ghost sm" data-action="csv">${icon("download", 14)} CSV</button></div>
    <div class="chips tx-periode">${PERIODE.map((p) => `<button class="chip-btn ${f.periode === p.id ? "on" : ""}" data-action="periode" data-p="${p.id}">${p.id === "bulan" ? esc(namaBulan()) : p.nama}</button>`).join("")}</div>
    ${
      f.periode === "rentang"
        ? `<div class="row2 tx-rentang"><label class="field"><span>Dari</span><input type="date" value="${esc(f.dari)}" max="${todayISO()}" data-change="dari"></label><label class="field"><span>Sampai</span><input type="date" value="${esc(f.sampai)}" max="${todayISO()}" data-change="sampai"></label></div>`
        : ""
    }
    <div class="tx-tools">
      <input type="search" class="tx-search" value="${esc(f.q)}" placeholder="Cari: gas, tahu, GoFood, 22rb…" aria-label="Cari transaksi" autocomplete="off">
      <details class="tx-filter" ${filterOpen || nFilter ? "open" : ""}><summary class="btn ghost sm">Filter${nFilter ? ` (${nFilter})` : ""}</summary>
        <div class="tx-filter-body">
          <select data-change="fjenis" aria-label="Jenis"><option value="">Masuk & keluar</option><option value="masuk" ${f.jenis === "masuk" ? "selected" : ""}>Pemasukan</option><option value="keluar" ${f.jenis === "keluar" ? "selected" : ""}>Pengeluaran</option></select>
          <select data-change="fkategori" aria-label="Kategori"><option value="">Semua kategori</option>${kats.map((k) => `<option ${f.kategori === k ? "selected" : ""}>${esc(k)}</option>`).join("")}</select>
          <select data-change="fsumber" aria-label="Sumber"><option value="">Semua sumber</option>${SUMBER.map((x) => `<option value="${x.id}" ${f.sumber === x.id ? "selected" : ""}>${x.nama}</option>`).join("")}</select>
          ${nFilter || f.q ? `<button class="btn ghost sm" data-action="resetFilter">Reset</button>` : ""}
        </div>
      </details>
    </div>
    <div id="tx-list">${txList(s)}</div>
  </section>`;
}

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
    const openAdd = location.hash.includes("add=1");
    const ins = s.insight?.ym === ym ? s.insight : null;

    return `
      ${head("Kas & Laporan", "#/")}
      <div class="month-nav">
        <button class="icon-btn" data-action="prev" aria-label="Bulan sebelumnya">‹</button>
        <b>${bulan}</b>
        <button class="icon-btn" data-action="next" aria-label="Bulan berikutnya">›</button>
      </div>

      ${saldoCard(s)}
      <section class="card">
        <div class="stats3">
          <div><small>Masuk</small><b class="pos">${rupiah(st.masuk)}</b></div>
          <div><small>Keluar</small><b class="neg">${rupiah(st.keluar)}</b></div>
          <div><small>Laba</small><b class="${st.laba >= 0 ? "pos" : "neg"}">${rupiah(st.laba)}</b></div>
        </div>
        ${chart(st.harian)}
        <div class="legend small"><span><i class="dot in"></i>Masuk</span><span><i class="dot out"></i>Keluar</span></div>
        <a href="#/laporan" class="lr-link">${icon("receipt", 16)}<span><b>Laporan laba rugi</b><small class="muted">"Laba" di atas = uang masuk − keluar. Laba sebenarnya (setelah HPP) ada di laporan.</small></span>${icon("chevron", 16)}</a>
        <a href="#/impor-jual" class="lr-link">${icon("download", 16)}<span><b>Impor penjualan lama</b><small class="muted">Dari Excel, aplikasi kasir lain, atau laporan GoFood / Grab (CSV)</small></span>${icon("chevron", 16)}</a>
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

      ${txSection(s)}
`;
  },

  after(root) {
    root.querySelector(".tx-filter")?.addEventListener("toggle", (e) => (filterOpen = e.target.open));
    const input = root.querySelector(".tx-search");
    if (!input) return;
    let t = null;
    input.addEventListener("input", () => {
      clearTimeout(t);
      t = setTimeout(() => {
        f.q = input.value;
        limit = PER_HALAMAN;
        root.querySelector("#tx-list").innerHTML = txList(store.get());
      }, 150);
    });
  },

  actions: {
    saldoBuka() {
      saldoOpen = true;
      render();
    },
    saldoTutup() {
      saldoOpen = false;
      render();
    },
    prev() { shiftMonth(-1); f.periode = "bulan"; limit = PER_HALAMAN; render(); },
    next() { shiftMonth(1); f.periode = "bulan"; limit = PER_HALAMAN; render(); },
    periode(el) {
      f.periode = el.dataset.p;
      if (f.periode === "rentang" && !f.dari && !f.sampai) {
        f.dari = `${ym}-01`;
        f.sampai = todayISO();
      }
      limit = PER_HALAMAN;
      render();
    },
    more() {
      limit += PER_HALAMAN;
      render();
    },
    resetFilter() {
      f = { ...f, q: "", jenis: "", kategori: "", sumber: "" };
      limit = PER_HALAMAN;
      render();
    },
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
      // Sesuai filter yang sedang aktif (semua hasil, bukan cuma yang tampil).
      const list = filterTx(store.get().transactions, f, todayISO(), ym);
      if (!list.length) return toast("Tidak ada transaksi untuk diunduh", "err");
      const rows = [["Tanggal", "Jenis", "Kategori", "Nominal", "Catatan", "Sumber"], ...list.map((t) => [t.tanggal, t.jenis, t.kategori, t.nominal, t.catatan, sumberOf(t)])];
      const nama = f.periode === "bulan" ? ym : f.periode === "hari" ? todayISO() : f.periode;
      download(`kas-${nama}.csv`, "\ufeff" + rows.map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n"), "text/csv");
    },
  },
  changes: {
    dari(el) {
      f.dari = el.value;
      limit = PER_HALAMAN;
      render();
    },
    sampai(el) {
      f.sampai = el.value;
      limit = PER_HALAMAN;
      render();
    },
    fjenis(el) {
      f.jenis = el.value;
      limit = PER_HALAMAN;
      render();
    },
    fkategori(el) {
      f.kategori = el.value;
      limit = PER_HALAMAN;
      render();
    },
    fsumber(el) {
      f.sumber = el.value;
      limit = PER_HALAMAN;
      render();
    },
    jenis(el) {
      jenisForm = el.value;
      const sel = el.form.querySelector("select[name=kategori]");
      sel.innerHTML = KATEGORI[jenisForm].map((k) => `<option>${k}</option>`).join("");
    },
  },
  forms: {
    saldo(form) {
      const fd = new FormData(form);
      const nominal = Math.max(0, Math.round(Number(fd.get("nominal")) || 0));
      const tanggal = String(fd.get("tanggal") || todayISO()).slice(0, 10);
      store.set({ kasAwal: { tanggal: tanggal > todayISO() ? todayISO() : tanggal, nominal } });
      saldoOpen = false;
      toast("Saldo awal disimpan");
      render();
    },
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
      if (t.tanggal !== todayISO() && f.periode === "hari") f.periode = "bulan"; // biar transaksi yang baru dicatat kelihatan
      toast("Tersimpan");
      render();
    },
  },
};
