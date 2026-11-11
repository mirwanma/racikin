import { icon } from "./icons.js";
// Helper kecil untuk render & format.
export const $ = (sel, root = document) => root.querySelector(sel);

export function esc(v) {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const rp = new Intl.NumberFormat("id-ID");
export const rupiah = (n) => "Rp " + rp.format(Math.round(Number(n) || 0));
export const short = (n) => {
  n = Number(n) || 0;
  const a = Math.abs(n);
  if (a >= 1e9) return (n / 1e9).toFixed(1).replace(".0", "") + "M";
  if (a >= 1e6) return (n / 1e6).toFixed(1).replace(".0", "") + "jt";
  if (a >= 1e3) return Math.round(n / 1e3) + "rb";
  return String(Math.round(n));
};

export const todayISO = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
};
export const addDays = (iso, n) => {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + n);
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, "0"), dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
};
export const fmtDate = (iso, opts = { weekday: "short", day: "numeric", month: "short" }) =>
  new Date(iso + "T00:00:00").toLocaleDateString("id-ID", opts);

export const list = (items, cls = "") =>
  `<ul class="${cls}">${(items || []).map((i) => `<li>${esc(i)}</li>`).join("")}</ul>`;

let toastTimer;
export function toast(msg, type = "") {
  const el = $("#toast");
  el.textContent = msg;
  el.className = "toast show " + type;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.className = "toast"), 2800);
}

export function loading(label = "AI lagi meracik…") {
  return `<div class="loading"><div class="pot"><span></span><span></span><span></span></div><p>${esc(label)}</p></div>`;
}

export function empty({ icon: name = "spark", title, text, action, label }) {
  return `<div class="empty card">
    <div class="empty-icon">${icon(name, 30)}</div>
    <h3>${esc(title)}</h3>
    <p>${esc(text)}</p>
    ${action ? `<button class="btn primary" data-action="${action}">${esc(label)}</button>` : ""}
  </div>`;
}

export function download(filename, content, type = "text/plain") {
  const blob = new Blob([content], { type });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast("Disalin ke clipboard");
  } catch {
    toast("Gagal menyalin", "err");
  }
}
