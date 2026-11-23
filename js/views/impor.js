// Input cepat buat usaha yang sudah jalan: #/impor?jenis=menu (daftar menu + harga) | #/impor?jenis=bahan (bahan + stok awal).
// Sumber: ketik/tempel teks (Mode Demo pakai parser lokal) atau foto papan menu / nota belanja (AI Online).
import { icon } from "../icons.js";
import { store } from "../store.js";
import { esc, rupiah, toast, todayISO } from "../ui.js";
import { render } from "../app.js";
import { head } from "./_shared.js";
import { ai, isDemo, AuthRequiredError } from "../ai.js";
import { fmtQty } from "../stok-utils.js";
import { opsiSatuan } from "../satuan.js";
import { barisMenu, simpanMenu, barisBahan, simpanBahan } from "../impor.js";

const MAX_SISI = 1600;
let st = null; // { jenis, mode, text, foto: { url, data, mime } | null, rows: [] | null, busy, error, selesai }

const jenisDariUrl = () => (new URLSearchParams(location.hash.split("?")[1] || "").get("jenis") === "bahan" ? "bahan" : "menu");

const TEKS = {
  menu: {
    judul: "Masukin menu cepat",
    sub: "Tempel daftar menu dari catatan / WA, atau foto papan menu. Nanti dirapihin jadi menu + harga.",
    contoh: "cth:\nBakso urat 15rb\nMie ayam bakso 18.000\nEs teh manis 4rb",
    foto: "Foto papan menu / buku menu / screenshot GoFood",
  },
  bahan: {
    judul: "Bahan & stok cepat",
    sub: "Tulis bahan yang ada sekarang (atau foto nota belanja). Stoknya dicatat sebagai stok awal.",
    contoh: "cth:\ntahu 200 pcs @600\ncabai rawit 1 kg 80rb\nminyak goreng 5 liter 90.000",
    foto: "Foto catatan stok / nota belanja",
  },
};

function mulai() {
  const jenis = jenisDariUrl();
  if (!st || st.jenis !== jenis) st = { jenis, mode: "teks", text: "", foto: null, rows: null, busy: false, error: "", selesai: null };
}

/** Kecilkan foto (maks 1600 px, JPEG) lalu ubah ke base64 untuk dikirim ke AI. */
async function siapkanFoto(file) {
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" }).catch(() => null);
  if (!bmp) throw new Error("Foto nggak bisa dibaca. Coba JPG/PNG.");
  const k = Math.min(1, MAX_SISI / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * k);
  c.height = Math.round(bmp.height * k);
  c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
  const blob = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.8));
  const data = await new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(String(fr.result).split(",")[1]);
    fr.onerror = () => rej(new Error("Foto gagal dibaca"));
    fr.readAsDataURL(blob);
  });
  return { url: URL.createObjectURL(blob), data, mime: "image/jpeg" };
}

async function baca() {
  if (st.busy) return;
  const s = store.get();
  const pakaiFoto = st.mode === "foto";
  if (pakaiFoto && !st.foto) return toast("Pilih / ambil foto dulu ya", "err");
  if (!pakaiFoto && !st.text.trim()) return toast("Tulis atau tempel daftarnya dulu ya", "err");
  st.busy = true;
  st.error = "";
  render();
  try {
    const input = { text: pakaiFoto ? "" : st.text.slice(0, 8000), ...(pakaiFoto ? { gambar: { mime: st.foto.mime, data: st.foto.data } } : {}) };
    if (st.jenis === "menu") {
      const r = await ai("parse_menu", { ...input, menu_ada: s.resep.map((x) => x.nama).slice(0, 200) });
      st.rows = barisMenu(s, r.menu);
    } else {
      const r = await ai("parse_bahan", { ...input, bahan_ada: s.bahan.map((b) => ({ nama: b.nama, satuan: b.satuan })).slice(0, 200) });
      st.rows = barisBahan(s, r.bahan);
    }
    if (!st.rows.length) st.error = pakaiFoto ? "Nggak ada yang kebaca dari foto. Coba foto lebih dekat & terang, atau ketik aja." : "Nggak ada yang kebaca. Tulis satu per baris, cth: Bakso urat 15rb";
  } catch (e) {
    if (e instanceof AuthRequiredError) st.error = e.message;
    else st.error = e.message || "Gagal membaca, coba lagi ya";
  }
  st.busy = false;
  render();
}

function inputView() {
  const t = TEKS[st.jenis];
  return `
    <section class="card stack">
      <p class="small muted" style="margin:0">${t.sub}</p>
      <div class="seg">
        <label><input type="radio" name="mode" value="teks" data-change="mode" ${st.mode === "teks" ? "checked" : ""}><span>${icon("pen", 14)} Ketik / tempel</span></label>
        <label><input type="radio" name="mode" value="foto" data-change="mode" ${st.mode === "foto" ? "checked" : ""}><span>${icon("spark", 14)} Foto</span></label>
      </div>
      ${
        st.mode === "teks"
          ? `<textarea rows="8" data-change="text" placeholder="${esc(t.contoh)}" aria-label="Daftar">${esc(st.text)}</textarea>
             <p class="small muted">Satu per baris. ${isDemo() ? "Mode Demo: dibaca otomatis tanpa AI." : "AI yang rapihin, format bebas."}</p>`
          : `${
              st.foto
                ? `<div class="foto-now"><img src="${st.foto.url}" alt="Foto yang mau dibaca"></div><label class="btn ghost">${icon("plus", 16)} Ganti foto<input type="file" accept="image/*" data-change="foto" hidden></label>`
                : `<label class="foto-empty impor-foto">${icon("plus", 26)}<span>${t.foto}</span><input type="file" accept="image/*" data-change="foto" hidden></label>`
            }
             ${isDemo() ? `<p class="warn-box small">Baca foto butuh <b>AI Online</b> (login + nyalain di <a href="#/setelan" class="link">Setelan</a>). Di Mode Demo, pakai "Ketik / tempel" aja.</p>` : `<p class="small muted">Pastikan tulisannya kelihatan jelas. Pakai 1 kuota AI.</p>`}`
      }
      ${st.error ? `<p class="warn-box small">${esc(st.error)}</p>` : ""}
      <button class="btn primary block lg" data-action="baca" ${st.busy ? "disabled" : ""}>${st.busy ? "Lagi dibaca…" : `${icon("spark", 16)} Baca daftar`}</button>
    </section>`;
}

const aksiMenu = (r, i) =>
  r.adaId
    ? `<select data-change="row" data-f="aksi" data-i="${i}" aria-label="Aksi"><option value="harga" ${r.aksi === "harga" ? "selected" : ""}>Update harga</option><option value="lewati" ${r.aksi === "lewati" ? "selected" : ""}>Lewati</option></select>`
    : `<label class="impor-cek"><input type="checkbox" data-change="row" data-f="pakai" data-i="${i}" ${r.aksi === "baru" ? "checked" : ""}><span>Simpan</span></label>`;

function reviewMenu() {
  const n = st.rows.filter((r) => r.aksi !== "lewati").length;
  return `<section class="card stack">
    <div class="row-between"><h2 class="card-title" style="margin:0">Cek dulu (${st.rows.length} menu)</h2><button class="btn ghost sm" data-action="ulang">Ulang</button></div>
    <p class="small muted">Benerin nama & harga kalau ada yang salah baca.</p>
    ${st.rows
      .map(
        (r, i) => `<div class="impor-row ${r.aksi === "lewati" ? "off" : ""}">
          <input value="${esc(r.nama)}" maxlength="60" data-change="row" data-f="nama" data-i="${i}" aria-label="Nama menu">
          <input type="number" inputmode="numeric" min="0" step="500" value="${r.harga || ""}" placeholder="Harga" data-change="row" data-f="harga" data-i="${i}" aria-label="Harga">
          ${aksiMenu(r, i)}
          <small class="muted impor-info">${r.adaId ? `Sudah ada · harga sekarang ${rupiah(r.hargaLama)}` : r.kategori === "minuman" ? "Minuman" : r.kategori === "lainnya" ? "Lainnya" : "Makanan"}${!r.harga ? ` · <span class="neg">harga kosong</span>` : ""}${r.catatan ? ` · ${esc(r.catatan)}` : ""}</small>
        </div>`,
      )
      .join("")}
    ${st.rows.some((r) => r.catatan) ? `<p class="small muted">Ada catatan varian/topping? Atur nanti di <a href="#/stok?tab=varian" class="link">tab Varian</a> biar ditanya di Kasir.</p>` : ""}
    <button class="btn primary block lg" data-action="simpan" ${n ? "" : "disabled"}>Simpan ${n} menu</button>
  </section>`;
}

function reviewBahan() {
  const n = st.rows.filter((r) => r.aksi === "simpan").length;
  return `<section class="card stack">
    <div class="row-between"><h2 class="card-title" style="margin:0">Cek dulu (${st.rows.length} bahan)</h2><button class="btn ghost sm" data-action="ulang">Ulang</button></div>
    <p class="small muted">Stok = jumlah yang ada sekarang. Harga = per 1 satuan (kosongin kalau belum tahu).</p>
    ${st.rows
      .map(
        (r, i) => `<div class="impor-row bahan ${r.aksi !== "simpan" ? "off" : ""}">
          <input value="${esc(r.nama)}" maxlength="60" data-change="row" data-f="nama" data-i="${i}" aria-label="Nama bahan">
          <input type="number" min="0" step="any" value="${r.stok || ""}" placeholder="Stok" data-change="row" data-f="stok" data-i="${i}" aria-label="Stok">
          <select data-change="row" data-f="satuan" data-i="${i}" ${r.adaId ? "disabled" : ""} aria-label="Satuan">${opsiSatuan(r.satuan).map((x) => `<option ${x === r.satuan ? "selected" : ""}>${esc(x)}</option>`).join("")}</select>
          <label class="impor-harga"><small class="muted">Rp / ${esc(r.satuan)}</small><input type="number" min="0" step="any" value="${r.harga || ""}" placeholder="belum tahu" data-change="row" data-f="harga" data-i="${i}" aria-label="Harga per satuan"></label>
          <label class="impor-cek"><input type="checkbox" data-change="row" data-f="pakai" data-i="${i}" ${r.aksi === "simpan" ? "checked" : ""}><span>Simpan</span></label>
          <small class="muted impor-info">${r.adaId ? `Sudah ada${r.stokLama !== null ? ` · stok sekarang ${fmtQty(r.stokLama)} ${esc(r.satuan)} (diganti)` : ""}` : "Bahan baru"}</small>
        </div>`,
      )
      .join("")}
    <button class="btn primary block lg" data-action="simpan" ${n ? "" : "disabled"}>Simpan ${n} bahan</button>
  </section>`;
}

function selesaiView() {
  const x = st.selesai;
  if (st.jenis === "menu") {
    return `<section class="card stack center">
      <div class="empty-icon">${icon("check", 30)}</div>
      <h3>${x.baru ? `${x.baru} menu baru masuk` : "Menu diperbarui"}${x.ubah ? ` · ${x.ubah} harga diupdate` : ""}</h3>
      <p class="small muted">Menunya udah bisa dijual di Kasir. Biar HPP & untung per porsi keitung, lengkapi resepnya (bisa pakai AI per menu).</p>
      <div class="row2"><a href="#/stok" class="btn ghost">Lengkapi resep</a><a href="#/kasir" class="btn primary">Buka Kasir</a></div>
      <a href="#/impor?jenis=bahan" class="link small">Lanjut: isi bahan & stok cepat</a>
    </section>`;
  }
  return `<section class="card stack center">
    <div class="empty-icon">${icon("check", 30)}</div>
    <h3>${x.baru} bahan baru${x.ubah ? ` · ${x.ubah} diperbarui` : ""}</h3>
    <p class="small muted">Stoknya tercatat sebagai stok awal. Pas jualan di Kasir, stok berkurang otomatis sesuai resep.</p>
    <div class="row2"><a href="#/stok?tab=bahan" class="btn ghost">Lihat stok</a><a href="#/" class="btn primary">Ke Beranda</a></div>
  </section>`;
}

export const impor = {
  render() {
    mulai();
    const t = TEKS[st.jenis];
    const body = st.selesai ? selesaiView() : st.rows?.length ? (st.jenis === "menu" ? reviewMenu() : reviewBahan()) : inputView();
    return `${head(t.judul, st.jenis === "menu" ? "#/stok" : "#/stok?tab=bahan")}${body}`;
  },

  changes: {
    mode(el) {
      st.mode = el.value;
      st.error = "";
      render();
    },
    text(el) {
      st.text = el.value;
    },
    async foto(el) {
      const file = el.files?.[0];
      el.value = "";
      if (!file) return;
      if (!/^image\//.test(file.type)) return toast("Pilih file foto ya", "err");
      try {
        st.foto = await siapkanFoto(file);
        st.error = "";
      } catch (e) {
        st.error = e.message;
      }
      render();
    },
    row(el) {
      const r = st.rows[Number(el.dataset.i)];
      const f = el.dataset.f;
      if (f === "pakai") r.aksi = el.checked ? (st.jenis === "menu" ? "baru" : "simpan") : "lewati";
      else if (f === "aksi") r.aksi = el.value;
      else if (f === "harga" || f === "stok") r[f] = el.value === "" ? 0 : Math.max(0, Number(el.value) || 0);
      else r[f] = el.value;
      if (f === "pakai" || f === "aksi" || f === "satuan") render();
    },
  },

  actions: {
    baca: () => baca(),
    ulang() {
      st.rows = null;
      st.error = "";
      render();
    },
    simpan() {
      const s = store.get();
      const rows = st.rows.map((r) => ({ ...r, nama: String(r.nama || "").trim() })).filter((r) => r.nama);
      if (st.jenis === "menu") {
        const kosong = rows.filter((r) => r.aksi === "baru" && !r.harga);
        if (kosong.length && !confirm(`${kosong.length} menu harganya masih kosong. Tetap simpan? (bisa diisi nanti di Stok & Resep)`)) return;
        const { patch, baru, ubah } = simpanMenu(s, rows);
        store.set(patch);
        st.selesai = { baru, ubah };
      } else {
        const { patch, baru, ubah } = simpanBahan(s, rows, todayISO());
        store.set(patch);
        st.selesai = { baru, ubah };
      }
      toast("Tersimpan");
      render();
      window.scrollTo(0, 0);
    },
  },
};

// Keluar dari halaman ini -> mulai bersih lagi kalau dibuka lagi.
if (typeof addEventListener === "function") addEventListener("hashchange", () => !location.hash.startsWith("#/impor") && (st = null));
