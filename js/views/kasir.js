import { store, uid } from "../store.js";
import { esc, rupiah, toast, todayISO } from "../ui.js";
import { render } from "../app.js";
import { icon } from "../icons.js";
import { head } from "./_shared.js";
import { bahanMap, bisaDibuat } from "../stok-utils.js";
import { program, waLink } from "../loyalty.js";
import { cloud, markCards, isKasir, pelaku, teamActive } from "../cloud.js";
import { METODE, metodeNama, subtotal, buatOrder, batalOrder, rekapHari, struk, perKasir } from "../pos.js";
import { activeChannels, channelCfg, channelNama, hargaDi, isOnline, komisiRp } from "../online.js";

// State layar kasir (tidak disimpan; keranjang hilang kalau app ditutup).
let tab = "jual"; // jual | rekap
let step = "menu"; // menu | bayar | struk
let cart = []; // { key, resepId, nama, harga, qty }
let form = { diskon: 0, metode: "tunai", bayar: 0, pelangganId: "" };
let last = null; // { order, stempelInfo }
let openOrder = null;
let channel = "toko"; // toko | gofood | grabfood | shopeefood

/** Ganti saluran: harga item menu di keranjang ikut menyesuaikan. */
function setChannel(s, id) {
  channel = id;
  cart = cart.map((c) => {
    const r = c.resepId && s.resep.find((x) => x.id === c.resepId);
    return r ? { ...c, harga: hargaDi(s, r, channel) } : c;
  });
}

const totalNow = () => Math.max(0, subtotal(cart) - Math.min(Number(form.diskon) || 0, subtotal(cart)));
const count = () => cart.reduce((a, i) => a + i.qty, 0);
const bisnisOf = (s) => s.brand?.terpilih?.nama || s.profile?.nama || "Toko";
const jam = (w) => (w || "").slice(11, 16);

function addItem(it) {
  const ada = cart.find((c) => c.key === it.key);
  if (ada) ada.qty += 1;
  else cart.push({ ...it, qty: 1 });
}

/** Pecahan uang cepat yang masuk akal untuk total. */
function quickCash(total) {
  const opts = new Set([total]);
  for (const step of [5000, 10000, 20000, 50000, 100000]) {
    const v = Math.ceil(total / step) * step;
    if (v > total) opts.add(v);
  }
  return [...opts].sort((a, b) => a - b).slice(0, 4);
}

function channelChips(s) {
  const act = activeChannels(s);
  if (channel !== "toko" && !act.some((c) => c.id === channel)) channel = "toko";
  if (!act.length) return isKasir() ? "" : `<p class="small muted pos-online-link"><a href="#/online" class="link">Atur harga GoFood / GrabFood / ShopeeFood</a></p>`;
  return `<div class="chips pos-channels">
    ${[{ id: "toko", nama: "Toko" }, ...act].map((c) => `<label class="chip"><input type="radio" name="channel" value="${c.id}" data-change="channel" ${channel === c.id ? "checked" : ""}><span>${esc(c.nama)}</span></label>`).join("")}
    ${isKasir() ? "" : `<a href="#/online" class="icon-btn sm" aria-label="Atur harga online">${icon("gear", 14)}</a>`}
  </div>`;
}

function menuView(s) {
  const map = bahanMap(s.bahan);
  const grid = s.resep.length
    ? `<div class="pos-grid">${s.resep
        .map((r) => {
          const inCart = cart.find((c) => c.key === r.id)?.qty || 0;
          const bd = bisaDibuat(r, map);
          const habis = bd.porsi === 0;
          return `<button class="pos-item ${inCart ? "in" : ""} ${habis ? "habis" : ""}" data-action="add" data-id="${r.id}">
            ${inCart ? `<span class="pos-qty">${inCart}</span>` : ""}
            <b>${esc(r.nama)}</b>
            <span class="pos-price">${rupiah(hargaDi(s, r, channel))}</span>
            ${bd.porsi !== null ? `<small class="mono">${habis ? "stok habis" : `sisa ±${bd.porsi}`}</small>` : ""}
          </button>`;
        })
        .join("")}</div>`
    : `<section class="card empty">
        <div class="empty-icon">${icon("register", 30)}</div>
        <h3>Belum ada menu</h3>
        <p>Menu kasir diambil dari resep. Bikin resep dulu biar harga, HPP & stok nyambung otomatis.</p>
        ${isKasir() ? `<p class="small muted">Minta pemilik usaha bikin menu dulu.</p>` : `<a href="#/resep?id=new" class="btn primary">+ Bikin menu</a>`}
      </section>`;
  return `${channelChips(s)}${grid}
    <details class="card">
      <summary><b>Item lain (di luar menu)</b></summary>
      <form class="row3 pos-custom" data-form="custom">
        <input name="nama" placeholder="Nama, cth: Es teh" required>
        <input name="harga" type="number" inputmode="numeric" min="0" step="500" placeholder="Harga" required>
        <button class="btn soft">Tambah</button>
      </form>
    </details>
    ${
      cart.length
        ? `<div class="pos-bar">
            <button class="btn ghost sm" data-action="clear" aria-label="Kosongkan">${icon("x", 14)}</button>
            <div><small class="mono">${count()} item${channel !== "toko" ? ` · ${esc(channelNama(channel))}` : ""}</small><b>${rupiah(subtotal(cart))}</b></div>
            <button class="btn primary" data-action="checkout">Bayar ${icon("chevron", 16)}</button>
          </div>`
        : ""
    }`;
}

function bayarView(s) {
  const total = totalNow();
  const sub = subtotal(cart);
  const online = isOnline(channel);
  const kurang = !online && form.metode === "tunai" && (Number(form.bayar) || 0) < total;
  const kembali = Math.max(0, (Number(form.bayar) || 0) - total);
  const pelanggan = s.loyalty && s.pelanggan.length;
  return `
    <section class="card">
      <div class="row-between"><h2 class="card-title">Pesanan${online ? ` <span class="tag">${esc(channelNama(channel))}</span>` : ""}</h2><button class="btn ghost sm" data-action="back">+ Tambah item</button></div>
      ${cart
        .map(
          (c) => `<div class="pos-line">
            <div><b>${esc(c.nama)}</b><p class="small muted">${rupiah(c.harga)}</p></div>
            <div class="stepper">
              <button class="icon-btn sm" data-action="dec" data-key="${esc(c.key)}" aria-label="Kurangi">−</button>
              <b>${c.qty}</b>
              <button class="icon-btn sm" data-action="inc" data-key="${esc(c.key)}" aria-label="Tambah">+</button>
            </div>
            <b class="pos-line-total">${rupiah(c.harga * c.qty)}</b>
          </div>`,
        )
        .join("")}
      <div class="row-between pos-sum"><span>Subtotal</span><b>${rupiah(sub)}</b></div>
      <label class="row-between pos-sum"><span>Diskon (Rp)</span><input class="pos-diskon" type="number" inputmode="numeric" min="0" step="500" value="${form.diskon || ""}" placeholder="0" data-change="diskon"></label>
      <div class="row-between pos-total"><span>Total</span><b>${rupiah(total)}</b></div>
    </section>

    ${
      pelanggan
        ? `<section class="card"><label class="field"><span>Pelanggan (kartu stempel)</span>
            <select data-change="pelanggan"><option value="">Tanpa kartu stempel</option>${[...s.pelanggan]
              .sort((a, b) => a.nama.localeCompare(b.nama, "id"))
              .map((p) => `<option value="${p.id}" ${form.pelangganId === p.id ? "selected" : ""}>${esc(p.nama)} · ${p.stempel || 0}/${program(s).target}</option>`)
              .join("")}</select></label>
            ${form.pelangganId && total < (program(s).minBelanja || 0) ? `<p class="small muted">Belum dapat stempel: min. belanja ${rupiah(program(s).minBelanja)}</p>` : ""}
          </section>`
        : ""
    }

    ${
      online
        ? `<section class="card stack">
            <h2 class="card-title" style="margin:0">Pesanan ${esc(channelNama(channel))}</h2>
            <p class="small muted">Dibayar pembeli lewat aplikasi. Komisi ${channelCfg(s, channel).komisi}% dipotong platform.</p>
            <div class="row-between pos-sum"><span>Harga ke pembeli</span><b>${rupiah(total)}</b></div>
            <div class="row-between pos-sum"><span>Komisi platform</span><b class="neg">−${rupiah(komisiRp(s, channel, total))}</b></div>
            <div class="row-between pos-total"><span>Kamu terima</span><b class="pos">${rupiah(total - komisiRp(s, channel, total))}</b></div>
            <button class="btn primary block lg" data-action="selesai" ${!cart.length ? "disabled" : ""}>Catat pesanan · ${rupiah(total)}</button>
          </section>`
        : `<section class="card stack">
      <h2 class="card-title" style="margin:0">Pembayaran</h2>
      <div class="chips">${METODE.map((m) => `<label class="chip"><input type="radio" name="metode" value="${m.id}" data-change="metode" ${form.metode === m.id ? "checked" : ""}><span>${m.nama}</span></label>`).join("")}</div>
      ${
        form.metode === "tunai"
          ? `<label class="field"><span>Uang diterima</span><input type="number" inputmode="numeric" min="0" step="500" value="${form.bayar || ""}" placeholder="${total}" data-change="bayar"></label>
            <div class="chips">${quickCash(total).map((v) => `<button type="button" class="chip-btn ${Number(form.bayar) === v ? "on" : ""}" data-action="uang" data-v="${v}">${v === total ? "Uang pas" : rupiah(v)}</button>`).join("")}</div>
            <div class="row-between pos-total"><span>Kembalian</span><b class="${kurang ? "neg" : "pos"}">${kurang ? "Uang kurang" : rupiah(kembali)}</b></div>`
          : ""
      }
      <button class="btn primary block lg" data-action="selesai" ${kurang || !cart.length ? "disabled" : ""}>Selesaikan · ${rupiah(total)}</button>
    </section>`
    }`;
}

function strukView(s) {
  const { order: o, stempelInfo: si } = last;
  const p = o.pelangganId ? s.pelanggan.find((x) => x.id === o.pelangganId) : null;
  const text = struk(o, bisnisOf(s), rupiah);
  const wa = p?.wa ? waLink(p.wa, text) : `https://wa.me/?text=${encodeURIComponent(text)}`;
  return `
    <section class="struk">
      <div class="struk-head"><b>${esc(bisnisOf(s))}</b><small class="mono">Order #${o.no} · ${jam(o.waktu)}</small></div>
      ${o.items.map((i) => `<div class="row-between"><span>${i.qty}× ${esc(i.nama)}</span><span>${rupiah(i.harga * i.qty)}</span></div>`).join("")}
      ${o.diskon ? `<div class="row-between muted"><span>Diskon</span><span>−${rupiah(o.diskon)}</span></div>` : ""}
      <div class="row-between struk-total"><span>Total</span><b>${rupiah(o.total)}</b></div>
      ${
        isOnline(o.channel)
          ? `<div class="row-between"><span>${esc(channelNama(o.channel))}</span><span>dibayar di aplikasi</span></div>
             <div class="row-between muted"><span>Komisi</span><span>−${rupiah(o.komisi)}</span></div>
             <div class="row-between struk-kembali"><span>Kamu terima</span><b>${rupiah(o.total - o.komisi)}</b></div>`
          : `<div class="row-between"><span>${metodeNama(o.metode)}</span><span>${rupiah(o.bayar)}</span></div>`
      }
      ${o.metode === "tunai" ? `<div class="row-between struk-kembali"><span>Kembalian</span><b>${rupiah(o.kembali)}</b></div>` : ""}
      ${si?.nama ? `<p class="struk-note">${si.siap ? `${esc(si.nama)} dapat hadiah! (${si.stempel}/${si.target})` : `+1 stempel ${esc(si.nama)} (${si.stempel}/${si.target})`}</p>` : ""}
      <p class="struk-note small">${isKasir() ? `Tercatat atas nama ${esc(o.kasir?.nama || "kamu")}` : "Tercatat di Kas"}${o.items.some((i) => i.resepId) ? " · stok bahan diperbarui" : ""}</p>
    </section>
    <div class="row2">
      <a class="btn ghost" href="${esc(wa)}" target="_blank" rel="noopener">Kirim struk WA</a>
      <button class="btn primary" data-action="baru">Pesanan baru</button>
    </div>`;
}

/** Kasir hanya boleh membatalkan order yang dia catat sendiri. */
const bolehBatal = (o) => !isKasir() || (o.kasir && o.kasir.id === cloud.user?.id);

function rekapView(s) {
  const r = rekapHari(s);
  const tim = teamActive() || new Set(r.semua.map((o) => o.kasir?.id || "-")).size > 1;
  const tgl = new Date(todayISO() + "T00:00:00").toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long" });
  return `
    <p class="muted small">${esc(tgl)}</p>
    <div class="stats3">
      <div><small>Omzet</small><b class="pos">${rupiah(r.omzet)}</b></div>
      <div><small>Order</small><b>${r.n}</b></div>
      <div><small>Rata-rata</small><b>${rupiah(r.rata)}</b></div>
    </div>
    ${r.komisi ? `<div class="stats3"><div><small>Komisi ojol</small><b class="neg">−${rupiah(r.komisi)}</b></div><div><small>Bersih</small><b class="pos">${rupiah(r.bersih)}</b></div><div><small>Porsi online</small><b>${Math.round((r.aktif.filter((o) => isOnline(o.channel)).reduce((a, o) => a + o.total, 0) / (r.omzet || 1)) * 100)}%</b></div></div>` : ""}
    ${
      r.n
        ? `<section class="card">
            <h2 class="card-title">Per metode bayar</h2>
            ${r.perMetode.map((m) => `<div class="row-between pos-sum"><span>${m.nama} <small class="muted">· ${m.n} order${m.komisi ? ` · komisi ${rupiah(m.komisi)}` : ""}</small></span><b>${rupiah(m.total)}</b></div>`).join("")}
            ${
              tim
                ? `<h4>Per kasir</h4>${perKasir(r.aktif)
                    .map((k) => `<div class="row-between pos-sum"><span>${esc(k.nama)} <small class="muted">· ${k.n} order</small></span><b>${rupiah(k.total)}</b></div>`)
                    .join("")}`
                : ""
            }
            <h4>Terlaris hari ini</h4>
            ${r.terlaris.slice(0, 5).map(([nama, q], i) => `<div class="row-between pos-sum"><span><b class="mono">${i + 1}.</b> ${esc(nama)}</span><b>${q} porsi</b></div>`).join("")}
            ${isKasir() ? "" : `<p class="muted small">Penjualan kasir otomatis masuk ke <a href="#/kas" class="link">Kas</a>, digabung per metode bayar per hari.</p>`}
          </section>`
        : `<section class="card"><p class="muted">Belum ada penjualan hari ini.</p></section>`
    }
    ${
      r.semua.length
        ? `<section class="card">
            <h2 class="card-title">Order hari ini${r.batal ? ` <small class="muted">· ${r.batal} batal</small>` : ""}</h2>
            ${[...r.semua]
              .reverse()
              .map(
                (o) => `<div class="pos-order ${o.status === "batal" ? "batal" : ""}">
                  <button class="pos-order-head" data-action="order" data-id="${o.id}">
                    <span class="mono">#${o.no}</span><span>${jam(o.waktu)} · ${o.items.reduce((a, i) => a + i.qty, 0)} item · ${metodeNama(o.metode)}${o.kasir && tim ? ` · ${esc(o.kasir.nama)}` : ""}</span>
                    <b>${o.status === "batal" ? "Batal" : rupiah(o.total)}</b>
                  </button>
                  ${
                    openOrder === o.id
                      ? `<div class="inline-form">
                          ${o.items.map((i) => `<div class="row-between small"><span>${i.qty}× ${esc(i.nama)}</span><span>${rupiah(i.harga * i.qty)}</span></div>`).join("")}
                          ${o.diskon ? `<div class="row-between small muted"><span>Diskon</span><span>−${rupiah(o.diskon)}</span></div>` : ""}
                          ${o.batalOleh ? `<p class="small muted">Dibatalkan oleh ${esc(o.batalOleh.nama)}</p>` : ""}
                          ${
                            o.status === "batal"
                              ? ""
                              : bolehBatal(o)
                                ? `<button class="btn danger sm" data-action="batal" data-id="${o.id}">Batalkan order</button>`
                                : `<p class="small muted">Order kasir lain hanya bisa dibatalkan pemilik / manajer.</p>`
                          }
                        </div>`
                      : ""
                  }
                </div>`,
              )
              .join("")}
          </section>`
        : ""
    }`;
}

export const kasir = {
  render(s) {
    if (location.hash.includes("tab=rekap")) {
      tab = "rekap";
      history.replaceState(null, "", "#/kasir");
    }
    const tabs = `<div class="seg">
      <label><input type="radio" name="tab" value="jual" data-change="tab" ${tab === "jual" ? "checked" : ""}><span>Jual</span></label>
      <label><input type="radio" name="tab" value="rekap" data-change="tab" ${tab === "rekap" ? "checked" : ""}><span>Hari ini</span></label>
    </div>`;
    const body = tab === "rekap" ? rekapView(s) : step === "struk" && last ? strukView(s) : step === "bayar" && cart.length ? bayarView(s) : menuView(s);
    return `${head("Kasir", "#/")}${tabs}${body}`;
  },

  actions: {
    add(el) {
      const r = store.get().resep.find((x) => x.id === el.dataset.id);
      if (!r) return;
      addItem({ key: r.id, resepId: r.id, nama: r.nama, harga: hargaDi(store.get(), r, channel) });
      render();
    },
    inc(el) {
      const c = cart.find((x) => x.key === el.dataset.key);
      if (c) c.qty++;
      render();
    },
    dec(el) {
      const c = cart.find((x) => x.key === el.dataset.key);
      if (c) c.qty--;
      cart = cart.filter((x) => x.qty > 0);
      if (!cart.length) step = "menu";
      render();
    },
    clear() {
      cart = [];
      render();
    },
    checkout() {
      step = "bayar";
      form.bayar = 0;
      render();
      window.scrollTo(0, 0);
    },
    back() {
      step = "menu";
      render();
    },
    uang(el) {
      form.bayar = Number(el.dataset.v);
      render();
    },
    selesai() {
      const s = store.get();
      const { patch, order, stempelInfo } = buatOrder(s, { cart, ...form, channel, kasir: pelaku() });
      store.set(patch);
      if (order.stempel) markCards({ ids: [order.pelangganId] });
      last = { order, stempelInfo };
      cart = [];
      form = { diskon: 0, metode: "tunai", bayar: 0, pelangganId: "" }; // tiap order baru mulai dari Tunai
      step = "struk";
      toast(`Order #${order.no} · ${rupiah(order.total)} tercatat`);
      render();
      window.scrollTo(0, 0);
    },
    baru() {
      step = "menu";
      last = null;
      render();
    },
    order(el) {
      openOrder = openOrder === el.dataset.id ? null : el.dataset.id;
      render();
    },
    batal(el) {
      const s = store.get();
      const o = s.orders.find((x) => x.id === el.dataset.id);
      if (!confirm(`Batalkan order #${o.no} (${rupiah(o.total)})? Kas, stok${o.stempel ? " & stempel" : ""} akan dikembalikan.`)) return;
      if (!bolehBatal(o)) return toast("Order ini hanya bisa dibatalkan pemilik / manajer", "err");
      const patch = batalOrder(s, o.id, pelaku());
      if (!patch) return;
      store.set(patch);
      if (o.stempel) markCards({ ids: [o.pelangganId] });
      toast(`Order #${o.no} dibatalkan`);
      render();
    },
  },

  changes: {
    channel(el) {
      setChannel(store.get(), el.value);
      render();
    },
    tab(el) {
      tab = el.value;
      render();
    },
    diskon(el) {
      form.diskon = Number(el.value) || 0;
      render();
    },
    metode(el) {
      form.metode = el.value;
      render();
    },
    bayar(el) {
      form.bayar = Number(el.value) || 0;
      render();
    },
    pelanggan(el) {
      form.pelangganId = el.value;
      render();
    },
  },

  forms: {
    custom(form_) {
      const fd = new FormData(form_);
      const nama = String(fd.get("nama")).trim();
      const harga = Number(fd.get("harga")) || 0;
      addItem({ key: "x-" + uid(), resepId: null, nama, harga });
      toast(`${nama} ditambahkan`);
      render();
    },
  },
};
