// Promo & voucher (#/promo, editor #/promo?id=<id>|new[&preset=...]). Pemilik/manajer.
import { icon } from "../icons.js";
import { store, uid } from "../store.js";
import { esc, rupiah, toast, todayISO, addDays } from "../ui.js";
import { render } from "../app.js";
import { head } from "./_shared.js";
import { HARI, ketPromo, pemakaian, normKode, berlakuPada } from "../promo.js";
import { activeChannels } from "../online.js";

let draft = null;
let loadedFor = null;
const param = (k) => new URLSearchParams(location.hash.split("?")[1] || "").get(k);
const JENIS = [
  { id: "order", nama: "Diskon order" },
  { id: "menu", nama: "Diskon menu" },
  { id: "bxgy", nama: "Beli X gratis Y" },
];

/** Jam paling sepi (saat buka) dari order 30 hari, buat contoh happy hour. */
function jamSepi(s) {
  const per = {};
  for (const o of s.orders || []) if (o.status !== "batal") per[Number(String(o.waktu).slice(11, 13))] = (per[Number(String(o.waktu).slice(11, 13))] || 0) + 1;
  const total = Object.values(per).reduce((a, n) => a + n, 0);
  const buka = Object.entries(per).filter(([, n]) => total && n >= total * 0.02).sort((a, b) => a[1] - b[1]);
  return buka.length ? Number(buka[0][0]) : 14;
}

const kosong = () => ({ id: null, nama: "", aktif: true, jenis: "order", tipe: "persen", nilai: 10, minBelanja: 0, maks: 0, resepIds: [], beli: 2, gratis: 1, waktu: { dari: "", sampai: "", hari: [], jamDari: "", jamSampai: "" }, saluran: ["toko"], kode: "", kuota: 0 });

function dariPreset(id, s) {
  const d = kosong();
  const minuman = (s.resep || []).filter((r) => /\b(es|teh|kopi|jus|jeruk|minum|susu|air)\b/i.test(r.nama)).map((r) => r.id);
  if (id === "happy") {
    const h = jamSepi(s);
    return { ...d, nama: "Happy hour", tipe: "persen", nilai: 15, maks: 10000, waktu: { ...d.waktu, jamDari: `${String(h).padStart(2, "0")}:00`, jamSampai: `${String(h + 1).padStart(2, "0")}:00` } };
  }
  if (id === "bxgy") return { ...d, nama: "Beli 2 gratis 1", jenis: "bxgy", resepIds: minuman.length ? minuman : (s.resep || []).slice(0, 1).map((r) => r.id) };
  if (id === "min") return { ...d, nama: "Hemat belanja banyak", tipe: "rp", nilai: 5000, minBelanja: 50000 };
  if (id === "hari") return { ...d, nama: "Senin ceria", jenis: "menu", tipe: "persen", nilai: 20, resepIds: (s.resep || []).slice(0, 1).map((r) => r.id), waktu: { ...d.waktu, hari: [1] } };
  if (id === "voucher") return { ...d, nama: "Voucher hemat", tipe: "rp", nilai: 5000, minBelanja: 30000, kode: "HEMAT5", kuota: 50, waktu: { ...d.waktu, dari: todayISO(), sampai: addDays(todayISO(), 30) } };
  return d;
}
const PRESET = [
  ["happy", "Happy hour jam sepi"],
  ["bxgy", "Beli 2 gratis 1"],
  ["min", "Diskon min. belanja"],
  ["hari", "Hari spesial"],
  ["voucher", "Voucher kode"],
];

function load() {
  const id = param("id");
  const key = `${id}|${param("preset") || ""}`;
  if (loadedFor === key && draft) return;
  loadedFor = key;
  const s = store.get();
  const p = (s.promo || []).find((x) => x.id === id);
  draft = p ? structuredClone({ ...kosong(), ...p, waktu: { ...kosong().waktu, ...(p.waktu || {}) } }) : dariPreset(param("preset"), s);
}

function editor(s) {
  load();
  const d = draft;
  const ch = [{ id: "toko", nama: "Toko" }, ...activeChannels(s)];
  const menuChips = `<div class="chips">${(s.resep || []).map((r) => `<label class="chip"><input type="checkbox" data-change="menu" value="${r.id}" ${d.resepIds.includes(r.id) ? "checked" : ""}><span>${esc(r.nama)}</span></label>`).join("") || `<span class="small muted">Belum ada menu.</span>`}</div>`;
  const ada = !!d.id && (s.promo || []).some((x) => x.id === d.id);
  return `
    ${head(ada ? "Edit Promo" : "Promo Baru", "#/promo")}
    ${ada ? "" : `<section class="card"><p class="small muted" style="margin-top:0">Mulai dari contoh:</p><div class="chips">${PRESET.map(([k, n]) => `<a class="chip-btn ${param("preset") === k ? "on" : ""}" href="#/promo?id=new&preset=${k}">${n}</a>`).join("")}</div></section>`}
    <section class="card stack">
      <label class="field"><span>Nama promo</span><input value="${esc(d.nama)}" maxlength="40" placeholder="cth: Happy hour" data-change="f" data-f="nama"></label>
      <div class="seg seg3">${JENIS.map((j) => `<label><input type="radio" name="jenis" value="${j.id}" data-change="f" data-f="jenis" ${d.jenis === j.id ? "checked" : ""}><span>${j.nama}</span></label>`).join("")}</div>
      ${
        d.jenis === "order"
          ? `<div class="row2">
              <label class="field"><span>Potongan</span><select data-change="f" data-f="tipe"><option value="persen" ${d.tipe === "persen" ? "selected" : ""}>Persen (%)</option><option value="rp" ${d.tipe !== "persen" ? "selected" : ""}>Rupiah</option></select></label>
              <label class="field"><span>${d.tipe === "persen" ? "Berapa %" : "Berapa Rp"}</span><input type="number" min="0" step="${d.tipe === "persen" ? 1 : 500}" value="${d.nilai || ""}" data-change="f" data-f="nilai"></label>
            </div>
            <div class="row2">
              <label class="field"><span>Min. belanja (Rp)</span><input type="number" min="0" step="1000" value="${d.minBelanja || ""}" placeholder="0 = tanpa syarat" data-change="f" data-f="minBelanja"></label>
              ${d.tipe === "persen" ? `<label class="field"><span>Maks. potongan (Rp)</span><input type="number" min="0" step="1000" value="${d.maks || ""}" placeholder="0 = tanpa batas" data-change="f" data-f="maks"></label>` : ""}
            </div>`
          : d.jenis === "menu"
            ? `<div class="field"><span>Menu yang ikut promo</span>${menuChips}</div>
               <div class="row2">
                 <label class="field"><span>Bentuk</span><select data-change="f" data-f="tipe"><option value="persen" ${d.tipe === "persen" ? "selected" : ""}>Diskon %</option><option value="rp" ${d.tipe === "rp" ? "selected" : ""}>Potongan Rp per porsi</option><option value="harga" ${d.tipe === "harga" ? "selected" : ""}>Harga spesial per porsi</option></select></label>
                 <label class="field"><span>${d.tipe === "persen" ? "Berapa %" : d.tipe === "harga" ? "Harga jadi (Rp)" : "Potongan (Rp)"}</span><input type="number" min="0" step="${d.tipe === "persen" ? 1 : 500}" value="${d.nilai || ""}" data-change="f" data-f="nilai"></label>
               </div>`
            : `<div class="field"><span>Menu yang ikut (boleh campur, yang termurah yang gratis)</span>${menuChips}</div>
               <div class="row2">
                 <label class="field"><span>Beli</span><input type="number" min="1" step="1" value="${d.beli}" data-change="f" data-f="beli"></label>
                 <label class="field"><span>Gratis</span><input type="number" min="1" step="1" value="${d.gratis}" data-change="f" data-f="gratis"></label>
               </div>`
      }
    </section>
    <section class="card stack">
      <h2 class="card-title" style="margin:0">Kapan berlaku <small class="muted">kosongin = kapan aja</small></h2>
      <div class="row2">
        <label class="field"><span>Mulai tanggal</span><input type="date" value="${d.waktu.dari}" data-change="w" data-f="dari"></label>
        <label class="field"><span>Sampai tanggal</span><input type="date" value="${d.waktu.sampai}" data-change="w" data-f="sampai"></label>
      </div>
      <div class="field"><span>Hari</span><div class="chips">${HARI.map((h, i) => `<label class="chip"><input type="checkbox" data-change="hari" value="${i}" ${d.waktu.hari.includes(i) ? "checked" : ""}><span>${h}</span></label>`).join("")}</div></div>
      <div class="row2">
        <label class="field"><span>Dari jam</span><input type="time" value="${d.waktu.jamDari}" data-change="w" data-f="jamDari"></label>
        <label class="field"><span>Sampai jam</span><input type="time" value="${d.waktu.jamSampai}" data-change="w" data-f="jamSampai"></label>
      </div>
      <div class="field"><span>Berlaku di</span><div class="chips">${ch.map((c) => `<label class="chip"><input type="checkbox" data-change="saluran" value="${c.id}" ${d.saluran.includes(c.id) ? "checked" : ""}><span>${esc(c.nama)}</span></label>`).join("")}</div></div>
    </section>
    <section class="card stack">
      <h2 class="card-title" style="margin:0">Kode voucher <small class="muted">opsional</small></h2>
      <div class="row2">
        <label class="field"><span>Kode</span><input value="${esc(d.kode)}" maxlength="20" placeholder="kosong = otomatis" autocapitalize="characters" data-change="f" data-f="kode"></label>
        <label class="field"><span>Kuota (kali)</span><input type="number" min="0" step="1" value="${d.kuota || ""}" placeholder="0 = tanpa batas" data-change="f" data-f="kuota"></label>
      </div>
      <p class="small muted">${d.kode ? "Promo cuma kepakai kalau kasir masukin kode ini." : "Tanpa kode, promo otomatis kepakai di Kasir kalau syaratnya terpenuhi."} Promo nggak numpuk: tiap order ambil 1 promo yang paling untung buat pelanggan.</p>
      <label class="impor-cek"><input type="checkbox" data-change="f" data-f="aktif" ${d.aktif ? "checked" : ""}><span>Aktif</span></label>
    </section>
    <section class="card accent"><p class="small" style="margin:0"><b>Pelanggan lihatnya:</b> ${esc(ketPromo(d, s))}</p></section>
    <button class="btn primary block lg" data-action="simpan">Simpan promo</button>
    ${ada ? `<button class="btn danger block" data-action="hapus">Hapus promo</button>` : ""}`;
}

function daftar(s) {
  const list = s.promo || [];
  const pakai = pemakaian(s);
  const now = (() => {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  })();
  if (!list.length) {
    return `${head("Promo & Voucher", "#/bisnis")}
      <section class="card empty"><div class="empty-icon">${icon("spark", 30)}</div><h3>Belum ada promo</h3>
        <p>Bikin promo otomatis (happy hour, beli 2 gratis 1, diskon min. belanja) atau voucher pakai kode. Kasir langsung ngitung potongannya.</p>
        <div class="chips center">${PRESET.map(([k, n]) => `<a class="chip-btn" href="#/promo?id=new&preset=${k}">${n}</a>`).join("")}</div>
        <a href="#/promo?id=new" class="btn primary">+ Bikin dari nol</a>
      </section>`;
  }
  return `${head("Promo & Voucher", "#/bisnis")}
    ${list
      .map((p) => {
        const u = pakai[p.id] || { n: 0, rp: 0, omzet: 0 };
        const jalan = berlakuPada(p, now, "toko");
        return `<section class="card promo-card ${p.aktif ? "" : "off"}">
          <div class="row-between"><div><h3 style="margin:0">${esc(p.nama)}</h3><p class="small muted">${esc(ketPromo(p, s))}</p></div>
            <label class="switch" title="Aktif"><input type="checkbox" data-change="toggle" data-id="${p.id}" ${p.aktif ? "checked" : ""}><span></span></label></div>
          <div class="chips">${p.kode ? `<span class="tag mono">${esc(p.kode)}${Number(p.kuota) ? ` · ${u.n}/${p.kuota}` : ""}</span>` : `<span class="tag">otomatis</span>`}${p.aktif ? (jalan ? `<span class="tag pos">lagi jalan</span>` : "") : `<span class="tag">nonaktif</span>`}</div>
          <div class="stats3"><div><small>Dipakai</small><b>${u.n}×</b></div><div><small>Total potongan</small><b class="neg">${rupiah(u.rp)}</b></div><div><small>Omzet order</small><b>${rupiah(u.omzet)}</b></div></div>
          <a href="#/promo?id=${p.id}" class="btn ghost sm">Edit</a>
        </section>`;
      })
      .join("")}
    <a href="#/promo?id=new" class="btn primary block">+ Promo baru</a>
    <p class="small muted center">Potongan promo mengurangi omzet (sudah termasuk di Kas & laporan). Promo nggak numpuk.</p>`;
}

export const promo = {
  render(s) {
    return param("id") ? editor(s) : daftar(s);
  },
  changes: {
    f(el) {
      const k = el.dataset.f;
      if (k === "aktif") draft.aktif = el.checked;
      else if (["nilai", "minBelanja", "maks", "beli", "gratis", "kuota"].includes(k)) draft[k] = el.value === "" ? 0 : Math.max(0, Number(el.value) || 0);
      else if (k === "kode") draft.kode = normKode(el.value);
      else draft[k] = el.value;
      if (k === "jenis") draft.tipe = el.value === "menu" ? "persen" : draft.tipe === "harga" ? "persen" : draft.tipe;
      render();
    },
    w(el) {
      draft.waktu[el.dataset.f] = el.value;
      render();
    },
    hari(el) {
      const h = Number(el.value);
      draft.waktu.hari = el.checked ? [...new Set([...draft.waktu.hari, h])] : draft.waktu.hari.filter((x) => x !== h);
      render();
    },
    menu(el) {
      draft.resepIds = el.checked ? [...new Set([...draft.resepIds, el.value])] : draft.resepIds.filter((x) => x !== el.value);
      render();
    },
    saluran(el) {
      draft.saluran = el.checked ? [...new Set([...draft.saluran, el.value])] : draft.saluran.filter((x) => x !== el.value);
      render();
    },
    toggle(el) {
      store.set((s) => ({ promo: s.promo.map((p) => (p.id === el.dataset.id ? { ...p, aktif: el.checked } : p)) }));
      toast(el.checked ? "Promo diaktifkan" : "Promo dinonaktifkan");
    },
  },
  actions: {
    simpan() {
      const d = draft;
      const s = store.get();
      const nama = String(d.nama).trim();
      if (!nama) return toast("Nama promo wajib diisi", "err");
      if (d.jenis !== "bxgy" && !(Number(d.nilai) > 0)) return toast("Isi besar potongannya dulu", "err");
      if (d.jenis === "order" && d.tipe === "persen" && d.nilai > 100) return toast("Persen maksimal 100", "err");
      if (d.jenis === "menu" && d.tipe === "persen" && d.nilai > 100) return toast("Persen maksimal 100", "err");
      if (d.jenis !== "order" && !d.resepIds.length) return toast("Pilih menu yang ikut promo", "err");
      if (!d.saluran.length) return toast("Pilih minimal 1 saluran", "err");
      if (d.waktu.dari && d.waktu.sampai && d.waktu.dari > d.waktu.sampai) return toast("Tanggal mulai harus sebelum tanggal selesai", "err");
      const kode = normKode(d.kode);
      if (kode && (s.promo || []).some((p) => p.id !== d.id && normKode(p.kode) === kode)) return toast(`Kode ${kode} sudah dipakai promo lain`, "err");
      const w = Object.fromEntries(Object.entries(d.waktu).filter(([, v]) => (Array.isArray(v) ? v.length : v)));
      const rec = {
        id: d.id || uid(),
        nama: nama.slice(0, 40),
        aktif: !!d.aktif,
        jenis: d.jenis,
        ...(d.jenis !== "bxgy" ? { tipe: d.tipe, nilai: Math.round(Number(d.nilai) || 0) } : { beli: Math.max(1, Math.round(d.beli)), gratis: Math.max(1, Math.round(d.gratis)) }),
        ...(d.jenis === "order" ? { minBelanja: Math.round(Number(d.minBelanja) || 0), ...(d.tipe === "persen" && Number(d.maks) ? { maks: Math.round(Number(d.maks)) } : {}) } : { resepIds: d.resepIds }),
        waktu: w,
        saluran: d.saluran,
        ...(kode ? { kode, ...(Number(d.kuota) ? { kuota: Math.round(Number(d.kuota)) } : {}) } : {}),
        dibuat: (s.promo || []).find((p) => p.id === d.id)?.dibuat || todayISO(),
      };
      const list = (s.promo || []).some((p) => p.id === rec.id) ? s.promo.map((p) => (p.id === rec.id ? rec : p)) : [...(s.promo || []), rec];
      store.set({ promo: list });
      toast(`Promo ${rec.nama} disimpan`);
      draft = null;
      loadedFor = null;
      location.hash = "#/promo";
    },
    hapus() {
      if (!confirm(`Hapus promo "${draft.nama}"? Riwayat pemakaiannya di order lama tetap tercatat.`)) return;
      const id = draft.id;
      store.set((s) => ({ promo: (s.promo || []).filter((p) => p.id !== id) }));
      draft = null;
      loadedFor = null;
      location.hash = "#/promo";
    },
  },
};
