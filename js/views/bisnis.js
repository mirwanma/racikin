import { icon } from "../icons.js";
import { cloud, isMember } from "../cloud.js";
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
            <span class="module-num">${x.done ? icon("check", 16) : i + 1}</span>
            <div><h3>${x.label}</h3><p class="muted small">${desc[x.key]}</p></div>
            <span class="chev">${icon("chevron", 18)}</span>
          </a>`,
          )
          .join("")}
        <a href="#/studio" class="card module">
          <span class="module-num">${icon("palette", 18)}</span>
          <div><h3>Studio Brand</h3><p class="muted small">Logo, stiker kemasan, mockup, booth, spanduk, poster, menu & konten sosmed siap cetak</p></div>
          <span class="chev">${icon("chevron", 18)}</span>
        </a>
        <h4>Operasional harian</h4>
        <a href="#/kasir" class="card module">
          <span class="module-num">${icon("register", 18)}</span>
          <div><h3>Kasir (POS)</h3><p class="muted small">Jual dari daftar menu, langsung masuk Kas, stok & stempel</p></div>
          <span class="chev">${icon("chevron", 18)}</span>
        </a>
        <a href="#/online" class="card module">
          <span class="module-num">${icon("megaphone", 18)}</span>
          <div><h3>Harga Online</h3><p class="muted small">Harga & komisi GoFood, GrabFood, ShopeeFood + untung per porsi</p></div>
          <span class="chev">${icon("chevron", 18)}</span>
        </a>
        <a href="#/stok" class="card module">
          <span class="module-num">${icon("box", 18)}</span>
          <div><h3>Stok & Resep</h3><p class="muted small">${s.resep.length ? `${s.resep.length} menu · ${s.bahan.length} bahan` : "HPP otomatis dari resep, stok bahan, catat penjualan"}</p></div>
          <span class="chev">${icon("chevron", 18)}</span>
        </a>
        <a href="#/pelanggan" class="card module">
          <span class="module-num">${icon("receipt", 18)}</span>
          <div><h3>Pelanggan Setia</h3><p class="muted small">${s.loyalty ? `${s.pelanggan.length} pelanggan · kartu stempel digital` : "Kartu stempel digital + ajak pelanggan balik"}</p></div>
          <span class="chev">${icon("chevron", 18)}</span>
        </a>
        <a href="#/tim" class="card module">
          <span class="module-num">${icon("team", 18)}</span>
          <div><h3>Tim & Karyawan</h3><p class="muted small">${cloud.team?.role === "owner" && cloud.team.anggota ? `${cloud.team.anggota} anggota tim` : isMember() ? `Kamu ${cloud.team.role} di tim ini` : "Undang kasir & manajer, jualan dari banyak HP"}</p></div>
          <span class="chev">${icon("chevron", 18)}</span>
        </a>
        <a href="#/mentor" class="card module">
          <span class="module-num">${icon("chat", 18)}</span>
          <div><h3>Mentor AI</h3><p class="muted small">Tanya apa saja soal bisnismu</p></div>
          <span class="chev">${icon("chevron", 18)}</span>
        </a>
        <a href="#/profil" class="card module">
          <span class="module-num">${icon("user", 18)}</span>
          <div><h3>Profil Bisnis</h3><p class="muted small">Ubah data dasar yang dipakai AI</p></div>
          <span class="chev">${icon("chevron", 18)}</span>
        </a>
      </div>`;
  },
};
