import { journey } from "./home.js";

const desc = {
  ide: "Skor kelayakan, SWOT, persona, harga & HPP",
  rab: "Rencana modal, realisasi, dan kalkulator BEP",
  brand: "Nama, tagline, warna, logo, ide menu",
  aktivasi: "Checklist IG, TikTok, Maps, GoFood & launching",
};

export const bisnis = {
  render(s) {
    const steps = journey(s).filter((x) => desc[x.key]);
    return `
      <header class="page-head"><h1>Bangun Bisnis</h1></header>
      <p class="muted">Ikutin urutannya biar ide kamu siap jalan. Semua hasil disesuaikan sama profil bisnismu.</p>
      <div class="stack">
        ${steps
          .map(
            (x, i) => `
          <a href="${x.href}" class="card module ${x.done ? "done" : ""}">
            <span class="module-num">${x.done ? "✓" : i + 1}</span>
            <div><h3>${x.icon} ${x.label}</h3><p class="muted small">${desc[x.key]}</p></div>
            <span class="chev">›</span>
          </a>`,
          )
          .join("")}
        <h4>Operasional harian</h4>
        <a href="#/stok" class="card module">
          <span class="module-num">📦</span>
          <div><h3>🍜 Stok & Resep</h3><p class="muted small">${s.resep.length ? `${s.resep.length} menu · ${s.bahan.length} bahan` : "HPP otomatis dari resep, stok bahan, catat penjualan"}</p></div>
          <span class="chev">›</span>
        </a>
        <a href="#/profil" class="card module">
          <span class="module-num">⚙</span>
          <div><h3>🧾 Profil Bisnis</h3><p class="muted small">Ubah data dasar yang dipakai AI</p></div>
          <span class="chev">›</span>
        </a>
      </div>`;
  },
};
