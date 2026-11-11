import { store, uid } from "../store.js";
import { esc, rupiah, toast, list } from "../ui.js";
import { ai } from "../ai.js";
import { render, go } from "../app.js";
import { busy, runAI, head } from "./_shared.js";
import { SATUAN, fmtQty } from "../stok-utils.js";

// Draft resep yang sedang diedit (belum disimpan).
let draft = null;
let loadedFor = null;
let tips = null;

const routeId = () => new URLSearchParams(location.hash.split("?")[1] || "").get("id") || "new";
const key = (n) => String(n || "").trim().toLowerCase();
const findBahan = (nama) => store.get().bahan.find((b) => key(b.nama) === key(nama));

function load() {
  const id = routeId();
  if (loadedFor === id && draft) return;
  loadedFor = id;
  tips = null;
  const s = store.get();
  const r = s.resep.find((x) => x.id === id);
  if (r) {
    const map = Object.fromEntries(s.bahan.map((b) => [b.id, b]));
    draft = {
      id: r.id,
      nama: r.nama,
      harga: r.harga,
      hasil: r.hasil || 1,
      rows: r.items.map((it) => ({ nama: map[it.bahanId]?.nama || "", qty: it.qty, satuan: map[it.bahanId]?.satuan || "pcs", harga: "" })),
    };
  } else {
    draft = { id: null, nama: "", harga: s.profile?.harga || "", hasil: 1, rows: [{ nama: "", qty: "", satuan: "pcs", harga: "" }] };
  }
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
    ${c.margin && c.margin < 30 ? `<p class="small muted">💡 Margin di bawah 30% biasanya terlalu tipis untuk F&B. Coba naikkan harga atau kurangi bahan termahal.</p>` : ""}
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
    <button type="button" class="icon-btn sm" data-action="delRow" data-i="${i}" aria-label="Hapus baris">✕</button>
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
      ${head(draft.id ? "Edit Resep" : "Resep Baru", "#/stok")}
      <datalist id="bahan-list">${s.bahan.map((b) => `<option value="${esc(b.nama)}">`).join("")}</datalist>

      <section class="card stack">
        <label class="field"><span>Nama menu</span><input value="${esc(draft.nama)}" data-change="field" data-f="nama" placeholder="cth: Tahu Guyur Original"></label>
        <div class="row2">
          <label class="field"><span>Harga jual/porsi</span><input type="number" min="0" value="${esc(draft.harga)}" data-change="field" data-f="harga"></label>
          <label class="field"><span>Resep ini jadi berapa porsi?</span><input type="number" min="1" step="1" value="${esc(draft.hasil)}" data-change="field" data-f="hasil"></label>
        </div>
        <button type="button" class="btn soft" data-action="aiFill">✨ Isi bahan & takaran pakai AI</button>
      </section>

      <section class="card">
        <h2 class="card-title">🧂 Bahan (untuk ${esc(draft.hasil)} porsi)</h2>
        <div class="resep-rows">${draft.rows.map(rowHtml).join("")}</div>
        <button type="button" class="btn ghost block" data-action="addRow">+ Bahan</button>
      </section>

      <section class="card accent" id="hpp-box">${preview()}</section>
      ${tips ? `<section class="card"><h2 class="card-title">💡 Tips dari AI</h2>${list(tips, "checks")}<p class="muted small">Harga bahan dari AI adalah estimasi. Update pakai harga belanja aslimu di tab Bahan.</p></section>` : ""}

      <button class="btn primary block lg" data-action="save">Simpan resep</button>
      ${draft.id ? `<button class="btn danger block" data-action="del">Hapus resep</button>` : ""}`;
  },

  changes: {
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
      const rec = { id: draft.id || uid(), nama, harga: Number(draft.harga) || 0, hasil: Math.max(1, Number(draft.hasil) || 1), items };
      const resepList = draft.id ? s.resep.map((x) => (x.id === draft.id ? rec : x)) : [...s.resep, rec];
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
      store.set((s) => ({ resep: s.resep.filter((x) => x.id !== draft.id) }));
      draft = null;
      loadedFor = null;
      go("stok");
    },
  },
};
