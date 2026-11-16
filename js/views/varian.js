// Editor grup varian & topping (#/varian?id=<grupId>|new[&preset=pedas|topping|ukuran|manis]).
// Grup dipakai ulang di banyak menu: ubah harga di sini, semua menu ikut.
import { icon } from "../icons.js";
import { store, uid } from "../store.js";
import { esc, rupiah, toast } from "../ui.js";
import { render, go } from "../app.js";
import { head } from "./_shared.js";
import { bahanMap } from "../stok-utils.js";
import { hppPilihan, hppPilihanDi, porsiPilihan, ubahResep, tebakKemasan, MAKS_GRUP, MAKS_PILIHAN } from "../varian.js";

let draft = null;
const rpTanda = (n) => (n < 0 ? "−" : "") + rupiah(Math.abs(n));
const bukaUbah = new Set(); // id pilihan yang bagian "Ubah resep dasar"-nya dibuka
let loadedFor = null;

const param = (k) => new URLSearchParams(location.hash.split("?")[1] || "").get(k);
const key = (n) => String(n || "").trim().toLowerCase();

// Contoh cepat. Bahan dicocokkan dengan nama bahan yang sudah ada (kalau ada).
const PRESET = {
  pedas: { nama: "Level pedas", tipe: "satu", wajib: true, pilihan: [["Tidak pedas", 0], ["Level 1", 0, "cabai", 3], ["Level 3", 0, "cabai", 8], ["Level 5", 1000, "cabai", 15]] },
  topping: { nama: "Topping tambahan", tipe: "banyak", wajib: false, maks: 3, pilihan: [["Telur", 4000, "telur", 1], ["Keju", 3000, "keju", 15], ["Bakso", 4000, "bakso", 3]] },
  ukuran: { nama: "Ukuran", tipe: "satu", wajib: true, pilihan: [["Reguler", 0], ["Jumbo", 3000, null, 0, 1.5]] },
  manis: { nama: "Tingkat manis", tipe: "satu", wajib: false, pilihan: [["Normal", 0], ["Kurang manis", 0], ["Tanpa gula", 0]] },
};

function dariPreset(id) {
  const p = PRESET[id];
  const bahan = store.get().bahan;
  const cari = (kata) => (kata ? bahan.find((b) => key(b.nama).includes(kata)) : null);
  return {
    id: null,
    nama: p.nama,
    tipe: p.tipe,
    wajib: p.wajib,
    maks: p.maks || "",
    pilihan: p.pilihan.map(([nama, harga, kata, qty, porsi]) => {
      const b = cari(kata);
      return { id: uid(), nama, harga, habis: false, items: b ? [{ bahanId: b.id, qty }] : [], ...(porsi ? { porsi, tetap: kemasanDi(store.get(), draftMenuKosong) } : {}) };
    }),
    menu: new Set(),
  };
}

const draftMenuKosong = new Set();

/** Menu yang dicentang di draft (kalau belum ada: semua menu). */
const menuDraft = (s) => {
  const pilih = s.resep.filter((r) => draft?.menu?.has(r.id));
  return pilih.length ? pilih : s.resep;
};
/** Bahan resep dasar dari menu-menu itu (urut nama). */
function bahanDasar(s, menus) {
  const ids = new Set(menus.flatMap((r) => (r.items || []).map((it) => it.bahanId)));
  return s.bahan.filter((b) => ids.has(b.id)).sort((a, b) => a.nama.localeCompare(b.nama, "id"));
}
/** Tebakan awal bahan kemasan (tidak ikut dikali porsi). */
function kemasanDi(s, menuSet) {
  const menus = s.resep.filter((r) => menuSet.has(r.id));
  return bahanDasar(s, menus.length ? menus : s.resep).filter(tebakKemasan).map((b) => b.id);
}

function load() {
  const id = param("id") || "new";
  const preset = param("preset") || "";
  if (loadedFor === id + preset && draft) return;
  loadedFor = id + preset;
  const s = store.get();
  const g = (s.opsi || []).find((x) => x.id === id);
  if (g) {
    draft = {
      ...structuredClone(g),
      maks: g.maks || "",
      menu: new Set(s.resep.filter((r) => (r.opsiIds || []).includes(g.id)).map((r) => r.id)),
    };
  } else if (PRESET[preset]) draft = dariPreset(preset);
  else draft = { id: null, nama: "", tipe: "satu", wajib: true, maks: "", pilihan: [{ id: uid(), nama: "", harga: 0, habis: false, items: [] }], menu: new Set() };
}

/** Pasang daftar grup ke resep (tanpa key kalau kosong, biar data menu lama tidak berubah). */
function setOpsiIds(r, ids) {
  if (ids.length) return same(ids, r.opsiIds) ? r : { ...r, opsiIds: ids };
  if (!("opsiIds" in r)) return r;
  const { opsiIds: _o, ...rest } = r;
  return rest;
}
const same = (a, b) => Array.isArray(b) && a.length === b.length && a.every((x, i) => x === b[i]);

const ada = () => !!draft?.id && (store.get().opsi || []).some((g) => g.id === draft.id);

function pilihanHtml(s, p, i) {
  const map = bahanMap(s.bahan);
  const bahanOpt = (cur) => `<option value="">Pilih bahan…</option>${[...s.bahan]
    .sort((a, b) => a.nama.localeCompare(b.nama, "id"))
    .map((b) => `<option value="${b.id}" ${b.id === cur ? "selected" : ""}>${esc(b.nama)} (${esc(b.satuan)})</option>`)
    .join("")}`;
  const harga = Number(p.harga) || 0;
  const menus = s.resep.filter((r) => draft.menu.has(r.id));
  const dasar = bahanDasar(s, menuDraft(s));
  const porsi = porsiPilihan(p);
  const ubah = ubahResep(p);
  const hpp = ubah && menus.length ? hppPilihanDi(menus[0], p, map) : hppPilihan(p, map);
  const tetap = new Set(p.tetap || []);
  const dasarOpt = (cur) => `<option value="">Bahan di resep…</option>${dasar.map((b) => `<option value="${b.id}" ${b.id === cur ? "selected" : ""}>${esc(b.nama)}</option>`).join("")}`;
  const keOpt = (cur) => `<option value="" ${!cur ? "selected" : ""}>Dihilangkan (tanpa)</option>${[...s.bahan]
    .sort((a, b) => a.nama.localeCompare(b.nama, "id"))
    .map((b) => `<option value="${b.id}" ${b.id === cur ? "selected" : ""}>${esc(b.nama)} (${esc(b.satuan)})</option>`)
    .join("")}`;
  const bukaResep = ubah || bukaUbah.has(p.id);
  return `<div class="card opsi-edit" data-i="${i}">
    <div class="row-between"><b class="mono">#${i + 1}</b><button type="button" class="icon-btn sm" data-action="delPilihan" data-i="${i}" aria-label="Hapus pilihan">${icon("x", 14)}</button></div>
    <div class="row2">
      <label class="field"><span>Nama pilihan</span><input value="${esc(p.nama)}" maxlength="30" placeholder="cth: Keju" data-change="pilihan" data-f="nama" data-i="${i}"></label>
      <label class="field"><span>Harga tambahan (Rp)</span><input type="number" inputmode="numeric" min="0" step="500" value="${esc(p.harga || "")}" placeholder="0 = gratis" data-change="pilihan" data-f="harga" data-i="${i}"></label>
    </div>
    <div class="field"><span>Bahan tambahan per porsi <small class="muted">(opsional, buat HPP & stok)</small></span>
      ${(p.items || [])
        .map(
          (it, j) => `<div class="opsi-bahan">
            <select data-change="pbahan" data-f="bahanId" data-i="${i}" data-j="${j}" aria-label="Bahan">${bahanOpt(it.bahanId)}</select>
            <input type="number" min="0" step="any" value="${esc(it.qty)}" placeholder="Jml" data-change="pbahan" data-f="qty" data-i="${i}" data-j="${j}" aria-label="Jumlah">
            <small class="muted">${esc(map[it.bahanId]?.satuan || "")}</small>
            <button type="button" class="icon-btn sm" data-action="delPBahan" data-i="${i}" data-j="${j}" aria-label="Hapus bahan">${icon("x", 12)}</button>
          </div>`,
        )
        .join("")}
      ${s.bahan.length ? `<button type="button" class="btn ghost sm" data-action="addPBahan" data-i="${i}">+ Bahan</button>` : `<p class="small muted">Belum ada bahan. Bikin resep dulu biar bahannya kecatat.</p>`}
    </div>
    <details class="opsi-ubah" data-id="${p.id}" ${bukaResep ? "open" : ""}>
      <summary>Ubah resep dasar <small class="muted">(porsi jumbo, ganti / tanpa bahan)</small></summary>
      <label class="field"><span>Porsi resep (×)</span><input type="number" inputmode="decimal" min="0.1" max="10" step="0.25" value="${porsi !== 1 ? porsi : ""}" placeholder="1 = sama kayak resep, 1.5 = jumbo" data-change="pilihan" data-f="porsi" data-i="${i}"></label>
      ${
        porsi !== 1 && dasar.length
          ? `<div class="field"><span>Nggak ikut dikali <small class="muted">(kemasan, cup, sendok)</small></span><div class="chips">${dasar
              .map((b) => `<label class="chip"><input type="checkbox" data-change="tetap" data-i="${i}" value="${b.id}" ${tetap.has(b.id) ? "checked" : ""}><span>${esc(b.nama)}</span></label>`)
              .join("")}</div></div>`
          : ""
      }
      <div class="field"><span>Ganti bahan resep</span>
        ${(p.ganti || [])
          .map(
            (x, j) => `<div class="opsi-ganti">
              <select data-change="pganti" data-f="dari" data-i="${i}" data-j="${j}" aria-label="Bahan yang diganti">${dasarOpt(x.dari)}</select>
              <span class="muted">jadi</span>
              <select data-change="pganti" data-f="ke" data-i="${i}" data-j="${j}" aria-label="Diganti dengan">${keOpt(x.ke)}</select>
              <button type="button" class="icon-btn sm" data-action="delGanti" data-i="${i}" data-j="${j}" aria-label="Hapus">${icon("x", 12)}</button>
            </div>`,
          )
          .join("")}
        ${dasar.length ? `<button type="button" class="btn ghost sm" data-action="addGanti" data-i="${i}">+ Ganti bahan</button>` : `<p class="small muted">Centang menu yang pakai grup ini dulu biar bahan resepnya muncul.</p>`}
        <p class="small muted">Contoh: susu sapi jadi susu oat, atau gula dihilangkan buat "tanpa gula". Jumlahnya ngikut resep.</p>
      </div>
      ${ubah && menus.length ? `<div class="breakdown small">${menus.slice(0, 4).map((r) => { const h = hppPilihanDi(r, p, map); return `<div class="row-between"><span>${esc(r.nama)}</span><span class="mono">HPP ${h < 0 ? "−" : "+"}${rupiah(Math.abs(h))}</span></div>`; }).join("")}</div>` : ""}
    </details>
    <div class="row-between small">
      <span class="muted">${ubah ? (menus.length ? `HPP ${hpp < 0 ? "−" : "+"}${rupiah(Math.abs(hpp))} di ${esc(menus[0].nama)} · untung ${rpTanda(harga - hpp)}` : "Ngubah resep dasar") : (p.items || []).some((it) => it.bahanId) ? `HPP tambahan ${rupiah(hpp)} · untung ${rupiah(harga - hpp)}` : harga ? "Tanpa bahan tambahan" : "Gratis, tanpa bahan tambahan"}</span>
      <label class="todo"><input type="checkbox" data-change="pilihan" data-f="habis" data-i="${i}" ${p.habis ? "checked" : ""}><span>Lagi habis</span></label>
    </div>
  </div>`;
}

export const varian = {
  render(s) {
    load();
    const title = ada() ? "Edit Varian" : "Varian Baru";
    return `
      ${head(title, "#/stok?tab=varian")}
      ${
        !ada()
          ? `<section class="card"><p class="small muted" style="margin-top:0">Mulai dari contoh:</p><div class="chips">${Object.entries(PRESET)
              .map(([k, p]) => `<a class="chip-btn ${param("preset") === k ? "on" : ""}" href="#/varian?id=new&preset=${k}">${esc(p.nama)}</a>`)
              .join("")}</div></section>`
          : ""
      }
      <section class="card stack">
        <label class="field"><span>Nama grup</span><input value="${esc(draft.nama)}" maxlength="30" placeholder="cth: Level pedas, Topping, Ukuran" data-change="field" data-f="nama"></label>
        <div class="field"><span>Cara milih</span>
          <div class="seg">
            <label><input type="radio" name="tipe" value="satu" data-change="field" data-f="tipe" ${draft.tipe === "satu" ? "checked" : ""}><span>Pilih satu</span></label>
            <label><input type="radio" name="tipe" value="banyak" data-change="field" data-f="tipe" ${draft.tipe !== "satu" ? "checked" : ""}><span>Boleh lebih dari 1</span></label>
          </div>
        </div>
        <div class="row2">
          <label class="todo"><input type="checkbox" data-change="field" data-f="wajib" ${draft.wajib ? "checked" : ""}><span>Wajib dipilih</span></label>
          ${draft.tipe !== "satu" ? `<label class="field"><span>Maksimal (kosong = bebas)</span><input type="number" min="1" step="1" value="${esc(draft.maks)}" data-change="field" data-f="maks"></label>` : ""}
        </div>
        <p class="small muted">${draft.tipe === "satu" ? "Contoh: level pedas atau ukuran, pelanggan cuma pilih satu." : "Contoh: topping, pelanggan boleh pilih beberapa sekaligus."}</p>
      </section>

      <h2 class="card-title">Pilihan</h2>
      <div class="opsi-edit-list">${draft.pilihan.map((p, i) => pilihanHtml(s, p, i)).join("")}</div>
      ${draft.pilihan.length < MAKS_PILIHAN ? `<button type="button" class="btn ghost block" data-action="addPilihan">+ Pilihan</button>` : ""}

      <section class="card">
        <h2 class="card-title">Dipakai di menu</h2>
        ${
          s.resep.length
            ? `<div class="chips">${s.resep.map((r) => `<label class="chip"><input type="checkbox" data-change="menu" value="${r.id}" ${draft.menu.has(r.id) ? "checked" : ""}><span>${esc(r.nama)}</span></label>`).join("")}</div>
               <p class="small muted">Menu yang dicentang bakal nanya pilihan ini di Kasir & menu QR meja.</p>`
            : `<p class="small muted">Belum ada menu. <a href="#/resep?id=new" class="link">Bikin menu dulu</a>.</p>`
        }
      </section>

      <button class="btn primary block lg" data-action="save">Simpan varian</button>
      ${ada() ? `<button class="btn danger block" data-action="del">Hapus grup ini</button>` : ""}`;
  },

  after(root) {
    root.querySelectorAll("details.opsi-ubah").forEach((el) =>
      el.addEventListener("toggle", () => (el.open ? bukaUbah.add(el.dataset.id) : bukaUbah.delete(el.dataset.id))),
    );
  },

  changes: {
    field(el) {
      const f = el.dataset.f;
      if (f === "wajib") draft.wajib = el.checked;
      else if (f === "tipe") {
        draft.tipe = el.value;
        return render();
      } else if (f === "maks") draft.maks = el.value === "" ? "" : Math.max(1, Math.round(Number(el.value)));
      else draft[f] = el.value;
    },
    pilihan(el) {
      const p = draft.pilihan[Number(el.dataset.i)];
      const f = el.dataset.f;
      if (f === "habis") p.habis = el.checked;
      else if (f === "harga") p.harga = Math.max(0, Math.round(Number(el.value) || 0));
      else if (f === "porsi") {
        const lama = porsiPilihan(p);
        p.porsi = el.value === "" ? 1 : Math.min(10, Math.max(0.1, Number(el.value) || 1));
        // Pertama kali diisi: tebak bahan kemasan yang nggak ikut dikali
        if (lama === 1 && porsiPilihan(p) !== 1 && !(p.tetap || []).length) p.tetap = kemasanDi(store.get(), draft.menu);
        bukaUbah.add(p.id);
      } else p.nama = el.value;
      if (f === "harga" || f === "porsi") render();
    },
    tetap(el) {
      const p = draft.pilihan[Number(el.dataset.i)];
      const set = new Set(p.tetap || []);
      el.checked ? set.add(el.value) : set.delete(el.value);
      p.tetap = [...set];
      render();
    },
    pganti(el) {
      const p = draft.pilihan[Number(el.dataset.i)];
      p.ganti[Number(el.dataset.j)][el.dataset.f] = el.value;
      render();
    },
    pbahan(el) {
      const p = draft.pilihan[Number(el.dataset.i)];
      const it = p.items[Number(el.dataset.j)];
      if (el.dataset.f === "qty") it.qty = el.value === "" ? "" : Number(el.value);
      else it.bahanId = el.value;
      render();
    },
    menu(el) {
      el.checked ? draft.menu.add(el.value) : draft.menu.delete(el.value);
      if (draft.pilihan.some(ubahResep)) render();
    },
  },

  actions: {
    addPilihan() {
      draft.pilihan.push({ id: uid(), nama: "", harga: 0, habis: false, items: [] });
      render();
      document.querySelector(".opsi-edit:last-child input")?.focus();
    },
    delPilihan(el) {
      draft.pilihan.splice(Number(el.dataset.i), 1);
      render();
    },
    addPBahan(el) {
      draft.pilihan[Number(el.dataset.i)].items.push({ bahanId: "", qty: "" });
      render();
    },
    addGanti(el) {
      const p = draft.pilihan[Number(el.dataset.i)];
      p.ganti = [...(p.ganti || []), { dari: "", ke: "" }];
      bukaUbah.add(p.id);
      render();
    },
    delGanti(el) {
      draft.pilihan[Number(el.dataset.i)].ganti.splice(Number(el.dataset.j), 1);
      render();
    },
    delPBahan(el) {
      draft.pilihan[Number(el.dataset.i)].items.splice(Number(el.dataset.j), 1);
      render();
    },
    save() {
      const nama = String(draft.nama).trim();
      if (!nama) return toast("Nama grup wajib diisi", "err");
      const pilihan = draft.pilihan
        .map((p) => ({
          id: p.id || uid(),
          nama: String(p.nama).trim().slice(0, 30),
          harga: Math.max(0, Math.round(Number(p.harga) || 0)),
          items: (p.items || []).filter((it) => it.bahanId && Number(it.qty) > 0).map((it) => ({ bahanId: it.bahanId, qty: Number(it.qty) })),
          ...(p.habis ? { habis: true } : {}),
          ...(porsiPilihan(p) !== 1 ? { porsi: porsiPilihan(p), tetap: [...new Set(p.tetap || [])] } : {}),
          ...((p.ganti || []).some((x) => x.dari && x.dari !== x.ke)
            ? { ganti: [...new Map(p.ganti.filter((x) => x.dari && x.dari !== x.ke).map((x) => [x.dari, { dari: x.dari, ke: x.ke || "" }])).values()] }
            : {}),
        }))
        .filter((p) => p.nama);
      if (!pilihan.length) return toast("Tambahkan minimal 1 pilihan", "err");
      const dobel = pilihan.find((p, i) => pilihan.findIndex((x) => key(x.nama) === key(p.nama)) !== i);
      if (dobel) return toast(`Pilihan "${dobel.nama}" dobel`, "err");
      const s = store.get();
      const tipe = draft.tipe === "satu" ? "satu" : "banyak";
      const maks = tipe === "banyak" && Number(draft.maks) ? Math.min(Number(draft.maks), pilihan.length) : 0;
      const g = { id: draft.id || uid(), nama: nama.slice(0, 30), tipe, wajib: !!draft.wajib, ...(maks ? { maks } : {}), pilihan };
      const opsi = (s.opsi || []).some((x) => x.id === g.id) ? s.opsi.map((x) => (x.id === g.id ? g : x)) : [...(s.opsi || []), g];
      const resep = s.resep.map((r) => {
        const lama = r.opsiIds || [];
        const pakai = draft.menu.has(r.id);
        const ids = pakai ? (lama.includes(g.id) || lama.length >= MAKS_GRUP ? lama : [...lama, g.id]) : lama.filter((id) => id !== g.id);
        return setOpsiIds(r, ids);
      });
      store.set({ opsi, resep });
      toast(`Varian ${g.nama} disimpan · dipakai di ${draft.menu.size} menu`);
      draft = null;
      loadedFor = null;
      location.hash = "#/stok?tab=varian";
    },
    del() {
      const n = draft.menu.size;
      if (!confirm(`Hapus grup "${draft.nama}"?${n ? ` Grup ini dilepas dari ${n} menu.` : ""} Riwayat penjualan tetap aman.`)) return;
      const id = draft.id;
      store.set((s) => ({
        opsi: (s.opsi || []).filter((g) => g.id !== id),
        resep: s.resep.map((r) => ((r.opsiIds || []).includes(id) ? setOpsiIds(r, r.opsiIds.filter((x) => x !== id)) : r)),
      }));
      draft = null;
      loadedFor = null;
      go("stok");
    },
  },
};

/** Daftar grup untuk tab Varian di Stok & Resep. */
export function varianTab(s) {
  const map = bahanMap(s.bahan);
  const list = s.opsi || [];
  const pakai = (g) => s.resep.filter((r) => (r.opsiIds || []).includes(g.id));
  if (!list.length) {
    return `<section class="card empty">
      <div class="empty-icon">${icon("grid", 30)}</div>
      <h3>Belum ada varian & topping</h3>
      <p>Bikin pilihan kayak level pedas, topping, atau ukuran. Harga tambahan & bahannya otomatis masuk ke Kasir, HPP, dan stok.</p>
      <div class="chips center">${Object.entries(PRESET)
        .map(([k, p]) => `<a class="chip-btn" href="#/varian?id=new&preset=${k}">${esc(p.nama)}</a>`)
        .join("")}</div>
      <a href="#/varian?id=new" class="btn primary">+ Bikin dari nol</a>
    </section>`;
  }
  return `${list
    .map((g) => {
      const menu = pakai(g);
      return `<section class="card">
        <div class="row-between"><div><h3 style="margin:0">${esc(g.nama)}</h3><p class="small muted">${g.tipe === "satu" ? "Pilih satu" : g.maks ? `Maks. ${g.maks}` : "Boleh lebih dari 1"} · ${g.wajib ? "wajib" : "opsional"}</p></div><a href="#/varian?id=${g.id}" class="btn ghost sm">Edit</a></div>
        <div class="breakdown small">${g.pilihan
          .map((p) => {
            const h = ubahResep(p) && menu.length ? hppPilihanDi(menu[0], p, map) : hppPilihan(p, map);
            const ket = [porsiPilihan(p) !== 1 ? `${String(porsiPilihan(p)).replace(".", ",")}× porsi` : "", (p.ganti || []).length ? "ganti bahan" : ""].filter(Boolean).join(" · ");
            return `<div class="row-between"><span>${esc(p.nama)}${p.habis ? ` <span class="tag">habis</span>` : ""}${ket ? ` <small class="muted">${ket}</small>` : ""}</span><span class="mono">${p.harga ? `+${rupiah(p.harga)}` : "gratis"}${h ? ` <small class="muted">HPP ${h < 0 ? "−" : ""}${rupiah(Math.abs(h))}</small>` : ""}</span></div>`;
          })
          .join("")}</div>
        <p class="small muted">${menu.length ? `Dipakai di: ${menu.map((r) => esc(r.nama)).join(", ")}` : `<span class="neg">Belum dipasang ke menu mana pun.</span>`}</p>
      </section>`;
    })
    .join("")}
    <a href="#/varian?id=new" class="btn primary block">+ Grup varian baru</a>
    <p class="small muted center">Harga tambahan di GoFood/Grab/Shopee ikut markup saluran.</p>`;
}
