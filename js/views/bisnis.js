import { icon } from "../icons.js";
import { cloud, isMember } from "../cloud.js";
import { journey } from "./home.js";
import { isJalan } from "../tahap.js";
import { ringkasIzin } from "../izin.js";
import { hitungPajak, tagihanPajak, namaBulan } from "../pajak.js";
import { kasbonAktif, ringkasKasbon } from "../kasbon.js";
import { ringkasUtang } from "../utang.js";
import { absenAktif, ringkasHari } from "../absen.js";
import { todayISO, short, rupiah } from "../ui.js";

// Usaha yang sudah jalan: modul perencanaan jadi alat tambahan dengan sudut pandang berbeda.
const RENCANA_JALAN = [
  { key: "ide", label: "Cek ulang konsep", href: "#/ide", desc: "Analisa AI: pasar, kompetitor, harga & margin, risiko" },
  { key: "rab", label: "Rencana renovasi / cabang", href: "#/rab", desc: "RAB pengembangan, realisasi, kalkulator BEP" },
  { key: "brand", label: "Rebranding", href: "#/brand", desc: "Nama, tagline, warna, logo baru biar naik kelas" },
  { key: "aktivasi", label: "Checklist online", href: "#/aktivasi", desc: "IG, TikTok, Google Maps, GoFood & promo" },
];

const desc = {
  ide: "Skor kelayakan, SWOT, persona, harga & HPP",
  rab: "Rencana modal, realisasi, dan kalkulator BEP",
  brand: "Nama, tagline, warna, logo, ide menu",
  aktivasi: "Checklist IG, TikTok, Maps, GoFood & launching",
};

export const bisnis = {
  render(s) {
    const jalan = isJalan(s);
    const steps = journey(s).filter((x) => desc[x.key]);
    const studio = `<a href="#/studio" class="card module">
          <span class="module-num">${icon("palette", 18)}</span>
          <div><h3>Studio Brand</h3><p class="muted small">Logo, stiker kemasan, mockup, booth, spanduk, poster, menu & konten sosmed siap cetak</p></div>
          <span class="chev">${icon("chevron", 18)}</span>
        </a>`;
    const sehatMod = `<a href="#/sehat" class="card module">
          <span class="module-num">${icon("spark", 18)}</span>
          <div><h3>Cek Kesehatan Usaha</h3><p class="muted small">Skor & temuan dari data asli: untung, menu rugi, tren omzet, stok bocor, kas, pelanggan, kasir</p></div>
          <span class="chev">${icon("chevron", 18)}</span>
        </a>`;
    const imporMod = `<a href="#/impor-jual" class="card module">
          <span class="module-num">${icon("download", 18)}</span>
          <div><h3>Impor Penjualan Lama</h3><p class="muted small">${(s.imporJual || []).length ? `${s.imporJual.length} kali impor · ${s.imporJual.reduce((a, b) => a + b.hari, 0)} hari` : "Dari Excel, aplikasi kasir lain, atau laporan GoFood/Grab (CSV)"}</p></div>
          <span class="chev">${icon("chevron", 18)}</span>
        </a>`;
    const iz = ringkasIzin(s, todayISO());
    const izinMod = `<a href="#/izin" class="card module">
          <span class="module-num">${icon("doc", 18)}</span>
          <div><h3>Panduan Perizinan</h3><p class="muted small">${iz.selesai || iz.proses ? `${iz.selesai}/${iz.total} izin beres${iz.pengingat.length ? " · ada yang mau habis" : ""}` : "NIB, PIRT, sertifikat halal, SLHS & merek: mana yang perlu, cara & dokumennya"}</p></div>
          <span class="chev">${icon("chevron", 18)}</span>
        </a>`;
    const pj = hitungPajak(s, Number(todayISO().slice(0, 4)), todayISO());
    const pjT = tagihanPajak(s, todayISO());
    const pajakMod = `<a href="#/pajak" class="card module">
          <span class="module-num">${icon("receipt", 18)}</span>
          <div><h3>Pajak UMKM</h3><p class="muted small">${pjT ? `PPh ${namaBulan(pjT.ym)} belum dibayar` : pj.omzet ? `PPh Final 0,5%: omzet tahun ini Rp${short(pj.omzet)}, PPh Rp${short(pj.pph)}` : "PPh Final 0,5%: hitung per bulan dari Kas, jatuh tempo & cara bayarnya"}</p></div>
          <span class="chev">${icon("chevron", 18)}</span>
        </a>`;
    const kb = ringkasKasbon(s, todayISO());
    const ut = ringkasUtang(s, todayISO());
    const kasbonMod = `<a href="#/kasbon" class="card module">
          <span class="module-num">${icon("wallet", 18)}</span>
          <div><h3>Kasbon Pelanggan</h3><p class="muted small">${kasbonAktif(s) ? (kb.n ? `${kb.n} pelanggan · total ${rupiah(kb.total)}${kb.lama ? ` · ${kb.lama} lewat 14 hari` : ""}` : "Aktif · belum ada kasbon") : "Pelanggan makan dulu bayar nanti: batas, cicilan, tagih lewat WA"}</p></div>
          <span class="chev">${icon("chevron", 18)}</span>
        </a>`;
    const ab = ringkasHari(s, todayISO());
    const karyawanMod = `<a href="#/karyawan" class="card module">
          <span class="module-num">${icon("team", 18)}</span>
          <div><h3>Karyawan, Absen & Gaji</h3><p class="muted small">${absenAktif(s) && ab.total ? `Hari ini ${ab.tercatat}/${ab.total} tercatat · ${ab.hadir} hadir` : "Absen harian, impor mesin fingerprint, hitung & bayar gaji, kasbon karyawan"}</p></div>
          <span class="chev">${icon("chevron", 18)}</span>
        </a>`;
    const rencana = jalan
      ? `<h4>Alat pengembangan</h4>${studio}${RENCANA_JALAN.map(
          (x) => `<a href="${x.href}" class="card module"><span class="module-num">${icon("bulb", 18)}</span><div><h3>${x.label}</h3><p class="muted small">${x.desc}</p></div><span class="chev">${icon("chevron", 18)}</span></a>`,
        ).join("")}`
      : "";
    return `
      <header class="page-head"><h1>${jalan ? "Usahamu" : "Bangun Bisnis"}</h1></header>
      <p class="muted">${jalan ? "Semua alat buat ngerapihin & ngembangin usaha yang udah jalan." : "Ikutin urutannya biar ide kamu siap jalan. Semua hasil disesuaikan sama profil bisnismu."}</p>
      <div class="stack">
        ${jalan ? "" : steps
          .map(
            (x, i) => `
          <a href="${x.href}" class="card module ${x.done ? "done" : ""}">
            <span class="module-num">${x.done ? icon("check", 16) : i + 1}</span>
            <div><h3>${x.label}</h3><p class="muted small">${desc[x.key]}</p></div>
            <span class="chev">${icon("chevron", 18)}</span>
          </a>`,
          )
          .join("")}
        ${jalan ? "" : studio}
        ${jalan ? sehatMod + imporMod : `<h4>Operasional harian</h4>`}
        <a href="#/kasir" class="card module">
          <span class="module-num">${icon("register", 18)}</span>
          <div><h3>Kasir (POS)</h3><p class="muted small">Jual dari daftar menu, langsung masuk Kas, stok & stempel</p></div>
          <span class="chev">${icon("chevron", 18)}</span>
        </a>
        <a href="#/wa" class="card module">
          <span class="module-num">${icon("chat", 18)}</span>
          <div><h3>WhatsApp</h3><p class="muted small">Link & QR "Pesan via WA", daftar menu siap kirim, broadcast promo ke pelanggan, laporan ke pemilik</p></div>
          <span class="chev">${icon("chevron", 18)}</span>
        </a>
        <a href="#/promo" class="card module">
          <span class="module-num">${icon("spark", 18)}</span>
          <div><h3>Promo & Voucher</h3><p class="muted small">${(s.promo || []).filter((p) => p.aktif).length ? `${s.promo.filter((p) => p.aktif).length} promo aktif` : "Happy hour, beli 2 gratis 1, diskon min. belanja, kode voucher"}</p></div>
          <span class="chev">${icon("chevron", 18)}</span>
        </a>
        <a href="#/laporan" class="card module">
          <span class="module-num">${icon("calc", 18)}</span>
          <div><h3>Laporan Laba Rugi</h3><p class="muted small">Pendapatan, HPP, biaya & laba bersih per bulan, menu paling untung, cetak PDF</p></div>
          <span class="chev">${icon("chevron", 18)}</span>
        </a>
        <a href="#/meja" class="card module">
          <span class="module-num">${icon("grid", 18)}</span>
          <div><h3>Meja & QR</h3><p class="muted small">${s.posSetting?.pesanMeja ? `Aktif · ${(s.meja || []).length} meja` : "Opsional: pelanggan scan QR di meja, pesan & bayar dari HP"}</p></div>
          <span class="chev">${icon("chevron", 18)}</span>
        </a>
        <a href="#/dapur" class="card module">
          <span class="module-num">${icon("bowl", 18)}</span>
          <div><h3>Dapur</h3><p class="muted small">${s.posSetting?.dapur ? "Aktif · pesanan dari Kasir tampil di layar dapur" : "Opsional: layar pesanan untuk dapur yang terpisah dari kasir"}</p></div>
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
        <a href="#/belanja" class="card module">
          <span class="module-num">${icon("box", 18)}</span>
          <div><h3>Belanja & Supplier</h3><p class="muted small">${ut.total ? `Utang supplier ${rupiah(ut.total)}${ut.telat.length ? ` · ${ut.telat.length} lewat tempo` : ""}` : "Daftar belanja otomatis dari stok, pesan ke supplier via WA, riwayat harga bahan, utang/tempo"}</p></div>
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
        ${jalan ? "" : sehatMod + imporMod}
        ${kasbonMod}
        ${karyawanMod}
        ${izinMod}
        ${pajakMod}
        ${rencana}
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
