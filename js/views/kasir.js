import { store, uid } from "../store.js";
import { esc, rupiah, toast, todayISO, isWide } from "../ui.js";
import { render } from "../app.js";
import { icon } from "../icons.js";
import { head } from "./_shared.js";
import { bahanMap, bisaDibuat } from "../stok-utils.js";
import { program, waLink } from "../loyalty.js";
import { cloud, markCards, isKasir, pelaku, teamActive } from "../cloud.js";
import { METODE, metodeNama, subtotal, buatOrder, batalOrder, rekapHari, struk, perKasir } from "../pos.js";
import { dapurAktif, kirimTiket, tiketDari, ubahStatus as statusDapur, daftarTiket, dengar as dengarDapur } from "../dapur.js";
import { mejaAktif, pesananMasuk, dengarPesanan, ubahPesanan } from "../meja.js";
import { shiftAktif, ringkasan as ringkasanShift, wajibShift } from "../shift.js";
import { activeChannels, channelCfg, channelNama, hargaDi, isOnline, komisiRp } from "../online.js";
import { pilihPromo } from "../promo.js";
import { bacaChatOrder, linkWa, nomorPemilik, teksRekapHari } from "../wa.js";
import { grupMenu, punyaOpsi, pilihanAwal, pilihanHabis, cekPilihan, hargaItem, kunciItem, labelOpsi, namaLengkap, aturan, tambahanDi } from "../varian.js";

// State layar kasir (tidak disimpan; keranjang hilang kalau app ditutup).
let tab = "jual"; // jual | rekap
let step = "menu"; // menu | bayar | struk
let cart = []; // { key, resepId, nama, harga, qty, opsi? }
let pilih = null; // sheet varian yang terbuka { resepId, ids: [pilihanId], error }
let chatWa = null; // sheet "Order dari chat WA" { text, rows: [{ resepId, qty }] | null, sisa, atasNama, catatan }
let form = { diskon: 0, kode: "", metode: "tunai", bayar: 0, pelangganId: "", atasNama: "", catatanDapur: "" };
let lepasDapur = null;
let lepasMeja = null;
let mejaRef = null; // pesanan meja yang sedang dibayar { id, metode, bayar_status, kode, meja_nama }
let last = null; // { order, stempelInfo }
let openOrder = null;
let channel = "toko"; // toko | gofood | grabfood | shopeefood

/** Ganti saluran: harga item menu di keranjang ikut menyesuaikan. */
function setChannel(s, id) {
  channel = id;
  cart = cart.map((c) => {
    const r = c.resepId && s.resep.find((x) => x.id === c.resepId);
    return r ? { ...c, harga: hargaItem(s, r, c.opsi, channel) } : c;
  });
}

/** Waktu lokal "YYYY-MM-DDTHH:MM" (untuk aturan jam promo). */
const waktuNow = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};
/** Promo terbaik untuk keranjang sekarang. Pesanan meja yang sudah lunas digital tidak dapat promo (harga sudah dibayar). */
/** Nomor WA pelanggan untuk voucher per pelanggan: pelanggan kartu stempel yang dipilih, atau yang diisi di pesan meja. */
function waNow(s) {
  const p = form.pelangganId ? (s.pelanggan || []).find((x) => x.id === form.pelangganId) : null;
  return p?.wa || mejaRef?.promo?.wa || "";
}
function promoNow(s = store.get()) {
  // Pesanan meja yang sudah lunas digital: promo dikunci sesuai yang dibayar pelanggan.
  if (mejaRef?.metode === "digital" && mejaRef?.bayar_status === "lunas") {
    const p = mejaRef.promo;
    return { promo: p ? { id: p.id, nama: p.nama, potongan: Number(p.potongan) || 0, ...(p.kode ? { kode: p.kode } : {}), ...(p.wa ? { wa: p.wa } : {}) } : null, hint: "", kodeError: "", kunci: true };
  }
  return pilihPromo(s, cart, { channel, waktu: waktuNow(), kode: form.kode, wa: waNow(s) });
}
const potonganNow = () => promoNow().promo?.potongan || 0;
const totalNow = () => {
  const sisa = subtotal(cart) - potonganNow();
  return Math.max(0, sisa - Math.min(Number(form.diskon) || 0, sisa));
};
const count = () => cart.reduce((a, i) => a + i.qty, 0);
const bisnisOf = (s) => s.brand?.terpilih?.nama || s.profile?.nama || "Toko";
const jam = (w) => (w || "").slice(11, 16);

/** Sheet "Order dari chat WA": tempel chat pelanggan -> cek -> masuk keranjang. */
function chatSheet(s) {
  if (!chatWa) return "";
  const opsiMenu = (id) => s.resep.map((r) => `<option value="${r.id}" ${r.id === id ? "selected" : ""}>${esc(r.nama)}</option>`).join("");
  const body = !chatWa.rows
    ? `<textarea rows="7" data-change="chatText" placeholder="Tempel chat pelanggan di sini, cth:&#10;kak pesen tahu guyur bakso 2, es teh 1&#10;atas nama Budi, ambil jam 5" aria-label="Chat WA">${esc(chatWa.text)}</textarea>
       <p class="small muted">Nama menu dicocokkan otomatis sama daftar menu. Nanti dicek dulu sebelum masuk keranjang.</p>
       <button class="btn primary block lg" data-action="chatBaca">${icon("spark", 16)} Baca chat</button>`
    : `${
        chatWa.rows.length
          ? chatWa.rows
              .map(
                (r, i) => `<div class="chat-row"><select data-change="chatRow" data-f="resepId" data-i="${i}" aria-label="Menu">${opsiMenu(r.resepId)}</select>
                  <input type="number" min="1" step="1" value="${r.qty}" data-change="chatRow" data-f="qty" data-i="${i}" aria-label="Jumlah">
                  <button class="icon-btn sm" data-action="chatHapus" data-i="${i}" aria-label="Hapus">${icon("x", 12)}</button></div>`,
              )
              .join("")
          : `<p class="warn-box small">Nggak ada menu yang kebaca. Tambah manual atau cek tulisan chat-nya.</p>`
      }
      <button class="btn ghost sm" data-action="chatTambah">+ Menu</button>
      ${chatWa.sisa.length ? `<p class="small muted">Nggak kebaca: ${chatWa.sisa.map((x) => `"${esc(x)}"`).join(", ")}</p>` : ""}
      <div class="row2">
        <label class="field"><span>Atas nama</span><input value="${esc(chatWa.atasNama)}" maxlength="40" data-change="chatField" data-f="atasNama"></label>
        <label class="field"><span>Catatan</span><input value="${esc(chatWa.catatan)}" maxlength="200" data-change="chatField" data-f="catatan"></label>
      </div>
      <div class="row2"><button class="btn ghost" data-action="chatUlang">Ulang</button><button class="btn primary" data-action="chatMasuk" ${chatWa.rows.length ? "" : "disabled"}>Masukin keranjang</button></div>`;
  return `<div class="sheet-bg" data-action="chatTutup"></div>
    <section class="sheet" role="dialog" aria-modal="true" aria-label="Order dari chat WA">
      <header class="row-between"><h2 class="card-title" style="margin:0">${icon("chat", 18)} Order dari chat WA</h2><button class="icon-btn sm" data-action="chatTutup" aria-label="Tutup">${icon("x", 14)}</button></header>
      <div class="sheet-body">${body}</div>
    </section>`;
}

/** Sheet pilih varian & topping untuk menu yang punya grup pilihan. */
function pilihSheet(s) {
  if (!pilih) return "";
  const r = s.resep.find((x) => x.id === pilih.resepId);
  if (!r) return "";
  const map = bahanMap(s.bahan);
  const ids = new Set(pilih.ids);
  const cek = cekPilihan(s, r, pilih.ids, map);
  const harga = hargaItem(s, r, cek.opsi, channel);
  return `<div class="sheet-bg" data-action="pilihTutup"></div>
    <section class="sheet" role="dialog" aria-modal="true" aria-label="Pilih varian ${esc(r.nama)}">
      <header class="row-between"><div><h2 class="card-title" style="margin:0">${esc(r.nama)}</h2><p class="small muted">${rupiah(hargaDi(s, r, channel))}${channel !== "toko" ? ` · ${esc(channelNama(channel))}` : ""}</p></div>
        <button class="icon-btn sm" data-action="pilihTutup" aria-label="Tutup">${icon("x", 14)}</button></header>
      <div class="sheet-body">
      ${grupMenu(s, r)
        .map(
          (g) => `<fieldset class="opsi-grup"><legend><b>${esc(g.nama)}</b> <small class="muted">${aturan(g)}</small></legend>
          <div class="opsi-list">${g.pilihan
            .map((p) => {
              const habis = pilihanHabis(p, map);
              const on = ids.has(p.id);
              const t = tambahanDi(s, [p], channel);
              return `<button type="button" class="opsi-btn ${on ? "on" : ""} ${g.tipe === "satu" ? "radio" : ""}" data-action="pilihOpsi" data-g="${g.id}" data-id="${p.id}" ${habis ? "disabled" : ""} aria-pressed="${on}">
                <span class="opsi-dot">${on ? icon("check", 12) : ""}</span><span>${esc(p.nama)}</span><small class="mono">${habis ? "habis" : t ? `+${rupiah(t)}` : "gratis"}</small></button>`;
            })
            .join("")}</div></fieldset>`,
        )
        .join("")}
      </div>
      ${pilih.error ? `<p class="warn-box small">${esc(pilih.error)}</p>` : ""}
      <button class="btn primary block lg" data-action="pilihTambah">Tambah · ${rupiah(harga)}</button>
    </section>`;
}

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

/** Pesanan dari QR meja yang menunggu kasir. */
function mejaInbox() {
  const list = pesananMasuk();
  if (!list.length) return "";
  return `<section class="meja-inbox"><h3>${icon("grid", 16)} Pesanan meja <span class="kds-n">${list.length}</span></h3>
    ${list
      .map(
        (o) => `<div class="mi-row ${mejaRef?.id === o.id ? "on" : ""}">
          <div><b>${esc(o.meja_nama)} · ${esc(o.nama)}</b>
            <p class="small">${o.items.map((x) => `${x.qty}× ${esc(namaLengkap(x))}`).join(", ")}</p>
            <p class="small muted">Kode <b class="mono">${esc(o.kode)}</b> · ${rupiah(o.total)}${o.promo ? ` (${esc(o.promo.nama)} −${rupiah(o.promo.potongan)})` : ""} · ${
              o.metode === "digital" ? (o.bayar_status === "lunas" ? `<span class="pos">lunas digital (simulasi)</span>` : `<span class="neg">menunggu bayar digital</span>`) : "bayar di kasir"
            }${o.catatan ? ` · "${esc(o.catatan)}"` : ""}</p></div>
          <div class="mi-act">
            <button class="btn primary sm" data-action="terimaMeja" data-id="${o.id}">Terima</button>
            <button class="btn ghost sm" data-action="tolakMeja" data-id="${o.id}">Tolak</button>
          </div>
        </div>`,
      )
      .join("")}
  </section>`;
}

/** Pesanan yang sudah siap di dapur (mode dapur). */
function siapStrip() {
  const siap = daftarTiket().filter((t) => t.status === "siap");
  if (!siap.length) return "";
  return `<section class="siap-strip"><b>${icon("bowl", 16)} Siap diambil</b>
    ${siap.map((t) => `<button class="chip-btn on" data-action="diambil" data-id="${esc(t.id)}" title="Tandai sudah diambil">#${t.no}${t.data?.nama ? ` ${esc(t.data.nama)}` : ""} ${icon("check", 12)}</button>`).join("")}
  </section>`;
}

/** Bar shift di atas menu: status shift aktif, atau ajakan buka shift. */
function shiftBar(s) {
  const sh = shiftAktif(s, pelaku());
  if (sh) {
    const r = ringkasanShift(s, sh);
    return `<a href="#/shift" class="shift-bar on">${icon("register", 16)}<span><b>Shift ${esc(sh.kasir?.nama || "kasir")}</b> · sejak ${jam(sh.buka)} · ${r.order} order</span><span class="mono">laci ${rupiah(r.seharusnya)}</span></a>`;
  }
  return `<a href="#/shift" class="shift-bar">${icon("register", 16)}<span><b>Belum buka shift</b> · ${wajibShift(s) ? "wajib sebelum jualan" : "catat modal laci & tutup kasir"}</span><span class="link">Buka</span></a>`;
}

function menuView(s) {
  if (wajibShift(s) && !shiftAktif(s, pelaku())) {
    return `${shiftBar(s)}<section class="card empty"><div class="empty-icon">${icon("register", 30)}</div><h3>Buka shift dulu</h3>
      <p>Pemilik mengaktifkan "wajib buka shift". Isi modal awal laci, lalu mulai jualan.</p><a href="#/shift" class="btn primary">Buka shift</a></section>`;
  }
  const map = bahanMap(s.bahan);
  const adaFoto = s.resep.some((r) => r.foto);
  const grid = s.resep.length
    ? `<div class="pos-grid">${s.resep
        .map((r) => {
          const inCart = cart.filter((c) => c.resepId === r.id).reduce((a, c) => a + c.qty, 0);
          const bd = bisaDibuat(r, map);
          const habis = bd.porsi === 0;
          return `<button class="pos-item ${inCart ? "in" : ""} ${habis ? "habis" : ""} ${r.foto || adaFoto ? "foto" : ""}" data-action="add" data-id="${r.id}">
            ${inCart ? `<span class="pos-qty">${inCart}</span>` : ""}
            ${r.foto ? `<img class="pos-img" src="${esc(r.foto.url)}" alt="" loading="lazy" decoding="async">` : adaFoto ? `<span class="pos-img ph" aria-hidden="true">${icon("bowl", 26)}</span>` : ""}
            <b>${esc(r.nama)}</b>
            <span class="pos-price">${rupiah(hargaDi(s, r, channel))}${punyaOpsi(s, r) ? `<small class="pos-varian">+ varian</small>` : ""}</span>
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
  return `${shiftBar(s)}${mejaAktif(s) ? `<div id="meja-inbox">${mejaInbox()}</div>` : ""}${dapurAktif(s) ? `<div id="siap-strip">${siapStrip()}</div>` : ""}${channelChips(s)}${s.resep.length ? `<button class="btn ghost sm pos-chatwa" data-action="chatBuka">${icon("chat", 14)} Order dari chat WA</button>` : ""}${grid}
    <details class="card">
      <summary><b>Item lain (di luar menu)</b></summary>
      <form class="row3 pos-custom" data-form="custom">
        <input name="nama" placeholder="Nama, cth: Es teh" required>
        <input name="harga" type="number" inputmode="numeric" min="0" step="500" placeholder="Harga" required>
        <button class="btn soft">Tambah</button>
      </form>
    </details>
    ${
      cart.length && !isWide()
        ? `<div class="pos-bar">
            <button class="btn ghost sm" data-action="clear" aria-label="Kosongkan">${icon("x", 14)}</button>
            <div><small class="mono">${count()} item${channel !== "toko" ? ` · ${esc(channelNama(channel))}` : ""}${potonganNow() ? " · promo" : ""}</small><b>${rupiah(subtotal(cart) - potonganNow())}</b></div>
            <button class="btn primary" data-action="checkout">Bayar ${icon("chevron", 16)}</button>
          </div>`
        : ""
    }`;
}

/** Ringkasan promo yang kepakai hari ini (tab Hari ini). */
function promoHariIniRekap(aktif) {
  const m = new Map();
  for (const o of aktif) {
    if (!o.promo) continue;
    const cur = m.get(o.promo.id) || { nama: o.promo.nama, n: 0, rp: 0 };
    cur.n++;
    cur.rp += o.promo.potongan;
    m.set(o.promo.id, cur);
  }
  if (!m.size) return "";
  return `<h4>Promo hari ini</h4>${[...m.values()].map((x) => `<div class="row-between pos-sum"><span>${esc(x.nama)} <small class="muted">· ${x.n}×</small></span><b class="neg">−${rupiah(x.rp)}</b></div>`).join("")}`;
}

/** Promo yang kepakai + kolom kode voucher di keranjang. */
function promoBox(s) {
  const r = promoNow(s);
  const lunasDigital = mejaRef?.metode === "digital" && mejaRef?.bayar_status === "lunas";
  const adaPromo = (s.promo || []).some((p) => p.aktif);
  if (!adaPromo && !form.kode) return "";
  return `${r.promo ? `<div class="row-between pos-sum promo-line"><span>${icon("spark", 14)} ${esc(r.promo.nama)}${r.promo.kode ? ` <small class="mono">${esc(r.promo.kode)}</small>` : ""}</span><b class="pos">−${rupiah(r.promo.potongan)}</b></div>` : ""}
    ${r.hint ? `<p class="small muted promo-hint">${esc(r.hint)}</p>` : ""}
    ${lunasDigital ? `<p class="small muted">Pesanan meja sudah dibayar digital, promo ikut yang dibayar pelanggan.</p>` : `<label class="row-between pos-sum"><span>Kode voucher</span><input class="pos-kode" value="${esc(form.kode)}" maxlength="20" placeholder="opsional" autocapitalize="characters" data-change="kode"></label>
    ${form.kode && r.kodeError ? `<p class="small neg">${esc(r.kodeError)}</p>` : ""}`}`;
}

function bayarView(s) {
  const total = totalNow();
  const sub = subtotal(cart);
  const online = isOnline(channel);
  const kurang = !online && form.metode === "tunai" && (Number(form.bayar) || 0) < total;
  const kembali = Math.max(0, (Number(form.bayar) || 0) - total);
  const pelanggan = s.loyalty && s.pelanggan.length;
  const dapurForm = dapurAktif(s) || form.atasNama || form.catatanDapur
    ? `<section class="card stack dapur-form">
        <div class="row2">
          <label class="field"><span>Atas nama / no. meja</span><input value="${esc(form.atasNama)}" maxlength="40" placeholder="cth: Budi / meja 3" data-change="atasNama"></label>
          <label class="field"><span>${dapurAktif(s) ? "Catatan untuk dapur" : "Catatan"}</span><input value="${esc(form.catatanDapur)}" maxlength="200" placeholder="cth: pedas level 3, tanpa bawang" data-change="catatanDapur"></label>
        </div>
      </section>`
    : "";
  const mejaInfo = mejaRef
    ? `<section class="card meja-bayar ${mejaRef.metode === "digital" && mejaRef.bayar_status === "lunas" ? "lunas" : ""}"><b>${esc(mejaRef.meja_nama)} · ${esc(mejaRef.nama)}</b> <span class="small">kode <b class="mono">${esc(mejaRef.kode)}</b></span>
        <p class="small">${mejaRef.metode === "digital" && mejaRef.bayar_status === "lunas" ? "Sudah dibayar digital (simulasi). Metode diset QRIS, tinggal tekan Selesaikan." : mejaRef.metode === "digital" ? "Pelanggan memilih bayar digital tapi belum lunas. Terima pembayaran di kasir." : "Pelanggan bayar di kasir."}</p></section>`
    : "";
  return `${mejaInfo}${dapurForm}
    <section class="card">
      <div class="row-between"><h2 class="card-title">Pesanan${online ? ` <span class="tag">${esc(channelNama(channel))}</span>` : ""}</h2>${isWide() ? `<button class="btn ghost sm" data-action="clear">Kosongkan</button>` : `<button class="btn ghost sm" data-action="back">+ Tambah item</button>`}</div>
      ${cart
        .map(
          (c) => `<div class="pos-line">
            <div><b>${esc(c.nama)}</b>${c.opsi?.length ? `<p class="small pos-opsi">${esc(labelOpsi(c))}</p>` : ""}<p class="small muted">${rupiah(c.harga)}</p></div>
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
      ${promoBox(s)}
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
      <div class="struk-head"><b>${esc(bisnisOf(s))}</b><small class="mono">Order #${o.no} · ${jam(o.waktu)}${o.atasNama ? ` · ${esc(o.atasNama)}` : ""}</small></div>
      ${o.items.map((i) => `<div class="row-between"><span>${i.qty}× ${esc(i.nama)}${i.opsi?.length ? `<small class="struk-opsi">${esc(labelOpsi(i))}</small>` : ""}</span><span>${rupiah(i.harga * i.qty)}</span></div>`).join("")}
      ${o.promo ? `<div class="row-between muted"><span>Promo ${esc(o.promo.nama)}</span><span>−${rupiah(o.promo.potongan)}</span></div>` : ""}
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
      ${last.dapur ? `<p class="struk-note">${last.dapur === "terkirim" ? "Terkirim ke dapur" : last.dapur === "antre" ? "Menunggu internet untuk dikirim ke dapur" : "Mengirim ke dapur…"}</p>` : ""}
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
    <div class="row-between"><p class="muted small" style="margin:0">${esc(tgl)}</p><a href="#/shift" class="link small">Shift & tutup kasir</a></div>
    <div class="stats3">
      <div><small>Omzet</small><b class="pos">${rupiah(r.omzet)}</b></div>
      <div><small>Order</small><b>${r.n}</b></div>
      <div><small>Rata-rata</small><b>${rupiah(r.rata)}</b></div>
    </div>
    ${r.komisi ? `<div class="stats3"><div><small>Komisi online</small><b class="neg">−${rupiah(r.komisi)}</b></div><div><small>Bersih</small><b class="pos">${rupiah(r.bersih)}</b></div><div><small>Porsi online</small><b>${Math.round((r.aktif.filter((o) => isOnline(o.channel)).reduce((a, o) => a + o.total, 0) / (r.omzet || 1)) * 100)}%</b></div></div>` : ""}
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
            ${promoHariIniRekap(r.aktif)}
            ${r.opsiLaris.length ? `<h4>Varian & topping hari ini</h4><div class="chips">${r.opsiLaris.slice(0, 8).map(([nama, q]) => `<span class="tag">${esc(nama)} · ${q}</span>`).join("")}</div>` : ""}
            <a class="btn soft block" href="${esc(linkWa(nomorPemilik(s), teksRekapHari(s, todayISO())))}" target="_blank" rel="noopener">${icon("chat", 16)} Kirim rekap ke ${nomorPemilik(s) ? "pemilik" : "WA"}</a>
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
                          ${o.items.map((i) => `<div class="row-between small"><span>${i.qty}× ${esc(namaLengkap(i))}</span><span>${rupiah(i.harga * i.qty)}</span></div>`).join("")}
                          ${o.promo ? `<div class="row-between small muted"><span>Promo ${esc(o.promo.nama)}</span><span>−${rupiah(o.promo.potongan)}</span></div>` : ""}
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
  after(root) {
    if (mejaAktif(store.get()) && !lepasMeja) {
      lepasMeja = dengarPesanan((e) => {
        if (!location.hash.startsWith("#/kasir")) return lepasMeja?.(), (lepasMeja = null);
        if (e.type === "insert") {
          toast(`Pesanan baru dari ${e.baru.meja_nama} (${e.baru.nama})`);
          navigator.vibrate?.(200);
        }
        if (e.type === "update" && e.lama?.bayar_status !== "lunas" && e.baru?.bayar_status === "lunas") toast(`${e.baru.meja_nama}: pembayaran digital lunas`);
        const el = document.querySelector("#meja-inbox");
        if (el) el.innerHTML = mejaInbox();
      });
    }
    if (!dapurAktif(store.get()) || lepasDapur) return; // pasang sekali
    lepasDapur = dengarDapur((e) => {
      if (!location.hash.startsWith("#/kasir")) {
        lepasDapur?.();
        lepasDapur = null;
        return;
      }
      if (e.type === "update" && e.lama?.status !== "siap" && e.baru?.status === "siap") {
        toast(`Order #${e.baru.no}${e.baru.data?.nama ? ` (${e.baru.data.nama})` : ""} siap diambil!`);
        navigator.vibrate?.(200);
      }
      const el = document.querySelector("#siap-strip");
      if (el) el.innerHTML = siapStrip();
    });
  },

  render(s) {
    if (location.hash.includes("wa=1")) {
      chatWa ||= { text: "", rows: null, sisa: [], atasNama: "", catatan: "" };
      tab = "jual";
      history.replaceState(null, "", "#/kasir");
    }
    if (location.hash.includes("tab=rekap")) {
      tab = "rekap";
      history.replaceState(null, "", "#/kasir");
    }
    const tabs = `<div class="seg">
      <label><input type="radio" name="tab" value="jual" data-change="tab" ${tab === "jual" ? "checked" : ""}><span>Jual</span></label>
      <label><input type="radio" name="tab" value="rekap" data-change="tab" ${tab === "rekap" ? "checked" : ""}><span>Hari ini</span></label>
    </div>`;
    if (isWide() && tab === "jual") {
      // Tablet landscape: menu di kiri, keranjang & pembayaran selalu terlihat di kanan.
      const panel = cart.length
        ? bayarView(s)
        : step === "struk" && last
          ? strukView(s)
          : `<section class="card empty pos-empty"><div class="empty-icon">${icon("register", 30)}</div><h3>Keranjang kosong</h3><p>Ketuk menu di kiri untuk mulai pesanan.</p></section>`;
      return `${head("Kasir", "#/")}${tabs}<div class="pos-split"><div class="pos-left">${menuView(s)}</div><aside class="pos-right">${panel}</aside></div>${pilihSheet(s)}${chatSheet(s)}`;
    }
    const body = tab === "rekap" ? rekapView(s) : step === "struk" && last ? strukView(s) : step === "bayar" && cart.length ? bayarView(s) : menuView(s);
    return `${head("Kasir", "#/")}${tabs}${body}${tab === "jual" ? pilihSheet(s) + chatSheet(s) : ""}`;
  },

  actions: {
    add(el) {
      const r = store.get().resep.find((x) => x.id === el.dataset.id);
      if (!r) return;
      if (step === "struk") step = "menu"; // pesanan baru langsung dari menu
      const s = store.get();
      if (punyaOpsi(s, r)) {
        pilih = { resepId: r.id, ids: pilihanAwal(s, r, bahanMap(s.bahan)), error: "" };
        return render();
      }
      addItem({ key: r.id, resepId: r.id, nama: r.nama, harga: hargaDi(s, r, channel) });
      render();
    },
    pilihOpsi(el) {
      if (!pilih) return;
      const s = store.get();
      const r = s.resep.find((x) => x.id === pilih.resepId);
      const g = grupMenu(s, r).find((x) => x.id === el.dataset.g);
      if (!g) return;
      const id = el.dataset.id;
      const ids = new Set(pilih.ids);
      if (ids.has(id)) {
        if (!(g.tipe === "satu" && g.wajib)) ids.delete(id); // pilih-satu wajib: tidak bisa dikosongkan
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
      if (!pilih) return;
      const s = store.get();
      const r = s.resep.find((x) => x.id === pilih.resepId);
      if (!r) return (pilih = null), render();
      const cek = cekPilihan(s, r, pilih.ids, bahanMap(s.bahan));
      if (!cek.ok) {
        pilih.error = cek.error;
        return render();
      }
      addItem({ key: kunciItem(r.id, cek.opsi), resepId: r.id, nama: r.nama, harga: hargaItem(s, r, cek.opsi, channel), opsi: cek.opsi });
      pilih = null;
      render();
    },
    pilihTutup() {
      pilih = null;
      render();
    },
    chatBuka() {
      chatWa = { text: "", rows: null, sisa: [], atasNama: "", catatan: "" };
      render();
      document.querySelector("textarea[data-change=chatText]")?.focus();
    },
    chatTutup() {
      chatWa = null;
      render();
    },
    chatBaca() {
      if (!chatWa.text.trim()) return toast("Tempel chat-nya dulu ya", "err");
      const r = bacaChatOrder(chatWa.text, store.get().resep);
      chatWa = { ...chatWa, rows: r.items.map((x) => ({ resepId: x.resepId, qty: x.qty })), sisa: r.sisa, atasNama: r.atasNama, catatan: r.catatan };
      render();
    },
    chatUlang() {
      chatWa = { ...chatWa, rows: null };
      render();
    },
    chatTambah() {
      chatWa.rows.push({ resepId: store.get().resep[0]?.id, qty: 1 });
      render();
    },
    chatHapus(el) {
      chatWa.rows.splice(Number(el.dataset.i), 1);
      render();
    },
    chatMasuk() {
      const s = store.get();
      const map = bahanMap(s.bahan);
      let varian = 0;
      if (step === "struk") step = "menu";
      for (const row of chatWa.rows) {
        const r = s.resep.find((x) => x.id === row.resepId);
        const qty = Math.max(1, Math.round(Number(row.qty) || 1));
        if (!r) continue;
        let it = { key: r.id, resepId: r.id, nama: r.nama, harga: hargaDi(s, r, channel) };
        if (punyaOpsi(s, r)) {
          const cek = cekPilihan(s, r, pilihanAwal(s, r, map));
          it = { ...it, key: kunciItem(r.id, cek.opsi), harga: hargaItem(s, r, cek.opsi, channel), opsi: cek.opsi };
          varian++;
        }
        const ada = cart.find((c) => c.key === it.key);
        if (ada) ada.qty += qty;
        else cart.push({ ...it, qty });
      }
      if (chatWa.atasNama) form.atasNama = chatWa.atasNama.slice(0, 40);
      if (chatWa.catatan) form.catatanDapur = chatWa.catatan.slice(0, 200);
      chatWa = null;
      step = isWide() ? step : "bayar";
      toast(varian ? `Masuk keranjang. Cek varian ${varian} menu (pakai pilihan default)` : "Masuk keranjang");
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
      mejaRef = null;
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
      if (wajibShift(s) && !shiftAktif(s, pelaku())) return toast("Buka shift dulu sebelum jualan", "err");
      const { patch, order, stempelInfo } = buatOrder(s, { cart, ...form, promo: promoNow(s).promo, channel, kasir: pelaku(), shiftId: shiftAktif(s, pelaku())?.id || null });
      if (mejaRef) order.meja = { id: mejaRef.id, nama: mejaRef.meja_nama, kode: mejaRef.kode };
      const keDapur = dapurAktif(s);
      if (form.atasNama.trim()) order.atasNama = form.atasNama.trim().slice(0, 40);
      if (form.catatanDapur.trim()) order.catatanDapur = form.catatanDapur.trim().slice(0, 200);
      store.set(patch);
      if (keDapur) {
        kirimTiket(tiketDari(order, { nama: order.atasNama, catatan: order.catatanDapur })).then((ok) => {
          if (last?.order.id === order.id) last.dapur = ok ? "terkirim" : "antre";
          if (!ok) toast("Pesanan belum terkirim ke dapur (offline). Dikirim ulang otomatis.", "err");
          render();
        });
      }
      if (order.stempel) markCards({ ids: [order.pelangganId] });
      last = { order, stempelInfo, dapur: keDapur ? "mengirim" : null };
      if (mejaRef) {
        const ref = mejaRef;
        mejaRef = null;
        ubahPesanan(ref.id, { status: "diproses", bayar_status: "lunas", pos_order_id: order.id }).catch((e) => toast("Status pesanan meja gagal diperbarui: " + e.message, "err"));
      }
      cart = [];
      form = { diskon: 0, kode: "", metode: "tunai", bayar: 0, pelangganId: "", atasNama: "", catatanDapur: "" }; // tiap order baru mulai dari Tunai
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
    terimaMeja(el) {
      const o = pesananMasuk().find((x) => x.id === el.dataset.id);
      if (!o) return;
      if (cart.length && !mejaRef && !confirm("Keranjang sekarang akan diganti dengan pesanan meja ini. Lanjut?")) return;
      const s = store.get();
      const hilang = o.items.filter((x) => !s.resep.some((r) => r.id === x.id));
      channel = "toko";
      cart = o.items.map((x) => {
        const r = s.resep.find((y) => y.id === x.id);
        const opsi = Array.isArray(x.opsi) && x.opsi.length ? x.opsi : null;
        const it = { key: r ? kunciItem(r.id, opsi) : "x-" + uid(), resepId: r ? r.id : null, nama: r || !opsi ? x.nama : namaLengkap(x), harga: x.harga, qty: x.qty };
        if (r && opsi) it.opsi = opsi;
        return it;
      });
      mejaRef = o;
      form = {
        ...form,
        diskon: 0,
        metode: o.metode === "digital" && o.bayar_status === "lunas" ? "qris" : "tunai",
        bayar: 0,
        atasNama: `${o.meja_nama} · ${o.nama}`.slice(0, 40),
        kode: o.promo?.kode || "",
        catatanDapur: o.catatan || "",
      };
      step = "bayar";
      tab = "jual";
      if (hilang.length) toast(`${hilang.length} item sudah tidak ada di menu, dicatat sebagai item lain`, "err");
      render();
      window.scrollTo(0, 0);
    },
    async tolakMeja(el) {
      const o = pesananMasuk().find((x) => x.id === el.dataset.id);
      if (!o) return;
      const alasan = prompt(`Tolak pesanan ${o.meja_nama} (${o.nama})? Tulis alasan singkat untuk pelanggan:`, "Maaf, menu sedang habis");
      if (alasan === null) return;
      await ubahPesanan(o.id, { status: "batal", alasan: alasan.slice(0, 120) });
      if (mejaRef?.id === o.id) {
        mejaRef = null;
        cart = [];
        step = "menu";
      }
      toast("Pesanan meja ditolak");
      render();
    },
    async diambil(el) {
      await statusDapur(el.dataset.id, "diambil");
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
      if (dapurAktif(s)) statusDapur(o.id, "batal").catch(() => {});
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
    kode(el) {
      form.kode = el.value.trim().toUpperCase();
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
    atasNama(el) {
      form.atasNama = el.value;
    },
    catatanDapur(el) {
      form.catatanDapur = el.value;
    },
    pelanggan(el) {
      form.pelangganId = el.value;
      render();
    },
    chatText(el) {
      chatWa.text = el.value;
    },
    chatRow(el) {
      const r = chatWa.rows[Number(el.dataset.i)];
      r[el.dataset.f] = el.dataset.f === "qty" ? Math.max(1, Number(el.value) || 1) : el.value;
    },
    chatField(el) {
      chatWa[el.dataset.f] = el.value;
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
