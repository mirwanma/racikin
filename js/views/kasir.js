import { store, uid } from "../store.js";
import { esc, rupiah, toast, todayISO, isWide } from "../ui.js";
import { render } from "../app.js";
import { icon } from "../icons.js";
import { head } from "./_shared.js";
import { bahanMap, bisaDibuat } from "../stok-utils.js";
import { program, waLink, normWa, newToken } from "../loyalty.js";
import { kasbonAktif, cekKasbon, saldoKasbon, batasKasbon } from "../kasbon.js";
import { cloud, markCards, isKasir, pelaku, teamActive } from "../cloud.js";
import { METODE, metodeNama, subtotal, buatOrder, batalOrder, rekapHari, struk, perKasir } from "../pos.js";
import { billAktif, billTerbuka, cariBill, billMeja, keranjangBill, totalBill, jumlahItem, lamaBuka, bukaBill, tambahRonde, hapusItem, batalBill, ubahBill, tutupBill, voucherBill, itemBill, rapikanPilih, keranjangPilih, totalPilih, semuaDipilih, bayarSebagian, gabungBill, pindahMeja } from "../bill.js";
import { dapurAktif, kirimTiket, tiketDari, ubahStatus as statusDapur, daftarTiket, dengar as dengarDapur } from "../dapur.js";
import { mejaAktif, pesananMasuk, dengarPesanan, ubahPesanan } from "../meja.js";
import { shiftAktif, ringkasan as ringkasanShift, wajibShift } from "../shift.js";
import { activeChannels, channelCfg, channelNama, hargaDi, isOnline, komisiRp } from "../online.js";
import { pilihPromo } from "../promo.js";
import { bolehFitur } from "../paket.js";
import { kunciPro } from "./paket.js";
import { bacaChatOrder, linkWa, nomorPemilik, teksRekapHari } from "../wa.js";
import { grupMenu, punyaOpsi, pilihanAwal, pilihanHabis, cekPilihan, hargaItem, kunciItem, labelOpsi, namaLengkap, aturan, tambahanDi } from "../varian.js";

// State layar kasir (tidak disimpan; keranjang hilang kalau app ditutup).
let tab = "jual"; // jual | bill | rekap
let step = "menu"; // menu | bayar | struk
let cart = []; // { key, resepId, nama, harga, qty, opsi? }
let pilih = null; // sheet varian yang terbuka { resepId, ids: [pilihanId], error }
let chatWa = null; // sheet "Order dari chat WA" { text, rows: [{ resepId, qty }] | null, sisa, atasNama, catatan }
let kasbonBaru = false; // form tambah pelanggan cepat untuk kasbon
let form = { diskon: 0, kode: "", metode: "tunai", bayar: 0, pelangganId: "", atasNama: "", catatanDapur: "", tunaiSebagian: 0, campur: false };
let lepasDapur = null;
let lepasMeja = null;
let mejaRef = null; // pesanan meja yang sedang dibayar { id, metode, bayar_status, kode, meja_nama }
let last = null; // { order, stempelInfo }
let openOrder = null;
let channel = "toko"; // toko | gofood | grabfood | shopeefood
// Open bill (opsional, js/bill.js)
let billTambah = null; // id bill yang sedang ditambah pesanannya (keranjang -> ronde baru)
let billRef = null; // { id, nama, ronde } bill yang sedang dibayar (keranjang = isi bill, tidak bisa diubah)
let billSheet = null; // pilih bill untuk "Simpan ke bill": { nama, error }
let billBuka = null; // id bill yang detailnya dibuka di tab Bill
let billSplit = null; // sheet bayar sebagian { id, pilih: { itemId: qty } }
let billPindah = null; // sheet pindah meja / gabung bill: id bill
const FORM_AWAL = () => ({ diskon: 0, kode: "", metode: "tunai", bayar: 0, pelangganId: "", atasNama: "", catatanDapur: "", tunaiSebagian: 0, campur: false });
const bolehAtur = () => !isKasir();

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
  return p?.wa || mejaRef?.promo?.wa || (billRef && cariBill(s, billRef.id)?.wa) || "";
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

/** Keranjang sedang dipakai untuk nambah pesanan ke bill (bukan dibayar). */
function billTambahView(s) {
  const b = cariBill(s, billTambah);
  if (!b) {
    billTambah = null;
    return "";
  }
  return `<section class="card bill-tambah">
      <div class="row-between"><h2 class="card-title" style="margin:0">Tambah ke bill ${esc(b.nama)}</h2>${isWide() ? `<button class="btn ghost sm" data-action="clear">Kosongkan</button>` : `<button class="btn ghost sm" data-action="back">+ Tambah item</button>`}</div>
      <p class="small muted">Ronde ke-${(b.ronde || []).length + 1}. Stok langsung dipotong${dapurAktif(s) ? " & pesanan dikirim ke dapur" : ""}. Bayarnya nanti dari tab Bill.</p>
      ${cart
        .map(
          (c) => `<div class="pos-line">
            <div><b>${esc(c.nama)}</b>${c.opsi?.length ? `<p class="small pos-opsi">${esc(labelOpsi(c))}</p>` : ""}<p class="small muted">${rupiah(c.harga)}</p></div>
            <div class="stepper"><button class="icon-btn sm" data-action="dec" data-key="${esc(c.key)}" aria-label="Kurangi">−</button><b>${c.qty}</b><button class="icon-btn sm" data-action="inc" data-key="${esc(c.key)}" aria-label="Tambah">+</button></div>
            <b class="pos-line-total">${rupiah(c.harga * c.qty)}</b>
          </div>`,
        )
        .join("")}
      <div class="row-between pos-sum"><span>Ronde ini</span><b>${rupiah(subtotal(cart))}</b></div>
      <div class="row-between pos-total"><span>Total bill setelah ini</span><b>${rupiah(totalBill(b) + subtotal(cart))}</b></div>
      <button class="btn primary block lg" data-action="billKirim" ${!cart.length ? "disabled" : ""}>${dapurAktif(s) ? "Kirim ke dapur & bill" : "Simpan ke bill"} · ${rupiah(subtotal(cart))}</button>
      <button class="btn ghost block" data-action="billBatalTambah">Batal nambah</button>
    </section>`;
}

function bayarView(s) {
  if (billTambah) return billTambahView(s);
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
  const bRef = billRef ? cariBill(s, billRef.id) : null;
  const billInfo = bRef
    ? billRef.pilih
      ? `<section class="card meja-bayar bill-bayar"><b>Bayar sebagian bill ${esc(bRef.nama)}</b> <span class="small">${cart.reduce((a, c) => a + c.qty, 0)} item dipilih</span>
        <p class="small">Sisanya (${rupiah(totalBill(bRef) - subtotal(cart))}) tetap di bill sampai dibayar.</p></section>`
      : `<section class="card meja-bayar bill-bayar"><b>Bayar bill ${esc(bRef.nama)}</b> <span class="small">${(bRef.ronde || []).length} ronde · dibuka ${lamaBuka(bRef)} lalu</span>
        <p class="small">Isi bill nggak bisa diubah di sini. Mau nambah? Buka tab Bill, pilih "Tambah pesanan".</p></section>`
    : "";
  return `${billInfo}${mejaInfo}${bRef ? "" : dapurForm}
    <section class="card">
      <div class="row-between"><h2 class="card-title">Pesanan${online ? ` <span class="tag">${esc(channelNama(channel))}</span>` : ""}</h2>${billRef ? `<button class="btn ghost sm" data-action="clear">Batal bayar</button>` : isWide() ? `<button class="btn ghost sm" data-action="clear">Kosongkan</button>` : `<button class="btn ghost sm" data-action="back">+ Tambah item</button>`}</div>
      ${cart
        .map(
          (c) => `<div class="pos-line">
            <div><b>${esc(c.nama)}</b>${c.opsi?.length ? `<p class="small pos-opsi">${esc(labelOpsi(c))}</p>` : ""}<p class="small muted">${rupiah(c.harga)}</p></div>
            ${
              billRef
                ? `<b class="mono">${c.qty}×</b>`
                : `<div class="stepper">
              <button class="icon-btn sm" data-action="dec" data-key="${esc(c.key)}" aria-label="Kurangi">−</button>
              <b>${c.qty}</b>
              <button class="icon-btn sm" data-action="inc" data-key="${esc(c.key)}" aria-label="Tambah">+</button>
            </div>`
            }
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
      pelanggan && form.metode !== "kasbon"
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
      <div class="chips">${metodeKasir(s).map((m) => `<label class="chip"><input type="radio" name="metode" value="${m.id}" data-change="metode" ${form.metode === m.id ? "checked" : ""}><span>${m.nama}</span></label>`).join("")}</div>
      ${
        form.metode === "kasbon"
          ? kasbonBox(s, total)
          : form.metode === "tunai"
          ? `<label class="field"><span>Uang diterima</span><input type="number" inputmode="numeric" min="0" step="500" value="${form.bayar || ""}" placeholder="${total}" data-change="bayar"></label>
            <div class="chips">${quickCash(total).map((v) => `<button type="button" class="chip-btn ${Number(form.bayar) === v ? "on" : ""}" data-action="uang" data-v="${v}">${v === total ? "Uang pas" : rupiah(v)}</button>`).join("")}</div>
            <div class="row-between pos-total"><span>Kembalian</span><b class="${kurang ? "neg" : "pos"}">${kurang ? "Uang kurang" : rupiah(kembali)}</b></div>`
          : `<label class="impor-cek"><input type="checkbox" data-change="campur" ${form.campur ? "checked" : ""}><span>Sebagian dibayar tunai</span></label>
            ${
              form.campur
                ? `<label class="field"><span>Bagian tunai (Rp)</span><input type="number" inputmode="numeric" min="0" step="500" value="${form.tunaiSebagian || ""}" placeholder="0" data-change="tunaiSebagian"></label>
                  ${campurError(total) ? `<p class="small neg">${esc(campurError(total))}</p>` : `<div class="row-between pos-sum"><span>Tunai</span><b>${rupiah(form.tunaiSebagian)}</b></div><div class="row-between pos-sum"><span>${esc(metodeNama(form.metode))}</span><b>${rupiah(total - (Number(form.tunaiSebagian) || 0))}</b></div>`}`
                : ""
            }`
      }
      <button class="btn primary block lg" data-action="selesai" ${kurang || !cart.length || (form.campur && form.metode !== "tunai" && campurError(total)) || kasbonError(s, total) ? "disabled" : ""}>${billRef ? (billRef.pilih ? "Bayar bagian ini" : "Lunasi bill") : "Selesaikan"} · ${rupiah(total)}</button>
      ${billAktif(s) && bolehFitur("bill") && !billRef && !mejaRef && cart.length ? `<button class="btn soft block" data-action="billSimpanBuka">${icon("receipt", 16)} Simpan ke bill (bayar nanti)</button>` : ""}
    </section>`
    }`;
}

/** Item pesanan meja -> item keranjang Kasir. */
function keranjangMeja(s, o) {
  return o.items.map((x) => {
    const r = s.resep.find((y) => y.id === x.id);
    const opsi = Array.isArray(x.opsi) && x.opsi.length ? x.opsi : null;
    const it = { key: r ? kunciItem(r.id, opsi) : "x-" + uid(), resepId: r ? r.id : null, nama: r || !opsi ? x.nama : namaLengkap(x), harga: x.harga, qty: x.qty };
    if (r && opsi) it.opsi = opsi;
    return it;
  });
}

/** Pesanan dari QR meja masuk bill meja itu (dibuat kalau belum ada). */
function masukBillMeja(o, hilang = []) {
  let s = store.get();
  let b = billMeja(s, o.meja_id);
  if (!b) {
    const r = bukaBill(s, { nama: o.meja_nama, meja: { id: o.meja_id, nama: o.meja_nama }, oleh: pelaku() });
    store.set(r.patch);
    b = r.bill;
  }
  const ronde = kirimRonde(b.id, { meja: { id: o.id, kode: o.kode }, sumberCart: keranjangMeja(store.get(), o), catatan: [o.nama, o.catatan].filter(Boolean).join(" · ") });
  if (!ronde) return;
  if (o.promo?.kode) store.set(voucherBill(store.get(), b.id, { kode: o.promo.kode, wa: o.promo.wa }));
  ubahPesanan(o.id, { status: "diproses", pos_order_id: ronde.id }).catch((e) => toast("Status pesanan meja gagal diperbarui: " + e.message, "err"));
  billBuka = b.id;
  toast(`Pesanan ${o.meja_nama} (${o.nama}) masuk bill ${b.nama}${hilang.length ? `. ${hilang.length} item sudah nggak ada di menu` : ""}`);
  render();
}

/** Simpan isi keranjang sebagai ronde baru di bill: potong stok, kirim ke dapur (kalau aktif). */
function kirimRonde(billId, { meja = null, sumberCart = null, catatan = "" } = {}) {
  const s = store.get();
  const b = cariBill(s, billId);
  if (!b) return toast("Bill nggak ditemukan", "err");
  let hasil;
  try {
    hasil = tambahRonde(s, billId, sumberCart || cart, { oleh: pelaku(), meja });
  } catch (e) {
    return toast(e.message, "err");
  }
  store.set(hasil.patch);
  const { ronde } = hasil;
  const ke = dapurAktif(s);
  if (ke) {
    const no = (cariBill(store.get(), billId)?.ronde || []).length;
    kirimTiket(tiketDari({ id: ronde.id, no, items: ronde.items, channel: "toko", kasir: pelaku(), waktu: ronde.waktu }, { nama: `${b.nama} (bill)`, catatan: catatan || (sumberCart ? "" : form.catatanDapur) })).then((ok) => {
      if (!ok) toast("Pesanan belum terkirim ke dapur (offline). Dikirim ulang otomatis.", "err");
    });
  }
  if (!sumberCart) {
    cart = [];
    billTambah = null;
    form = FORM_AWAL();
    step = "menu";
    tab = "bill";
    billBuka = billId;
    toast(`${ke ? "Dikirim ke dapur & d" : "D"}isimpan ke bill ${b.nama} · ${rupiah(subtotal(ronde.items))}`);
    render();
    window.scrollTo(0, 0);
  }
  return ronde;
}

/** Pengingat di atas menu saat sedang nambah pesanan ke bill. */
function billBanner(s) {
  const b = billTambah ? cariBill(s, billTambah) : null;
  if (!b) return "";
  return `<div class="bill-banner">${icon("receipt", 16)}<span>Nambah pesanan ke <b>${esc(b.nama)}</b></span><button class="btn ghost sm" data-action="billBatalTambah">Batal</button></div>`;
}

/** Validasi pembayaran campuran: bagian tunai harus di antara 0 dan total. */
/** Metode bayar di Kasir (Kasbon kalau diaktifkan). */
const metodeKasir = (s) => (kasbonAktif(s) ? [...METODE, { id: "kasbon", nama: "Kasbon" }] : METODE);
/** Bagian yang jadi kasbon (setelah DP tunai). */
const jumlahKasbon = (total) => (form.metode === "kasbon" ? total - (form.campur ? Number(form.tunaiSebagian) || 0 : 0) : 0);
function kasbonError(s, total) {
  if (form.metode !== "kasbon") return "";
  return cekKasbon(s, form.pelangganId, jumlahKasbon(total));
}
/** Pilih pelanggan yang kasbon + info sisa & batas. */
function kasbonBox(s, total) {
  const list = [...(s.pelanggan || [])].sort((a, b) => a.nama.localeCompare(b.nama, "id"));
  const p = form.pelangganId ? list.find((x) => x.id === form.pelangganId) : null;
  const err = kasbonError(s, total);
  return `<div class="kasbon-box stack">
    <label class="field"><span>Pelanggan yang kasbon</span>
      <select data-change="pelanggan"><option value="">Pilih pelanggan</option>${list
        .map((x) => {
          const sisa = saldoKasbon(s, x.id);
          return `<option value="${x.id}" ${form.pelangganId === x.id ? "selected" : ""}>${esc(x.nama)}${sisa > 0 ? ` · kasbon ${rupiah(sisa)}` : ""}</option>`;
        })
        .join("")}</select></label>
    ${
      kasbonBaru
        ? `<form class="row2 kasbon-baru" data-form="kasbonPelanggan"><input name="nama" maxlength="40" placeholder="Nama pelanggan" required aria-label="Nama pelanggan"><input name="wa" inputmode="tel" maxlength="20" placeholder="No. WA (opsional)" aria-label="Nomor WA"><button class="btn soft sm">Tambah</button></form>`
        : `<button type="button" class="link small" data-action="kasbonBaru">${icon("plus", 14)} Pelanggan baru</button>`
    }
    ${p ? `<div class="row-between pos-sum"><span>Kasbon ${esc(p.nama)} sekarang</span><b>${rupiah(Math.max(0, saldoKasbon(s, p.id)))} / batas ${rupiah(batasKasbon(s, p))}</b></div>` : ""}
    <label class="impor-cek"><input type="checkbox" data-change="campur" ${form.campur ? "checked" : ""}><span>Ada DP / bayar sebagian tunai</span></label>
    ${form.campur ? `<label class="field"><span>Bayar tunai sekarang (Rp)</span><input type="number" inputmode="numeric" min="0" step="500" value="${form.tunaiSebagian || ""}" placeholder="0" data-change="tunaiSebagian"></label>${campurError(total) ? `<p class="small neg">${esc(campurError(total))}</p>` : ""}` : ""}
    ${err && form.pelangganId ? `<p class="small neg">${esc(err)}</p>` : p ? `<div class="row-between pos-total"><span>Jadi kasbon</span><b class="neg">${rupiah(jumlahKasbon(total))}</b></div>` : ""}
    <p class="small muted">Stok & penjualan langsung tercatat, uangnya masuk Kas saat kasbon dilunasi (menu Kasbon).</p>
  </div>`;
}

function campurError(total) {
  const t = Number(form.tunaiSebagian) || 0;
  if (t <= 0) return "Isi berapa yang dibayar tunai";
  if (t >= total) return "Bagian tunai harus kurang dari total (kalau semua tunai, pilih metode Tunai)";
  return "";
}

/** Pilih bill tujuan "Simpan ke bill". */
function billSheetView(s) {
  if (!billSheet) return "";
  const list = billTerbuka(s);
  return `<div class="sheet-bg" data-action="billSheetTutup"></div>
    <section class="sheet" role="dialog" aria-modal="true" aria-label="Simpan ke bill">
      <header class="row-between"><h2 class="card-title" style="margin:0">Simpan ke bill</h2><button class="icon-btn sm" data-action="billSheetTutup" aria-label="Tutup">${icon("x", 14)}</button></header>
      <div class="sheet-body stack">
        <form class="row-gap bill-baru" data-form="billBaru">
          <input name="nama" maxlength="40" placeholder="Bill baru: Meja 3 / nama pembeli" value="${esc(billSheet.nama || form.atasNama || "")}" required aria-label="Nama bill">
          <button class="btn primary">Buka</button>
        </form>
        ${billSheet.error ? `<p class="small neg">${esc(billSheet.error)}</p>` : ""}
        ${list.length ? `<p class="small muted">Atau tambahkan ke bill yang masih buka:</p>${list.map((b) => `<button class="bill-pilih" data-action="billSimpanKe" data-id="${esc(b.id)}"><b>${esc(b.nama)}</b><small class="muted">${jumlahItem(b)} item · ${rupiah(totalBill(b))} · ${lamaBuka(b)}</small></button>`).join("")}` : ""}
      </div>
    </section>`;
}

/** Sheet bayar sebagian: pilih item & jumlah yang dibayar sekarang (split bill per orang). */
function billSplitView(s) {
  if (!billSplit) return "";
  const b = cariBill(s, billSplit.id);
  if (!b) return "";
  const p = billSplit.pilih;
  const items = itemBill(b);
  const tot = totalPilih(b, p);
  return `<div class="sheet-bg" data-action="billSplitTutup"></div>
    <section class="sheet" role="dialog" aria-modal="true" aria-label="Bayar sebagian">
      <header class="row-between"><div><h2 class="card-title" style="margin:0">Bayar sebagian · ${esc(b.nama)}</h2><p class="small muted">Pilih yang dibayar sekarang, sisanya tetap di bill.</p></div><button class="icon-btn sm" data-action="billSplitTutup" aria-label="Tutup">${icon("x", 14)}</button></header>
      <div class="sheet-body">
        ${items
          .map((it) => {
            const q = p[it.id] || 0;
            return `<div class="pos-line split-line ${q ? "on" : ""}">
              <div><b>${esc(it.nama)}</b>${it.opsi?.length ? `<p class="small pos-opsi">${esc(labelOpsi(it))}</p>` : ""}<p class="small muted">${rupiah(it.harga)} · ada ${it.qty}</p></div>
              <div class="stepper"><button class="icon-btn sm" data-action="splitMin" data-i="${esc(it.id)}" aria-label="Kurangi" ${q ? "" : "disabled"}>−</button><b>${q}</b><button class="icon-btn sm" data-action="splitPlus" data-i="${esc(it.id)}" aria-label="Tambah" ${q < it.qty ? "" : "disabled"}>+</button></div>
              <b class="pos-line-total">${rupiah(it.harga * q)}</b>
            </div>`;
          })
          .join("")}
      </div>
      <div class="row-between pos-total"><span>Dibayar sekarang</span><b>${rupiah(tot)}</b></div>
      <p class="small muted">Sisa di bill: ${rupiah(totalBill(b) - tot)}</p>
      <button class="btn primary block lg" data-action="billSplitBayar" ${tot ? "" : "disabled"}>Lanjut bayar · ${rupiah(tot)}</button>
    </section>`;
}

/** Sheet pindah meja / gabung ke bill lain. */
function billPindahView(s) {
  if (!billPindah) return "";
  const b = cariBill(s, billPindah);
  if (!b) return "";
  const lain = billTerbuka(s).filter((x) => x.id !== b.id);
  const meja = (s.meja || []).filter((m) => m.id !== b.meja?.id);
  return `<div class="sheet-bg" data-action="billPindahTutup"></div>
    <section class="sheet" role="dialog" aria-modal="true" aria-label="Pindah atau gabung bill">
      <header class="row-between"><h2 class="card-title" style="margin:0">Pindah / gabung · ${esc(b.nama)}</h2><button class="icon-btn sm" data-action="billPindahTutup" aria-label="Tutup">${icon("x", 14)}</button></header>
      <div class="sheet-body stack">
        ${
          meja.length
            ? `<p class="small muted">Pindah ke meja (kalau meja itu sudah punya bill, otomatis digabung):</p><div class="chips">${meja
                .map((m) => {
                  const ada = billTerbuka(s).find((x) => x.meja?.id === m.id);
                  return `<button class="chip-btn" data-action="billPindahMeja" data-meja="${esc(m.id)}">${esc(m.nama)}${ada ? " · ada bill" : ""}</button>`;
                })
                .join("")}</div>`
            : ""
        }
        ${
          lain.length
            ? `<p class="small muted">Gabung ke bill lain (semua pesanan pindah ke sana):</p>${lain.map((x) => `<button class="bill-pilih" data-action="billGabung" data-ke="${esc(x.id)}"><b>${esc(x.nama)}</b><small class="muted">${jumlahItem(x)} item · ${rupiah(totalBill(x))}</small></button>`).join("")}`
            : ""
        }
        ${!meja.length && !lain.length ? `<p class="muted">Belum ada meja atau bill lain. Ganti nama bill aja kalau pindah tempat.</p>` : ""}
      </div>
    </section>`;
}

/** Tab Bill: daftar bill yang masih buka. */
function billView(s) {
  if (!billAktif(s) && !bolehFitur("bill")) return kunciPro("bill");
  if (!billAktif(s)) {
    return `<section class="card empty"><div class="empty-icon">${icon("receipt", 30)}</div><h3>Open bill</h3>
      <p>Buat pembeli yang pesan dulu, nambah-nambah, terus bayar belakangan (makan di tempat). Kasir tetap bisa ngelayanin transaksi lain. Stok dipotong tiap pesanan dikirim, uang masuk Kas waktu bill dibayar.</p>
      ${bolehAtur() ? `<button class="btn primary" data-action="billNyala">Aktifkan open bill</button>` : `<p class="small muted">Minta pemilik / manajer mengaktifkan.</p>`}</section>`;
  }
  const list = billTerbuka(s).sort((a, b) => a.dibuka.localeCompare(b.dibuka));
  const total = list.reduce((a, b) => a + totalBill(b), 0);
  return `${
    bolehFitur("bill")
      ? `<form class="card row-gap bill-baru" data-form="billBaru">
      <input name="nama" maxlength="40" placeholder="Bill baru: Meja 3 / nama pembeli" required aria-label="Nama bill baru">
      <button class="btn primary">${icon("plus", 14)} Buka bill</button>
    </form>`
      : `<p class="warn-box small">${icon("lock", 14)} Paket Pro habis: bill yang masih buka tetap bisa dibayar, tapi nggak bisa bikin bill / nambah pesanan baru. <a href="#/paket" class="link">Lihat paket</a></p>`
  }
    ${list.length ? `<p class="small muted">${list.length} bill belum dibayar · total ${rupiah(total)}</p>` : `<section class="card empty"><p class="muted">Belum ada bill yang buka. Bikin bill baru, atau di layar bayar pilih "Simpan ke bill".</p></section>`}
    ${list
      .map((b) => {
        const open = billBuka === b.id;
        return `<section class="card bill-card ${open ? "open" : ""}">
          <button class="bill-head" data-action="billDetail" data-id="${esc(b.id)}" aria-expanded="${open}">
            <span><b>${esc(b.nama)}</b>${b.meja ? ` <span class="tag">QR ${esc(b.meja.nama)}</span>` : ""}<small class="muted">${jumlahItem(b)} item · ${(b.ronde || []).length} ronde · ${lamaBuka(b)}</small></span>
            <b class="mono">${rupiah(totalBill(b))}</b>
          </button>
          ${(b.dibayar || []).length ? `<p class="small pos">${icon("check", 13)} Sudah dibayar sebagian: ${rupiah(b.dibayar.reduce((a, x) => a + (Number(x.total) || 0), 0))} (${b.dibayar.length}x)</p>` : ""}
          <div class="row2">
            <button class="btn soft" data-action="billTambahMulai" data-id="${esc(b.id)}" ${bolehFitur("bill") ? "" : "disabled"}>${icon("plus", 14)} Tambah pesanan</button>
            <button class="btn primary" data-action="billBayar" data-id="${esc(b.id)}" ${jumlahItem(b) ? "" : "disabled"}>Bayar semua</button>
          </div>
          <div class="row2">
            <button class="btn ghost sm" data-action="billSplitBuka" data-id="${esc(b.id)}" ${jumlahItem(b) > 1 ? "" : "disabled"}>Bayar sebagian</button>
            <button class="btn ghost sm" data-action="billPindahBuka" data-id="${esc(b.id)}">Pindah / gabung</button>
          </div>
          ${
            open
              ? `<div class="bill-detail">
                  ${(b.ronde || [])
                    .map(
                      (r, i) => `<div class="bill-ronde"><p class="small muted">Ronde ${i + 1} · ${jam(r.waktu)}${r.oleh?.nama ? ` · ${esc(r.oleh.nama)}` : ""}${r.meja ? ` · dari QR (${esc(r.meja.kode)})` : ""}</p>
                      ${r.items
                        .map(
                          (it) => `<div class="row-between pos-sum"><span>${it.qty}× ${esc(it.nama)}${it.opsi?.length ? `<small class="struk-opsi">${esc(labelOpsi(it))}</small>` : ""}</span>
                          <span class="row-gap"><b>${rupiah(it.harga * it.qty)}</b>${bolehAtur() ? `<button class="icon-btn sm" data-action="billHapusItem" data-id="${esc(b.id)}" data-r="${esc(r.id)}" data-i="${esc(it.id)}" aria-label="Batalkan item">${icon("x", 12)}</button>` : ""}</span></div>`,
                        )
                        .join("")}</div>`,
                    )
                    .join("") || `<p class="small muted">Belum ada pesanan.</p>`}
                  ${(b.hapus || []).length ? `<p class="small muted">Dibatalkan: ${b.hapus.map((h) => `${h.item.qty}× ${esc(h.item.nama)} (${esc(h.alasan)})`).join(", ")}</p>` : ""}
                  <div class="row-gap">
                    <button class="btn ghost sm" data-action="billGantiNama" data-id="${esc(b.id)}">Ganti nama</button>
                    ${bolehAtur() ? `<button class="btn ghost sm danger-text" data-action="billBatal" data-id="${esc(b.id)}">Batalkan bill</button>` : ""}
                  </div>
                </div>`
              : ""
          }
        </section>`;
      })
      .join("")}
    ${bolehAtur() && !list.length ? `<button class="btn ghost sm block" data-action="billMati">Matikan open bill</button>` : ""}`;
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
          : o.pembayaran
            ? o.pembayaran.map((x) => `<div class="row-between"><span>${metodeNama(x.metode)}</span><span>${rupiah(x.jumlah)}</span></div>`).join("")
            : `<div class="row-between"><span>${metodeNama(o.metode)}</span><span>${rupiah(o.bayar)}</span></div>`
      }
      ${o.metode === "tunai" ? `<div class="row-between struk-kembali"><span>Kembalian</span><b>${rupiah(o.kembali)}</b></div>` : ""}
      ${o.pelangganId && (o.metode === "kasbon" || o.pembayaran?.some((x) => x.metode === "kasbon")) ? `<p class="struk-note">Kasbon ${esc(p?.nama || "")}: total sekarang ${rupiah(Math.max(0, saldoKasbon(s, o.pelangganId)))}</p>` : ""}
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
    <div class="row-between"><p class="muted small" style="margin:0">${esc(tgl)}</p><span>${kasbonAktif(s) ? `<a href="#/kasbon" class="link small">Kasbon</a> · ` : ""}<a href="#/shift" class="link small">Shift & tutup kasir</a></span></div>
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
    const nBill = billAktif(s) ? billTerbuka(s).length : 0;
    const adaTabBill = billAktif(s) || bolehAtur();
    if (tab === "bill" && !adaTabBill) tab = "jual";
    const tabs = `<div class="seg ${adaTabBill ? "seg3" : ""}">
      <label><input type="radio" name="tab" value="jual" data-change="tab" ${tab === "jual" ? "checked" : ""}><span>Jual</span></label>
      ${adaTabBill ? `<label><input type="radio" name="tab" value="bill" data-change="tab" ${tab === "bill" ? "checked" : ""}><span>Bill${nBill ? ` <b class="kds-n">${nBill}</b>` : ""}</span></label>` : ""}
      <label><input type="radio" name="tab" value="rekap" data-change="tab" ${tab === "rekap" ? "checked" : ""}><span>Hari ini</span></label>
    </div>`;
    if (isWide() && tab === "jual") {
      // Tablet landscape: menu di kiri, keranjang & pembayaran selalu terlihat di kanan.
      const panel = cart.length
        ? bayarView(s)
        : step === "struk" && last
          ? strukView(s)
          : `<section class="card empty pos-empty"><div class="empty-icon">${icon("register", 30)}</div><h3>Keranjang kosong</h3><p>Ketuk menu di kiri untuk mulai pesanan.</p></section>`;
      return `${head("Kasir", "#/")}${tabs}<div class="pos-split"><div class="pos-left">${billBanner(s)}${menuView(s)}</div><aside class="pos-right">${panel}</aside></div>${pilihSheet(s)}${chatSheet(s)}${billSheetView(s)}`;
    }
    const body = tab === "rekap" ? rekapView(s) : tab === "bill" ? billView(s) + billSplitView(s) + billPindahView(s) : step === "struk" && last ? strukView(s) : step === "bayar" && cart.length ? bayarView(s) : billBanner(s) + menuView(s);
    return `${head("Kasir", "#/")}${tabs}${body}${tab === "jual" ? pilihSheet(s) + chatSheet(s) + billSheetView(s) : ""}`;
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
      if (billRef) {
        billRef = null;
        form = FORM_AWAL();
        tab = "bill";
      }
      step = "menu";
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
    kasbonBaru() {
      kasbonBaru = true;
      render();
      document.querySelector("form[data-form=kasbonPelanggan] input")?.focus();
    },
    uang(el) {
      form.bayar = Number(el.dataset.v);
      render();
    },
    selesai() {
      const s = store.get();
      if (wajibShift(s) && !shiftAktif(s, pelaku())) return toast("Buka shift dulu sebelum jualan", "err");
      const bRef = billRef ? cariBill(s, billRef.id) : null;
      if (billRef && !bRef) {
        billRef = null;
        cart = [];
        step = "menu";
        return toast("Bill ini sudah dibayar / dibatalkan di HP lain", "err");
      }
      if (form.metode === "kasbon" && !kasbonAktif(s)) form.metode = "tunai";
      const errKasbon = kasbonError(s, totalNow());
      if (errKasbon) return toast(errKasbon, "err");
      const { patch, order, stempelInfo } = buatOrder(s, {
        cart,
        ...form,
        tunaiSebagian: form.campur ? form.tunaiSebagian : 0,
        promo: promoNow(s).promo,
        channel,
        kasir: pelaku(),
        shiftId: shiftAktif(s, pelaku())?.id || null,
        // Open bill: stok sudah dipotong per ronde.
        stok: !bRef,
        bill: bRef ? { id: bRef.id, nama: bRef.nama, ronde: (bRef.ronde || []).length, ...(billRef.pilih ? { sebagian: true } : {}) } : null,
      });
      if (mejaRef) order.meja = { id: mejaRef.id, nama: mejaRef.meja_nama, kode: mejaRef.kode };
      const keDapur = dapurAktif(s) && !bRef; // bill: tiap ronde sudah dikirim ke dapur
      if (bRef) order.atasNama = bRef.nama.slice(0, 40);
      else if (form.atasNama.trim()) order.atasNama = form.atasNama.trim().slice(0, 40);
      if (form.catatanDapur.trim()) order.catatanDapur = form.catatanDapur.trim().slice(0, 200);
      // Bill: lunas penuh -> ditutup; bayar sebagian -> item yang dibayar dikurangi dari bill.
      const sisa = bRef && billRef.pilih ? bayarSebagian(s, bRef.id, billRef.pilih, { orderId: order.id, total: order.total }) : null;
      store.set(bRef ? { ...patch, ...(sisa ? { bills: sisa.bills } : tutupBill(s, bRef.id)) } : patch);
      if (bRef) {
        // Pesanan dari QR meja yang masuk bill ini ikut lunas (kalau bill-nya sudah lunas semua).
        if (!sisa || sisa.lunas) for (const r of bRef.ronde || []) if (r.meja?.id) ubahPesanan(r.meja.id, { bayar_status: "lunas" }).catch(() => {});
        if (sisa && !sisa.lunas) toast(`Sisa bill ${bRef.nama}: ${rupiah(totalBill(cariBill(store.get(), bRef.id)))}`);
        billRef = null;
      }
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
      kasbonBaru = false;
      form = FORM_AWAL(); // tiap order baru mulai dari Tunai
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
    // ---------- Open bill ----------
    billNyala() {
      if (!bolehFitur("bill")) return (location.hash = "#/paket");
      store.set((s) => ({ posSetting: { ...(s.posSetting || {}), openBill: true } }));
      toast("Open bill aktif");
      render();
    },
    billMati() {
      if (billTerbuka(store.get()).length) return toast("Masih ada bill yang belum dibayar", "err");
      store.set((s) => ({ posSetting: { ...(s.posSetting || {}), openBill: false } }));
      tab = "jual";
      render();
    },
    billDetail(el) {
      billBuka = billBuka === el.dataset.id ? null : el.dataset.id;
      render();
    },
    billTambahMulai(el) {
      if (cart.length && !billTambah && !confirm("Keranjang sekarang akan dikosongkan. Lanjut?")) return;
      billTambah = el.dataset.id;
      billRef = null;
      mejaRef = null;
      cart = [];
      channel = "toko";
      tab = "jual";
      step = "menu";
      render();
      window.scrollTo(0, 0);
    },
    billBatalTambah() {
      const id = billTambah;
      billTambah = null;
      cart = [];
      step = "menu";
      tab = id ? "bill" : "jual";
      render();
    },
    billKirim() {
      kirimRonde(billTambah);
    },
    billSimpanBuka() {
      billSheet = { nama: form.atasNama || "", error: "" };
      render();
    },
    billSheetTutup() {
      billSheet = null;
      render();
    },
    billSimpanKe(el) {
      billSheet = null;
      kirimRonde(el.dataset.id);
    },
    billBayar(el) {
      const s = store.get();
      const b = cariBill(s, el.dataset.id);
      if (!b || !jumlahItem(b)) return;
      if (cart.length && !billRef && !confirm("Keranjang sekarang akan diganti dengan isi bill ini. Lanjut?")) return;
      billRef = { id: b.id, nama: b.nama };
      billTambah = null;
      mejaRef = null;
      channel = "toko";
      cart = keranjangBill(b);
      form = { ...FORM_AWAL(), kode: b.kode || "" };
      tab = "jual";
      step = "bayar";
      render();
      window.scrollTo(0, 0);
    },
    billSplitBuka(el) {
      billSplit = { id: el.dataset.id, pilih: {} };
      render();
    },
    billSplitTutup() {
      billSplit = null;
      render();
    },
    splitPlus(el) {
      const b = cariBill(store.get(), billSplit?.id);
      const it = itemBill(b).find((x) => x.id === el.dataset.i);
      if (!it) return;
      billSplit.pilih[it.id] = Math.min(it.qty, (billSplit.pilih[it.id] || 0) + 1);
      render();
    },
    splitMin(el) {
      if (!billSplit) return;
      billSplit.pilih[el.dataset.i] = Math.max(0, (billSplit.pilih[el.dataset.i] || 0) - 1);
      render();
    },
    billSplitBayar() {
      const s = store.get();
      const b = cariBill(s, billSplit?.id);
      if (!b) return;
      const pilih = rapikanPilih(b, billSplit.pilih);
      if (!Object.keys(pilih).length) return toast("Pilih item yang dibayar dulu", "err");
      billSplit = null;
      if (cart.length && !billRef && !confirm("Keranjang sekarang akan diganti. Lanjut?")) return;
      const semua = semuaDipilih(b, pilih);
      billRef = semua ? { id: b.id, nama: b.nama } : { id: b.id, nama: b.nama, pilih };
      billTambah = null;
      mejaRef = null;
      channel = "toko";
      cart = semua ? keranjangBill(b) : keranjangPilih(b, pilih);
      form = { ...FORM_AWAL(), kode: b.kode || "" };
      tab = "jual";
      step = "bayar";
      render();
      window.scrollTo(0, 0);
    },
    billPindahBuka(el) {
      billPindah = el.dataset.id;
      render();
    },
    billPindahTutup() {
      billPindah = null;
      render();
    },
    billPindahMeja(el) {
      const s = store.get();
      const m = (s.meja || []).find((x) => x.id === el.dataset.meja);
      const b = cariBill(s, billPindah);
      if (!m || !b) return;
      const r = pindahMeja(s, b.id, m);
      store.set({ bills: r.bills });
      billPindah = null;
      billBuka = r.digabung || b.id;
      toast(r.digabung ? `${b.nama} digabung ke bill ${m.nama}` : `Bill pindah ke ${m.nama}`);
      render();
    },
    billGabung(el) {
      const s = store.get();
      const b = cariBill(s, billPindah);
      const ke = cariBill(s, el.dataset.ke);
      if (!b || !ke || !confirm(`Gabung ${b.nama} ke ${ke.nama}? Semua pesanan ${b.nama} pindah ke ${ke.nama}.`)) return;
      store.set(gabungBill(s, b.id, ke.id));
      billPindah = null;
      billBuka = ke.id;
      toast(`${b.nama} digabung ke ${ke.nama}`);
      render();
    },
    billHapusItem(el) {
      const s = store.get();
      const b = cariBill(s, el.dataset.id);
      const it = b?.ronde.find((r) => r.id === el.dataset.r)?.items.find((x) => x.id === el.dataset.i);
      if (!it) return;
      let qty = it.qty;
      if (it.qty > 1) {
        const j = prompt(`Batalkan berapa ${it.nama}? (1-${it.qty})`, String(it.qty));
        if (j === null) return;
        qty = Math.round(Number(j));
        if (!(qty >= 1 && qty <= it.qty)) return toast(`Isi angka 1 sampai ${it.qty}`, "err");
      }
      const alasan = prompt(`Batalkan ${qty}× ${it.nama} dari bill ${b.nama}? Tulis alasannya:`, "Salah input");
      if (alasan === null) return;
      if (!alasan.trim()) return toast("Alasan wajib diisi", "err");
      const stokKembali = confirm("Kembalikan stok bahannya? (OK kalau belum sempat dibuat, Batal kalau sudah dibuat / terbuang)");
      store.set(hapusItem(s, b.id, el.dataset.r, it.id, { alasan, oleh: pelaku(), stokKembali, qty }));
      toast(`${qty}× ${it.nama} dibatalkan dari bill`);
      render();
    },
    billBatal(el) {
      const s = store.get();
      const b = cariBill(s, el.dataset.id);
      if (!b) return;
      const alasan = prompt(`Batalkan seluruh bill ${b.nama} (${rupiah(totalBill(b))})? Tulis alasannya:`, "");
      if (alasan === null) return;
      if (!alasan.trim()) return toast("Alasan wajib diisi", "err");
      const stokKembali = itemBill(b).length ? confirm("Kembalikan stok bahannya? (OK kalau belum sempat dibuat, Batal kalau sudah dibuat / terbuang)") : false;
      store.set(batalBill(s, b.id, { alasan, oleh: pelaku(), stokKembali }));
      if (billTambah === b.id) billTambah = null;
      if (billRef?.id === b.id) {
        billRef = null;
        cart = [];
      }
      toast(`Bill ${b.nama} dibatalkan`);
      render();
    },
    billGantiNama(el) {
      const s = store.get();
      const b = cariBill(s, el.dataset.id);
      if (!b) return;
      const nama = prompt("Nama bill:", b.nama);
      if (nama === null) return;
      store.set(ubahBill(s, b.id, { nama }));
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
      // Open bill aktif: pesanan "bayar di kasir" masuk ke bill meja itu (bayar nanti).
      if (billAktif(s) && bolehFitur("bill") && !(o.metode === "digital" && o.bayar_status === "lunas")) return masukBillMeja(o, hilang);
      channel = "toko";
      cart = keranjangMeja(s, o);
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
    campur(el) {
      form.campur = el.checked;
      if (!form.campur) form.tunaiSebagian = 0;
      render();
    },
    tunaiSebagian(el) {
      form.tunaiSebagian = Math.max(0, Math.round(Number(el.value) || 0));
      render();
    },
    kode(el) {
      form.kode = el.value.trim().toUpperCase();
      render();
    },
    metode(el) {
      form.metode = el.value;
      if (el.value === "kasbon") form.bayar = 0;
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
    kasbonPelanggan(f) {
      const fd = new FormData(f);
      const nama = String(fd.get("nama") || "").trim().slice(0, 40);
      if (!nama) return;
      const s = store.get();
      const wa = normWa(fd.get("wa"));
      if ((s.pelanggan || []).some((x) => x.nama.toLowerCase() === nama.toLowerCase())) return toast("Nama itu sudah ada, pilih dari daftar", "err");
      if (wa && (s.pelanggan || []).some((x) => normWa(x.wa) === wa)) return toast("No. WA ini sudah terdaftar", "err");
      const p = { id: uid(), nama, wa, stempel: 0, kunjungan: 0, hadiahDiambil: 0, terakhir: null, dibuat: todayISO(), token: newToken() };
      store.set({ pelanggan: [...(s.pelanggan || []), p] });
      form.pelangganId = p.id;
      markCards({ ids: [p.id] });
      kasbonBaru = false;
      render();
    },
    billBaru(form_) {
      if (!bolehFitur("bill")) return toast("Open bill khusus paket Pro", "err");
      const nama = String(new FormData(form_).get("nama") || "").trim();
      const s = store.get();
      let r;
      try {
        r = bukaBill(s, { nama, oleh: pelaku() });
      } catch (e) {
        if (billSheet) billSheet.error = e.message;
        return toast(e.message, "err");
      }
      store.set(r.patch);
      if (billSheet) {
        // Dari layar bayar: isi keranjang langsung jadi ronde pertama
        billSheet = null;
        return kirimRonde(r.bill.id);
      }
      // Dari tab Bill: langsung pilih menu untuk bill ini
      billTambah = r.bill.id;
      cart = [];
      tab = "jual";
      step = "menu";
      toast(`Bill ${r.bill.nama} dibuka. Pilih menunya`);
      render();
      window.scrollTo(0, 0);
    },
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
