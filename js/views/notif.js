// Halaman Pengingat: nyalakan notifikasi di HP ini + pilih pengingat apa saja & jamnya.
import { icon } from "../icons.js";
import { esc, toast } from "../ui.js";
import { render } from "../app.js";
import { head } from "./_shared.js";
import { cloud, role } from "../cloud.js";
import { support, permission, currentSub, serverRow, enable, disable, updatePrefs, sendTest, DEFAULT_PREFS } from "../push.js";

const JENIS = [
  { id: "konten", nama: "Jadwal posting hari ini", desc: "Ide konten, platform & jam posting dari Kalender Konten", waktu: "pagi" },
  { id: "stok", nama: "Bahan menipis", desc: "Bahan yang stoknya sudah di bawah batas minimum", waktu: "pagi" },
  { id: "ajak", nama: "Pelanggan perlu diajak balik", desc: "Tiap Senin: pelanggan yang ≥ 3 minggu nggak mampir", waktu: "pagi" },
  { id: "rekap", nama: "Rekap tutup kasir", desc: "Omzet, jumlah order & menu terlaris hari ini", waktu: "malam" },
];
const KASIR = ["stok", "rekap"];

let st = { loaded: false, loading: false, sub: null, prefs: null, error: "" };
let busy = false;

window.addEventListener("hashchange", () => {
  if (location.hash.startsWith("#/notif")) st.loaded = false;
});

async function load() {
  if (st.loading) return;
  st.loading = true;
  try {
    const sub = await currentSub();
    const row = sub ? await serverRow(sub) : null;
    // Ada langganan di browser tapi tidak terdaftar untuk akun ini -> dianggap belum aktif.
    st = { loaded: true, loading: false, sub: row ? sub : null, prefs: row ? { ...DEFAULT_PREFS, ...row.prefs } : null, error: "" };
  } catch (err) {
    st = { ...st, loaded: true, loading: false, error: err.message };
  }
  render();
}

async function run(fn) {
  if (busy) return;
  busy = true;
  render();
  try {
    await fn();
  } catch (err) {
    toast(err.message || "Gagal", "err");
  } finally {
    busy = false;
    render();
  }
}

const jamOpts = (from, to, cur) =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i)
    .map((h) => `<option value="${h}" ${Number(cur) === h ? "selected" : ""}>${String(h).padStart(2, "0")}.00</option>`)
    .join("");

function intro(kinds) {
  return `<section class="card">
    <h2 class="card-title">Yang bakal diingatkan</h2>
    <ul class="checks small">${JENIS.filter((j) => kinds.includes(j.id)).map((j) => `<li><b>${esc(j.nama)}</b> · ${esc(j.desc)}</li>`).join("")}</ul>
    <p class="small muted">Dikirim maksimal sekali sehari per jenis, dan hanya kalau memang ada yang perlu diingatkan.</p>
  </section>`;
}

export const notif = {
  render() {
    const back = head("Pengingat", role() === "kasir" ? "#/akun" : "#/setelan");
    if (!cloud.user) {
      return `${back}<section class="card empty"><div class="empty-icon">${icon("bell", 30)}</div><h3>Masuk dulu</h3>
        <p>Pengingat dikirim server ke HP kamu, jadi perlu akun supaya tahu data usaha mana yang dicek.</p>
        <a href="#/akun" class="btn primary">Masuk / Daftar</a></section>`;
    }
    const kinds = role() === "kasir" ? KASIR : JENIS.map((j) => j.id);
    const sup = support();
    if (sup === "ios-install") {
      return `${back}<section class="card warn-card"><h2 class="card-title">Pasang dulu ke Layar Utama</h2>
        <p class="small">Di iPhone/iPad, notifikasi hanya bisa untuk app yang dipasang: buka Racikin di Safari, ketuk tombol <b>Share</b>, pilih <b>Add to Home Screen</b>, lalu buka Racikin dari ikon di layar utama dan kembali ke halaman ini.</p>
        <p class="small muted">Butuh iOS 16.4 atau lebih baru.</p></section>${intro(kinds)}`;
    }
    if (sup !== "ok") {
      return `${back}<section class="card warn-card"><p>Browser ini belum mendukung notifikasi push. Coba buka Racikin di Chrome, Firefox, Edge, atau Safari terbaru.</p></section>${intro(kinds)}`;
    }
    if (!st.loaded) {
      load();
      return `${back}<section class="card"><p class="muted">Memuat…</p></section>`;
    }
    if (permission() === "denied") {
      return `${back}<section class="card warn-card"><h2 class="card-title">Notifikasi diblokir</h2>
        <p class="small">Izin notifikasi untuk Racikin ditolak di browser ini. Buka setelan situs (ikon gembok di sebelah alamat web) > Notifikasi > Izinkan, lalu muat ulang halaman.</p></section>${intro(kinds)}`;
    }
    if (!st.sub) {
      return `${back}
        <section class="card accent">
          <h2 class="card-title">Biar nggak ada yang kelewat</h2>
          <p class="small">Nyalakan pengingat di HP ini. Notifikasi tetap muncul walau app Racikin sedang ditutup.</p>
          <button class="btn primary block" data-action="enable" ${busy ? "disabled" : ""}>${icon("bell", 16)} ${busy ? "Menyalakan…" : "Nyalakan pengingat"}</button>
          ${st.error ? `<p class="warn-box small">${esc(st.error)}</p>` : ""}
        </section>
        ${intro(kinds)}`;
    }
    const p = st.prefs;
    return `${back}
      <section class="card">
        <div class="sync-box synced"><span>${icon("bell", 20)}</span><div><b>Pengingat aktif di HP ini</b><p class="small muted">Zona waktu: ${esc(Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Jakarta")}</p></div></div>
        <div class="row2">
          <button class="btn soft" data-action="test" ${busy ? "disabled" : ""}>Kirim tes</button>
          <button class="btn ghost" data-action="disable" ${busy ? "disabled" : ""}>Matikan</button>
        </div>
      </section>
      <section class="card">
        <h2 class="card-title">Pilih pengingat</h2>
        ${JENIS.filter((j) => kinds.includes(j.id))
          .map(
            (j) => `<label class="todo notif-opt"><input type="checkbox" data-change="pref" data-k="${j.id}" ${p[j.id] !== false ? "checked" : ""}>
              <span><b>${esc(j.nama)}</b><small class="muted">${esc(j.desc)} · ${j.waktu === "pagi" ? "pagi" : "malam"}</small></span></label>`,
          )
          .join("")}
        <div class="row2">
          ${kinds.some((k) => JENIS.find((j) => j.id === k).waktu === "pagi") ? `<label class="field"><span>Jam pagi</span><select data-change="jam" data-k="pagi">${jamOpts(5, 12, p.pagi)}</select></label>` : ""}
          ${kinds.includes("rekap") ? `<label class="field"><span>Jam tutup</span><select data-change="jam" data-k="malam">${jamOpts(15, 23, p.malam)}</select></label>` : ""}
        </div>
        <p class="small muted">Pengingat dicek tiap 15 menit, jadi bisa datang sampai ±15 menit setelah jam yang dipilih.</p>
      </section>`;
  },

  actions: {
    enable() {
      return run(async () => {
        await enable(DEFAULT_PREFS);
        st.loaded = false;
        toast("Pengingat aktif");
      });
    },
    disable() {
      if (!confirm("Matikan pengingat di HP ini?")) return;
      return run(async () => {
        await disable();
        st = { loaded: true, loading: false, sub: null, prefs: null, error: "" };
        toast("Pengingat dimatikan");
      });
    },
    test() {
      return run(async () => {
        const r = await sendTest();
        toast(r.sent ? "Notifikasi tes dikirim, cek HP kamu" : "Belum terkirim. Coba matikan lalu nyalakan lagi.", r.sent ? "" : "err");
      });
    },
  },

  changes: {
    pref(el) {
      st.prefs = { ...st.prefs, [el.dataset.k]: el.checked };
      return run(() => updatePrefs(st.prefs));
    },
    jam(el) {
      st.prefs = { ...st.prefs, [el.dataset.k]: Number(el.value) };
      return run(() => updatePrefs(st.prefs));
    },
  },
};
