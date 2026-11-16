// WhatsApp (#/wa): nomor usaha & pemilik, teks menu siap kirim, link + QR "Pesan via WA", broadcast pelanggan.
// Semua lewat link wa.me: pesan dibuka di WhatsApp HP, pengguna sendiri yang menekan kirim.
import { icon } from "../icons.js";
import { store } from "../store.js";
import { esc, toast, copy, todayISO, download } from "../ui.js";
import { render } from "../app.js";
import { head } from "./_shared.js";
import { qrSvg } from "../meja.js";
import { normWa } from "../loyalty.js";
import { nomorUsaha, nomorPemilik, linkWa, teksMenu, linkPesan, SEGMEN, pelangganSegmen, templateBroadcast, pesanUntuk, bisnisOf } from "../wa.js";

let segmen = "semua";
let tpl = null; // template broadcast yang sedang diedit
let qr = { link: "", svg: "" };
const KIRIM_KEY = "racikin:wa-terkirim"; // tanda "sudah dikirim" per hari & segmen (cuma di HP ini)

function bacaTerkirim() {
  try {
    const x = JSON.parse(localStorage.getItem(KIRIM_KEY)) || {};
    return x.tanggal === todayISO() ? x : { tanggal: todayISO(), ids: {} };
  } catch {
    return { tanggal: todayISO(), ids: {} };
  }
}
function tandai(id) {
  const x = bacaTerkirim();
  (x.ids[segmen] ||= []).includes(id) || x.ids[segmen].push(id);
  try {
    localStorage.setItem(KIRIM_KEY, JSON.stringify(x));
  } catch {
    /* abaikan */
  }
}

function nomorCard(s) {
  return `<section class="card stack">
    <h2 class="card-title" style="margin:0">Nomor WhatsApp</h2>
    <form data-form="nomor" class="stack">
      <div class="row2">
        <label class="field"><span>WA usaha (buat pelanggan pesan)</span><input name="usaha" type="tel" inputmode="tel" value="${esc(nomorUsaha(s))}" placeholder="0812…"></label>
        <label class="field"><span>WA pemilik (terima laporan)</span><input name="pemilik" type="tel" inputmode="tel" value="${esc(nomorPemilik(s))}" placeholder="0812…"></label>
      </div>
      <button class="btn soft">Simpan nomor</button>
    </form>
    <p class="small muted">Laporan tutup shift & rekap harian dari kasir dikirim ke WA pemilik. Kosongin kalau mau pilih kontak tiap kirim.</p>
  </section>`;
}

function menuCard(s) {
  const teks = teksMenu(s, { tanggal: todayISO() });
  return `<section class="card stack">
    <h2 class="card-title" style="margin:0">Daftar menu siap kirim</h2>
    <textarea rows="8" readonly class="wa-teks" aria-label="Teks menu">${esc(teks)}</textarea>
    <div class="row2">
      <button class="btn ghost" data-action="salinMenu">${icon("receipt", 16)} Salin</button>
      <a class="btn primary" href="${esc(linkWa("", teks))}" target="_blank" rel="noopener">${icon("chat", 16)} Kirim / Status WA</a>
    </div>
    <p class="small muted">Harga toko + promo yang berlaku hari ini. Ubah jam buka & alamat di <a href="#/studio" class="link">Studio Brand</a>.</p>
  </section>`;
}

function pesanCard(s) {
  const link = linkPesan(s);
  if (!link) {
    return `<section class="card"><h2 class="card-title">Link & QR "Pesan via WA"</h2><p class="small muted">Isi nomor WA usaha dulu, nanti link & QR-nya muncul di sini buat brosur, bio IG, atau stiker meja.</p></section>`;
  }
  if (qr.link !== link) {
    qr = { link, svg: "" };
    qrSvg(link, 5).then((svg) => {
      if (qr.link === link) {
        qr.svg = svg;
        render();
      }
    });
  }
  return `<section class="card stack">
    <h2 class="card-title" style="margin:0">Link & QR "Pesan via WA"</h2>
    <div class="wa-qr">${qr.svg || ""}</div>
    <p class="small mono wa-link">${esc(link)}</p>
    <div class="row2">
      <button class="btn ghost" data-action="salinLink">${icon("receipt", 16)} Salin link</button>
      <button class="btn soft" data-action="unduhQr" ${qr.svg ? "" : "disabled"}>${icon("download", 16)} Unduh QR</button>
    </div>
    <p class="small muted">Pelanggan scan / klik → chat ke WA usaha dengan format pesanan. Chat-nya tinggal ditempel di Kasir → "Order dari chat WA".</p>
  </section>`;
}

function broadcastCard(s) {
  if (!s.loyalty || !(s.pelanggan || []).length) {
    return `<section class="card"><h2 class="card-title">Broadcast ke pelanggan</h2><p class="small muted">Belum ada data pelanggan. Aktifkan <a href="#/pelanggan" class="link">kartu stempel</a> dulu, nomor WA pelanggan kecatat dari situ.</p></section>`;
  }
  tpl ??= templateBroadcast(s, todayISO());
  const { list, tanpaWa } = pelangganSegmen(s, segmen, todayISO());
  const sudah = new Set(bacaTerkirim().ids[segmen] || []);
  const n = list.filter((p) => sudah.has(p.id)).length;
  return `<section class="card stack">
    <h2 class="card-title" style="margin:0">Broadcast ke pelanggan</h2>
    <label class="field"><span>Kirim ke</span><select data-change="segmen">${SEGMEN.map((x) => `<option value="${x.id}" ${segmen === x.id ? "selected" : ""}>${x.nama}</option>`).join("")}</select></label>
    <label class="field"><span>Pesan</span><textarea rows="4" data-change="tpl" maxlength="600">${esc(tpl)}</textarea></label>
    <p class="small muted">Kode otomatis: {nama} {stempel} {sisa} {hadiah} {link} (link kartu stempel). <button class="link small" data-action="tplUlang">Pakai pesan bawaan</button></p>
    ${
      list.length
        ? `<div class="row-between"><b>${list.length} pelanggan</b><span class="small ${n === list.length ? "pos" : "muted"}">${n}/${list.length} terkirim hari ini</span></div>
           <div class="progress"><span style="width:${(n / list.length) * 100}%"></span></div>
           <div class="wa-list">${list
             .map(
               (p) => `<div class="row-between wa-row ${sudah.has(p.id) ? "done" : ""}"><span><b>${esc(p.nama)}</b><small class="muted">${p.stempel || 0} stempel</small></span>
                 <a class="btn ${sudah.has(p.id) ? "ghost" : "primary"} sm" href="${esc(linkWa(p.wa, pesanUntuk(s, tpl, p)))}" target="_blank" rel="noopener" data-action="kirim" data-id="${p.id}">${sudah.has(p.id) ? `${icon("check", 14)} Terkirim` : "Kirim"}</a></div>`,
             )
             .join("")}</div>`
        : `<p class="small muted">Nggak ada pelanggan di kelompok ini.</p>`
    }
    ${tanpaWa ? `<p class="small muted">${tanpaWa} pelanggan di kelompok ini belum punya nomor WA.</p>` : ""}
    <p class="small muted">WhatsApp biasa nggak bisa kirim massal otomatis, jadi dikirim satu-satu. Kirim secukupnya biar nomor usaha nggak dianggap spam.</p>
  </section>`;
}

export const wa = {
  render(s) {
    return `${head("WhatsApp", "#/bisnis")}
      <p class="muted small">Semua pesan dibuka di WhatsApp HP-mu, kamu tinggal tekan kirim. Gratis, tanpa daftar apa pun.</p>
      ${nomorCard(s)}${pesanCard(s)}${menuCard(s)}${broadcastCard(s)}
      <section class="card"><p class="small" style="margin:0">${icon("register", 14)} Order yang masuk lewat chat bisa langsung dimasukin ke keranjang: <a href="#/kasir?wa=1" class="link">Kasir → Order dari chat WA</a>.</p></section>`;
  },
  changes: {
    segmen(el) {
      segmen = el.value;
      render();
    },
    tpl(el) {
      tpl = el.value;
      render();
    },
  },
  forms: {
    nomor(form) {
      const fd = new FormData(form);
      const usaha = String(fd.get("usaha") || "").trim();
      const pemilik = String(fd.get("pemilik") || "").trim();
      for (const [n, v] of [["usaha", usaha], ["pemilik", pemilik]]) if (v && normWa(v).length < 10) return toast(`Nomor WA ${n} kurang lengkap`, "err");
      store.set((s) => ({ wa: { ...(s.wa || {}), usaha, pemilik } }));
      toast("Nomor WA disimpan");
      render();
    },
  },
  actions: {
    async salinMenu() {
      await copy(teksMenu(store.get(), { tanggal: todayISO() }));
    },
    async salinLink() {
      await copy(linkPesan(store.get()));
    },
    unduhQr() {
      download(`qr-pesan-wa-${bisnisOf(store.get()).toLowerCase().replace(/\W+/g, "-")}.svg`, qr.svg, "image/svg+xml");
    },
    tplUlang() {
      tpl = templateBroadcast(store.get(), todayISO());
      render();
    },
    kirim(el) {
      tandai(el.dataset.id); // link tetap dibuka oleh browser (target _blank)
      setTimeout(render, 300);
    },
  },
};
