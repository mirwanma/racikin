import { store } from "./store.js";
import { $, toast } from "./ui.js";
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
import { initCloud, onCloudChange } from "./cloud.js";

const routes = { "": home, profil, bisnis, ide, rab, brand, aktivasi, kas, konten, mentor, setelan, akun, stok, resep, pelanggan, kartu, studio, kasir };
const tabOf = { "": "", bisnis: "bisnis", ide: "bisnis", rab: "bisnis", brand: "bisnis", aktivasi: "bisnis", kas: "kas", stok: "bisnis", resep: "bisnis", pelanggan: "bisnis", studio: "bisnis", konten: "konten", kasir: "kasir" };

const view = $("#view");
let current = home;

function routeName() {
  return location.hash.replace(/^#\/?/, "").split("?")[0].split("/")[0];
}

export function render() {
  const name = routeName();
  // Wajib isi profil dulu sebelum pakai fitur lain
  if (!store.get().profile && !["profil", "setelan", "akun", "kartu"].includes(name)) {
    location.replace("#/profil");
    return;
  }
  current = routes[name] || home;
  view.innerHTML = current.render(store.get());
  current.after?.(view);
  document.querySelectorAll(".tabbar a").forEach((a) => a.classList.toggle("active", a.dataset.tab === (tabOf[name] ?? "")));
  document.body.dataset.route = name || "home";
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
