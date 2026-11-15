// Halaman pelanggan dari QR meja: lihat menu, pesan, bayar (di kasir / digital simulasi), pantau status.
// Dibuka tanpa login & tanpa data usaha di perangkat. Rute: #/m/<token-meja>
import { esc, rupiah, toast } from "../ui.js";
import { render } from "../app.js";
import { icon } from "../icons.js";
import { ambilMenu, kirimPesanan, cekPesanan, bayarSimulasi, qrSvg } from "../meja.js";

let token = null;
let menu = null; // hasil get_table_menu
let err = "";
let loading = false;
let cart = new Map(); // id -> qty
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
const items = () => [...cart.entries()].map(([id, qty]) => ({ m: menu.menu.find((x) => x.id === id), qty })).filter((x) => x.m && x.qty > 0);
const total = () => items().reduce((a, x) => a + x.m.harga * x.qty, 0);
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

function menuView() {
  const list = (menu.menu || []).filter((m) => !cari || m.nama.toLowerCase().includes(cari.toLowerCase()));
  return `${header()}
    ${(menu.menu || []).length > 8 ? `<input type="search" class="pm-cari" placeholder="Cari menu…" value="${esc(cari)}" aria-label="Cari menu">` : ""}
    <div class="pm-list">
      ${list
        .map((m) => {
          const q = cart.get(m.id) || 0;
          return `<div class="pm-item ${m.habis ? "habis" : ""} ${q ? "in" : ""}">
            <div><b>${esc(m.nama)}</b><p class="mono">${rupiah(m.harga)}${m.habis ? " · habis" : ""}</p></div>
            ${
              m.habis
                ? `<span class="tag">Habis</span>`
                : q
                  ? `<div class="stepper"><button class="icon-btn sm" data-action="kurang" data-id="${esc(m.id)}" aria-label="Kurangi">−</button><b>${q}</b><button class="icon-btn sm" data-action="tambah" data-id="${esc(m.id)}" aria-label="Tambah">+</button></div>`
                  : `<button class="btn soft sm" data-action="tambah" data-id="${esc(m.id)}">${icon("plus", 14)} Tambah</button>`
            }
          </div>`;
        })
        .join("") || `<p class="muted">Menu tidak ditemukan.</p>`}
    </div>
    ${jumlah() ? `<div class="pm-bar"><div><small class="mono">${jumlah()} item</small><b>${rupiah(total())}</b></div><button class="btn primary" data-action="checkout">Lanjut ${icon("chevron", 16)}</button></div>` : ""}`;
}

function checkoutView() {
  return `${header()}
    <section class="card">
      <div class="row-between"><h2 class="card-title" style="margin:0">Pesananmu</h2><button class="btn ghost sm" data-action="balik">+ Tambah</button></div>
      ${items().map((x) => `<div class="row-between pos-sum"><span>${x.qty}× ${esc(x.m.nama)}</span><b>${rupiah(x.m.harga * x.qty)}</b></div>`).join("")}
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
      ${(o.items || []).map((x) => `<div class="row-between pos-sum"><span>${x.qty}× ${esc(x.nama)}</span><b>${rupiah(x.harga * x.qty)}</b></div>`).join("")}
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
      cart.set(el.dataset.id, (cart.get(el.dataset.id) || 0) + 1);
      render();
    },
    kurang(el) {
      const q = (cart.get(el.dataset.id) || 0) - 1;
      q > 0 ? cart.set(el.dataset.id, q) : cart.delete(el.dataset.id);
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
        const r = await kirimPesanan(token, items().map((x) => ({ id: x.m.id, qty: x.qty })), nama, String(fd.get("catatan") || ""), metode);
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
