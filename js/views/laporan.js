// Laporan laba rugi bulanan + grafik laba 6 bulan + menu paling untung + cetak/CSV.
import { store } from "../store.js";
import { esc, rupiah, short, download, todayISO } from "../ui.js";
import { render } from "../app.js";
import { icon } from "../icons.js";
import { head } from "./_shared.js";
import { labaRugi, metodeDefault, bulanTersedia, bulanSebelum, delta, catatan, toCSV, pembanding } from "../laporan.js";

let ym = null;
let metode = null; // null = otomatis per bulan

const namaBulan = (m, opt = { month: "long", year: "numeric" }) => new Date(m + "-01T00:00:00").toLocaleDateString("id-ID", opt);
const bisnisOf = (s) => s.brand?.terpilih?.nama || s.profile?.nama || "Usaha";
const sign = (n) => (n < 0 ? "−" : "") + rupiah(Math.abs(n));

let vsLabel = "";
function deltaTag(now, prev, invers = false) {
  const d = delta(now, prev);
  if (d === null || !Number.isFinite(d)) return "";
  const naik = d >= 0;
  const baik = invers ? !naik : naik;
  return `<span class="delta ${baik ? "up" : "down"}">${naik ? "▲" : "▼"} ${Math.abs(d).toFixed(0)}% vs ${esc(vsLabel)}</span>`;
}

/** Grafik kolom laba bersih 6 bulan (satu seri; bulan rugi di bawah garis nol). */
function chart(s, months) {
  const data = months.map((m) => ({ m, r: labaRugi(s, m, metode || metodeDefault(s, m)) }));
  const vals = data.map((d) => d.r.labaBersih);
  const maxPos = Math.max(0, ...vals);
  const minNeg = Math.min(0, ...vals);
  const range = maxPos - minNeg || 1;
  const H = 150;
  const PAD = 20; // ruang label nilai di atas batang tertinggi
  const Hi = H - PAD - (minNeg < 0 ? PAD : 0);
  const y0 = PAD + (maxPos / range) * Hi; // posisi garis nol dari atas
  return `<section class="card">
    <h2 class="card-title">Laba bersih ${months.length} bulan</h2>
    <p class="small muted">Ketuk batang untuk lihat laporan bulan itu.</p>
    <div class="lr-chart" style="--h:${H}px">
      <div class="lr-zero" style="top:${y0}px"></div>
      ${data
        .map(({ m, r }) => {
          const v = r.labaBersih;
          const h = Math.max(2, (Math.abs(v) / range) * Hi);
          const top = v >= 0 ? y0 - h : y0;
          const on = m === ym;
          return `<button class="lr-col ${on ? "on" : ""}" data-action="bulan" data-ym="${m}" aria-label="${esc(namaBulan(m))}: laba bersih ${esc(sign(v))}">
            <span class="lr-bar ${v < 0 ? "neg" : ""}" style="top:${top}px;height:${h}px"></span>
            ${on ? `<span class="lr-val" style="top:${v >= 0 ? top - 18 : top + h + 2}px">${v < 0 ? "−" : ""}${short(Math.abs(v))}</span>` : ""}
            <span class="lr-tip" role="tooltip"><b>${esc(namaBulan(m))}</b><span>Pendapatan ${rupiah(r.pendapatan)}</span><span>Laba bersih ${esc(sign(v))}</span><span>Margin ${r.marginBersih.toFixed(0)}%</span></span>
            <span class="lr-x">${esc(namaBulan(m, { month: "short" }))}</span>
          </button>`;
        })
        .join("")}
    </div>
  </section>`;
}

const baris = (label, val, cls = "", sub = "") =>
  `<div class="lr-row ${cls}"><span>${label}${sub ? ` <small class="muted">${sub}</small>` : ""}</span><b>${val}</b></div>`;

function statement(r, s) {
  const p = r.rincianPendapatan;
  const sd = r.sampai && r.ym === todayISO().slice(0, 7) ? ` (s.d. ${new Date(r.sampai + "T00:00:00").getDate()} ${namaBulan(r.ym, { month: "short" })})` : "";
  return `<section class="card lr-statement">
    <div class="lr-head"><div><small class="mono muted">LAPORAN LABA RUGI</small><h2>${esc(bisnisOf(s))}</h2><p class="small muted">${esc(namaBulan(r.ym))}${esc(sd)} · HPP ${r.metode === "resep" ? "dari resep" : "dari belanja bahan"}</p></div></div>
    <h4>Pendapatan</h4>
    ${p.kasirToko ? baris("Penjualan toko (kasir)", rupiah(p.kasirToko), "", p.kasbon ? `termasuk kasbon ${rupiah(p.kasbon)}` : "") : ""}
    ${p.kasirOnline ? baris("Penjualan order online", rupiah(p.kasirOnline), "", "harga ke pembeli") : ""}
    ${p.manual ? baris("Penjualan dicatat manual", rupiah(p.manual)) : ""}
    ${p.pesanan ? baris("Pesanan / katering", rupiah(p.pesanan)) : ""}
    ${baris("Total pendapatan", rupiah(r.pendapatan), "sub", r.potonganPromo ? `sudah dipotong promo ${rupiah(r.potonganPromo)}` : "")}
    ${baris("Harga pokok penjualan (HPP)", "−" + rupiah(r.hpp), "", r.metode === "resep" ? "porsi terjual × HPP resep" : "belanja bahan & kemasan")}
    ${baris("Laba kotor", sign(r.labaKotor), "total", `margin ${r.marginKotor.toFixed(0)}%`)}
    <h4>Biaya operasional</h4>
    ${r.biayaKat.length ? r.biayaKat.map(([k, v]) => baris(esc(k), "−" + rupiah(v))).join("") : `<p class="small muted">Belum ada biaya tercatat.</p>`}
    ${baris("Total biaya", "−" + rupiah(r.biaya), "sub")}
    ${baris("Laba usaha", sign(r.labaUsaha), "total")}
    ${r.lain ? baris("Pendapatan lain-lain", rupiah(r.lain)) : ""}
    ${baris("Laba bersih", sign(r.labaBersih), `grand ${r.labaBersih < 0 ? "rugi" : ""}`, `margin ${r.marginBersih.toFixed(0)}%`)}
    <h4>Arus kas</h4>
    ${r.metode === "resep" && r.belanjaHpp ? baris("Belanja bahan & kemasan", "−" + rupiah(r.belanjaHpp), "", "sudah dihitung lewat HPP") : ""}
    ${r.aset ? baris("Belanja peralatan (aset)", "−" + rupiah(r.aset)) : ""}
    ${baris("Arus kas bersih (masuk − keluar)", sign(r.arusKas), "sub")}
  </section>`;
}

function menuCard(r) {
  if (r.metode !== "resep" || !r.menu.length) return "";
  const top = r.menu.slice(0, 5);
  const tipis = [...r.menu].filter((m) => m.porsi >= 5).sort((a, b) => a.margin - b.margin).slice(0, 3);
  const row = (m) => `<tr><td>${esc(m.nama)}</td><td class="num">${m.porsi}</td><td class="num">${short(m.untung)}</td><td class="num">${m.margin.toFixed(0)}%</td></tr>`;
  return `<section class="card">
    <h2 class="card-title">Menu paling untung</h2>
    <table class="lr-table"><thead><tr><th>Menu</th><th class="num">Porsi</th><th class="num">Untung</th><th class="num">Margin</th></tr></thead><tbody>${top.map(row).join("")}</tbody></table>
    ${tipis.length ? `<h4>Margin paling tipis</h4><table class="lr-table"><tbody>${tipis.map(row).join("")}</tbody></table>` : ""}
    ${
      r.opsi?.length
        ? `<h4>Varian & topping terlaris</h4><table class="lr-table"><thead><tr><th>Pilihan</th><th class="num">Porsi</th><th class="num">Untung +/−</th></tr></thead><tbody>${r.opsi
            .slice(0, 5)
            .map((o) => `<tr><td>${esc(o.nama)} <small class="muted">${esc(o.grup)}</small></td><td class="num">${o.porsi}</td><td class="num">${short(o.untung)}</td></tr>`)
            .join("")}</tbody></table><p class="small muted">Pilihan gratis yang pakai bahan (mis. level pedas) bikin untung minus. Pertimbangkan kasih harga tambahan.</p>`
        : ""
    }
    <p class="small muted">Perkiraan pakai harga toko & HPP resep saat ini. Untung = porsi × (harga − HPP), sebelum biaya operasional.</p>
  </section>`;
}

export const laporan = {
  render(s) {
    const months = bulanTersedia(s);
    if (!months.length) {
      return `${head("Laporan Laba Rugi", "#/kas")}<section class="card empty"><div class="empty-icon">${icon("receipt", 30)}</div><h3>Belum ada transaksi</h3><p>Catat penjualan lewat Kasir atau transaksi di Kas dulu, nanti laporannya muncul di sini.</p><a href="#/kasir" class="btn primary">Buka Kasir</a><a href="#/impor-jual" class="btn ghost">Impor penjualan lama</a></section>`;
    }
    if (!ym || !months.includes(ym)) ym = months[months.length - 1];
    const m = metode || metodeDefault(s, ym);
    const r = labaRugi(s, ym, m);
    const pb = pembanding(s, ym, metode, todayISO());
    const prev = pb?.r || null;
    vsLabel = pb ? (pb.sebagian ? `1–${pb.hari} ${namaBulan(bulanSebelum(ym), { month: "short" })}` : namaBulan(bulanSebelum(ym), { month: "short" })) : "";
    const last6 = months.slice(-6);
    return `${head("Laporan Laba Rugi", "#/kas")}
      <div class="chips no-print">${months
        .slice(-6)
        .map((x) => `<button class="chip-btn ${x === ym ? "on" : ""}" data-action="bulan" data-ym="${x}">${esc(namaBulan(x, { month: "short", year: "2-digit" }))}</button>`)
        .join("")}</div>
      <div class="seg no-print">
        <label><input type="radio" name="metode" value="resep" data-change="metode" ${m === "resep" ? "checked" : ""}><span>HPP dari resep</span></label>
        <label><input type="radio" name="metode" value="belanja" data-change="metode" ${m === "belanja" ? "checked" : ""}><span>HPP dari belanja</span></label>
      </div>

      <section class="card lr-hero">
        <small class="mono muted">LABA BERSIH ${esc(namaBulan(ym, { month: "long" }).toUpperCase())}</small>
        <div class="lr-big ${r.labaBersih < 0 ? "rugi" : ""}">${esc(sign(r.labaBersih))}</div>
        ${prev ? deltaTag(r.labaBersih, prev.labaBersih) : ""}
        <div class="stats3">
          <div><small>Pendapatan</small><b>${short(r.pendapatan)}</b>${prev ? deltaTag(r.pendapatan, prev.pendapatan) : ""}</div>
          <div><small>Margin kotor</small><b>${r.marginKotor.toFixed(0)}%</b></div>
          <div><small>Margin bersih</small><b>${r.marginBersih.toFixed(0)}%</b></div>
        </div>
      </section>

      ${last6.length > 1 ? `<div class="no-print">${chart(s, last6)}</div>` : ""}
      ${statement(r, s)}
      ${menuCard(r)}
      <section class="card">
        <h2 class="card-title">Catatan</h2>
        <ul class="lr-notes">${catatan(r, pb)
          .map((c) => (typeof c === "string" ? `<li>${esc(c)}</li>` : `<li class="n-${c.t}">${esc(c.x)}</li>`))
          .join("")}</ul>
      </section>
      <div class="row2 no-print">
        <button class="btn ghost" data-action="csv">${icon("download", 16)} Unduh CSV</button>
        <button class="btn primary" data-action="cetak">Cetak / simpan PDF</button>
      </div>
      <p class="small muted center">Laporan dihitung dari data Kas, Kasir & resep. Bukan laporan pajak resmi.</p>`;
  },

  actions: {
    bulan(el) {
      ym = el.dataset.ym;
      render();
    },
    cetak() {
      window.print();
    },
    csv() {
      const s = store.get();
      const r = labaRugi(s, ym, metode || metodeDefault(s, ym));
      download(`laba-rugi-${ym}.csv`, toCSV(r, bisnisOf(s)), "text/csv");
    },
  },

  changes: {
    metode(el) {
      metode = el.value;
      render();
    },
  },
};
