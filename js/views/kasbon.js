// Kasbon pelanggan (#/kasbon): siapa ngutang berapa & sejak kapan, terima pelunasan (boleh cicil) -> masuk Kas,
// tagih lewat WhatsApp, batas kasbon per pelanggan. Kasir boleh melihat & menerima pelunasan; setelan oleh pemilik/manajer.
import { icon } from "../icons.js";
import { esc, rupiah, toast, todayISO, fmtDate } from "../ui.js";
import { store } from "../store.js";
import { render } from "../app.js";
import { head } from "./_shared.js";
import { isKasir, pelaku } from "../cloud.js";
import { waLink } from "../loyalty.js";
import { bisnisOf } from "../wa.js";
import { shiftAktif, nowLocal } from "../shift.js";
import { metodeNama } from "../pos.js";
import { kasbonAktif, daftarKasbon, ringkasKasbon, saldoKasbon, batasKasbon, sejakKasbon, riwayatKasbon, bayarKasbon, hapusBayar, teksTagih, BATAS_DEFAULT, METODE_BAYAR, UMUR_TAGIH } from "../kasbon.js";

let pilih = null; // pelangganId yang dibuka
let metode = "tunai";
const bolehAtur = () => !isKasir();
const tgl = (iso) => fmtDate(iso, { day: "numeric", month: "short" });
const umurTeks = (n) => (n <= 0 ? "hari ini" : n === 1 ? "kemarin" : `${n} hari`);

/** Pengingat di Beranda: kasbon yang sudah lama belum dibayar. */
export function kasbonCard(s) {
  if (!kasbonAktif(s)) return "";
  const r = ringkasKasbon(s, todayISO());
  if (!r.lama) return "";
  return `<a href="#/kasbon" class="card pajak-mini">
    ${icon("wallet", 22)}
    <span><b>Kasbon ${rupiah(r.totalLama)} belum dibayar</b><small class="muted">${r.lama} pelanggan lewat ${UMUR_TAGIH} hari. Tagih pelan-pelan lewat WA yuk</small></span>
    ${icon("chevron", 18)}
  </a>`;
}

function setelanView(s, ada) {
  if (!bolehAtur()) return "";
  return `<section class="card stack">
    <h2 class="card-title" style="margin:0">Setelan kasbon</h2>
    <label class="field"><span>Batas kasbon per pelanggan (Rp)</span><input type="number" inputmode="numeric" min="0" step="10000" value="${s.posSetting?.kasbonBatas ?? BATAS_DEFAULT}" data-change="batasDefault"></label>
    <p class="small muted">Kasir nggak bisa kasih kasbon melebihi batas ini. Batas khusus per pelanggan bisa diatur di detail pelanggan.</p>
    ${ada ? `<p class="small muted">Kasbon bisa dimatikan setelah semua lunas.</p>` : `<button class="btn ghost sm" data-action="mati">Matikan kasbon</button>`}
  </section>`;
}

function detailView(s, x) {
  const p = x.p;
  const saldo = saldoKasbon(s, p.id);
  const riwayat = riwayatKasbon(s, p.id);
  const sejak = sejakKasbon(s, p.id);
  const pesan = teksTagih(s, p, bisnisOf(s), rupiah);
  return `<section class="card stack kasbon-detail" data-id="${p.id}">
    <div class="row-between"><h2 class="card-title" style="margin:0">${esc(p.nama)}</h2><button class="icon-btn" data-action="tutup" aria-label="Tutup">${icon("x", 16)}</button></div>
    <div class="stats3">
      <div><small>Sisa kasbon</small><b class="${saldo > 0 ? "neg" : ""}">${rupiah(Math.max(0, saldo))}</b></div>
      <div><small>Sejak</small><b>${sejak ? tgl(sejak) : "-"}</b></div>
      <div><small>Batas</small><b>${rupiah(x.batas)}</b></div>
    </div>
    ${saldo < 0 ? `<p class="small muted">Lebih bayar ${rupiah(-saldo)} (ada order yang dibatalkan setelah dibayar). Kembalikan uangnya atau jadikan deposit.</p>` : ""}
    ${
      saldo > 0
        ? `<form class="stack" data-form="bayar" data-id="${p.id}">
        <div class="chips">${METODE_BAYAR.map((m) => `<label class="chip"><input type="radio" name="metode" value="${m.id}" data-change="metode" ${metode === m.id ? "checked" : ""}><span>${m.nama}</span></label>`).join("")}</div>
        <label class="field"><span>Dibayar sekarang (Rp)</span><input type="number" inputmode="numeric" name="nominal" min="1" max="${saldo}" step="1" value="${saldo}" required></label>
        <p class="small muted">Boleh dicicil. Uangnya masuk Kas (kategori ${"Pelunasan kasbon"})${metode === "tunai" ? " & laci shift kalau lagi buka shift" : ""}.</p>
        <button class="btn primary block">${icon("check", 16)} Terima pembayaran</button>
      </form>
      <a class="btn soft block" target="_blank" rel="noopener" href="${esc(p.wa ? waLink(p.wa, pesan) : `https://wa.me/?text=${encodeURIComponent(pesan)}`)}" data-action="tagih">${icon("chat", 16)} Tagih lewat WhatsApp${p.wa ? "" : " (pilih kontak)"}</a>`
        : `<p class="ok-box small">Kasbon ${esc(p.nama)} sudah lunas.</p>`
    }
    ${
      bolehAtur()
        ? `<label class="field"><span>Batas khusus ${esc(p.nama)} (Rp, kosongkan = ikut setelan)</span><input type="number" inputmode="numeric" min="0" step="10000" value="${p.batasKasbon ?? ""}" placeholder="${s.posSetting?.kasbonBatas ?? BATAS_DEFAULT}" data-change="batasPelanggan" data-id="${p.id}"></label>`
        : ""
    }
    <h3 class="small muted" style="margin:6px 0 0">Riwayat</h3>
    <div class="kasbon-riwayat">${
      riwayat.length
        ? riwayat
            .slice(0, 40)
            .map(
              (k) => `<div class="row-between pos-sum">
          <span>${k.jenis === "utang" ? `Kasbon${k.no ? ` order #${k.no}` : ""}` : `Bayar ${esc(metodeNama(k.metode || "tunai"))}`}<small class="muted"> · ${tgl(k.tanggal)}${k.oleh?.nama ? ` · ${esc(k.oleh.nama)}` : ""}</small></span>
          <span><b class="${k.jenis === "utang" ? "neg" : "pos"}">${k.jenis === "utang" ? "+" : "−"}${rupiah(k.nominal)}</b>${k.jenis === "bayar" && bolehAtur() ? ` <button class="link small" data-action="hapusBayar" data-id="${k.id}">hapus</button>` : ""}</span>
        </div>`,
            )
            .join("")
        : `<p class="small muted">Belum ada catatan.</p>`
    }</div>
  </section>`;
}

export const kasbon = {
  render(s) {
    const back = isKasir() ? "#/kasir" : "#/bisnis";
    if (!kasbonAktif(s)) {
      return `${head("Kasbon", back)}
      <section class="card stack">
        <h2 class="card-title" style="margin:0">Pelanggan makan dulu, bayar nanti</h2>
        <p class="small">Aktifkan biar di Kasir ada metode bayar <b>Kasbon</b>. Pesanan tetap tercatat sebagai penjualan & stok terpotong, tapi uangnya baru masuk Kas waktu dilunasi (boleh dicicil).</p>
        <ul class="small muted">
          <li>Wajib pilih pelanggan, ada batas kasbon per pelanggan.</li>
          <li>Daftar siapa ngutang berapa & sejak kapan, plus tagih sopan lewat WhatsApp.</li>
          <li>Pengingat di Beranda kalau ada kasbon lewat ${UMUR_TAGIH} hari.</li>
        </ul>
        ${bolehAtur() ? `<button class="btn primary" data-action="nyala">Aktifkan kasbon</button>` : `<p class="small muted">Minta pemilik / manajer mengaktifkan.</p>`}
      </section>`;
    }
    const today = todayISO();
    const list = daftarKasbon(s, today);
    const r = ringkasKasbon(s, today);
    const x = pilih ? list.find((y) => y.p.id === pilih) || (s.pelanggan || []).filter((p) => p.id === pilih).map((p) => ({ p, batas: batasKasbon(s, p) }))[0] : null;
    return `${head("Kasbon", back)}
      <section class="card accent">
        <div class="stats3">
          <div><small>Total kasbon</small><b>${rupiah(r.total)}</b></div>
          <div><small>Pelanggan</small><b>${r.n}</b></div>
          <div><small>Lewat ${UMUR_TAGIH} hari</small><b class="${r.lama ? "neg" : ""}">${r.lama}</b></div>
        </div>
        <p class="small muted" style="margin:0">Kasbon dicatat dari Kasir (pilih metode <b>Kasbon</b>). Pelunasan masuk Kas kategori Pelunasan kasbon.</p>
      </section>
      ${x ? detailView(s, x) : ""}
      <section class="card">
        <h2 class="card-title">Belum lunas</h2>
        ${
          list.length
            ? list
                .map(
                  (y) => `<button class="kasbon-row ${pilih === y.p.id ? "on" : ""}" data-action="buka" data-id="${y.p.id}">
              <span><b>${esc(y.p.nama)}</b><small class="${y.umur >= UMUR_TAGIH ? "neg" : "muted"}">sejak ${tgl(y.sejak)} · ${umurTeks(y.umur)}</small></span>
              <span class="num"><b>${rupiah(y.saldo)}</b><small class="muted">batas ${rupiah(y.batas)}</small></span>
            </button>`,
                )
                .join("")
            : `<p class="small muted">Nggak ada kasbon. Mantap, semua lunas.</p>`
        }
      </section>
      ${setelanView(s, list.length > 0)}`;
  },
  changes: {
    metode(el) {
      metode = el.value;
    },
    batasDefault(el) {
      const v = Math.max(0, Math.round(Number(el.value) || 0));
      store.set((s) => ({ posSetting: { ...(s.posSetting || {}), kasbonBatas: v } }));
      toast(`Batas kasbon ${rupiah(v)}`);
      render();
    },
    batasPelanggan(el) {
      const id = el.dataset.id;
      const v = el.value === "" ? null : Math.max(0, Math.round(Number(el.value) || 0));
      store.set((s) => ({ pelanggan: s.pelanggan.map((p) => (p.id === id ? (v == null ? Object.fromEntries(Object.entries(p).filter(([k]) => k !== "batasKasbon")) : { ...p, batasKasbon: v }) : p)) }));
      toast(v == null ? "Ikut batas setelan" : `Batas khusus ${rupiah(v)}`);
      render();
    },
  },
  actions: {
    nyala() {
      store.set((s) => ({ posSetting: { ...(s.posSetting || {}), kasbon: true } }));
      toast("Kasbon aktif. Pilih metode Kasbon di Kasir");
      render();
    },
    mati() {
      if (daftarKasbon(store.get(), todayISO()).length) return toast("Masih ada kasbon yang belum lunas", "err");
      store.set((s) => ({ posSetting: { ...(s.posSetting || {}), kasbon: false } }));
      pilih = null;
      render();
    },
    buka(el) {
      pilih = pilih === el.dataset.id ? null : el.dataset.id;
      metode = "tunai";
      render();
      if (pilih) document.querySelector(".kasbon-detail")?.scrollIntoView({ block: "start" });
    },
    tutup() {
      pilih = null;
      render();
    },
    tagih() {},
    hapusBayar(el) {
      if (!confirm("Hapus catatan pembayaran ini? Kas-nya ikut dikurangi.")) return;
      const r = hapusBayar(store.get(), el.dataset.id);
      if (r) store.set(r);
      render();
    },
  },
  forms: {
    bayar(f) {
      const s = store.get();
      const id = f.dataset.id;
      const fd = new FormData(f);
      const waktu = nowLocal();
      try {
        const r = bayarKasbon(s, id, { nominal: fd.get("nominal"), metode: String(fd.get("metode") || metode), tanggal: waktu.slice(0, 10), waktu, oleh: pelaku(), shiftId: shiftAktif(s, pelaku())?.id || null });
        // Akun kasir nggak menulis Kas: Kas pelunasan dihitung ulang dari daftar kasbon di HP pemilik (reconcile).
        store.set(isKasir() ? { kasbon: r.kasbon } : { kasbon: r.kasbon, transactions: r.transactions });
        const p = s.pelanggan.find((x) => x.id === id);
        const sisa = saldoKasbon(store.get(), id);
        toast(sisa > 0 ? `Diterima ${rupiah(r.entri.nominal)}. Sisa kasbon ${p?.nama || ""} ${rupiah(sisa)}` : `Kasbon ${p?.nama || ""} lunas`);
        if (sisa <= 0) pilih = null;
      } catch (e) {
        return toast(e.message, "err");
      }
      render();
    },
  },
};
