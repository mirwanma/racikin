import { icon } from "../icons.js";
import { esc, rupiah, todayISO, addDays, fmtDate } from "../ui.js";
import { monthStats } from "./_shared.js";
import { store } from "../store.js";
import { render } from "../app.js";
import { syncBadge } from "./akun.js";
import { cloud } from "../cloud.js";
import { program, siapTukar, perluDiajak } from "../loyalty.js";
import { menipis, belumDiisi, bahanMap, bisaDibuat, fmtQty } from "../stok-utils.js";

export function journey(s) {
  const steps = [
    { key: "ide", label: "Analisa ide", done: !!s.idea, href: "#/ide" },
    { key: "rab", label: "RAB & modal", done: !!s.rab, href: "#/rab" },
    { key: "brand", label: "Brand kit", done: !!s.brand?.terpilih, href: "#/brand" },
    { key: "aktivasi", label: "Aktivasi jualan", done: !!s.activation, href: "#/aktivasi" },
    { key: "kas", label: "Mulai nyatet kas", done: s.transactions.length > 0, href: "#/kas" },
    { key: "konten", label: "Jadwal konten", done: !!s.calendar, href: "#/konten" },
  ];
  return steps;
}

export function todayContent(s) {
  if (!s.calendar) return [];
  const today = todayISO();
  return s.calendar.jadwal.filter((j) => addDays(s.calendar.start, j.hari_ke - 1) === today);
}

function stokCard(s) {
  if (!s.bahan.length && !s.resep.length) return "";
  const low = menipis(s.bahan);
  const kosong = belumDiisi(s.bahan);
  const adaTracked = s.bahan.some((b) => b.tracked);
  const map = bahanMap(s.bahan);
  const menu = s.resep.map((r) => ({ r, bd: bisaDibuat(r, map) })).filter((x) => x.bd.porsi !== null);
  return `<section class="card ${low.length ? "warn-card" : ""}">
    <div class="row-between"><h2 class="card-title">Stok</h2><a href="#/stok?tab=bahan" class="link">Kelola</a></div>
    ${
      low.length
        ? `<p><b class="neg">Menipis:</b> ${low.map((b) => `${esc(b.nama)} (${fmtQty(Number(b.stok) || 0)} ${esc(b.satuan)})`).join(", ")}</p>`
        : adaTracked
          ? `<p class="muted small">Semua bahan yang dicatat aman</p>`
          : ""
    }
    ${
      kosong.length
        ? `<p class="small">${kosong.length} bahan belum diisi stoknya. <a href="#/stok?tab=bahan&isi=1" class="link">Isi stok awal</a></p>`
        : ""
    }
    ${menu.length ? `<p class="small muted">Bisa dibuat: ${menu.map((x) => `${esc(x.r.nama)} <b>${x.bd.porsi}</b> porsi`).join(" · ")}</p>` : ""}
  </section>`;
}

function loyalCard(s) {
  if (!s.loyalty || !s.pelanggan.length) return "";
  const prog = program(s);
  const ready = s.pelanggan.filter((p) => siapTukar(p, prog));
  const ajak = perluDiajak(s.pelanggan);
  return `<section class="card">
    <div class="row-between"><h2 class="card-title">Pelanggan setia</h2><a href="#/pelanggan" class="link">Buka</a></div>
    <div class="stats3">
      <div><small>Pelanggan</small><b>${s.pelanggan.length}</b></div>
      <div><small>Hadiah siap</small><b class="${ready.length ? "pos" : ""}">${ready.length}</b></div>
      <div><small>Perlu diajak</small><b class="${ajak.length ? "neg" : ""}">${ajak.length}</b></div>
    </div>
    ${ajak.length ? `<p class="small">${ajak.length} pelanggan lama nggak balik. <a href="#/pelanggan" class="link">Kirim pesan ajak balik</a></p>` : ""}
  </section>`;
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
          <p class="eyebrow">${sapa}, ${esc(p.owner)}</p>
          <h1>${esc(s.brand?.terpilih?.nama || p.nama || "Bisnismu")}</h1>
          <p class="muted small">${esc(p.jenis)} · ${esc([p.area, p.kota].filter(Boolean).join(", "))}</p>
        </div>
        <div class="greet-actions">
          ${cloud.user ? syncBadge() : `<a href="#/akun" class="pill">${icon("cloud", 13)} Masuk</a>`}
          <a href="#/setelan" class="icon-btn" aria-label="Setelan">${icon("gear", 20)}</a>
        </div>
      </section>

      <section class="card journey">
        <div class="row-between">
          <h2 class="card-title">Perjalanan bisnismu</h2>
          <span class="pill">${done}/${steps.length}</span>
        </div>
        <div class="progress"><span style="width:${(done / steps.length) * 100}%"></span></div>
        <div class="steps">
          ${steps.map((x, i) => `<a href="${x.href}" class="step ${x.done ? "done" : ""} ${x === next ? "next" : ""}"><span class="step-icon">${x.done ? icon("check", 15) : i + 1}</span><span>${x.label}</span></a>`).join("")}
        </div>
        ${next ? `<a href="${next.href}" class="btn primary block">Lanjut: ${next.label}</a>` : `<p class="center">Semua langkah awal beres! Sekarang konsisten nyatet & posting ya</p>`}
      </section>

      <section class="card">
        <div class="row-between">
          <h2 class="card-title">Kas bulan ini</h2>
          <a href="#/kas" class="link">Detail</a>
        </div>
        <div class="stats3">
          <div><small>Masuk</small><b class="pos">${rupiah(st.masuk)}</b></div>
          <div><small>Keluar</small><b class="neg">${rupiah(st.keluar)}</b></div>
          <div><small>Laba</small><b class="${st.laba >= 0 ? "pos" : "neg"}">${rupiah(st.laba)}</b></div>
        </div>
        <a href="#/kas?add=1" class="btn soft block">+ Catat transaksi</a>
      </section>

      ${stokCard(s)}
      ${loyalCard(s)}

      <section class="card">
        <div class="row-between">
          <h2 class="card-title">Konten hari ini</h2>
          <a href="#/konten" class="link">Kalender</a>
        </div>
        ${
          !s.calendar
            ? `<p class="muted">Belum ada jadwal konten. <a href="#/konten" class="link">Bikin sekarang</a></p>`
            : today.length
              ? today.map((j) => `
                <div class="task ${j.done ? "done" : ""}">
                  <button class="check" data-action="toggle" data-hari="${j.hari_ke}" aria-label="Tandai selesai">${j.done ? icon("check", 15) : ""}</button>
                  <div><b>${esc(j.ide)}</b><p class="muted small">${esc(j.platform)} · ${esc(j.format)} · ${esc(j.jam)}</p><p class="small">“${esc(j.hook)}”</p></div>
                </div>`).join("")
              : `<p class="muted">Hari ini libur posting (${fmtDate(todayISO())}). Istirahat juga penting</p>`
        }
      </section>

      <section class="quick">
        <a href="#/mentor" class="quick-item">${icon("chat", 22)}<span>Tanya Mentor</span></a>
        <a href="#/stok" class="quick-item">${icon("box", 22)}<span>Stok & resep</span></a>
        <a href="#/pelanggan" class="quick-item">${icon("receipt", 22)}<span>Pelanggan</span></a>
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
