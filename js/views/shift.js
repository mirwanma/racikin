// Halaman Shift: buka shift, catat uang laci, tutup shift (hitung uang), riwayat & selisih.
import { store } from "../store.js";
import { esc, rupiah, toast, todayISO, fmtDate } from "../ui.js";
import { render } from "../app.js";
import { icon } from "../icons.js";
import { head } from "./_shared.js";
import { pelaku, role } from "../cloud.js";
import { linkWa, nomorPemilik, teksShift } from "../wa.js";
import { shiftAktif, shiftTerbuka, ringkasan, bukaShift, catatLaci, hapusLaci, tutupShift, selisihPerKasir, wajibShift, JENIS_LACI, KATEGORI_LACI, PECAHAN } from "../shift.js";

let jenisLaci = "keluar";
let hitung = {}; // pecahan -> jumlah lembar (kalkulator)
let setorManual = ""; // uang di laci (diketik langsung)
let open = null; // id shift riwayat yang dibuka
let tutupLain = null; // id shift orang lain yang mau ditutup pemilik

const jam = (w) => (w || "").slice(11, 16);
const totalHitung = () => PECAHAN.reduce((a, p) => a + p * (Number(hitung[p]) || 0), 0);
const uangLaci = () => (Object.values(hitung).some((n) => Number(n) > 0) ? totalHitung() : setorManual === "" ? null : Number(setorManual) || 0);
const bisaKelola = () => role() === "owner" || role() === "manajer";
const namaKasir = (k) => k?.nama || "Kasir";

function selisihTag(x) {
  if (x === null || x === undefined) return `<span class="tag">belum dihitung</span>`;
  if (x === 0) return `<span class="tag ok">pas</span>`;
  return `<span class="tag ${x < 0 ? "minus" : "plus"}">${x < 0 ? "kurang" : "lebih"} ${rupiah(Math.abs(x))}</span>`;
}

function rows(r) {
  return `
    <div class="row-between pos-sum"><span>Modal awal laci</span><b>${rupiah(r.modal)}</b></div>
    <div class="row-between pos-sum"><span>Penjualan tunai</span><b class="pos">+${rupiah(r.tunai)}</b></div>
    ${r.tambah ? `<div class="row-between pos-sum"><span>Tambah uang</span><b class="pos">+${rupiah(r.tambah)}</b></div>` : ""}
    ${r.keluar ? `<div class="row-between pos-sum"><span>Pengeluaran dari laci</span><b class="neg">−${rupiah(r.keluar)}</b></div>` : ""}
    ${r.ambil ? `<div class="row-between pos-sum"><span>Disetor / diambil</span><b class="neg">−${rupiah(r.ambil)}</b></div>` : ""}
    <div class="row-between pos-total"><span>Uang seharusnya di laci</span><b>${rupiah(r.seharusnya)}</b></div>
    <p class="small muted">${r.order} order · omzet ${rupiah(r.omzet)}${r.nonTunai ? ` · QRIS/transfer ${rupiah(r.nonTunai)}` : ""}${r.online ? ` · online ${rupiah(r.online)}` : ""}${r.batal ? ` · ${r.batal} batal` : ""}</p>`;
}

function hitungForm(r, id, label = "Tutup shift") {
  const uang = uangLaci();
  const selisih = uang === null ? null : uang - r.seharusnya;
  return `<form class="stack" data-form="tutup" data-id="${id}">
    <label class="field"><span>Uang di laci sekarang (hitung fisik)</span>
      <input type="number" inputmode="numeric" min="0" step="500" value="${Object.values(hitung).some((n) => Number(n) > 0) ? totalHitung() : esc(setorManual)}" placeholder="${r.seharusnya}" data-change="setor"></label>
    <details class="pecahan" ${Object.values(hitung).some((n) => Number(n) > 0) ? "open" : ""}><summary class="small"><b>Hitung per pecahan</b></summary>
      <div class="pecahan-grid">${PECAHAN.map((p) => `<label><span class="mono">${p >= 1000 ? p / 1000 + "rb" : p}</span><input type="number" inputmode="numeric" min="0" step="1" value="${hitung[p] || ""}" placeholder="0" data-change="pecahan" data-p="${p}" aria-label="Jumlah ${rupiah(p)}"></label>`).join("")}</div>
      <p class="small muted">Total: <b>${rupiah(totalHitung())}</b></p>
    </details>
    <div class="row-between pos-total"><span>Selisih</span>${selisihTag(selisih)}</div>
    <input name="catatan" maxlength="200" placeholder="Catatan (opsional), cth: kembalian kurang Rp 2.000">
    <button class="btn primary block">${label}</button>
  </form>`;
}

function aktifCard(s, sh) {
  const r = ringkasan(s, sh);
  return `
    <section class="card shift-card">
      <div class="row-between"><div><small class="mono muted">SHIFT AKTIF</small><h2 style="margin:2px 0">${esc(namaKasir(sh.kasir))}</h2>
        <p class="small muted">Sejak ${fmtDate(sh.buka.slice(0, 10))} ${jam(sh.buka)}</p></div>
        <a href="#/kasir" class="btn soft sm">${icon("register", 14)} Jualan</a></div>
      ${rows(r)}
    </section>

    <section class="card">
      <h2 class="card-title">Uang keluar / masuk laci</h2>
      ${(sh.laci || []).length
        ? (sh.laci || [])
            .map((l) => `<div class="tx ${JENIS_LACI[l.jenis].tanda > 0 ? "masuk" : "keluar"}"><div><b>${esc(JENIS_LACI[l.jenis].nama)}${l.kategori ? ` · ${esc(l.kategori)}` : ""}</b><p class="muted small">${jam(l.waktu)}${l.catatan ? ` · ${esc(l.catatan)}` : ""}</p></div>
              <b>${JENIS_LACI[l.jenis].tanda > 0 ? "+" : "−"}${rupiah(l.nominal)}</b>
              <button class="icon-btn sm" data-action="hapusLaci" data-shift="${sh.id}" data-id="${l.id}" aria-label="Hapus">${icon("x", 14)}</button></div>`)
            .join("")
        : `<p class="small muted">Belum ada. Catat kalau ada uang laci dipakai beli sesuatu, ditambah, atau disetor.</p>`}
      <form class="stack inline-form" data-form="laci" data-id="${sh.id}">
        <div class="chips">${Object.entries(JENIS_LACI).map(([k, v]) => `<label class="chip"><input type="radio" name="jenis" value="${k}" data-change="jenis" ${jenisLaci === k ? "checked" : ""}><span>${v.nama}</span></label>`).join("")}</div>
        <p class="small muted">${esc(JENIS_LACI[jenisLaci].desc)}</p>
        <div class="row2">
          <input name="nominal" type="number" inputmode="numeric" min="500" step="500" placeholder="Nominal" required>
          ${jenisLaci === "keluar" ? `<select name="kategori">${KATEGORI_LACI.map((k) => `<option>${k}</option>`).join("")}</select>` : `<span></span>`}
        </div>
        <input name="catatan" maxlength="80" placeholder="${jenisLaci === "keluar" ? "Untuk apa? cth: beli es batu" : jenisLaci === "ambil" ? "cth: setor ke Pak Raka" : "cth: tukar uang kecil"}">
        <button class="btn soft">Catat</button>
      </form>
    </section>

    <section class="card">
      <h2 class="card-title">Tutup shift</h2>
      <p class="small muted">Hitung semua uang di laci, masukkan totalnya. Selisih dibandingkan dengan uang seharusnya.</p>
      ${hitungForm(r, sh.id)}
    </section>`;
}

function bukaCard(s) {
  const last = [...(s.shifts || [])].reverse().find((x) => x.tutup && x.hasil);
  return `<section class="card accent">
    <h2 class="card-title">Buka shift</h2>
    <p class="small">Isi uang awal di laci (uang kembalian). Semua penjualan sampai shift ditutup tercatat atas nama <b>${esc(namaKasir(pelaku()))}</b>.</p>
    <form class="stack" data-form="buka">
      <label class="field"><span>Modal awal laci (Rp)</span><input name="modal" type="number" inputmode="numeric" min="0" step="1000" value="${last ? Math.min(last.hasil.modal || 0, 500000) : 200000}" required></label>
      <button class="btn primary block">${icon("register", 16)} Buka shift</button>
    </form>
  </section>`;
}

function riwayat(s) {
  const me = pelaku();
  const batas = (() => {
    const d = new Date(todayISO() + "T00:00:00");
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  })();
  let list = (s.shifts || []).filter((x) => x.buka.slice(0, 10) >= batas);
  if (!bisaKelola()) list = list.filter((x) => (x.kasir?.id || null) === (me?.id || null));
  const lain = shiftTerbuka(s).filter((x) => (x.kasir?.id || null) !== (me?.id || null));
  const tutup = list.filter((x) => x.tutup).reverse();
  const perKasir = selisihPerKasir(tutup);
  return `
    ${
      bisaKelola() && lain.length
        ? `<section class="card warn-card"><h2 class="card-title">Shift lain yang masih buka</h2>
            ${lain
              .map((x) => {
                const r = ringkasan(s, x);
                return `<div class="shift-row"><div><b>${esc(namaKasir(x.kasir))}</b><p class="small muted">sejak ${fmtDate(x.buka.slice(0, 10))} ${jam(x.buka)} · ${r.order} order · seharusnya ${rupiah(r.seharusnya)}</p></div>
                  <button class="btn ghost sm" data-action="tutupLain" data-id="${x.id}">Tutup</button></div>
                  ${tutupLain === x.id ? `<div class="inline-form">${rows(r)}${hitungForm(r, x.id, `Tutup shift ${esc(namaKasir(x.kasir))}`)}</div>` : ""}`;
              })
              .join("")}
          </section>`
        : ""
    }
    ${
      perKasir.length && bisaKelola()
        ? `<section class="card"><h2 class="card-title">Selisih 30 hari</h2>
            ${perKasir.map((k) => `<div class="row-between pos-sum"><span>${esc(k.nama)} <small class="muted">· ${k.n} shift${k.kurang ? ` · ${k.kurang}× kurang` : ""}</small></span>${selisihTag(k.selisih)}</div>`).join("")}
          </section>`
        : ""
    }
    <section class="card">
      <h2 class="card-title">Riwayat shift</h2>
      ${
        tutup.length
          ? tutup
              .map(
                (x) => `<div class="pos-order">
                  <button class="pos-order-head" data-action="open" data-id="${x.id}">
                    <span class="mono">${fmtDate(x.buka.slice(0, 10), { day: "numeric", month: "short" })}</span>
                    <span>${jam(x.buka)}–${jam(x.tutup)} · ${esc(namaKasir(x.kasir))} · ${x.hasil?.order ?? 0} order</span>
                    ${selisihTag(x.hasil?.selisih)}
                  </button>
                  ${
                    open === x.id && x.hasil
                      ? `<div class="inline-form">${rows(x.hasil)}
                          <div class="row-between pos-sum"><span>Uang dihitung</span><b>${x.hasil.setor === null ? "–" : rupiah(x.hasil.setor)}</b></div>
                          ${x.catatan ? `<p class="small">Catatan: ${esc(x.catatan)}</p>` : ""}
                          ${x.ditutupOleh ? `<p class="small muted">Ditutup oleh ${esc(x.ditutupOleh.nama)}</p>` : ""}
                          <a class="btn soft sm" href="${esc(linkWa(nomorPemilik(s), teksShift(s, x)))}" target="_blank" rel="noopener">${icon("chat", 14)} Kirim ke ${nomorPemilik(s) ? "pemilik" : "WA"}</a></div>`
                      : ""
                  }
                </div>`,
              )
              .join("")
          : `<p class="small muted">Belum ada shift yang ditutup.</p>`
      }
    </section>
    ${
      bisaKelola()
        ? `<section class="card"><label class="todo set-opt"><input type="checkbox" data-change="wajib" ${wajibShift(s) ? "checked" : ""}>
            <span><b>Wajib buka shift sebelum jualan</b><small class="muted">Kasir tidak bisa mencatat order sebelum buka shift. Cocok kalau ada karyawan.</small></span></label></section>`
        : ""
    }`;
}

export const shift = {
  render(s) {
    const sh = shiftAktif(s, pelaku());
    return `${head("Shift Kasir", "#/kasir")}${sh ? aktifCard(s, sh) : bukaCard(s)}${riwayat(s)}`;
  },

  actions: {
    open(el) {
      open = open === el.dataset.id ? null : el.dataset.id;
      render();
    },
    tutupLain(el) {
      tutupLain = tutupLain === el.dataset.id ? null : el.dataset.id;
      hitung = {};
      setorManual = "";
      render();
    },
    hapusLaci(el) {
      if (!confirm("Hapus catatan laci ini?")) return;
      store.set(hapusLaci(store.get(), el.dataset.shift, el.dataset.id));
      render();
    },
  },

  changes: {
    jenis(el) {
      jenisLaci = el.value;
      render();
    },
    setor(el) {
      hitung = {};
      setorManual = el.value;
      render();
    },
    pecahan(el) {
      hitung = { ...hitung, [el.dataset.p]: Math.max(0, Math.round(Number(el.value) || 0)) };
      render();
    },
    wajib(el) {
      store.set((s) => ({ posSetting: { ...(s.posSetting || {}), wajibShift: el.checked } }));
      toast(el.checked ? "Kasir wajib buka shift dulu" : "Buka shift jadi opsional");
      render();
    },
  },

  forms: {
    buka(form) {
      const { patch } = bukaShift(store.get(), { kasir: pelaku(), modal: new FormData(form).get("modal") });
      store.set(patch);
      hitung = {};
      setorManual = "";
      toast("Shift dibuka. Selamat jualan!");
      render();
    },
    laci(form) {
      const fd = new FormData(form);
      store.set(catatLaci(store.get(), form.dataset.id, { jenis: jenisLaci, nominal: fd.get("nominal"), kategori: fd.get("kategori") || "Operasional", catatan: fd.get("catatan") }));
      toast("Tercatat");
      render();
    },
    tutup(form) {
      const s = store.get();
      const sh = s.shifts.find((x) => x.id === form.dataset.id);
      const uang = uangLaci();
      const r = ringkasan(s, sh);
      const pesan =
        uang === null
          ? "Tutup shift tanpa menghitung uang laci? Selisih tidak akan diketahui."
          : `Tutup shift?\n\nSeharusnya ${rupiah(r.seharusnya)}\nDihitung ${rupiah(uang)}\nSelisih ${uang - r.seharusnya === 0 ? "pas" : rupiah(uang - r.seharusnya)}`;
      if (!confirm(pesan)) return;
      store.set(tutupShift(s, sh.id, { setor: uang, catatan: new FormData(form).get("catatan"), oleh: (sh.kasir?.id || null) !== (pelaku()?.id || null) ? pelaku() || { id: null, nama: "Pemilik" } : null }));
      hitung = {};
      setorManual = "";
      tutupLain = null;
      open = sh.id;
      toast("Shift ditutup");
      render();
      window.scrollTo(0, 0);
    },
  },
};
