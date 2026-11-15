import { icon } from "../icons.js";
import { store } from "../store.js";
import { esc, toast } from "../ui.js";
import { go } from "../app.js";
import { muatDummy } from "./_dummy.js";
import { TAHAP, LAMA, SALURAN, MASALAH, MAKS_MASALAH } from "../tahap.js";

export const JENIS = ["Makanan berat", "Jajanan / snack", "Minuman / kopi", "Dessert", "Frozen food", "Katering"];
export const KONSEP = ["Gerobak / booth", "Kios / ruko", "Online / dari rumah", "Cloud kitchen"];
const TARGET = ["Mahasiswa", "Pelajar", "Pekerja kantoran", "Keluarga", "Ibu rumah tangga", "Ojol & pekerja lapangan"];
const SKILL = ["Masak", "Sosmed / konten", "Desain", "Jualan / ngomong", "Keuangan", "Belum ada, mau belajar"];
const WAKTU = ["Full-time", "Sampingan"];

/** Tampilkan bagian sesuai tahap; input di bagian yang disembunyikan dinonaktifkan (tidak divalidasi & tidak ikut tersimpan). */
function terapkanTahap(form) {
  const t = form.querySelector("input[name=tahap]:checked")?.value || "ide";
  form.dataset.tahap = t;
  for (const el of form.querySelectorAll("[data-only]")) {
    const on = el.dataset.only === t;
    el.hidden = !on;
    for (const inp of el.querySelectorAll("input, textarea, select")) inp.disabled = !on;
  }
}

const chips = (name, options, selected = [], type = "checkbox") =>
  `<div class="chips">${options
    .map(
      (o) => `<label class="chip"><input type="${type}" name="${name}" value="${esc(o)}" ${
        (Array.isArray(selected) ? selected.includes(o) : selected === o) ? "checked" : ""
      } ${type === "radio" ? "required" : ""}><span>${esc(o)}</span></label>`,
    )
    .join("")}</div>`;

export const profil = {
  render({ profile }) {
    const p = profile || {};
    const first = !profile;
    const tahap = p.tahap === "jalan" ? "jalan" : "ide";
    const lengkapi = location.hash.includes("lengkapi=1");
    return `
      ${first ? `
      <section class="hero">
        <div class="hero-badge">racikin</div>
        <h1>Racik ide jadi <span class="hl">cuan.</span></h1>
        <p>Co-founder AI buat usaha F&B kamu, dari yang baru punya ide sampai yang udah jalan bertahun-tahun. Isi profil bisnis dulu biar semua saran AI pas buat kamu.</p>
      </section>` : `<header class="page-head"><a href="#/" class="back" aria-label="Kembali">${icon("back", 18)}</a><h1>Profil Bisnis</h1></header>`}

      <form data-form="save" class="stack" data-tahap="${tahap}">
        ${lengkapi ? `<p class="warn-box small">Lengkapi kondisi usahamu sekarang biar langkah di Beranda pas.</p>` : ""}
        <div class="card stack">
          <h2 class="card-title">Usahamu sekarang di tahap mana?</h2>
          <div class="tahap-pilih">${TAHAP.map(
            (t) => `<label class="tahap-opt"><input type="radio" name="tahap" value="${t.id}" data-change="tahap" ${tahap === t.id ? "checked" : ""}><span><b>${t.nama}</b><small>${t.sub}</small></span></label>`,
          ).join("")}</div>
        </div>

        <div class="card stack">
          <h2 class="card-title">Kenalan dulu</h2>
          <label class="field"><span>Nama kamu</span>
            <input name="owner" value="${esc(p.owner)}" placeholder="cth: Raka" required></label>
          <label class="field" data-only="ide" ${tahap === "ide" ? "" : "hidden"}><span>Ide usahamu (ceritain aja bebas)</span>
            <textarea name="ide" rows="3" required placeholder="cth: Jualan tahu guyur kuah pedas dekat kampus, porsi mahasiswa">${esc(p.ide)}</textarea></label>
          <label class="field" data-only="jalan" ${tahap === "jalan" ? "" : "hidden"}><span>Ceritain usahamu singkat</span>
            <textarea name="ide" rows="3" required placeholder="cth: Warung bakso di depan pasar, rame pas makan siang, jualan juga di GoFood">${esc(p.ide)}</textarea></label>
          <label class="field" data-only="ide" ${tahap === "ide" ? "" : "hidden"}><span>Nama brand <small>(kosongin kalau belum ada)</small></span>
            <input name="nama" value="${esc(p.nama)}" placeholder="cth: TAHGUY"></label>
          <label class="field" data-only="jalan" ${tahap === "jalan" ? "" : "hidden"}><span>Nama usaha</span>
            <input name="nama" value="${esc(p.nama)}" placeholder="cth: Bakso Pak Kumis" required></label>
        </div>

        <div class="card stack" data-only="jalan" ${tahap === "jalan" ? "" : "hidden"}>
          <h2 class="card-title">Kondisi usaha sekarang</h2>
          <div class="field"><span>Udah jalan berapa lama?</span>${chips("lama", LAMA, p.lama, "radio")}</div>
          <div class="row2">
            <label class="field"><span>Omzet rata-rata/hari (Rp) <small>kira-kira</small></span>
              <input name="omzetHarian" type="number" inputmode="numeric" min="0" step="50000" value="${esc(p.omzetHarian || "")}" placeholder="1500000"></label>
            <label class="field"><span>Karyawan <small>(selain kamu)</small></span>
              <input name="karyawan" type="number" inputmode="numeric" min="0" step="1" value="${esc(p.karyawan ?? "")}" placeholder="0"></label>
          </div>
          <label class="field"><span>Harga rata-rata per porsi</span>
            <input name="harga" type="number" inputmode="numeric" min="0" step="500" value="${esc(p.harga || "")}" placeholder="15000"></label>
          <div class="field"><span>Jualan lewat mana aja?</span>${chips("saluran", SALURAN, p.saluran || [])}</div>
          <div class="field"><span>Masalah yang paling mau diberesin <small>(pilih maks. ${MAKS_MASALAH})</small></span>
            <div class="chips">${MASALAH.map((m) => `<label class="chip"><input type="checkbox" name="masalah" value="${m.id}" data-change="masalah" ${(p.masalah || []).includes(m.id) ? "checked" : ""}><span>${esc(m.nama)}</span></label>`).join("")}</div>
          </div>
        </div>

        <div class="card stack">
          <h2 class="card-title">Jenis & konsep</h2>
          <div class="field"><span>Jenis F&B</span>${chips("jenis", JENIS, p.jenis, "radio")}</div>
          <div class="field"><span>Konsep jualan</span>${chips("konsep", KONSEP, p.konsep, "radio")}</div>
          <label class="field"><span>${tahap === "jalan" ? "Menu andalan" : "Menu utama"}</span>
            <input name="menu" value="${esc(p.menu)}" placeholder="cth: tahu guyur original, pedas, topping telur"></label>
        </div>

        <div class="card stack">
          <h2 class="card-title">Lokasi & pasar</h2>
          <div class="row2">
            <label class="field"><span>Kota</span><input name="kota" value="${esc(p.kota)}" placeholder="cth: Cimahi" required></label>
            <label class="field"><span>Dekat mana?</span><input name="area" value="${esc(p.area)}" placeholder="cth: Kampus Unjani"></label>
          </div>
          <div class="field"><span>Target pembeli</span>${chips("target", TARGET, p.target)}</div>
        </div>

        <div class="card stack" data-only="ide" ${tahap === "ide" ? "" : "hidden"}>
          <h2 class="card-title">Modal & waktu</h2>
          <div class="row2">
            <label class="field"><span>Modal yang ada (Rp)</span>
              <input name="modal" type="number" inputmode="numeric" min="0" step="50000" value="${esc(p.modal)}" placeholder="5000000" required></label>
            <label class="field"><span>Rencana harga jual/porsi</span>
              <input name="harga" type="number" inputmode="numeric" min="0" step="500" value="${esc(p.harga)}" placeholder="12000"></label>
          </div>
        </div>

        <div class="card stack">
          <h2 class="card-title">Kamu</h2>
          <div class="field"><span>Waktu yang kamu punya</span>${chips("waktu", WAKTU, p.waktu, "radio")}</div>
          <div class="field"><span>Skill kamu</span>${chips("skill", SKILL, p.skill)}</div>
        </div>

        <button class="btn primary block lg">${first ? "Gas, mulai racik!" : "Simpan profil"}</button>
        ${first ? `<button type="button" class="btn ghost block" data-action="sample">Isi contoh (TAHGUY)</button>
        <button type="button" class="btn soft block" data-action="dummy">Coba demo lengkap (data 2 bulan)</button>
        <a href="#/akun" class="btn ghost block">Sudah punya akun? Masuk</a>` : ""}
      </form>`;
  },

  after(root) {
    const form = root.querySelector("form[data-form=save]");
    if (form) terapkanTahap(form);
  },

  changes: {
    tahap(el) {
      terapkanTahap(el.form);
    },
    masalah(el) {
      const dipilih = el.form.querySelectorAll("input[name=masalah]:checked");
      if (dipilih.length > MAKS_MASALAH) {
        el.checked = false;
        toast(`Pilih maksimal ${MAKS_MASALAH} dulu ya, biar fokus`, "err");
      }
    },
  },

  forms: {
    save(form) {
      const fd = new FormData(form);
      const tahap = fd.get("tahap") === "jalan" ? "jalan" : "ide";
      const lama = store.get().profile || {};
      const profile = {
        tahap,
        owner: fd.get("owner").trim(),
        ide: fd.get("ide").trim(),
        nama: fd.get("nama").trim(),
        jenis: fd.get("jenis"),
        konsep: fd.get("konsep"),
        menu: fd.get("menu").trim(),
        kota: fd.get("kota").trim(),
        area: fd.get("area").trim(),
        target: fd.getAll("target"),
        modal: tahap === "ide" ? Number(fd.get("modal")) || 0 : Number(lama.modal) || 0,
        harga: Number(fd.get("harga")) || 0,
        waktu: fd.get("waktu"),
        skill: fd.getAll("skill"),
      };
      if (tahap === "jalan") {
        Object.assign(profile, {
          lama: fd.get("lama") || "",
          omzetHarian: Number(fd.get("omzetHarian")) || 0,
          karyawan: Number(fd.get("karyawan")) || 0,
          saluran: fd.getAll("saluran"),
          masalah: fd.getAll("masalah").slice(0, MAKS_MASALAH),
        });
      } else {
        // Data "udah jalan" tetap disimpan kalau sempat diisi (bisa balik ke tahap itu tanpa isi ulang).
        for (const k of ["lama", "omzetHarian", "karyawan", "saluran", "masalah", "tolakNaik"]) if (lama[k] !== undefined) profile[k] = lama[k];
      }
      const first = !store.get().profile;
      store.set({ profile });
      toast(first ? `Siap, ${profile.owner}! Yuk mulai` : "Profil disimpan");
      if (location.hash.includes("lengkapi=1")) history.replaceState(null, "", "#/profil");
      go(first || tahap === "jalan" ? "" : "bisnis");
    },
  },

  actions: {
    dummy: () => muatDummy(),
    sample() {
      store.set({
        profile: {
          tahap: "ide",
          owner: "Raka",
          ide: "Tahu guyur kuah kaldu pedas dengan topping custom, porsi pas buat mahasiswa, jualan sore sampai malam",
          nama: "TAHGUY",
          jenis: "Jajanan / snack",
          konsep: "Gerobak / booth",
          menu: "Tahu guyur original, pedas level 1-5, topping telur & bakso",
          kota: "Cimahi",
          area: "Kampus Unjani",
          target: ["Mahasiswa", "Pekerja kantoran"],
          modal: 8_000_000,
          harga: 12_000,
          waktu: "Full-time",
          skill: ["Masak", "Sosmed / konten"],
        },
      });
      toast("Profil contoh TAHGUY dimuat");
      go("");
    },
  },
};
