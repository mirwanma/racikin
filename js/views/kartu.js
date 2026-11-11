// Halaman publik kartu stempel (dibuka pelanggan lewat link, tanpa login).
import { esc } from "../ui.js";
import { render } from "../app.js";
import { icon } from "../icons.js";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "../cloud.js";

let state = { token: null, data: null, error: "", loading: false };
const tokenOf = () => (location.hash.match(/^#\/kartu\/([0-9a-f-]{36})/i) || [])[1] || null;

async function load(token) {
  state = { token, data: null, error: "", loading: true };
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_stamp_card`, {
      method: "POST",
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_token: token }),
    });
    if (!res.ok) throw new Error(String(res.status));
    const data = await res.json();
    state = { token, data, error: data ? "" : "notfound", loading: false };
  } catch {
    state = { token, data: null, error: navigator.onLine ? "error" : "offline", loading: false };
  }
  render();
}

const validHex = (h) => (/^#[0-9a-f]{6}$/i.test(h || "") ? h : null);

export const kartu = {
  render() {
    const token = tokenOf();
    if (!token) return message("Link kartu tidak valid", "Minta link kartu yang baru ke penjualnya ya.");
    if (state.token !== token && !state.loading) load(token);
    if (state.loading || state.token !== token) return `<div class="loading"><div class="pot"><span></span><span></span><span></span></div><p>Membuka kartu…</p></div>`;
    if (state.error === "notfound") return message("Kartu tidak ditemukan", "Mungkin kartunya sudah dihapus. Minta link baru ke penjualnya ya.");
    if (state.error) return message(state.error === "offline" ? "Kamu lagi offline" : "Kartu gagal dimuat", "Cek koneksi lalu coba lagi.", true);

    const d = state.data;
    const n = Math.min(Number(d.stempel) || 0, d.target);
    const ready = (Number(d.stempel) || 0) >= d.target;
    const sisa = Math.max(0, d.target - (Number(d.stempel) || 0));
    const utama = validHex(d.warna?.utama);
    const aksen = validHex(d.warna?.aksen);
    const style = utama ? `style="--lc-main:${utama};--lc-accent:${aksen || utama}"` : "";
    const diperbarui = d.diperbarui ? new Date(d.diperbarui).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "";

    return `
      <section class="loyal-card ${utama ? "branded" : ""}" ${style}>
        <div class="lc-top">
          <div><small class="mono">${esc(d.program)}</small><h1>${esc(d.bisnis)}</h1></div>
          ${d.lokasi ? `<small class="lc-loc">${esc(d.lokasi)}</small>` : ""}
        </div>
        <p class="lc-hi">Halo, <b>${esc(d.nama)}</b></p>
        <div class="lc-stamps" style="--cols:${d.target <= 5 ? d.target : d.target <= 10 ? 5 : 6}">
          ${Array.from({ length: d.target }, (_, i) => `<span class="lc-stamp ${i < n ? "on" : ""}">${i < n ? icon("check", 22) : `<em>${i + 1}</em>`}</span>`).join("")}
        </div>
        <div class="lc-reward ${ready ? "ready" : ""}">
          ${
            ready
              ? `<b>Hadiah kamu siap!</b><span>${esc(d.hadiah)} — tunjukkan kartu ini ke kasir.</span>`
              : `<b>${n} dari ${d.target} stempel</b><span>${sisa} lagi dapat ${esc(d.hadiah)}</span>`
          }
        </div>
      </section>
      <p class="muted small center">${d.hadiahDiambil ? `Kamu sudah ${d.hadiahDiambil}× ambil hadiah. ` : ""}Diperbarui ${esc(diperbarui)}</p>
      <button class="btn ghost block" data-action="reload">${icon("sync", 16)} Muat ulang</button>
      <p class="muted small center lc-foot">Kartu stempel digital · dibuat dengan <span class="wordmark">racikin</span></p>`;
  },
  actions: {
    reload() {
      state = { token: null, data: null, error: "", loading: false };
      render();
    },
  },
};

function message(title, text, retry = false) {
  return `<section class="card empty"><div class="empty-icon">${icon("receipt", 30)}</div><h3>${esc(title)}</h3><p>${esc(text)}</p>
    ${retry ? `<button class="btn primary" data-action="reload">Coba lagi</button>` : ""}</section>`;
}
