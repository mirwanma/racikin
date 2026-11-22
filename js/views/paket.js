// Halaman Paket (#/paket): paket sekarang, perbandingan Gratis vs Pro vs Max, upgrade lewat WA admin Racikin.
import { icon } from "../icons.js";
import { esc, rupiah, fmtDate } from "../ui.js";
import { cloud } from "../cloud.js";
import { head } from "./_shared.js";
import { paketKini, muatPaket, labelPaket, sisaHari, hematTahun, linkUpgrade, namaFitur, perluIngat, isiPaket, kuotaAi, tingkatFitur, hargaPaket, NAMA_PAKET } from "../paket.js";

const tgl = (t) => (t ? fmtDate(String(t).slice(0, 10), { day: "numeric", month: "long", year: "numeric" }) : "-");
const usahaOf = (s) => s.brand?.terpilih?.nama || s.profile?.nama || "";

/** Kotak "fitur ini khusus Pro / Max" untuk ditaruh menggantikan tombol/fitur yang dikunci. */
export function kunciPro(fitur, teks = "") {
  const pk = NAMA_PAKET[tingkatFitur(fitur, paketKini())] || "Pro";
  return `<section class="card pro-kunci">
    <span class="pro-tag">${icon("lock", 13)} ${pk.toUpperCase()}</span>
    <h3>${esc(namaFitur(fitur))} khusus paket ${pk}</h3>
    <p class="small">${esc(teks || `Upgrade ke ${pk} buat buka fitur ini. Data kamu tetap aman di paket sekarang.`)}</p>
    <a href="#/paket" class="btn primary">Lihat paket ${pk}</a>
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
    <span><b>${esc(teks)}</b><small class="muted">${ingat.jenis === "habis" ? "Perpanjang biar fitur Pro tetap jalan." : `${isiPaket(p).pro.map((f) => f.nama).slice(0, 3).join(", ")} terkunci. Upgrade buat buka lagi.`}</small></span>
    ${icon("chevron", 18)}
  </a>`;
}

export const paket = {
  render(s) {
    const p = paketKini();
    if (cloud.user && !p.harga_bulan) muatPaket().catch(() => {});
    const h = hargaPaket(p, "pro");
    const hm = hargaPaket(p, "max");
    const hemat = hematTahun(h);
    const hematMax = hematTahun(hm);
    const pro = p.paket === "pro" || p.paket === "max";
    const isi = isiPaket(p);
    const ai = kuotaAi(p);
    const n = sisaHari(p);
    const link = (periode, paket = "pro") => linkUpgrade(p, { email: cloud.user?.email, usaha: usahaOf(s), periode, paket });
    const tombol = (paket, hh) =>
      p.paket === "lokal"
        ? ""
        : link("bulan", paket)
          ? `<div class="stack">
              <a href="${esc(link("bulan", paket))}" target="_blank" rel="noopener" class="btn primary block">${icon("chat", 16)} ${p.paket === paket && p.sumber === "bayar" ? "Perpanjang" : "Upgrade"} bulanan · ${rupiah(hh.bulan)}</a>
              <a href="${esc(link("tahun", paket))}" target="_blank" rel="noopener" class="btn soft block">${p.paket === paket && p.sumber === "bayar" ? "Perpanjang" : "Upgrade"} tahunan · ${rupiah(hh.tahun)}</a>
            </div>`
          : `<p class="small muted">Upgrade sebentar lagi dibuka. Hubungi admin Racikin ya.</p>`;
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
                  : `<p class="small">Fitur inti tetap gratis selamanya. Upgrade buat buka ${esc(isi.pro.map((f) => f.nama.toLowerCase()).join(", "))}.</p>`
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
          <ul class="checks">${isi.gratis.map((f) => `<li>${esc(f)}</li>`).join("")}</ul>
        </section>
        <section class="card paket-kol pro">
          <h3>Pro <span class="pro-tag">${icon("spark", 12)} PALING LENGKAP</span></h3>
          <b class="paket-harga">${rupiah(h.bulan)}<small>/bulan</small></b>
          <p class="small">atau ${rupiah(h.tahun)}/tahun (hemat ${rupiah(hemat.rp)}, ±${hemat.bulan} bulan gratis)</p>
          <p class="small muted">Semua fitur Gratis, plus:</p>
          <ul class="checks">${isi.pro.map((f) => `<li><b>${esc(f.nama)}</b><small class="muted"> · ${esc(f.ket)}</small></li>`).join("")}</ul>
          ${p.paket === "max" ? `<p class="small muted">Sudah termasuk di paket Max kamu.</p>` : tombol("pro", h)}
        </section>
        ${
          isi.max.length
            ? `<section class="card paket-kol max">
          <h3>Max <span class="pro-tag">${icon("spark", 12)} BANYAK CABANG</span></h3>
          <b class="paket-harga">${rupiah(hm.bulan)}<small>/bulan</small></b>
          <p class="small">atau ${rupiah(hm.tahun)}/tahun${hematMax.rp > 0 ? ` (hemat ${rupiah(hematMax.rp)})` : ""}</p>
          <p class="small muted">Semua fitur Pro, plus:</p>
          <ul class="checks">${isi.max.map((f) => `<li><b>${esc(f.nama)}</b><small class="muted"> · ${esc(f.ket)}</small></li>`).join("")}</ul>
          ${tombol("max", hm)}
        </section>`
            : ""
        }
      </div>
      ${p.paket === "lokal" ? "" : `<p class="small muted center">Pembayaran lewat chat WhatsApp admin Racikin (transfer / QRIS). Paket aktif setelah pembayaran dicek.</p>`}
      <p class="small muted center">Kuota AI per akun: Gratis ${ai.gratis}x/hari, Pro ${ai.pro}x/hari. Harga sudah termasuk semua update fitur.</p>`;
  },
};
