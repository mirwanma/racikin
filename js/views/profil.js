import { icon } from "../icons.js";
import { store } from "../store.js";
import { esc, toast } from "../ui.js";
import { go } from "../app.js";

export const JENIS = ["Makanan berat", "Jajanan / snack", "Minuman / kopi", "Dessert", "Frozen food", "Katering"];
export const KONSEP = ["Gerobak / booth", "Kios / ruko", "Online / dari rumah", "Cloud kitchen"];
const TARGET = ["Mahasiswa", "Pelajar", "Pekerja kantoran", "Keluarga", "Ibu rumah tangga", "Ojol & pekerja lapangan"];
const SKILL = ["Masak", "Sosmed / konten", "Desain", "Jualan / ngomong", "Keuangan", "Belum ada, mau belajar"];
const WAKTU = ["Full-time", "Sampingan"];

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
    return `
      ${first ? `
      <section class="hero">
        <div class="hero-badge">racikin</div>
        <h1>Racik ide jadi <span class="hl">cuan.</span></h1>
        <p>Co-founder AI buat usaha F&B kamu, dari ide, modal, brand, sampai jualan tiap hari. Isi profil bisnis dulu biar semua saran AI pas buat kamu.</p>
      </section>` : `<header class="page-head"><a href="#/" class="back" aria-label="Kembali">${icon("back", 18)}</a><h1>Profil Bisnis</h1></header>`}

      <form data-form="save" class="stack">
        <div class="card stack">
          <h2 class="card-title">Kenalan dulu</h2>
          <label class="field"><span>Nama kamu</span>
            <input name="owner" value="${esc(p.owner)}" placeholder="cth: Raka" required></label>
          <label class="field"><span>Ide usahamu (ceritain aja bebas)</span>
            <textarea name="ide" rows="3" required placeholder="cth: Jualan tahu guyur kuah pedas dekat kampus, porsi mahasiswa">${esc(p.ide)}</textarea></label>
          <label class="field"><span>Nama brand <small>(kosongin kalau belum ada)</small></span>
            <input name="nama" value="${esc(p.nama)}" placeholder="cth: TAHGUY"></label>
        </div>

        <div class="card stack">
          <h2 class="card-title">Jenis & konsep</h2>
          <div class="field"><span>Jenis F&B</span>${chips("jenis", JENIS, p.jenis, "radio")}</div>
          <div class="field"><span>Konsep jualan</span>${chips("konsep", KONSEP, p.konsep, "radio")}</div>
          <label class="field"><span>Menu utama</span>
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

        <div class="card stack">
          <h2 class="card-title">Modal & waktu</h2>
          <div class="row2">
            <label class="field"><span>Modal yang ada (Rp)</span>
              <input name="modal" type="number" inputmode="numeric" min="0" step="50000" value="${esc(p.modal)}" placeholder="5000000" required></label>
            <label class="field"><span>Rencana harga jual/porsi</span>
              <input name="harga" type="number" inputmode="numeric" min="0" step="500" value="${esc(p.harga)}" placeholder="12000"></label>
          </div>
          <div class="field"><span>Waktu yang kamu punya</span>${chips("waktu", WAKTU, p.waktu, "radio")}</div>
          <div class="field"><span>Skill kamu</span>${chips("skill", SKILL, p.skill)}</div>
        </div>

        <button class="btn primary block lg">${first ? "Gas, mulai racik!" : "Simpan profil"}</button>
        ${first ? `<button type="button" class="btn ghost block" data-action="sample">Isi contoh (TAHGUY)</button>
        <a href="#/akun" class="btn ghost block">Sudah punya akun? Masuk</a>` : ""}
      </form>`;
  },

  forms: {
    save(form) {
      const fd = new FormData(form);
      const profile = {
        owner: fd.get("owner").trim(),
        ide: fd.get("ide").trim(),
        nama: fd.get("nama").trim(),
        jenis: fd.get("jenis"),
        konsep: fd.get("konsep"),
        menu: fd.get("menu").trim(),
        kota: fd.get("kota").trim(),
        area: fd.get("area").trim(),
        target: fd.getAll("target"),
        modal: Number(fd.get("modal")) || 0,
        harga: Number(fd.get("harga")) || 0,
        waktu: fd.get("waktu"),
        skill: fd.getAll("skill"),
      };
      const first = !store.get().profile;
      store.set({ profile });
      toast(first ? `Siap, ${profile.owner}! Yuk mulai` : "Profil disimpan");
      go(first ? "" : "bisnis");
    },
  },

  actions: {
    sample() {
      store.set({
        profile: {
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
