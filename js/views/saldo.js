// Saldo pelanggan (#/saldo): siapa punya saldo berapa, isi saldo (setor uang), tarik (uang dikembalikan), riwayat.
// Kasir boleh melihat, mengisi & menarik (uangnya lewat laci); aktif / mati oleh pemilik / manajer.
import { icon } from "../icons.js";
import { esc, rupiah, toast, todayISO, fmtDate } from "../ui.js";
import { store, uid } from "../store.js";
import { render } from "../app.js";
import { head } from "./_shared.js";
import { isKasir, pelaku, markCards } from "../cloud.js";
import { normWa, newToken } from "../loyalty.js";
import { shiftAktif, nowLocal } from "../shift.js";
import { metodeNama } from "../pos.js";
import { saldoAktif, daftarSaldo, ringkasSaldo, saldoOf, riwayatSaldo, isiSaldo, tarikSaldo, hapusSaldo, labelSaldo, METODE_SALDO, KAT_SALDO } from "../saldo.js";

let pilih = null; // pelangganId yang dibuka
let mode = "isi"; // isi | tarik
let metode = "tunai";
let cari = "";
const bolehAtur = () => !isKasir();
const tgl = (iso) => fmtDate(iso, { day: "numeric", month: "short" });

/** Modul di halaman Bisnis. */
export function saldoModul(s) {
  const r = ringkasSaldo(s);
  return `<a href="#/saldo" class="card module">
          <span class="module-num">${icon("wallet", 18)}</span>
          <div><h3>Saldo Pelanggan</h3><p class="muted small">${saldoAktif(s) ? (r.n ? `${r.n} pelanggan · titipan ${rupiah(r.total)}` : "Aktif · belum ada saldo") : "Pelanggan nyimpen uang / kembalian, dipakai bayar nanti"}</p></div>
          <span class="chev">${icon("chevron", 18)}</span>
        </a>`;
}

function detailView(s, p) {
  const ada = saldoOf(s, p.id);
  const riwayat = riwayatSaldo(s, p.id);
  return `<section class="card stack kasbon-detail saldo-detail" data-id="${p.id}">
    <div class="row-between"><h2 class="card-title" style="margin:0">${esc(p.nama)}</h2><button class="icon-btn" data-action="tutup" aria-label="Tutup">${icon("x", 16)}</button></div>
    <div class="row-between pos-total"><span>Saldo sekarang</span><b class="${ada > 0 ? "pos" : ""}">${rupiah(Math.max(0, ada))}</b></div>
    <div class="chips">
      <label class="chip"><input type="radio" name="mode" value="isi" data-change="mode" ${mode === "isi" ? "checked" : ""}><span>Isi saldo</span></label>
      <label class="chip"><input type="radio" name="mode" value="tarik" data-change="mode" ${mode === "tarik" ? "checked" : ""} ${ada > 0 ? "" : "disabled"}><span>Tarik / kembalikan</span></label>
    </div>
    <form class="stack" data-form="simpan" data-id="${p.id}">
      <div class="chips">${METODE_SALDO.map((m) => `<label class="chip"><input type="radio" name="metode" value="${m.id}" data-change="metode" ${metode === m.id ? "checked" : ""}><span>${m.nama}</span></label>`).join("")}</div>
      <label class="field"><span>${mode === "isi" ? "Jumlah yang disetor (Rp)" : "Jumlah yang dikembalikan (Rp)"}</span><input type="number" inputmode="numeric" name="nominal" min="1" ${mode === "tarik" ? `max="${ada}" value="${ada}"` : `step="1" placeholder="cth: 50000"`} required></label>
      ${mode === "isi" ? `<div class="chips">${[20000, 50000, 100000].map((v) => `<button type="button" class="chip-btn" data-action="cepat" data-v="${v}">${rupiah(v)}</button>`).join("")}</div>` : ""}
      <input name="catatan" maxlength="100" placeholder="Catatan (opsional)" aria-label="Catatan">
      <p class="small muted">${mode === "isi" ? "Uangnya masuk Kas sebagai titipan (bukan omzet)" : "Uangnya keluar dari Kas (titipan berkurang)"}${metode === "tunai" ? " & laci shift kalau lagi buka shift" : ""}.</p>
      <button class="btn primary block">${icon("check", 16)} ${mode === "isi" ? "Simpan saldo" : "Kembalikan uang"}</button>
    </form>
    <h3 class="small muted" style="margin:6px 0 0">Riwayat</h3>
    <div class="kasbon-riwayat">${
      riwayat.length
        ? riwayat
            .slice(0, 40)
            .map(
              (k) => `<div class="row-between pos-sum">
          <span>${esc(labelSaldo(k))}${k.jenis !== "pakai" ? ` · ${esc(metodeNama(k.metode || "tunai"))}` : ""}<small class="muted"> · ${tgl(k.tanggal)}${k.oleh?.nama ? ` · ${esc(k.oleh.nama)}` : ""}${k.catatan ? ` · ${esc(k.catatan)}` : ""}</small></span>
          <span><b class="${k.jenis === "isi" ? "pos" : "neg"}">${k.jenis === "isi" ? "+" : "−"}${rupiah(k.nominal)}</b>${k.jenis !== "pakai" && k.sumber !== "kembalian" && bolehAtur() ? ` <button class="link small" data-action="hapus" data-id="${k.id}">hapus</button>` : ""}</span>
        </div>`,
            )
            .join("")
        : `<p class="small muted">Belum ada catatan.</p>`
    }</div>
  </section>`;
}

export const saldo = {
  render(s) {
    const back = isKasir() ? "#/kasir" : "#/bisnis";
    if (!saldoAktif(s)) {
      return `${head("Saldo Pelanggan", back)}
      <section class="card stack">
        <h2 class="card-title" style="margin:0">Pelanggan nitip uang, bayar belakangan</h2>
        <p class="small">Aktifkan biar pelanggan bisa <b>nyimpen saldo</b> di tokomu: setor uang di depan, atau kembaliannya nggak diambil. Waktu jajan lagi, tinggal pilih metode bayar <b>Saldo</b> di Kasir.</p>
        <ul class="small muted">
          <li>Kembalian tunai bisa langsung disimpan jadi saldo dari layar Kasir.</li>
          <li>Saldo kurang? Sisanya bisa dibayar tunai, QRIS, atau transfer.</li>
          <li>Pembukuan aman: saldo dicatat sebagai titipan (bukan omzet), omzet masuk waktu saldonya dipakai belanja.</li>
          <li>Pelanggan bisa cek saldonya sendiri di kartu stempel digital.</li>
        </ul>
        ${bolehAtur() ? `<button class="btn primary" data-action="nyala">Aktifkan saldo pelanggan</button>` : `<p class="small muted">Minta pemilik / manajer mengaktifkan.</p>`}
      </section>`;
    }
    const list = daftarSaldo(s);
    const r = ringkasSaldo(s);
    const p = pilih ? (s.pelanggan || []).find((x) => x.id === pilih) : null;
    const q = cari.trim().toLowerCase();
    const semua = [...(s.pelanggan || [])].filter((x) => !q || x.nama.toLowerCase().includes(q) || String(x.wa || "").includes(q)).sort((a, b) => a.nama.localeCompare(b.nama, "id"));
    return `${head("Saldo Pelanggan", back)}
      <section class="card accent">
        <div class="stats3">
          <div><small>Total titipan</small><b>${rupiah(r.total)}</b></div>
          <div><small>Pelanggan</small><b>${r.n}</b></div>
          <div><small>Rata-rata</small><b>${rupiah(r.n ? r.total / r.n : 0)}</b></div>
        </div>
        <p class="small muted" style="margin:0">Uang titipan ini milik pelanggan (dicatat di Kas kategori ${esc(KAT_SALDO)}, nggak dihitung laba). Dipakai lewat metode bayar <b>Saldo</b> di Kasir.</p>
      </section>
      ${p ? detailView(s, p) : ""}
      <section class="card">
        <h2 class="card-title">Punya saldo</h2>
        ${
          list.length
            ? list
                .map(
                  (y) => `<button class="kasbon-row ${pilih === y.p.id ? "on" : ""}" data-action="buka" data-id="${y.p.id}">
              <span><b>${esc(y.p.nama)}</b><small class="muted">terakhir ${tgl(y.terakhir.slice(0, 10))}</small></span>
              <span class="num"><b class="pos">${rupiah(y.saldo)}</b></span>
            </button>`,
                )
                .join("")
            : `<p class="small muted">Belum ada pelanggan yang nyimpen saldo.</p>`
        }
      </section>
      <section class="card stack">
        <h2 class="card-title" style="margin:0">Isi saldo pelanggan</h2>
        <input type="search" placeholder="Cari nama / no. WA" value="${esc(cari)}" data-change="cari" aria-label="Cari pelanggan">
        <div class="saldo-cari">${
          semua.length
            ? semua
                .slice(0, 12)
                .map((x) => `<button class="kasbon-row ${pilih === x.id ? "on" : ""}" data-action="buka" data-id="${x.id}"><span><b>${esc(x.nama)}</b>${x.wa ? `<small class="muted">${esc(x.wa)}</small>` : ""}</span><span class="num">${rupiah(Math.max(0, saldoOf(s, x.id)))}</span></button>`)
                .join("")
            : `<p class="small muted">${q ? "Nggak ketemu." : "Belum ada pelanggan."}</p>`
        }</div>
        <form class="row2" data-form="baru"><input name="nama" maxlength="40" placeholder="Pelanggan baru: nama" required aria-label="Nama pelanggan baru"><input name="wa" inputmode="tel" maxlength="20" placeholder="No. WA (opsional)" aria-label="Nomor WA"><button class="btn soft sm">Tambah</button></form>
      </section>
      ${
        bolehAtur()
          ? `<section class="card stack"><h2 class="card-title" style="margin:0">Setelan</h2>
        ${r.n ? `<p class="small muted">Saldo pelanggan bisa dimatikan setelah semua saldo dipakai / dikembalikan.</p>` : `<button class="btn ghost sm" data-action="mati">Matikan saldo pelanggan</button>`}</section>`
          : ""
      }`;
  },
  changes: {
    mode(el) {
      mode = el.value;
      render();
    },
    metode(el) {
      metode = el.value;
      render();
    },
    cari(el) {
      cari = el.value;
      render();
      const i = document.querySelector('input[data-change="cari"]');
      if (i) {
        i.focus();
        i.setSelectionRange(i.value.length, i.value.length);
      }
    },
  },
  actions: {
    nyala() {
      store.set((s) => ({ posSetting: { ...(s.posSetting || {}), saldo: true } }));
      markCards({ ids: (store.get().pelanggan || []).map((p) => p.id) });
      toast("Saldo pelanggan aktif. Ada metode bayar Saldo di Kasir");
      render();
    },
    mati() {
      if (ringkasSaldo(store.get()).n) return toast("Masih ada pelanggan yang punya saldo", "err");
      store.set((s) => ({ posSetting: { ...(s.posSetting || {}), saldo: false } }));
      markCards({ ids: (store.get().pelanggan || []).map((p) => p.id) });
      pilih = null;
      render();
    },
    buka(el) {
      pilih = pilih === el.dataset.id ? null : el.dataset.id;
      mode = "isi";
      metode = "tunai";
      render();
      if (pilih) document.querySelector(".saldo-detail")?.scrollIntoView({ block: "start" });
    },
    tutup() {
      pilih = null;
      render();
    },
    cepat(el) {
      const i = document.querySelector('form[data-form="simpan"] input[name="nominal"]');
      if (i) i.value = el.dataset.v;
    },
    hapus(el) {
      if (!confirm("Hapus catatan saldo ini? Kas-nya ikut disesuaikan.")) return;
      try {
        const s = store.get();
        const e = s.saldoPelanggan.find((k) => k.id === el.dataset.id);
        const r = hapusSaldo(s, el.dataset.id);
        if (r) {
          store.set(r);
          markCards({ ids: [e.pelangganId] });
        }
      } catch (err) {
        return toast(err.message, "err");
      }
      render();
    },
  },
  forms: {
    simpan(f) {
      const s = store.get();
      const id = f.dataset.id;
      const fd = new FormData(f);
      const waktu = nowLocal();
      try {
        const opt = { nominal: fd.get("nominal"), metode: String(fd.get("metode") || metode), tanggal: waktu.slice(0, 10), waktu, oleh: pelaku(), shiftId: shiftAktif(s, pelaku())?.id || null, catatan: fd.get("catatan") };
        const r = mode === "tarik" ? tarikSaldo(s, id, opt) : isiSaldo(s, id, opt);
        // Akun kasir nggak menulis Kas: Kas titipan dihitung ulang dari daftar saldo di HP pemilik (reconcile).
        store.set(isKasir() ? { saldoPelanggan: r.saldoPelanggan } : { saldoPelanggan: r.saldoPelanggan, transactions: r.transactions });
        markCards({ ids: [id] });
        const p = s.pelanggan.find((x) => x.id === id);
        toast(`${mode === "tarik" ? "Dikembalikan" : "Disimpan"} ${rupiah(r.entri.nominal)}. Saldo ${p?.nama || ""} ${rupiah(saldoOf(store.get(), id))}`);
        mode = "isi";
      } catch (e) {
        return toast(e.message, "err");
      }
      render();
    },
    baru(f) {
      const fd = new FormData(f);
      const nama = String(fd.get("nama") || "").trim().slice(0, 40);
      if (!nama) return;
      const s = store.get();
      const wa = normWa(fd.get("wa"));
      if ((s.pelanggan || []).some((x) => x.nama.toLowerCase() === nama.toLowerCase())) return toast("Nama itu sudah ada, pilih dari daftar", "err");
      if (wa && (s.pelanggan || []).some((x) => normWa(x.wa) === wa)) return toast("No. WA ini sudah terdaftar", "err");
      const p = { id: uid(), nama, wa, stempel: 0, kunjungan: 0, hadiahDiambil: 0, terakhir: null, dibuat: todayISO(), token: newToken() };
      store.set({ pelanggan: [...(s.pelanggan || []), p] });
      markCards({ ids: [p.id] });
      pilih = p.id;
      mode = "isi";
      cari = "";
      render();
      document.querySelector(".saldo-detail")?.scrollIntoView({ block: "start" });
    },
  },
};
