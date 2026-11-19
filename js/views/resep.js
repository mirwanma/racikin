import { icon } from "../icons.js";
import { bolehFitur } from "../paket.js";
import { store, uid } from "../store.js";
import { esc, rupiah, toast, list } from "../ui.js";
import { ai } from "../ai.js";
import { render, go } from "../app.js";
import { busy, runAI, head } from "./_shared.js";
import { SATUAN, fmtQty } from "../stok-utils.js";
import { cloud, role } from "../cloud.js";
import { GAYA, siapkan, percantikOtomatis, percantikAI, upload, hapusFile } from "../foto.js";

// Draft resep yang sedang diedit (belum disimpan).
let draft = null;
let loadedFor = null;
let tips = null;
// Editor foto: { asli: {blob,url}, hasil: {blob,url,label,ai} | null, gaya, busy: ""|"auto"|"ai"|"simpan", error }
let foto = null;

const routeId = () => new URLSearchParams(location.hash.split("?")[1] || "").get("id") || "new";
const key = (n) => String(n || "").trim().toLowerCase();
const findBahan = (nama) => store.get().bahan.find((b) => key(b.nama) === key(nama));

function load() {
  const id = routeId();
  if (loadedFor === id && draft) return;
  loadedFor = id;
  tips = null;
  foto = null;
  const s = store.get();
  const r = s.resep.find((x) => x.id === id);
  if (r) {
    const map = Object.fromEntries(s.bahan.map((b) => [b.id, b]));
    draft = {
      id: r.id,
      nama: r.nama,
      harga: r.harga,
      hasil: r.hasil || 1,
      foto: r.foto || null,
      opsiIds: [...(r.opsiIds || [])],
      rows: r.items.map((it) => ({ nama: map[it.bahanId]?.nama || "", qty: it.qty, satuan: map[it.bahanId]?.satuan || "pcs", harga: "" })),
    };
  } else {
    draft = { id: null, nama: "", harga: s.profile?.harga || "", hasil: 1, foto: null, opsiIds: [], rows: [{ nama: "", qty: "", satuan: "pcs", harga: "" }] };
  }
}

const ada = () => !!draft?.id && store.get().resep.some((r) => r.id === draft.id); // resep sudah tersimpan?
const bisaFoto = () => cloud.user && cloud.team && ["owner", "manajer"].includes(role());

function fotoCard() {
  const pilihFile = (label, cls = "btn soft") =>
    `<label class="${cls} ${bisaFoto() ? "" : "disabled"}">${icon("plus", 16)} ${label}<input type="file" accept="image/*" data-change="foto" hidden ${bisaFoto() ? "" : "disabled"}></label>`;
  if (foto) {
    const sibuk = foto.busy;
    return `<section class="card foto-card">
      <div class="row-between"><h2 class="card-title" style="margin:0">Foto menu</h2><button class="btn ghost sm" data-action="fotoBatal" ${sibuk ? "disabled" : ""}>Batal</button></div>
      <div class="foto-compare ${foto.hasil || sibuk ? "dua" : ""}">
        <figure><img src="${foto.asli.url}" alt="Foto asli"><figcaption>Asli</figcaption></figure>
        ${
          sibuk === "auto" || sibuk === "ai"
            ? `<figure class="foto-loading"><div class="pot"><span></span><span></span><span></span></div><figcaption>${sibuk === "ai" ? "AI lagi mempercantik… (±10–30 dtk)" : "Memproses…"}</figcaption></figure>`
            : foto.hasil
              ? `<figure class="hasil"><img src="${foto.hasil.url}" alt="Hasil"><figcaption>${esc(foto.hasil.label)}</figcaption></figure>`
              : ""
        }
      </div>
      ${foto.error ? `<p class="warn-box small">${esc(foto.error)}</p>` : ""}
      <div class="field"><span>Gaya (untuk AI)</span><div class="chips">${GAYA.map((g) => `<button type="button" class="chip-btn ${foto.gaya === g.id ? "on" : ""}" data-action="fotoGaya" data-g="${g.id}" ${sibuk ? "disabled" : ""}>${g.nama}</button>`).join("")}</div></div>
      <div class="row2">
        <button type="button" class="btn ghost foto-btn" data-action="fotoAuto" ${sibuk ? "disabled" : ""}><span>Percantik otomatis</span><small>gratis · di HP</small></button>
        ${bolehFitur("foto") ? `<button type="button" class="btn soft foto-btn" data-action="fotoAI" ${sibuk ? "disabled" : ""}><span>${icon("spark", 16)} Percantik pakai AI</span><small>Gemini · kuota harian</small></button>` : `<a href="#/paket" class="btn soft foto-btn"><span>${icon("lock", 16)} Percantik pakai AI</span><small>khusus paket Pro</small></a>`}
      </div>
      <div class="row2">
        <button type="button" class="btn ${foto.hasil ? "ghost" : "primary"}" data-action="fotoSimpan" data-v="asli" ${sibuk ? "disabled" : ""}>Simpan foto asli</button>
        ${foto.hasil ? `<button type="button" class="btn primary" data-action="fotoSimpan" data-v="hasil" ${sibuk ? "disabled" : ""}>${sibuk === "simpan" ? "Menyimpan…" : `Simpan ${foto.hasil.ai ? "versi AI" : "hasil"}`}</button>` : ""}
      </div>
      <p class="small muted">Belum ada yang tersimpan sampai kamu pilih. AI hanya memperbaiki cahaya, warna & latar; isi makanannya dipertahankan.</p>
    </section>`;
  }
  return `<section class="card foto-card">
    <div class="row-between"><h2 class="card-title" style="margin:0">Foto menu <small class="muted">opsional</small></h2></div>
    ${
      draft.foto
        ? `<div class="foto-now"><img src="${esc(draft.foto.url)}" alt="Foto ${esc(draft.nama)}">${draft.foto.ai ? `<span class="tag">AI</span>` : ""}</div>
           <div class="row2">${pilihFile("Ganti foto", "btn ghost")}<button type="button" class="btn soft" data-action="fotoEditLama" ${bisaFoto() ? "" : "disabled"}>${icon("spark", 16)} Percantik foto ini</button></div>
           <button type="button" class="btn ghost sm" data-action="fotoHapus" ${bisaFoto() ? "" : "disabled"}>Hapus foto</button>`
        : `<div class="foto-empty">${icon("bowl", 30)}<p class="small muted">Foto tampil di Kasir & menu pelanggan (QR meja).</p>${pilihFile("Upload / ambil foto", "btn primary")}</div>`
    }
    ${bisaFoto() ? "" : `<p class="small muted">${cloud.user ? "Hanya pemilik/manajer yang bisa mengubah foto menu." : `<a href="#/akun" class="link">Login</a> dulu supaya foto bisa disimpan.`}</p>`}
  </section>`;
}

async function fotoProses(kind) {
  if (!foto || foto.busy) return;
  foto.busy = kind;
  foto.error = "";
  render();
  try {
    if (kind === "auto") foto.hasil = { ...(await percantikOtomatis(foto.asli.blob)), label: "Percantik otomatis", ai: false };
    else {
      const r = await percantikAI(foto.asli.blob, { nama: draft.nama, gaya: foto.gaya });
      foto.hasil = { ...r, label: `AI · ${GAYA.find((g) => g.id === foto.gaya)?.nama}`, ai: true };
      if (r.quota) toast(`AI foto: ${r.quota.used_today}/${r.quota.limit_day} hari ini`);
    }
  } catch (e) {
    foto.error = /quota|kuota|penuh|billing/i.test(e.message)
      ? `${e.message} Catatan: edit gambar Gemini butuh billing aktif di Google AI Studio. Sementara itu pakai "Percantik otomatis" (gratis).`
      : e.message;
  }
  foto.busy = "";
  render();
}

/** Hitung HPP dari draft (bahan baru pakai harga yang diketik / estimasi AI). */
function calc() {
  let total = 0;
  let kurang = 0;
  const rows = draft.rows.map((row) => {
    const b = findBahan(row.nama);
    const harga = b?.harga ? Number(b.harga) : Number(row.harga) || 0;
    if (row.nama && !harga) kurang++;
    const biaya = (Number(row.qty) || 0) * harga;
    total += biaya;
    return { row, b, harga, biaya };
  });
  const hasil = Math.max(1, Number(draft.hasil) || 1);
  const hpp = total / hasil;
  const jual = Number(draft.harga) || 0;
  return { rows, hpp, kurang, margin: jual ? ((jual - hpp) / jual) * 100 : 0, hasil };
}

function preview() {
  const c = calc();
  const cls = c.margin >= 50 ? "pos" : c.margin >= 30 ? "" : "neg";
  return `
    <div class="stats3">
      <div><small>HPP/porsi</small><b>${rupiah(c.hpp)}</b></div>
      <div><small>Untung/porsi</small><b class="${cls}">${rupiah((Number(draft.harga) || 0) - c.hpp)}</b></div>
      <div><small>Margin</small><b class="${cls}">${Math.round(c.margin)}%</b></div>
    </div>
    ${c.kurang ? `<p class="warn-box small">${c.kurang} bahan belum ada harganya.</p>` : ""}
    ${c.margin && c.margin < 30 ? `<p class="small muted">Margin di bawah 30% biasanya terlalu tipis untuk F&B. Coba naikkan harga atau kurangi bahan termahal.</p>` : ""}
    <div class="breakdown small">${c.rows
      .filter((x) => x.row.nama && x.biaya)
      .sort((a, b) => b.biaya - a.biaya)
      .map((x) => `<div class="row-between"><span>${esc(x.row.nama)}</span><span>${rupiah(x.biaya / c.hasil)}</span></div>`)
      .join("")}</div>`;
}

const updatePreview = () => {
  const el = document.getElementById("hpp-box");
  if (el) el.innerHTML = preview();
};

function rowHtml(row, i) {
  const b = findBahan(row.nama);
  return `<div class="resep-row" data-i="${i}">
    <input list="bahan-list" placeholder="Bahan" value="${esc(row.nama)}" data-change="row" data-f="nama" data-i="${i}" aria-label="Nama bahan">
    <input type="number" min="0" step="any" placeholder="Jml" value="${esc(row.qty)}" data-change="row" data-f="qty" data-i="${i}" aria-label="Jumlah">
    <select data-change="row" data-f="satuan" data-i="${i}" ${b ? "disabled" : ""} aria-label="Satuan">${SATUAN.map((s) => `<option ${s === (b?.satuan || row.satuan) ? "selected" : ""}>${s}</option>`).join("")}</select>
    <button type="button" class="icon-btn sm" data-action="delRow" data-i="${i}" aria-label="Hapus baris">${icon("x", 14)}</button>
    ${
      row.nama && !b
        ? `<label class="new-price"><span>Bahan baru · harga per ${esc(row.satuan)}</span><input type="number" min="0" step="any" placeholder="Rp" value="${esc(row.harga)}" data-change="row" data-f="harga" data-i="${i}"></label>`
        : b
          ? `<small class="muted row-hint">${rupiah(b.harga)}/${esc(b.satuan)} · ${b.tracked ? `stok ${fmtQty(Number(b.stok) || 0)}` : "stok belum diisi"}</small>`
          : ""
    }
  </div>`;
}

export const resep = {
  render(s) {
    load();
    if (busy.resep) return head(draft.id ? "Edit Resep" : "Resep Baru", "#/stok") + `<div class="loading"><div class="pot"><span></span><span></span><span></span></div><p>AI lagi nyusun takaran ${esc(draft.nama)}…</p></div>`;
    return `
      ${head(ada() ? "Edit Resep" : "Resep Baru", "#/stok")}
      <datalist id="bahan-list">${s.bahan.map((b) => `<option value="${esc(b.nama)}">`).join("")}</datalist>

      <section class="card stack">
        <label class="field"><span>Nama menu</span><input value="${esc(draft.nama)}" data-change="field" data-f="nama" placeholder="cth: Tahu Guyur Original"></label>
        <div class="row2">
          <label class="field"><span>Harga jual/porsi</span><input type="number" min="0" value="${esc(draft.harga)}" data-change="field" data-f="harga"></label>
          <label class="field"><span>Resep ini jadi berapa porsi?</span><input type="number" min="1" step="1" value="${esc(draft.hasil)}" data-change="field" data-f="hasil"></label>
        </div>
        <button type="button" class="btn soft" data-action="aiFill">${icon("spark", 16)} Isi bahan & takaran pakai AI</button>
      </section>

      ${fotoCard()}

      <section class="card">
        <h2 class="card-title">Bahan (untuk ${esc(draft.hasil)} porsi)</h2>
        <div class="resep-rows">${draft.rows.map(rowHtml).join("")}</div>
        <button type="button" class="btn ghost block" data-action="addRow">+ Bahan</button>
      </section>

      <section class="card">
        <h2 class="card-title">Varian & topping <small class="muted">opsional</small></h2>
        ${
          (s.opsi || []).length
            ? `<div class="chips">${s.opsi.map((g) => `<label class="chip"><input type="checkbox" data-change="opsi" value="${g.id}" ${draft.opsiIds.includes(g.id) ? "checked" : ""}><span>${esc(g.nama)}</span></label>`).join("")}</div>
               <p class="small muted">Dicentang = Kasir & menu QR nanya pilihan ini. <a href="#/stok?tab=varian" class="link">Atur varian</a></p>`
            : `<p class="small muted">Belum ada grup varian (level pedas, topping, ukuran). <a href="#/varian?id=new" class="link">Bikin varian</a></p>`
        }
      </section>

      <section class="card accent" id="hpp-box">${preview()}</section>
      ${tips ? `<section class="card"><h2 class="card-title">Tips dari AI</h2>${list(tips, "checks")}<p class="muted small">Harga bahan dari AI adalah estimasi. Update pakai harga belanja aslimu di tab Bahan.</p></section>` : ""}

      <button class="btn primary block lg" data-action="save">Simpan resep</button>
      ${ada() ? `<button class="btn danger block" data-action="del">Hapus resep</button>` : ""}`;
  },

  changes: {
    async foto(el) {
      const file = el.files?.[0];
      el.value = "";
      if (!file) return;
      if (!/^image\//.test(file.type)) return toast("Pilih file foto (JPG/PNG/WebP)", "err");
      try {
        foto = { asli: await siapkan(file), hasil: null, gaya: "studio", busy: "", error: "" };
      } catch (e) {
        return toast(e.message || "Foto tidak bisa dibaca", "err");
      }
      render();
    },
    opsi(el) {
      draft.opsiIds = el.checked ? [...new Set([...draft.opsiIds, el.value])] : draft.opsiIds.filter((x) => x !== el.value);
    },
    field(el) {
      draft[el.dataset.f] = el.dataset.f === "nama" ? el.value : el.value === "" ? "" : Number(el.value);
      updatePreview();
    },
    row(el) {
      const i = Number(el.dataset.i);
      const f = el.dataset.f;
      draft.rows[i][f] = f === "qty" || f === "harga" ? (el.value === "" ? "" : Number(el.value)) : el.value;
      // Ganti nama bahan bisa mengubah satuan / input harga -> render ulang baris saja.
      if (f === "nama" || f === "satuan") {
        const wrap = el.closest(".resep-row");
        const tmp = document.createElement("div");
        tmp.innerHTML = rowHtml(draft.rows[i], i);
        wrap.replaceWith(tmp.firstElementChild);
      }
      updatePreview();
    },
  },

  actions: {
    fotoGaya(el) {
      foto.gaya = el.dataset.g;
      render();
    },
    fotoAuto: () => fotoProses("auto"),
    fotoAI: () => fotoProses("ai"),
    fotoBatal() {
      foto = null;
      render();
    },
    async fotoEditLama() {
      try {
        const blob = await fetch(draft.foto.url, { cache: "no-store" }).then((r) => {
          if (!r.ok) throw new Error("Foto lama tidak bisa diambil");
          return r.blob();
        });
        foto = { asli: await siapkan(blob), hasil: null, gaya: "studio", busy: "", error: "" };
        render();
      } catch (e) {
        toast(e.message, "err");
      }
    },
    async fotoSimpan(el) {
      if (!foto || foto.busy) return;
      const pilih = el.dataset.v === "hasil" && foto.hasil ? foto.hasil : foto.asli;
      foto.busy = "simpan";
      render();
      try {
        if (!draft.id) draft.id = uid(); // resep baru: id dibuat sekarang supaya nama file stabil
        const { url, path } = await upload(pilih.blob, draft.id);
        const lama = draft.foto?.path;
        draft.foto = { url, path, ai: !!pilih.ai, at: new Date().toISOString() };
        // Resep yang sudah ada: langsung simpan fotonya (tanpa harus tekan "Simpan resep").
        if (store.get().resep.some((r) => r.id === draft.id)) {
          store.set((s) => ({ resep: s.resep.map((r) => (r.id === draft.id ? { ...r, foto: draft.foto } : r)) }));
        }
        if (lama && lama !== path) hapusFile(lama);
        foto = null;
        toast(store.get().resep.some((r) => r.id === draft.id) ? "Foto menu disimpan" : "Foto siap · tekan Simpan resep");
      } catch (e) {
        foto.busy = "";
        foto.error = e.message;
      }
      render();
    },
    fotoHapus() {
      if (!confirm("Hapus foto menu ini?")) return;
      const path = draft.foto?.path;
      draft.foto = null;
      if (store.get().resep.some((r) => r.id === draft.id)) {
        store.set((s) => ({ resep: s.resep.map((r) => (r.id === draft.id ? (({ foto: _f, ...rest }) => rest)(r) : r)) }));
      }
      if (path) hapusFile(path);
      render();
    },

    addRow() {
      draft.rows.push({ nama: "", qty: "", satuan: "pcs", harga: "" });
      render();
      document.querySelector(".resep-row:last-child input")?.focus();
    },
    delRow(el) {
      draft.rows.splice(Number(el.dataset.i), 1);
      if (!draft.rows.length) draft.rows.push({ nama: "", qty: "", satuan: "pcs", harga: "" });
      render();
    },
    aiFill() {
      if (!String(draft.nama).trim()) return toast("Isi nama menu dulu ya", "err");
      const filled = draft.rows.some((r) => r.nama);
      if (filled && !confirm("Daftar bahan sekarang akan diganti hasil AI. Lanjut?")) return;
      const s = store.get();
      return runAI("resep", async () => {
        const r = await ai("generate_recipe", {
          menu: draft.nama,
          keterangan: s.profile?.menu || s.profile?.ide || "",
          porsi: Number(draft.hasil) || 1,
          bahan_ada: s.bahan.map((b) => ({ nama: b.nama, satuan: b.satuan })),
        });
        draft.hasil = r.porsi_hasil || draft.hasil;
        draft.rows = r.bahan.map((x) => {
          const b = findBahan(x.nama);
          return { nama: x.nama, qty: x.qty, satuan: b?.satuan || x.satuan, harga: x.harga_per_satuan, estimasi: true };
        });
        tips = r.tips;
      });
    },
    save() {
      const nama = String(draft.nama).trim();
      if (!nama) return toast("Nama menu wajib diisi", "err");
      const rows = draft.rows.filter((r) => String(r.nama).trim() && Number(r.qty) > 0);
      if (!rows.length) return toast("Tambahkan minimal 1 bahan dengan jumlahnya", "err");
      const s = store.get();
      const bahan = [...s.bahan];
      const items = [];
      for (const row of rows) {
        let b = bahan.find((x) => key(x.nama) === key(row.nama));
        if (!b) {
          b = { id: uid(), nama: String(row.nama).trim(), satuan: row.satuan, harga: Number(row.harga) || 0, stok: 0, min: 0, estimasi: !!row.estimasi, tracked: false };
          bahan.push(b);
        } else if (!b.harga && Number(row.harga)) {
          // Bahan lama belum punya harga: pakai harga dari baris ini (mis. estimasi AI).
          const idx = bahan.indexOf(b);
          bahan[idx] = b = { ...b, harga: Number(row.harga), estimasi: !!row.estimasi };
        }
        const ada = items.find((it) => it.bahanId === b.id);
        if (ada) ada.qty += Number(row.qty);
        else items.push({ bahanId: b.id, qty: Number(row.qty) });
      }
      // Pertahankan field lain resep (mis. foto) — dulu field tambahan hilang setiap resep diedit.
      const lama = s.resep.find((x) => x.id === draft.id) || {};
      const rec = { ...lama, id: draft.id || uid(), nama, harga: Number(draft.harga) || 0, hasil: Math.max(1, Number(draft.hasil) || 1), items };
      if (draft.foto) rec.foto = draft.foto;
      else delete rec.foto;
      const opsiIds = (draft.opsiIds || []).filter((id) => (s.opsi || []).some((g) => g.id === id));
      if (opsiIds.length) rec.opsiIds = opsiIds;
      else delete rec.opsiIds;
      const resepList = s.resep.some((x) => x.id === rec.id) ? s.resep.map((x) => (x.id === rec.id ? rec : x)) : [...s.resep, rec];
      store.set({ bahan, resep: resepList });
      const baru = bahan.length - s.bahan.length;
      toast(`Resep ${nama} disimpan${baru ? ` · ${baru} bahan baru ditambahkan` : ""}`);
      draft = null;
      loadedFor = null;
      // Ada bahan yang stoknya belum diisi? Langsung tawarkan isi stok awal.
      if (bahan.some((b) => !b.tracked) && confirm("Resep tersimpan! Mau isi stok bahannya sekarang? (bisa juga nanti)")) {
        location.hash = "#/stok?tab=bahan&isi=1";
        return;
      }
      go("stok");
    },
    del() {
      if (!confirm(`Hapus resep "${draft.nama}"? Bahan & stoknya tetap ada.`)) return;
      if (draft.foto?.path) hapusFile(draft.foto.path);
      store.set((s) => ({ resep: s.resep.filter((x) => x.id !== draft.id) }));
      draft = null;
      loadedFor = null;
      go("stok");
    },
  },
};
