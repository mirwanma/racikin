// Belanja & Supplier: daftar belanja otomatis, supplier, riwayat harga bahan.
import { store, uid } from "../store.js";
import { esc, rupiah, short, toast, copy, fmtDate, todayISO } from "../ui.js";
import { render } from "../app.js";
import { icon } from "../icons.js";
import { head } from "./_shared.js";
import { fmtQty } from "../stok-utils.js";
import { normWa, waLink } from "../loyalty.js";
import { rencanaBelanja, perSupplier, pesanWA, perubahanHarga, riwayatHarga, belanjaSupplier, catatBelanja } from "../belanja.js";
import { TEMPO_DEFAULT, METODE_BAYAR, tambahHari, ringkasUtang, pengingatUtang, notaSupplier, sisaNota, dibayar, statusNota, bayarUtang, lunasiSupplier, hapusBayarUtang, hapusNota, ubahTempo } from "../utang.js";

let tab = "daftar"; // daftar | supplier | harga | utang
let utangCek = false; // form "Sudah belanja": belum dibayar
let bukaNota = null; // nota utang yang dibuka (form bayar)
let bukaRiwayat = null; // supplierId yang riwayat notanya dibuka
let hari = 3;
let skip = new Set(); // bahanId yang tidak ikut dibeli
let qtyEdit = {}; // bahanId -> qty (diubah manual)
let extra = []; // bahanId tambahan (di luar rencana)
let catat = null; // key grup yang sedang dicatat
let editSup = null; // id supplier yang diedit ("new" = baru)
let openHarga = null;

const keyOf = (g) => g.supplier?.id || "none";
const bisnisOf = (s) => s.brand?.terpilih?.nama || s.profile?.nama || "usaha saya";

function itemsDaftar(s) {
  const plan = rencanaBelanja(s, hari);
  const ada = new Set(plan.map((p) => p.bahan.id));
  for (const id of extra) {
    const b = s.bahan.find((x) => x.id === id);
    if (b && !ada.has(id)) plan.push({ bahan: b, beli: 0, perHari: 0, habisDalam: null, menipis: false, estimasi: 0, tambahan: true });
  }
  return plan.map((p) => {
    const qty = qtyEdit[p.bahan.id] ?? p.beli;
    return { ...p, qty, estimasi: qty * (Number(p.bahan.harga) || 0), ikut: !skip.has(p.bahan.id) && qty > 0 };
  });
}

function itemRow(it) {
  const b = it.bahan;
  const info = it.tambahan ? "ditambah manual" : it.habisDalam !== null ? `stok ${fmtQty(Number(b.stok) || 0)} · habis ±${it.habisDalam < 1 ? "<1" : Math.floor(it.habisDalam)} hari` : `stok ${fmtQty(Number(b.stok) || 0)} · di bawah minimum`;
  return `<div class="bl-row ${it.ikut ? "" : "off"}">
    <input type="checkbox" data-change="ikut" data-id="${b.id}" ${!skip.has(b.id) ? "checked" : ""} aria-label="Ikut dibeli">
    <div><b>${esc(b.nama)}</b><p class="small muted">${esc(info)}${it.menipis ? ` · <span class="neg">menipis</span>` : ""}</p></div>
    <label class="bl-qty"><input type="number" inputmode="decimal" min="0" step="any" value="${it.qty}" data-change="qty" data-id="${b.id}" aria-label="Jumlah ${esc(b.nama)}"><small>${esc(b.satuan)}</small></label>
    <b class="bl-est">${short(it.estimasi)}</b>
  </div>`;
}

function catatForm(g) {
  const items = g.items.filter((i) => i.ikut);
  return `<form class="inline-form stack" data-form="catat" data-sup="${g.supplier?.id || ""}">
    <p class="small muted">Isi jumlah & total bayar sebenarnya. Harga per satuan baru otomatis menggantikan harga lama (HPP menu ikut ter-update).</p>
    ${items
      .map(
        (it) => `<div class="bl-catat"><b>${esc(it.bahan.nama)}</b>
          <label><input type="number" inputmode="decimal" min="0" step="any" name="q-${it.bahan.id}" value="${it.qty}"><small>${esc(it.bahan.satuan)}</small></label>
          <label><small>Rp</small><input type="number" inputmode="numeric" min="0" step="1" name="t-${it.bahan.id}" value="${Math.round(it.estimasi / 500) * 500}"></label></div>`,
      )
      .join("")}
    ${
      g.supplier
        ? `<label class="impor-cek"><input type="checkbox" name="utang" data-change="utangCek" ${utangCek ? "checked" : ""}><span>Belum dibayar (utang / tempo ke ${esc(g.supplier.nama)})</span></label>
          <div class="utang-tempo stack" ${utangCek ? "" : "hidden"}><label class="field"><span>Jatuh tempo bayar</span><input type="date" name="tempo" min="${todayISO()}" value="${tambahHari(todayISO(), TEMPO_DEFAULT)}" required ${utangCek ? "" : "disabled"}></label><p class="small muted">Stok & harga tetap ter-update sekarang. Pengeluaran Kas dicatat waktu utangnya dibayar (tab Utang).</p></div>`
        : ""
    }
    <label class="todo kas-cek" ${utangCek && g.supplier ? "hidden" : ""}><input type="checkbox" name="kas" checked><span>Catat pengeluaran ke Kas</span></label>
    <div class="row2"><button type="button" class="btn ghost" data-action="batalCatat">Batal</button><button class="btn primary">Simpan belanja</button></div>
  </form>`;
}

function daftarTab(s) {
  const items = itemsDaftar(s);
  const groups = perSupplier(s, items);
  const total = items.filter((i) => i.ikut).reduce((a, i) => a + i.estimasi, 0);
  const lain = s.bahan.filter((b) => !items.some((i) => i.bahan.id === b.id)).sort((a, b) => a.nama.localeCompare(b.nama, "id"));
  return `
    <div class="row-between"><span class="small">Belanja untuk</span>
      <div class="chips">${[1, 3, 7].map((h) => `<button class="chip-btn ${h === hari ? "on" : ""}" data-action="hari" data-h="${h}">${h} hari</button>`).join("")}</div></div>
    <p class="small muted">Dihitung dari rata-rata pemakaian 14 hari terakhir + stok minimum − stok sekarang.</p>
    ${
      items.length
        ? groups
            .map((g) => {
              const ikut = g.items.filter((i) => i.ikut);
              const sub = ikut.reduce((a, i) => a + i.estimasi, 0);
              const wa = ikut.length ? (g.supplier?.wa ? waLink(g.supplier.wa, pesanWA({ ...g, items: ikut }, bisnisOf(s))) : `https://wa.me/?text=${encodeURIComponent(pesanWA({ ...g, items: ikut }, bisnisOf(s)))}`) : "";
              return `<section class="card">
                <div class="row-between"><div><h2 class="card-title" style="margin:0">${esc(g.supplier?.nama || "Belum ada supplier")}</h2>
                  <p class="small muted">${ikut.length} bahan · perkiraan ${rupiah(sub)}</p></div>
                  ${g.supplier ? "" : `<button class="btn ghost sm" data-action="tab" data-t="supplier">Atur supplier</button>`}</div>
                ${g.items.map(itemRow).join("")}
                ${
                  catat === keyOf(g)
                    ? catatForm(g)
                    : ikut.length
                      ? `<div class="row2 bl-actions">
                          <a class="btn ghost" href="${esc(wa)}" target="_blank" rel="noopener">${g.supplier?.wa ? "Pesan via WA" : "Kirim daftar via WA"}</a>
                          <button class="btn primary" data-action="catat" data-k="${keyOf(g)}">Sudah belanja</button>
                        </div>`
                      : ""
                }
              </section>`;
            })
            .join("")
        : `<section class="card empty"><div class="empty-icon">${icon("check", 30)}</div><h3>Stok aman</h3><p>Belum ada bahan yang perlu dibeli untuk ${hari} hari ke depan.</p></section>`
    }
    ${items.length ? `<div class="bl-total"><span>Total perkiraan belanja</span><b>${rupiah(total)}</b></div>` : ""}
    ${
      lain.length
        ? `<section class="card"><label class="field"><span>Tambah bahan lain ke daftar</span><select data-change="extra"><option value="">Pilih bahan…</option>${lain.map((b) => `<option value="${b.id}">${esc(b.nama)}</option>`).join("")}</select></label>
            <button class="btn ghost sm" data-action="salin">Salin semua daftar</button></section>`
        : ""
    }`;
}

function supForm(s, sp) {
  const b = [...s.bahan].sort((x, y) => x.nama.localeCompare(y.nama, "id"));
  return `<form class="stack ${sp ? "inline-form" : ""}" data-form="sup" data-id="${sp?.id || ""}">
    <div class="row2"><input name="nama" maxlength="60" placeholder="Nama, cth: Pabrik Tahu Pak Darto" value="${esc(sp?.nama || "")}" required>
      <input name="wa" type="tel" inputmode="tel" placeholder="No. WA (opsional)" value="${esc(sp?.wa || "")}"></div>
    <input name="catatan" maxlength="120" placeholder="Catatan (jam buka, alamat, minimal order…)" value="${esc(sp?.catatan || "")}">
    ${b.length ? `<div class="field"><span>Bahan yang dibeli di sini</span><div class="chips">${b.map((x) => `<label class="chip"><input type="checkbox" name="bahan" value="${x.id}" ${sp && x.supplierId === sp.id ? "checked" : ""}><span>${esc(x.nama)}</span></label>`).join("")}</div></div>` : ""}
    <div class="row2">${sp ? `<button type="button" class="btn danger" data-action="hapusSup" data-id="${sp.id}">Hapus</button>` : `<span></span>`}<button class="btn primary">${sp ? "Simpan" : "Tambah supplier"}</button></div>
  </form>`;
}

function supplierTab(s) {
  const list = s.supplier || [];
  const total = belanjaSupplier(s, 30);
  return `
    ${list
      .map((sp) => {
        const bahan = s.bahan.filter((b) => b.supplierId === sp.id);
        return `<section class="card">
          <div class="row-between"><div><h2 class="card-title" style="margin:0">${esc(sp.nama)}</h2>
            <p class="small muted">${sp.wa ? esc(sp.wa) : "tanpa no. WA"}${total[sp.id] ? ` · belanja 30 hari ${rupiah(total[sp.id])}` : ""}</p></div>
            <button class="btn ghost sm" data-action="editSup" data-id="${sp.id}">Edit</button></div>
          ${sp.catatan ? `<p class="small">${esc(sp.catatan)}</p>` : ""}
          <p class="small">${bahan.length ? bahan.map((b) => esc(b.nama)).join(", ") : `<span class="muted">Belum ada bahan.</span>`}</p>
          ${editSup === sp.id ? supForm(s, sp) : ""}
        </section>`;
      })
      .join("")}
    <details class="card" ${list.length ? "" : "open"}><summary><b>Tambah supplier</b></summary>${supForm(s, null)}</details>
    ${s.bahan.some((b) => !b.supplierId) && list.length ? `<p class="small muted">${s.bahan.filter((b) => !b.supplierId).length} bahan belum punya supplier.</p>` : ""}`;
}

function hargaTab(s) {
  const ubah = perubahanHarga(s);
  const naik = ubah.filter((u) => u.pct >= 5);
  const turun = ubah.filter((u) => u.pct <= -5);
  const sup = new Map((s.supplier || []).map((x) => [x.id, x.nama]));
  const blok = (u) => `<div class="bl-harga">
      <button class="bl-head" data-action="openHarga" data-id="${u.bahan.id}">
        <span><b>${esc(u.bahan.nama)}</b></span><span class="small">${rupiah(u.lama)} → <b>${rupiah(u.baru)}</b>/${esc(u.bahan.satuan)}<br><span class="muted">sejak ${fmtDate(u.sejak, { day: "numeric", month: "short" })}</span></span>
        <span class="tag ${u.pct > 0 ? "minus" : "ok"}">${u.pct > 0 ? "▲" : "▼"} ${Math.abs(u.pct).toFixed(0)}%</span>
      </button>
      ${u.menu.length ? `<p class="small muted">HPP ${u.menu.slice(0, 3).map((m) => `${esc(m.nama)} ${m.deltaHpp >= 0 ? "+" : "−"}${rupiah(Math.abs(m.deltaHpp))}`).join(" · ")}${u.menu.length > 3 ? ` · +${u.menu.length - 3} menu` : ""} per porsi</p>` : ""}
      ${openHarga === u.bahan.id ? riwayat(s, u.bahan, sup) : ""}
    </div>`;
  const semua = [...s.bahan].sort((a, b) => a.nama.localeCompare(b.nama, "id"));
  return `
    ${naik.length ? `<section class="card warn-card"><h2 class="card-title">Harga naik</h2>${naik.map(blok).join("")}<p class="small muted">Cek margin menu terdampak di Stok & Resep, atau cari supplier lain.</p></section>` : ""}
    ${turun.length ? `<section class="card"><h2 class="card-title">Harga turun</h2>${turun.map(blok).join("")}</section>` : ""}
    <section class="card"><h2 class="card-title">Semua bahan</h2>
      ${semua
        .map((b) => {
          const r = riwayatHarga(s, b.id);
          const last = r[r.length - 1];
          return `<div class="bl-harga"><button class="bl-head" data-action="openHarga" data-id="${b.id}">
              <span><b>${esc(b.nama)}</b></span><span class="small muted">${last ? `beli ${fmtDate(last.tanggal, { day: "numeric", month: "short" })}` : "belum ada riwayat"}</span>
              <b>${rupiah(b.harga)}/${esc(b.satuan)}</b></button>
              ${openHarga === b.id ? riwayat(s, b, sup) : ""}</div>`;
        })
        .join("")}
      <p class="small muted">Riwayat harga tercatat setiap belanja yang diisi total bayarnya.</p>
    </section>`;
}

function riwayat(s, b, sup) {
  const r = riwayatHarga(s, b.id).slice(-8).reverse();
  if (!r.length) return `<p class="small muted inline-form">Belum ada pembelian dengan harga untuk bahan ini.</p>`;
  return `<table class="lr-table inline-form"><thead><tr><th>Tanggal</th><th>Supplier</th><th class="num">Harga/${esc(b.satuan)}</th></tr></thead><tbody>
    ${r.map((l) => `<tr><td>${fmtDate(l.tanggal, { day: "numeric", month: "short" })}</td><td>${esc(sup.get(l.supplierId) || l.catatan || "-")}</td><td class="num">${rupiah(l.harga)}</td></tr>`).join("")}
  </tbody></table>`;
}

const tglPendek = (iso) => fmtDate(iso, { day: "numeric", month: "short" });
const STATUS_NOTA = { telat: ["Lewat tempo", "neg"], segera: ["Segera", "warn"], belum: ["Belum", "muted"], lunas: ["Lunas", "pos"] };

function notaRow(s, n, today) {
  const st = statusNota(n, today);
  const [nm, cls] = STATUS_NOTA[st];
  const buka = bukaNota === n.id;
  const sisa = sisaNota(n);
  return `<div class="utang-nota ${buka ? "on" : ""}">
    <button class="utang-head" data-action="bukaNota" data-id="${n.id}">
      <span><b>${tglPendek(n.tanggal)}</b><small class="muted">${esc(n.catatan || "belanja")}</small></span>
      <span class="num"><b>${rupiah(sisa || n.total)}</b><small class="${cls === "neg" ? "neg" : "muted"}">${sisa ? `tempo ${tglPendek(n.tempo)}` : "lunas"}</small></span>
      <span class="sehat-pill ${cls}">${nm}</span>
    </button>
    ${
      buka
        ? `<div class="inline-form stack">
        <p class="small muted">Total ${rupiah(n.total)}${dibayar(n) ? ` · sudah dibayar ${rupiah(dibayar(n))}` : ""}</p>
        ${(n.bayar || []).map((b) => `<div class="row-between pos-sum"><span>Bayar ${esc(METODE_BAYAR.find((m) => m.id === b.metode)?.nama || "")} · ${tglPendek(b.tanggal)}</span><span><b>${rupiah(b.nominal)}</b> <button class="link small" data-action="hapusBayar" data-nota="${n.id}" data-id="${b.id}">hapus</button></span></div>`).join("")}
        ${
          sisa
            ? `<form class="stack" data-form="bayarUtang" data-id="${n.id}">
            <div class="chips">${METODE_BAYAR.map((m, i) => `<label class="chip"><input type="radio" name="metode" value="${m.id}" ${m.id === "transfer" ? "checked" : ""}><span>${m.nama}</span></label>`).join("")}</div>
            <div class="row2">
              <label class="field"><span>Bayar (Rp)</span><input type="number" inputmode="numeric" name="nominal" min="1" max="${sisa}" step="1" value="${sisa}" required></label>
              <label class="field"><span>Tanggal</span><input type="date" name="tanggal" value="${today}" required></label>
            </div>
            <button class="btn primary block">${icon("check", 16)} Catat bayar (masuk Kas)</button>
          </form>
          <label class="field"><span>Ubah jatuh tempo</span><input type="date" value="${n.tempo}" min="${n.tanggal}" data-change="tempo" data-id="${n.id}"></label>`
            : ""
        }
        ${(n.bayar || []).length ? "" : `<button class="link small" data-action="hapusNota" data-id="${n.id}">Hapus catatan utang ini (salah catat)</button>`}
      </div>`
        : ""
    }
  </div>`;
}

/** Pengingat Beranda: utang supplier lewat / mendekati jatuh tempo. */
export function utangCard(s) {
  const p = pengingatUtang(s, todayISO());
  if (!p) return "";
  return `<a href="#/belanja?tab=utang" class="card pajak-mini ${p.telat ? "neg" : ""}">
    ${icon("box", 22)}
    <span><b>Utang supplier ${rupiah(p.total)}</b><small class="muted">${p.telat ? `${p.telat} nota lewat jatuh tempo` : `${esc(p.nama)} jatuh tempo ${tglPendek(p.tempo)}`}${p.n > 1 ? ` · ${p.n} nota` : ""}</small></span>
    ${icon("chevron", 18)}
  </a>`;
}

function utangTab(s) {
  const today = todayISO();
  const r = ringkasUtang(s, today);
  const sup = s.supplier || [];
  const lunasSup = sup.filter((x) => !r.supplier.some((y) => y.supplierId === x.id) && notaSupplier(s, x.id).length);
  return `
    <section class="card accent">
      <div class="stats3">
        <div><small>Total utang</small><b>${rupiah(r.total)}</b></div>
        <div><small>Nota</small><b>${r.n}</b></div>
        <div><small>Lewat tempo</small><b class="${r.telat.length ? "neg" : ""}">${r.telat.length}</b></div>
      </div>
      <p class="small muted" style="margin:0">Utang dicatat dari Daftar belanja > Sudah belanja (centang "Belum dibayar"). Bayarnya masuk Kas sebagai pengeluaran Bahan Baku / Kemasan.</p>
    </section>
    ${
      r.supplier.length
        ? r.supplier
            .map(
              (x) => `<section class="card stack utang-sup">
          <div class="row-between"><div><h2 class="card-title" style="margin:0">${esc(x.nama)}</h2><p class="small muted">${x.nota.length} nota${x.telat ? ` · <span class="neg">${x.telat} lewat tempo</span>` : ""}</p></div><b class="neg">${rupiah(x.sisa)}</b></div>
          ${x.nota.map((n) => notaRow(s, n, today)).join("")}
          ${x.nota.length > 1 ? `<button class="btn soft sm" data-action="lunasiSup" data-id="${x.supplierId}">Lunasi semua ${rupiah(x.sisa)} (transfer hari ini)</button>` : ""}
          ${notaSupplier(s, x.supplierId).some((n) => !sisaNota(n)) ? `<button class="link small" data-action="riwayatSup" data-id="${x.supplierId}">${bukaRiwayat === x.supplierId ? "Tutup riwayat" : "Riwayat lunas"}</button>${bukaRiwayat === x.supplierId ? notaSupplier(s, x.supplierId).filter((n) => !sisaNota(n)).slice(0, 10).map((n) => notaRow(s, n, today)).join("") : ""}` : ""}
        </section>`,
            )
            .join("")
        : `<section class="card"><p class="small muted" style="margin:0">Nggak ada utang ke supplier. Aman.</p></section>`
    }
    ${
      lunasSup.length
        ? `<section class="card stack"><h2 class="card-title" style="margin:0">Sudah lunas</h2>${lunasSup
            .map((x) => `<button class="link small" data-action="riwayatSup" data-id="${x.id}">${esc(x.nama)} (${notaSupplier(s, x.id).length} nota)</button>${bukaRiwayat === x.id ? notaSupplier(s, x.id).slice(0, 10).map((n) => notaRow(s, n, today)).join("") : ""}`)
            .join("")}</section>`
        : ""
    }`;
}

export const belanja = {
  render(s) {
    if (location.hash.includes("tab=supplier")) {
      tab = "supplier";
      history.replaceState(null, "", "#/belanja");
    }
    if (location.hash.includes("tab=utang")) {
      tab = "utang";
      history.replaceState(null, "", "#/belanja");
    }
    const adaUtang = (s.utangSupplier || []).length > 0;
    if (tab === "utang" && !adaUtang) tab = "daftar";
    const nUtang = ringkasUtang(s, todayISO()).n;
    const tabs = `<div class="seg ${adaUtang ? "seg4" : "seg3"}">
      ${(adaUtang ? [["daftar", "Daftar"], ["supplier", "Supplier"], ["harga", "Harga"], ["utang", `Utang${nUtang ? ` <b class="kds-n">${nUtang}</b>` : ""}`]] : [["daftar", "Daftar belanja"], ["supplier", "Supplier"], ["harga", "Harga bahan"]]).map(([k, v]) => `<label><input type="radio" name="tab" value="${k}" data-change="tab" ${tab === k ? "checked" : ""}><span>${v}</span></label>`).join("")}
    </div>`;
    if (!s.bahan.length) return `${head("Belanja & Supplier", "#/stok")}<section class="card empty"><div class="empty-icon">${icon("box", 30)}</div><h3>Belum ada bahan</h3><p>Bikin resep dulu supaya bahan & stoknya tercatat.</p><a href="#/resep?id=new" class="btn primary">Bikin resep</a></section>`;
    return `${head("Belanja & Supplier", "#/stok")}${tabs}${tab === "supplier" ? supplierTab(s) : tab === "harga" ? hargaTab(s) : tab === "utang" ? utangTab(s) : daftarTab(s)}`;
  },

  actions: {
    tab(el) {
      tab = el.dataset.t;
      render();
    },
    hari(el) {
      hari = Number(el.dataset.h);
      qtyEdit = {};
      catat = null;
      render();
    },
    catat(el) {
      catat = el.dataset.k;
      utangCek = false;
      render();
    },
    batalCatat() {
      catat = null;
      render();
    },
    async salin() {
      const s = store.get();
      const groups = perSupplier(s, itemsDaftar(s).filter((i) => i.ikut));
      await copy(groups.map((g) => `*${g.supplier?.nama || "Lainnya"}*\n${g.items.map((it) => `- ${it.bahan.nama}: ${fmtQty(it.qty)} ${it.bahan.satuan}`).join("\n")}`).join("\n\n"));
      toast("Daftar belanja disalin");
    },
    editSup(el) {
      editSup = editSup === el.dataset.id ? null : el.dataset.id;
      render();
    },
    hapusSup(el) {
      const s = store.get();
      const sp = s.supplier.find((x) => x.id === el.dataset.id);
      if (ringkasUtang(s, todayISO()).supplier.some((x) => x.supplierId === sp.id)) return toast(`Masih ada utang ke ${sp.nama}, lunasi dulu`, "err");
      if (!confirm(`Hapus supplier ${sp.nama}? Bahan-bahannya jadi "belum ada supplier".`)) return;
      store.set({ supplier: s.supplier.filter((x) => x.id !== sp.id), bahan: s.bahan.map((b) => (b.supplierId === sp.id ? { ...b, supplierId: null } : b)) });
      editSup = null;
      render();
    },
    bukaNota(el) {
      bukaNota = bukaNota === el.dataset.id ? null : el.dataset.id;
      render();
    },
    riwayatSup(el) {
      bukaRiwayat = bukaRiwayat === el.dataset.id ? null : el.dataset.id;
      render();
    },
    lunasiSup(el) {
      const s = store.get();
      const x = ringkasUtang(s, todayISO()).supplier.find((y) => y.supplierId === el.dataset.id);
      if (!x || !confirm(`Lunasi semua utang ke ${x.nama}: ${rupiah(x.sisa)} (transfer, hari ini)? Pengeluaran Kas ikut dicatat.`)) return;
      store.set(lunasiSupplier(s, x.supplierId, { tanggal: todayISO(), metode: "transfer" }));
      bukaNota = null;
      toast(`Utang ke ${x.nama} lunas`);
      render();
    },
    hapusBayar(el) {
      if (!confirm("Hapus catatan bayar ini? Pengeluaran Kas-nya ikut dihapus.")) return;
      store.set(hapusBayarUtang(store.get(), el.dataset.nota, el.dataset.id));
      render();
    },
    hapusNota(el) {
      if (!confirm("Hapus catatan utang ini? Stok yang sudah masuk nggak berubah.")) return;
      try {
        store.set(hapusNota(store.get(), el.dataset.id));
      } catch (e) {
        return toast(e.message, "err");
      }
      bukaNota = null;
      render();
    },
    openHarga(el) {
      openHarga = openHarga === el.dataset.id ? null : el.dataset.id;
      render();
    },
  },

  changes: {
    tab(el) {
      tab = el.value;
      catat = null;
      render();
    },
    utangCek(el) {
      // Tanpa render ulang: angka yang sudah diketik di form tetap.
      utangCek = el.checked;
      const f = el.closest("form");
      f.querySelector(".utang-tempo").hidden = !utangCek;
      f.querySelector(".utang-tempo input").disabled = !utangCek;
      f.querySelector(".kas-cek").hidden = utangCek;
    },
    tempo(el) {
      if (!el.value) return;
      store.set(ubahTempo(store.get(), el.dataset.id, el.value));
      toast(`Jatuh tempo jadi ${tglPendek(el.value)}`);
      render();
    },
    ikut(el) {
      if (el.checked) skip.delete(el.dataset.id);
      else skip.add(el.dataset.id);
      render();
    },
    qty(el) {
      qtyEdit = { ...qtyEdit, [el.dataset.id]: Math.max(0, Number(el.value) || 0) };
      render();
    },
    extra(el) {
      if (el.value) extra = [...extra, el.value];
      skip.delete(el.value);
      render();
    },
  },

  forms: {
    catat(form) {
      const s = store.get();
      const fd = new FormData(form);
      const rows = [];
      for (const [k, v] of fd.entries()) if (k.startsWith("q-")) rows.push({ bahanId: k.slice(2), qty: Number(v) || 0, total: Number(fd.get("t-" + k.slice(2))) || 0 });
      // Jaga-jaga salah ketik total: harga per satuan berubah lebih dari 2x lipat -> konfirmasi dulu.
      const aneh = rows
        .map((r) => ({ r, b: s.bahan.find((x) => x.id === r.bahanId) }))
        .filter(({ r, b }) => r.qty > 0 && r.total > 0 && Number(b?.harga) > 0 && (r.total / r.qty > b.harga * 2 || r.total / r.qty < b.harga / 2));
      if (aneh.length && !confirm(`Harga berubah jauh, cek lagi totalnya:\n\n${aneh.map(({ r, b }) => `${b.nama}: ${rupiah(b.harga)} → ${rupiah(r.total / r.qty)} per ${b.satuan}`).join("\n")}\n\nTetap simpan?`)) return;
      const utang = fd.get("utang") ? { tempo: String(fd.get("tempo") || "") } : null;
      try {
        store.set(catatBelanja(s, rows, { supplierId: form.dataset.sup || null, kas: !!fd.get("kas"), utang }));
      } catch (e) {
        return toast(e.message, "err");
      }
      for (const r of rows) {
        delete qtyEdit[r.bahanId];
        extra = extra.filter((x) => x !== r.bahanId);
      }
      catat = null;
      utangCek = false;
      toast(`Belanja tercatat${utang ? " sebagai utang" : ""} · stok ${rows.filter((r) => r.qty > 0).length} bahan bertambah`);
      render();
    },
    bayarUtang(form) {
      const fd = new FormData(form);
      const s = store.get();
      try {
        store.set(bayarUtang(s, form.dataset.id, { nominal: fd.get("nominal"), tanggal: String(fd.get("tanggal")), metode: String(fd.get("metode") || "transfer") }));
      } catch (e) {
        return toast(e.message, "err");
      }
      const n = store.get().utangSupplier.find((x) => x.id === form.dataset.id);
      toast(sisaNota(n) ? `Tercatat. Sisa nota ini ${rupiah(sisaNota(n))}` : "Nota lunas");
      if (!sisaNota(n)) bukaNota = null;
      render();
    },
    sup(form) {
      const s = store.get();
      const fd = new FormData(form);
      const nama = String(fd.get("nama")).trim();
      if (!nama) return;
      const id = form.dataset.id || uid();
      const data = { id, nama, wa: fd.get("wa") ? normWa(String(fd.get("wa"))) : "", catatan: String(fd.get("catatan") || "").trim() };
      const dipilih = new Set(fd.getAll("bahan"));
      const supplier = form.dataset.id ? s.supplier.map((x) => (x.id === id ? data : x)) : [...(s.supplier || []), data];
      const bahan = s.bahan.map((b) => (dipilih.has(b.id) ? { ...b, supplierId: id } : b.supplierId === id ? { ...b, supplierId: null } : b));
      store.set({ supplier, bahan });
      editSup = null;
      toast(form.dataset.id ? "Supplier disimpan" : `${nama} ditambahkan`);
      render();
    },
  },
};
