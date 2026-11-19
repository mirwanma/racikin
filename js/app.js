import { store } from "./store.js";
import { $, esc, toast, isWide, WIDE_QUERY } from "./ui.js";
import { home } from "./views/home.js";
import { profil } from "./views/profil.js";
import { bisnis } from "./views/bisnis.js";
import { ide } from "./views/ide.js";
import { rab } from "./views/rab.js";
import { brand } from "./views/brand.js";
import { aktivasi } from "./views/aktivasi.js";
import { kas } from "./views/kas.js";
import { konten } from "./views/konten.js";
import { mentor } from "./views/mentor.js";
import { setelan } from "./views/setelan.js";
import { akun } from "./views/akun.js";
import { stok } from "./views/stok.js";
import { resep } from "./views/resep.js";
import { pelanggan } from "./views/pelanggan.js";
import { kartu } from "./views/kartu.js";
import { studio } from "./views/studio.js";
import { kasir } from "./views/kasir.js";
import { online } from "./views/online.js";
import { tim, gabung } from "./views/tim.js";
import { notif } from "./views/notif.js";
import { shift } from "./views/shift.js";
import { laporan } from "./views/laporan.js";
import { belanja } from "./views/belanja.js";
import { dapur } from "./views/dapur.js";
import { meja } from "./views/meja.js";
import { pesan } from "./views/pesan.js";
import { varian } from "./views/varian.js";
import { impor } from "./views/impor.js";
import { sehat } from "./views/sehat.js";
import { izin } from "./views/izin.js";
import { imporJual } from "./views/imporjual.js";
import { promo } from "./views/promo.js";
import { wa } from "./views/wa.js";
import { paket } from "./views/paket.js";
import { initPaket, onPaket } from "./paket.js";
import { admin, isAdminMode, adminDiketahui, cekAdmin, tabAdmin } from "./views/admin.js";
import { initMeja } from "./meja.js";
import { initCloud, onCloudChange, cloud, role } from "./cloud.js";
import { icon } from "./icons.js";

const routes = { "": home, profil, bisnis, ide, rab, brand, aktivasi, kas, konten, mentor, setelan, akun, stok, resep, pelanggan, kartu, studio, kasir, online, tim, gabung, notif, shift, laporan, belanja, dapur, meja, varian, impor, sehat, izin, "impor-jual": imporJual, promo, wa, admin, paket, m: pesan };
const tabOf = { "": "", bisnis: "bisnis", ide: "bisnis", rab: "bisnis", brand: "bisnis", aktivasi: "bisnis", kas: "kas", stok: "bisnis", resep: "bisnis", pelanggan: "bisnis", studio: "bisnis", konten: "konten", kasir: "kasir", online: "kasir", tim: "bisnis", notif: "-", shift: "kasir", laporan: "kas", belanja: "bisnis", dapur: "kasir", meja: "bisnis", varian: "bisnis", impor: "bisnis", sehat: "bisnis", izin: "bisnis", "impor-jual": "bisnis", promo: "bisnis", wa: "bisnis", admin: "-", paket: "-", m: "-" };
// Kasir hanya melihat halaman jualan, pelanggan, dan stok bahan.
const KASIR_ROUTES = new Set(["kasir", "pelanggan", "stok", "akun", "setelan", "kartu", "tim", "gabung", "notif", "shift", "dapur", "m"]);
const tabOfKasir = { kasir: "kasir", pelanggan: "pelanggan", stok: "stok", akun: "akun", setelan: "akun", tim: "akun", notif: "akun", shift: "kasir", dapur: "dapur" };
// Akun dapur hanya membuka layar dapur & akun.
const DAPUR_ROUTES = new Set(["dapur", "akun", "setelan", "tim", "gabung", "notif", "m"]);
// Mode admin platform: hanya dashboard admin & akun (menu usaha disembunyikan).
const ADMIN_ROUTES = new Set(["admin", "akun"]);
const FREE_ROUTES = ["profil", "setelan", "akun", "kartu", "gabung", "tim", "notif", "m", "admin", "paket"];

// Halaman yang di layar lebar disusun dua kolom (kartu mengalir kiri-kanan).
const COLS = new Set(["home", "bisnis", "kas", "laporan", "pelanggan", "stok", "belanja", "shift", "tim", "setelan", "akun", "notif", "ide", "rab", "brand", "aktivasi", "konten", "online", "studio", "izin"]);
const view = $("#view");
let current = home;

function routeName() {
  return location.hash.replace(/^#\/?/, "").split("?")[0].split("/")[0];
}

export function render() {
  const name = routeName();
  const peran = role();
  document.body.dataset.role = peran;
  // Admin platform: cek ke server sekali setelah login, lalu render ulang kalau ternyata admin.
  if (cloud.user && adminDiketahui() === null) cekAdmin().then((ok) => ok && render()).catch(() => {});
  const adminMode = isAdminMode();
  document.body.dataset.admin = adminMode ? "1" : "";
  if (adminMode && !ADMIN_ROUTES.has(name)) {
    location.replace("#/admin");
    return;
  }
  if (peran === "kasir" && !KASIR_ROUTES.has(name)) {
    location.replace("#/kasir");
    return;
  }
  if (peran === "dapur" && !DAPUR_ROUTES.has(name)) {
    location.replace("#/dapur");
    return;
  }
  if (!adminMode && !store.get().profile && !FREE_ROUTES.includes(name)) {
    if (peran !== "owner") {
      // Anggota tim: data usaha pemilik sedang diambil dari cloud.
      current = { render: () => waitingTeam() };
      view.innerHTML = waitingTeam();
      document.body.dataset.route = name || "home";
      return;
    }
    // Wajib isi profil dulu sebelum pakai fitur lain
    location.replace("#/profil");
    return;
  }
  current = routes[name] || home;
  view.classList.toggle("cols", COLS.has(name || "home"));
  view.innerHTML = current.render(store.get());
  current.after?.(view);
  const tab = adminMode ? (name === "admin" ? "admin-" + tabAdmin() : "akun") : peran === "kasir" || peran === "dapur" ? tabOfKasir[name] : tabOf[name];
  document.querySelectorAll(".tabbar a").forEach((a) => a.classList.toggle("active", a.dataset.tab === (tab ?? "")));
  document.body.dataset.route = name || "home";
}

function waitingTeam() {
  const t = cloud.team;
  return `<section class="card empty">
    <div class="empty-icon">${icon("sync", 30)}</div>
    <h3>Lagi ambil data ${t?.bisnis ? esc(t.bisnis) : "usaha"}…</h3>
    <p>${t?.pro === false ? "Paket Pro usaha ini sudah habis, jadi akun tim sementara nggak bisa dipakai. Minta pemilik memperpanjang di halaman Paket." : cloud.status === "error" ? esc(cloud.error) : cloud.status === "offline" ? "Kamu lagi offline. Data muncul begitu tersambung internet." : "Kamu anggota tim. Data menu, stok & pelanggan diambil dari akun pemilik."}</p>
    <a href="#/tim" class="btn ghost">Info tim</a>
  </section>`;
}

export function go(path) {
  if (location.hash === "#/" + path) render();
  else location.hash = "#/" + path;
}

async function dispatch(kind, key, el, ev) {
  const fn = current[kind]?.[key];
  if (!fn) return;
  try {
    await fn(el, ev);
  } catch (err) {
    console.error(err);
    toast(err.message || "Ada yang error", "err");
    render();
  }
}

view.addEventListener("click", (ev) => {
  const el = ev.target.closest("[data-action]");
  if (el) dispatch("actions", el.dataset.action, el, ev);
});
view.addEventListener("change", (ev) => {
  const el = ev.target.closest("[data-change]");
  if (el) dispatch("changes", el.dataset.change, el, ev);
});
view.addEventListener("submit", (ev) => {
  const el = ev.target.closest("form[data-form]");
  if (!el) return;
  ev.preventDefault();
  dispatch("forms", el.dataset.form, el, ev);
});

window.addEventListener("hashchange", () => {
  render();
  window.scrollTo(0, 0);
});

// Render ulang saat status akun/sinkron berubah atau data cloud masuk,
// tapi jangan saat user sedang mengetik (biar input tidak hilang).
const typing = () => ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName);
let pending = false;
function softRender() {
  if (typing()) {
    if (!pending) {
      pending = true;
      document.addEventListener("focusout", () => setTimeout(() => ((pending = false), !typing() && render()), 50), { once: true });
    }
    return;
  }
  render();
}
// Tablet diputar / jendela diubah ukurannya: render ulang supaya tata letak ikut berganti.
document.body.dataset.wide = isWide() ? "1" : "";
if (typeof matchMedia === "function") {
  matchMedia(WIDE_QUERY).addEventListener?.("change", () => {
    document.body.dataset.wide = isWide() ? "1" : "";
    softRender();
  });
}
initCloud();
initMeja();
initPaket();
onPaket(() => softRender());
onCloudChange(softRender);
store.subscribe((s, source) => {
  if (source !== "cloud") return;
  // Login di perangkat baru saat masih di onboarding: data cloud masuk -> langsung ke Beranda.
  if (s.profile && routeName() === "profil" && document.querySelector(".hero")) location.hash = "#/";
  else softRender();
});
render();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
}
