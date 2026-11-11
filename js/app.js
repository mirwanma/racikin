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

const routes = { "": home, profil, bisnis, ide, rab, brand, aktivasi, kas, konten, mentor, setelan };
const tabOf = { "": "", bisnis: "bisnis", ide: "bisnis", rab: "bisnis", brand: "bisnis", aktivasi: "bisnis", kas: "kas", konten: "konten", mentor: "mentor" };

const view = $("#view");
let current = home;

function routeName() {
  return location.hash.replace(/^#\/?/, "").split("?")[0];
}

export function render() {
  const name = routeName();
  // Wajib isi profil dulu sebelum pakai fitur lain
  if (!store.get().profile && name !== "profil" && name !== "setelan") {
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
render();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
}
