// Halaman pelanggan dari QR meja: lihat menu, pesan, bayar (di kasir / digital simulasi), pantau status.
// Dibuka tanpa login & tanpa data usaha di perangkat. Rute: #/m/<token-meja>
import { esc, rupiah, toast } from "../ui.js";
import { render } from "../app.js";
import { icon } from "../icons.js";
import { ambilMenu, kirimPesanan, cekPesanan, bayarSimulasi, qrSvg } from "../meja.js";
import { grupMenu, cekPilihan, pilihanAwal, aturan, kunciItem, labelOpsi } from "../varian.js";

let token = null;
let menu = null; // hasil get_table_menu
let err = "";
let loading = false;
let cart = new Map(); // kunci (menu + pilihan) -> { id, qty, opsi: [{ g, id, nama, harga }] }
let pilih = null; // sheet varian { id, ids, error }
let step = "menu"; // menu | checkout | bayar | status
let cari = "";
let busy = false;
let order = null; // status terakhir dari server
let qr = "";
let pollT = null;

const KEY = () => `racikin:pesan:${token}`;
const simpan = (v) => {
  try {
    localStorage.setItem(KEY(), JSON.stringify(v));
  } catch {
    /* abaikan */
  }
};
const baca = () => {
  try {
    return JSON.parse(localStorage.getItem(KEY())) || null;
  } catch {
    return null;
  }
};
const namaTersimpan = () => {
  try {
    return localStorage.getItem("racikin:pesan-nama") || "";
  } catch {
    return "";
  }
};

const tokenDariUrl = () => location.hash.replace(/^#\/?m\/?/, "").split(/[?/]/)[0];
// Bentuk data publik disesuaikan supaya fungsi varian.js bisa dipakai: { opsi } & { opsiIds }.
const sv = () => ({ opsi: menu?.opsi || [] });
const rv = (m) => ({ opsiIds: m?.opsi || [] });
const punya = (m) => grupMenu(sv(), rv(m)).length > 0;
const tambahan = (opsi) => (opsi || []).reduce((a, o) => a + (Number(o.harga) || 0), 0);
const items = () =>
  [...cart.entries()]
    .map(([key, c]) => {
      const m = menu.menu.find((x) => x.id === c.id);
      return { key, m, qty: c.qty, opsi: c.opsi || [], harga: (m?.harga || 0) + tambahan(c.opsi) };
    })
    .filter((x) => x.m && x.qty > 0);
const total = () => items().reduce((a, x) => a + x.harga * x.qty, 0);
const qtyMenu = (id) => [...cart.values()].filter((c) => c.id === id).reduce((a, c) => a + c.qty, 0);
const tambahCart = (id, opsi = []) => {
  const key = kunciItem(id, opsi);
  const c = cart.get(key);
  cart.set(key, { id, opsi, qty: (c?.qty || 0) + 1 });
};
const jumlah = () => items().reduce((a, x) => a + x.qty, 0);

async function muat() {
  if (loading) return;
  loading = true;
  try {
    menu = await ambilMenu(token);
    err = menu ? "" : "QR meja tidak dikenali. Minta bantuan kasir ya.";
    const aktif = baca();
    if (menu && aktif?.id && step === "menu") {
      order = await cekPesanan(aktif.id, aktif.secret).catch(() => null);
      if (order && !["selesai", "batal"].includes(order.status)) step = order.metode === "digital" && order.bayar_status !== "lunas" ? "bayar" : "status";
    }
  } catch (e) {
    err = e.message;
  }
  loading = false;
  render();
}

function poll() {
  clearInterval(pollT);
  pollT = setInterval(async () => {
    if (!location.hash.startsWith("#/m/")) return clearInterval(pollT);
    const a = baca();
    if (!a?.id || document.visibilityState !== "visible") return;
    const o = await cekPesanan(a.id, a.secret).catch(() => null);
    if (o && JSON.stringify(o) !== JSON.stringify(order)) {
      const lama = order;
      order = o;
      if (lama && lama.dapur !== "siap" && o.dapur === "siap") navigator.vibrate?.([200, 100, 200]);
      render();
    }
  }, 5000);
}

function header() {
  const w = menu?.warna;
  return `<header class="pm-head" ${w ? `style="--pm1:${esc(w.utama)};--pm2:${esc(w.aksen)}"` : ""}>
    <div><small class="mono">${esc(menu?.meja?.nama || "Meja")}</small><h1>${esc(menu?.bisnis || "Menu")}</h1>${menu?.lokasi ? `<p class="small">${esc(menu.lokasi)}</p>` : ""}</div>
  </header>`;
}

/** Info promo yang lagi jalan (potongan dihitung kasir). */
function promoBanner() {
  const list = (menu?.promo || []).filter((p) => p && p.nama);
  if (!list.length) return "";
  return `<section class="card accent pm-promo">
    ${list.map((p) => `<p>${icon("spark", 14)}<span><b>${esc(p.nama)}</b> · ${esc(p.ket || "")}</span></p>`).join("")}
    <p class="small muted">Potongan promo dihitung kasir waktu pesananmu diterima (bayar di kasir).</p>
  </section>`;
}

function menuView() {
  const list = (menu.menu || []).filter((m) => !cari || m.nama.toLowerCase().includes(cari.toLowerCase()));
  return `${header()}
    ${promoBanner()}
    ${(menu.menu || []).length > 8 ? `<input type="search" class="pm-cari" placeholder="Cari menu…" value="${esc(cari)}" aria-label="Cari menu">` : ""}
    <div class="pm-list">
      ${list
        .map((m) => {
          const q = qtyMenu(m.id);
          const varian = punya(m);
          return `<div class="pm-item ${m.habis ? "habis" : ""} ${q ? "in" : ""}">
            ${m.foto && /^https:\/\//.test(m.foto) ? `<img class="pm-img" src="${esc(m.foto)}" alt="" loading="lazy" decoding="async">` : ""}
            <div class="pm-info"><b>${esc(m.nama)}</b><p class="mono">${rupiah(m.harga)}${m.habis ? " · habis" : varian ? ` · ada pilihan` : ""}</p></div>
            ${
              m.habis
                ? `<span class="tag">Habis</span>`
                : varian
                  ? `<button class="btn ${q ? "primary" : "soft"} sm" data-action="pilih" data-id="${esc(m.id)}">${q ? `${q} · tambah` : `${icon("plus", 14)} Pilih`}</button>`
                  : q
                  ? `<div class="stepper"><button class="icon-btn sm" data-action="kurang" data-key="${esc(m.id)}" aria-label="Kurangi">−</button><b>${q}</b><button class="icon-btn sm" data-action="tambah" data-id="${esc(m.id)}" aria-label="Tambah">+</button></div>`
                  : `<button class="btn soft sm" data-action="tambah" data-id="${esc(m.id)}">${icon("plus", 14)} Tambah</button>`
            }
          </div>`;
        })
        .join("") || `<p class="muted">Menu tidak ditemukan.</p>`}
    </div>
    ${pilihSheet()}
    ${jumlah() && !pilih ? `<div class="pm-bar"><div><small class="mono">${jumlah()} item</small><b>${rupiah(total())}</b></div><button class="btn primary" data-action="checkout">Lanjut ${icon("chevron", 16)}</button></div>` : ""}`;
}

function pilihSheet() {
  if (!pilih) return "";
  const m = menu.menu.find((x) => x.id === pilih.id);
  if (!m) return "";
  const ids = new Set(pilih.ids);
  const cek = cekPilihan(sv(), rv(m), pilih.ids, {});
  return `<div class="sheet-bg" data-action="pilihTutup"></div>
    <section class="sheet" role="dialog" aria-modal="true" aria-label="Pilih varian ${esc(m.nama)}">
      <header class="row-between"><div><h2 class="card-title" style="margin:0">${esc(m.nama)}</h2><p class="small muted">${rupiah(m.harga)}</p></div>
        <button class="icon-btn sm" data-action="pilihTutup" aria-label="Tutup">${icon("x", 14)}</button></header>
      <div class="sheet-body">
      ${grupMenu(sv(), rv(m))
        .map(
          (g) => `<fieldset class="opsi-grup"><legend><b>${esc(g.nama)}</b> <small class="muted">${aturan(g)}</small></legend>
          <div class="opsi-list">${g.pilihan
            .map((p) => {
              const on = ids.has(p.id);
              return `<button type="button" class="opsi-btn ${on ? "on" : ""} ${g.tipe === "satu" ? "radio" : ""}" data-action="pilihOpsi" data-g="${esc(g.id)}" data-id="${esc(p.id)}" ${p.habis ? "disabled" : ""} aria-pressed="${on}">
                <span class="opsi-dot">${on ? icon("check", 12) : ""}</span><span>${esc(p.nama)}</span><small class="mono">${p.habis ? "habis" : p.harga ? `+${rupiah(p.harga)}` : "gratis"}</small></button>`;
            })
            .join("")}</div></fieldset>`,
        )
        .join("")}
      </div>
      ${pilih.error ? `<p class="warn-box small">${esc(pilih.error)}</p>` : ""}
      <button class="btn primary block lg" data-action="pilihTambah">Tambah · ${rupiah(m.harga + tambahan(cek.opsi))}</button>
    </section>`;
}

function checkoutView() {
  return `${header()}
    <section class="card">
      <div class="row-between"><h2 class="card-title" style="margin:0">Pesananmu</h2><button class="btn ghost sm" data-action="balik">+ Tambah</button></div>
      ${items()
        .map(
          (x) => `<div class="pos-line">
            <div><b>${esc(x.m.nama)}</b>${x.opsi.length ? `<p class="small pos-opsi">${esc(labelOpsi(x))}</p>` : ""}<p class="small muted">${rupiah(x.harga)}</p></div>
            <div class="stepper"><button class="icon-btn sm" data-action="kurang" data-key="${esc(x.key)}" aria-label="Kurangi">−</button><b>${x.qty}</b><button class="icon-btn sm" data-action="lebih" data-key="${esc(x.key)}" aria-label="Tambah">+</button></div>
            <b class="pos-line-total">${rupiah(x.harga * x.qty)}</b>
          </div>`,
        )
        .join("")}
      <div class="row-between pos-total"><span>Total</span><b>${rupiah(total())}</b></div>
    </section>
    <form class="card stack" data-form="pesan">
      <label class="field"><span>Nama kamu</span><input name="nama" maxlength="40" required value="${esc(namaTersimpan())}" placeholder="Biar kasir & dapur tahu pesanan siapa" autocomplete="given-name"></label>
      <label class="field"><span>Catatan (opsional)</span><input name="catatan" maxlength="200" placeholder="cth: pedas level 3, tanpa bawang"></label>
      <div class="field"><span>Pembayaran</span>
        <label class="pm-pay"><input type="radio" name="metode" value="kasir" checked><span><b>Bayar di kasir</b><small class="muted">Tunai / QRIS di kasir. Sebutkan kode pesanan.</small></span></label>
        ${menu.digital ? `<label class="pm-pay"><input type="radio" name="metode" value="digital"><span><b>Bayar digital (QRIS)</b><small class="muted">Mode demo: simulasi, belum ada uang yang ditarik.</small></span></label>` : ""}
      </div>
      <button class="btn primary block lg" ${busy ? "disabled" : ""}>${busy ? "Mengirim…" : `Pesan sekarang · ${rupiah(total())}`}</button>
    </form>`;
}

function bayarView() {
  return `${header()}
    <section class="card stack center pm-qris">
      <span class="tag demo">SIMULASI · DEMO</span>
      <h2 class="card-title">Bayar ${rupiah(order.total)}</h2>
      <div class="pm-qr">${qr || ""}</div>
      <p class="small muted">Ini contoh tampilan QRIS. <b>Belum terhubung ke payment gateway</b>, jadi tidak ada uang yang ditarik. Tekan tombol di bawah untuk mensimulasikan pembayaran berhasil.</p>
      <button class="btn primary block lg" data-action="bayarDemo" ${busy ? "disabled" : ""}>${busy ? "Memproses…" : "Simulasikan bayar berhasil"}</button>
      <p class="small">Kode pesanan <b class="mono">${esc(order.kode)}</b> · ${esc(order.meja)}</p>
    </section>`;
}

function langkah() {
  const o = order;
  const d = o.dapur;
  // Tanpa mode dapur, setelah diterima kasir pesanan langsung disiapkan (tidak ada pelacakan lanjutan).
  const steps = d
    ? [
        ["Pesanan terkirim", true],
        ["Diterima kasir", o.status !== "baru"],
        ["Sedang dimasak", ["dimasak", "siap", "diambil"].includes(d)],
        ["Siap!", ["siap", "diambil"].includes(d)],
      ]
    : [
        ["Pesanan terkirim", true],
        ["Diterima & sedang disiapkan", o.status !== "baru"],
      ];
  return `<ol class="pm-steps">${steps.map(([t, ok]) => `<li class="${ok ? "ok" : ""}">${ok ? icon("check", 14) : ""}<span>${t}</span></li>`).join("")}</ol>`;
}

function statusView() {
  const o = order;
  const judul =
    o.status === "batal"
      ? "Pesanan tidak bisa diproses"
      : o.dapur === "siap"
        ? "Pesananmu siap!"
        : o.dapur === "diambil" || o.status === "selesai"
          ? "Selamat menikmati!"
          : o.dapur === "dimasak"
            ? "Sedang dimasak…"
            : o.status === "diproses"
              ? "Pesanan diterima, sedang disiapkan"
              : "Menunggu kasir…";
  return `${header()}
    <section class="card pm-status ${o.status} ${o.dapur || ""}">
      <small class="mono">KODE PESANAN</small>
      <div class="pm-kode mono">${esc(o.kode)}</div>
      <h2>${esc(judul)}</h2>
      ${o.status === "batal" ? `<p class="warn-box small">${esc(o.alasan || "Maaf, pesanan ditolak kasir.")} Silakan tanya kasir ya.</p>` : langkah()}
      <p class="small">${esc(o.meja)} · atas nama <b>${esc(o.nama)}</b></p>
      <p class="pm-paid ${o.bayar_status}">${o.bayar_status === "lunas" ? `${icon("check", 14)} Lunas${o.metode === "digital" ? " (digital, simulasi)" : ""}` : `Bayar di kasir: ${rupiah(o.total)} · sebutkan kode <b class="mono">${esc(o.kode)}</b>`}</p>
    </section>
    <section class="card">
      ${(o.items || []).map((x) => `<div class="row-between pos-sum"><span>${x.qty}× ${esc(x.nama)}${x.opsi?.length ? `<small class="struk-opsi">${esc(labelOpsi(x))}</small>` : ""}</span><b>${rupiah(x.harga * x.qty)}</b></div>`).join("")}
      <div class="row-between pos-total"><span>Total</span><b>${rupiah(o.total)}</b></div>
      ${o.catatan ? `<p class="small muted">Catatan: ${esc(o.catatan)}</p>` : ""}
    </section>
    <button class="btn ghost block" data-action="lagi">Pesan lagi</button>
    <p class="small muted center">Status diperbarui otomatis.</p>`;
}

export const pesan = {
  render() {
    const t = tokenDariUrl();
    if (t !== token) {
      token = t;
      menu = null;
      err = "";
      cart = new Map();
      pilih = null;
      step = "menu";
      order = null;
    }
    if (err) return `<section class="card empty pm-err"><div class="empty-icon">${icon("alert", 30)}</div><h3>Ups</h3><p>${esc(err)}</p></section>`;
    if (!menu) {
      muat();
      return `<section class="card"><p class="muted">Memuat menu…</p></section>`;
    }
    if (!menu.aktif && step !== "status") return `${header()}<section class="card empty"><div class="empty-icon">${icon("bowl", 30)}</div><h3>Pesan lewat meja sedang tidak aktif</h3><p>Silakan pesan langsung ke kasir ya.</p></section>`;
    if (step === "status" && order) {
      poll();
      return statusView();
    }
    if (step === "bayar" && order) {
      if (!qr) qrSvg(`DEMO-RACIKIN-${order.kode}-${order.total}`, 5).then((v) => ((qr = v), render()));
      return bayarView();
    }
    if (step === "checkout" && jumlah()) return checkoutView();
    return menuView();
  },

  after(root) {
    const c = root.querySelector(".pm-cari");
    c?.addEventListener("input", () => {
      cari = c.value;
      const pos = c.selectionStart;
      render();
      const n = document.querySelector(".pm-cari");
      n?.focus();
      n?.setSelectionRange(pos, pos);
    });
  },

  actions: {
    tambah(el) {
      tambahCart(el.dataset.id);
      render();
    },
    lebih(el) {
      const c = cart.get(el.dataset.key);
      if (c) c.qty++;
      render();
    },
    kurang(el) {
      const c = cart.get(el.dataset.key);
      if (c && --c.qty <= 0) cart.delete(el.dataset.key);
      if (!jumlah() && step === "checkout") step = "menu";
      render();
    },
    pilih(el) {
      const m = menu.menu.find((x) => x.id === el.dataset.id);
      if (!m) return;
      pilih = { id: m.id, ids: pilihanAwal(sv(), rv(m), {}), error: "" };
      render();
    },
    pilihOpsi(el) {
      const m = menu.menu.find((x) => x.id === pilih?.id);
      const g = grupMenu(sv(), rv(m)).find((x) => x.id === el.dataset.g);
      if (!g) return;
      const id = el.dataset.id;
      const ids = new Set(pilih.ids);
      if (ids.has(id)) {
        if (!(g.tipe === "satu" && g.wajib)) ids.delete(id);
      } else {
        if (g.tipe === "satu") for (const p of g.pilihan) ids.delete(p.id);
        else if (g.maks && g.pilihan.filter((p) => ids.has(p.id)).length >= g.maks) {
          pilih.error = `${g.nama}: maksimal ${g.maks}`;
          return render();
        }
        ids.add(id);
      }
      pilih = { ...pilih, ids: [...ids], error: "" };
      render();
    },
    pilihTambah() {
      const m = menu.menu.find((x) => x.id === pilih?.id);
      if (!m) return (pilih = null), render();
      const cek = cekPilihan(sv(), rv(m), pilih.ids, {});
      if (!cek.ok) {
        pilih.error = cek.error;
        return render();
      }
      tambahCart(m.id, cek.opsi);
      pilih = null;
      toast(`${m.nama} masuk pesanan`);
      render();
    },
    pilihTutup() {
      pilih = null;
      render();
    },
    checkout() {
      step = "checkout";
      render();
      window.scrollTo(0, 0);
    },
    balik() {
      step = "menu";
      render();
    },
    async bayarDemo() {
      if (busy) return;
      busy = true;
      render();
      try {
        const a = baca();
        order = await bayarSimulasi(a.id, a.secret);
        step = "status";
        toast("Pembayaran (simulasi) berhasil");
      } catch (e) {
        toast(e.message, "err");
      }
      busy = false;
      render();
    },
    lagi() {
      cart = new Map();
      step = "menu";
      render();
      window.scrollTo(0, 0);
    },
  },

  forms: {
    async pesan(form) {
      if (busy) return;
      const fd = new FormData(form);
      const nama = String(fd.get("nama")).trim();
      const metode = String(fd.get("metode") || "kasir");
      busy = true;
      render();
      try {
        try {
          localStorage.setItem("racikin:pesan-nama", nama);
        } catch {
          /* abaikan */
        }
        const r = await kirimPesanan(token, items().map((x) => ({ id: x.m.id, qty: x.qty, ...(x.opsi.length ? { opsi: x.opsi.map((o) => o.id) } : {}) })), nama, String(fd.get("catatan") || ""), metode);
        simpan({ id: r.id, secret: r.secret });
        order = await cekPesanan(r.id, r.secret);
        cart = new Map();
        if (metode === "digital") {
          qr = await qrSvg(`DEMO-RACIKIN-${r.kode}-${r.total}`, 5);
          step = "bayar";
        } else step = "status";
        window.scrollTo(0, 0);
      } catch (e) {
        toast(e.message, "err");
      }
      busy = false;
      render();
    },
  },
};
