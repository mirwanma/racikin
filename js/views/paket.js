// Halaman Paket (#/paket): paket sekarang, perbandingan Gratis vs Pro, upgrade lewat WA admin Racikin.
import { icon } from "../icons.js";
import { esc, rupiah, fmtDate } from "../ui.js";
import { cloud } from "../cloud.js";
import { head } from "./_shared.js";
import { FITUR_PRO, FITUR_GRATIS, HARGA, AI_HARI, paketKini, muatPaket, labelPaket, sisaHari, hematTahun, linkUpgrade, namaFitur, perluIngat } from "../paket.js";

const tgl = (t) => (t ? fmtDate(String(t).slice(0, 10), { day: "numeric", month: "long", year: "numeric" }) : "-");
const usahaOf = (s) => s.brand?.terpilih?.nama || s.profile?.nama || "";

/** Kotak "fitur ini khusus Pro" untuk ditaruh menggantikan tombol/fitur yang dikunci. */
export function kunciPro(fitur, teks = "") {
  return `<section class="card pro-kunci">
    <span class="pro-tag">${icon("lock", 13)} PRO</span>
    <h3>${esc(namaFitur(fitur))} khusus paket Pro</h3>
    <p class="small">${esc(teks || "Upgrade ke Pro buat buka fitur ini. Data kamu tetap aman di paket Gratis.")}</p>
    <a href="#/paket" class="btn primary">Lihat paket Pro</a>
  </section>`;
}

/** Pengingat di Beranda: masa coba/transisi mau habis, atau baru turun ke Gratis. */
export function paketCard() {
  const p = paketKini();
  const ingat = perluIngat(p);
  if (!ingat) return "";
  const teks =
    ingat.jenis === "habis"
      ? `${p.sumber === "bayar" ? "Paket Pro" : p.sumber === "coba" ? "Masa coba Pro" : "Pro gratis masa transisi"} ${ingat.sisa ? `habis ${ingat.sisa} hari lagi` : "habis hari ini"}`
      : "Paket kamu sekarang Gratis";
  return `<a href="#/paket" class="card paket-mini ${ingat.jenis}">
    <span class="pro-tag">${icon("spark", 13)} PRO</span>
    <span><b>${esc(teks)}</b><small class="muted">${ingat.jenis === "habis" ? "Perpanjang biar tim, pesan meja & fitur Pro lain tetap jalan." : "Tim, pesan meja, dapur, open bill & foto AI terkunci. Upgrade buat buka lagi."}</small></span>
    ${icon("chevron", 18)}
  </a>`;
}

export const paket = {
  render(s) {
    const p = paketKini();
    if (cloud.user && !p.harga_bulan) muatPaket().catch(() => {});
    const h = { bulan: p.harga_bulan ?? HARGA.bulan, tahun: p.harga_tahun ?? HARGA.tahun };
    const hemat = hematTahun(h);
    const pro = p.paket === "pro";
    const n = sisaHari(p);
    const link = (periode) => linkUpgrade(p, { email: cloud.user?.email, usaha: usahaOf(s), periode });
    const status =
      p.paket === "lokal"
        ? `<section class="card paket-status"><h2 class="card-title" style="margin:0">Mode coba di HP ini</h2>
            <p class="small">Kamu belum login, jadi semua fitur bisa dicoba di HP ini. Fitur yang butuh internet (tim, pesan meja, foto AI) perlu akun.</p>
            <a href="#/akun" class="btn primary">Daftar / masuk · coba Pro ${p.coba_hari || 14} hari gratis</a></section>`
        : `<section class="card paket-status ${pro ? "pro" : ""}">
            <small class="mono muted">PAKET KAMU</small>
            <h2>${esc(labelPaket(p))}</h2>
            ${
              pro && p.sumber !== "bayar"
                ? `<p class="small">Semua fitur Pro kebuka sampai <b>${tgl(p.sampai)}</b>${n !== null ? ` (${n} hari lagi)` : ""}. Setelah itu otomatis jadi Gratis, data tetap aman.</p>`
                : pro
                  ? `<p class="small">Aktif sampai <b>${tgl(p.sampai)}</b>${n !== null ? ` (${n} hari lagi)` : ""}. Terima kasih udah dukung Racikin!</p>`
                  : `<p class="small">Fitur inti tetap gratis selamanya. Upgrade buat buka tim, pesan meja, dapur, open bill, foto AI & kuota AI lebih besar.</p>`
            }
            ${p.memuat ? `<p class="small muted">Lagi ngecek paket…</p>` : ""}
          </section>`;
    return `
      ${head("Paket", "#/akun")}
      ${status}
      <div class="paket-grid">
        <section class="card paket-kol">
          <h3>Gratis</h3>
          <b class="paket-harga">Rp0</b>
          <ul class="checks">${FITUR_GRATIS.map((f) => `<li>${esc(f)}</li>`).join("")}</ul>
        </section>
        <section class="card paket-kol pro">
          <h3>Pro <span class="pro-tag">${icon("spark", 12)} PALING LENGKAP</span></h3>
          <b class="paket-harga">${rupiah(h.bulan)}<small>/bulan</small></b>
          <p class="small">atau ${rupiah(h.tahun)}/tahun (hemat ${rupiah(hemat.rp)}, ±${hemat.bulan} bulan gratis)</p>
          <p class="small muted">Semua fitur Gratis, plus:</p>
          <ul class="checks">${FITUR_PRO.map((f) => `<li><b>${esc(f.nama)}</b><small class="muted"> · ${esc(f.ket)}</small></li>`).join("")}</ul>
          ${
            p.paket === "lokal"
              ? ""
              : link("bulan")
                ? `<div class="stack">
                    <a href="${esc(link("bulan"))}" target="_blank" rel="noopener" class="btn primary block">${icon("chat", 16)} ${pro && p.sumber === "bayar" ? "Perpanjang" : "Upgrade"} bulanan · ${rupiah(h.bulan)}</a>
                    <a href="${esc(link("tahun"))}" target="_blank" rel="noopener" class="btn soft block">${pro && p.sumber === "bayar" ? "Perpanjang" : "Upgrade"} tahunan · ${rupiah(h.tahun)}</a>
                    <p class="small muted">Pembayaran lewat chat WhatsApp admin Racikin (transfer / QRIS). Pro aktif setelah pembayaran dicek.</p>
                  </div>`
                : `<p class="small muted">Upgrade sebentar lagi dibuka. Hubungi admin Racikin ya.</p>`
          }
        </section>
      </div>
      <p class="small muted center">Kuota AI per akun: Gratis ${AI_HARI.gratis}x/hari, Pro ${AI_HARI.pro}x/hari. Harga sudah termasuk semua update fitur.</p>`;
  },
};
