import { store } from "./store.js";
import { $, esc, toast } from "./ui.js";
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
import { initCloud, onCloudChange, cloud, role } from "./cloud.js";
import { icon } from "./icons.js";

const routes = { "": home, profil, bisnis, ide, rab, brand, aktivasi, kas, konten, mentor, setelan, akun, stok, resep, pelanggan, kartu, studio, kasir, online, tim, gabung, notif };
const tabOf = { "": "", bisnis: "bisnis", ide: "bisnis", rab: "bisnis", brand: "bisnis", aktivasi: "bisnis", kas: "kas", stok: "bisnis", resep: "bisnis", pelanggan: "bisnis", studio: "bisnis", konten: "konten", kasir: "kasir", online: "kasir", tim: "bisnis", notif: "-" };
// Kasir hanya melihat halaman jualan, pelanggan, dan stok bahan.
const KASIR_ROUTES = new Set(["kasir", "pelanggan", "stok", "akun", "setelan", "kartu", "tim", "gabung", "notif"]);
const tabOfKasir = { kasir: "kasir", pelanggan: "pelanggan", stok: "stok", akun: "akun", setelan: "akun", tim: "akun", notif: "akun" };
const FREE_ROUTES = ["profil", "setelan", "akun", "kartu", "gabung", "tim", "notif"];

const view = $("#view");
let current = home;

function routeName() {
  return location.hash.replace(/^#\/?/, "").split("?")[0].split("/")[0];
}

export function render() {
  const name = routeName();
  const peran = role();
  document.body.dataset.role = peran;
  if (peran === "kasir" && !KASIR_ROUTES.has(name)) {
    location.replace("#/kasir");
    return;
  }
  if (!store.get().profile && !FREE_ROUTES.includes(name)) {
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
  view.innerHTML = current.render(store.get());
  current.after?.(view);
  const tab = peran === "kasir" ? tabOfKasir[name] : tabOf[name];
  document.querySelectorAll(".tabbar a").forEach((a) => a.classList.toggle("active", a.dataset.tab === (tab ?? "")));
  document.body.dataset.route = name || "home";
}

function waitingTeam() {
  const t = cloud.team;
  return `<section class="card empty">
    <div class="empty-icon">${icon("sync", 30)}</div>
    <h3>Lagi ambil data ${t?.bisnis ? esc(t.bisnis) : "usaha"}…</h3>
    <p>${cloud.status === "error" ? esc(cloud.error) : cloud.status === "offline" ? "Kamu lagi offline. Data muncul begitu tersambung internet." : "Kamu anggota tim. Data menu, stok & pelanggan diambil dari akun pemilik."}</p>
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
initCloud();
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
