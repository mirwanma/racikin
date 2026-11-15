// Layar Dapur (Kitchen Display): Baru -> Dimasak -> Siap. Paling pas di tablet landscape.
import { store } from "../store.js";
import { esc, toast } from "../ui.js";
import { render } from "../app.js";
import { icon } from "../icons.js";
import { head } from "./_shared.js";
import { cloud, role } from "../cloud.js";
import { channelNama } from "../online.js";
import { STATUS, dapurAktif, bisaDapur, daftarTiket, dengar, ubahStatus, toggleItem, menitSejak, bunyi, muatTiket } from "../dapur.js";

let tab = "baru"; // HP: satu kolom per tab
let suara = (() => {
  try {
    return localStorage.getItem("racikin:dapur-suara") !== "0";
  } catch {
    return true;
  }
})();
let lepas = null;
let detik = null;

const KOLOM = ["baru", "dimasak", "siap"];
const bisaAtur = () => role() === "owner" || role() === "manajer";
const jam = (w) => (w || "").slice(11, 16);

function kartu(t, now) {
  const d = t.data || {};
  const m = menitSejak(t.created_at, now);
  const telat = t.status !== "siap" && m >= 20 ? "telat" : t.status !== "siap" && m >= 10 ? "lama" : "";
  const done = new Set(t.done || []);
  const st = STATUS[t.status];
  return `<article class="kt ${t.status} ${telat}" data-id="${esc(t.id)}">
    <header><b class="mono">#${t.no}</b>${d.nama ? `<span class="kt-nama">${esc(d.nama)}</span>` : ""}<span class="kt-min" title="Masuk jam ${esc(jam(d.waktu))}">${m} mnt</span></header>
    <div class="kt-meta small">${d.channel && d.channel !== "toko" ? `<span class="tag">${esc(channelNama(d.channel))}</span>` : `<span class="tag">Toko</span>`} ${esc(jam(d.waktu))}${d.kasir ? ` · ${esc(d.kasir)}` : ""}</div>
    <ul class="kt-items">${(d.items || [])
      .map(
        (it, i) => `<li><button class="kt-item ${done.has(i) ? "ok" : ""}" data-action="item" data-id="${esc(t.id)}" data-i="${i}" ${t.status === "siap" ? "disabled" : ""}>
          <span class="kt-qty">${it.qty}×</span><span>${esc(it.nama)}${it.opsi ? `<small class="kt-opsi">${esc(it.opsi)}</small>` : ""}</span>${done.has(i) ? icon("check", 16) : ""}</button></li>`,
      )
      .join("")}</ul>
    ${d.catatan ? `<p class="kt-note">${esc(d.catatan)}</p>` : ""}
    <div class="kt-actions">
      ${t.status !== "baru" ? `<button class="btn ghost sm" data-action="mundur" data-id="${esc(t.id)}" aria-label="Kembalikan ke status sebelumnya">${icon("back", 14)}</button>` : ""}
      <button class="btn ${t.status === "siap" ? "soft" : "primary"} block" data-action="maju" data-id="${esc(t.id)}">${st.aksi}</button>
    </div>
  </article>`;
}

function papan() {
  const now = Date.now();
  const list = daftarTiket().filter((t) => KOLOM.includes(t.status));
  const per = Object.fromEntries(KOLOM.map((k) => [k, list.filter((t) => t.status === k)]));
  const selesai = daftarTiket().filter((t) => t.status === "diambil").length;
  return `
    <div class="seg seg3 kds-tabs">${KOLOM.map((k) => `<label><input type="radio" name="kt" value="${k}" data-change="tab" ${tab === k ? "checked" : ""}><span>${STATUS[k].nama} <b class="kds-n">${per[k].length}</b></span></label>`).join("")}</div>
    <div class="kds" data-tab="${tab}">
      ${KOLOM.map(
        (k) => `<section class="kds-col ${k} ${tab === k ? "on" : ""}">
          <h2 class="kds-h">${STATUS[k].nama} <span class="kds-n">${per[k].length}</span></h2>
          ${per[k].length ? per[k].map((t) => kartu(t, now)).join("") : `<p class="small muted kds-empty">${k === "baru" ? "Belum ada pesanan baru." : "Kosong."}</p>`}
        </section>`,
      ).join("")}
    </div>
    <p class="small muted center">${selesai} pesanan sudah diambil hari ini · tiket otomatis terhapus setelah 3 hari</p>`;
}

export const dapur = {
  render(s) {
    const back = role() === "dapur" ? "" : role() === "kasir" ? "#/kasir" : "#/bisnis";
    const h = back ? head("Dapur", back) : `<header class="page-head"><h1>Dapur · ${esc(s.brand?.terpilih?.nama || s.profile?.nama || "")}</h1></header>`;
    if (!cloud.user) {
      return `${h}<section class="card empty"><div class="empty-icon">${icon("bowl", 30)}</div><h3>Masuk dulu</h3><p>Mode dapur mengirim pesanan dari HP kasir ke layar dapur lewat internet, jadi perlu akun.</p><a href="#/akun" class="btn primary">Masuk / Daftar</a></section>`;
    }
    if (!dapurAktif(s)) {
      return `${h}<section class="card accent">
        <h2 class="card-title">Mode dapur</h2>
        <p class="small">Untuk usaha yang dapurnya terpisah dari kasir. Setiap pesanan dari Kasir langsung muncul di layar dapur (tablet/HP di dapur), lengkap dengan catatan & nama pembeli. Dapur menandai <b>Dimasak</b> → <b>Siap</b>, kasir langsung dapat kabar.</p>
        <ul class="checks small"><li>Opsional: kasir tetap jalan seperti biasa kalau tidak diaktifkan.</li><li>Bisa pakai HP/tablet pemilik, atau undang akun khusus dengan peran <b>Dapur</b> (hanya bisa buka layar ini).</li><li>Butuh internet di kasir & dapur.</li></ul>
        ${bisaAtur() ? `<button class="btn primary block" data-action="aktifkan">${icon("bowl", 16)} Aktifkan mode dapur</button>` : `<p class="warn-box small">Minta pemilik usaha mengaktifkan mode dapur.</p>`}
      </section>`;
    }
    return `${h}
      <div class="row-between kds-bar">
        <span class="small muted">${bisaDapur() ? "Tersambung · pesanan masuk otomatis" : "Memuat…"}</span>
        <div class="chips">
          <button class="chip-btn ${suara ? "on" : ""}" data-action="suara">${suara ? "Suara nyala" : "Suara mati"}</button>
          <button class="chip-btn" data-action="muat">${icon("sync", 14)} Muat ulang</button>
          ${bisaAtur() ? `<button class="chip-btn" data-action="matikan">Matikan mode dapur</button>` : ""}
        </div>
      </div>
      <div id="kds">${papan()}</div>`;
  },

  after(root) {
    if (!root.querySelector("#kds")) return;
    if (lepas) return; // pendengar & timer cukup dipasang sekali
    lepas = dengar((e) => {
      if (!document.body.contains(root.querySelector("#kds"))) return;
      if (e.type === "insert" && suara) bunyi(2);
      if (e.type === "insert") toast(`Pesanan baru #${e.baru.no}${e.baru.data?.nama ? ` · ${e.baru.data.nama}` : ""}`);
      root.querySelector("#kds").innerHTML = papan();
    });
    clearInterval(detik);
    detik = setInterval(() => {
      const el = document.querySelector("#kds");
      if (!el || !location.hash.startsWith("#/dapur")) {
        clearInterval(detik);
        lepas?.();
        lepas = null;
        return;
      }
      el.innerHTML = papan(); // perbarui hitungan menit
    }, 30000);
  },

  actions: {
    async maju(el) {
      const t = daftarTiket().find((x) => x.id === el.dataset.id);
      if (!t) return;
      await ubahStatus(t.id, STATUS[t.status].next);
    },
    async mundur(el) {
      const t = daftarTiket().find((x) => x.id === el.dataset.id);
      const prev = { dimasak: "baru", siap: "dimasak" }[t?.status];
      if (prev) await ubahStatus(t.id, prev);
    },
    item(el) {
      return toggleItem(el.dataset.id, Number(el.dataset.i));
    },
    suara() {
      suara = !suara;
      try {
        localStorage.setItem("racikin:dapur-suara", suara ? "1" : "0");
      } catch {
        /* abaikan */
      }
      if (suara) bunyi(1);
      render();
    },
    async muat() {
      await muatTiket();
      toast("Dimuat ulang");
    },
    aktifkan() {
      store.set((s) => ({ posSetting: { ...(s.posSetting || {}), dapur: true } }));
      toast("Mode dapur aktif. Pesanan dari Kasir akan muncul di sini.");
      render();
    },
    matikan() {
      if (!confirm("Matikan mode dapur? Kasir berhenti mengirim pesanan ke dapur.")) return;
      store.set((s) => ({ posSetting: { ...(s.posSetting || {}), dapur: false } }));
      render();
    },
  },

  changes: {
    tab(el) {
      tab = el.value;
      document.querySelector(".kds")?.setAttribute("data-tab", tab);
      document.querySelectorAll(".kds-col").forEach((c) => c.classList.toggle("on", c.classList.contains(tab)));
    },
  },
};
