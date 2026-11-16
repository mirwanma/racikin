// Dashboard admin platform Racikin (#/admin). Hanya akun di tabel platform_admins (dicek di server).
// READ-ONLY: ringkasan platform, adopsi fitur, daftar merchant (cari/filter/urut), detail merchant, export CSV.
import { icon } from "../icons.js";
import { esc, rupiah, short, todayISO, fmtDate, download, toast } from "../ui.js";
import { render } from "../app.js";
import { sb, cloud } from "../cloud.js";
import { FITUR, STATUS, statusMerchant, ringkasPlatform, saringMerchant, URUT, toCSV, isTes } from "../admin.js";

let data = { status: "idle", list: [], at: null, error: "" }; // idle | loading | ok | bukan | error
let f = { q: "", status: "", tahap: "", urut: "aktif", tes: false };
let buka = null; // id merchant yang detailnya dibuka
let gulir = null; // id merchant yang perlu di-scroll setelah dibuka dari Ringkasan
const detail = new Map(); // id -> detail | "loading" | { error }
// Hasil is_platform_admin untuk user sekarang { uid, ok }. Disimpan di perangkat supaya menu admin langsung
// tampil saat app dibuka (data tetap dijaga server: fungsi admin_* menolak akun yang bukan admin).
const KEY_ADMIN = "racikin:admin";
const KEY_MODE = "racikin:mode-usaha"; // admin yang juga punya usaha bisa pindah ke app usaha
const lsGet = (k) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const lsSet = (k, v) => {
  try {
    v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v);
  } catch {}
};
let adminCache = (() => {
  const uid = lsGet(KEY_ADMIN);
  return uid ? { uid, ok: true, simpan: true } : null;
})();
let cekJalan = null;

/** Cek admin ke server (sekali per user). */
export async function cekAdmin() {
  if (!cloud.user || !sb()) return false;
  if (adminCache?.uid === cloud.user.id && !adminCache.simpan) return adminCache.ok;
  if (cekJalan) return cekJalan;
  cekJalan = (async () => {
    const { data: ok, error } = await sb().rpc("is_platform_admin");
    // Gagal jaringan: pakai hasil tersimpan dulu, cek lagi nanti.
    if (error && adminCache?.uid === cloud.user.id) return adminCache.ok;
    adminCache = { uid: cloud.user.id, ok: !error && ok === true };
    lsSet(KEY_ADMIN, adminCache.ok ? cloud.user.id : null);
    return adminCache.ok;
  })();
  try {
    return await cekJalan;
  } finally {
    cekJalan = null;
  }
}
export const adminDiketahui = () => {
  // Sesi login belum terbaca (baru buka app): pakai status tersimpan biar menu admin nggak kedip.
  if (!cloud.user) return cloud.available && !cloud.authSiap && adminCache?.simpan ? true : null;
  return adminCache?.uid === cloud.user.id ? adminCache.ok : null;
};

/** Mode admin platform: menu usaha disembunyikan, diganti menu admin. */
export const modeUsaha = () => lsGet(KEY_MODE) === "1";
export const isAdminMode = () => adminDiketahui() === true && !modeUsaha();
export function setModeUsaha(on) {
  lsSet(KEY_MODE, on ? "1" : null);
}
/** Dipanggil saat logout: lupakan status admin di perangkat ini. */
export function lupakanAdmin() {
  adminCache = null;
  lsSet(KEY_ADMIN, null);
  lsSet(KEY_MODE, null);
  data = { status: "idle", list: [], at: null, error: "" };
  detail.clear();
  buka = null;
}

export const TAB_ADMIN = [
  ["ringkasan", "Ringkasan"],
  ["merchant", "Merchant"],
  ["tren", "Pertumbuhan"],
];
export const tabAdmin = () => {
  const t = new URLSearchParams(location.hash.split("?")[1] || "").get("tab");
  return TAB_ADMIN.some(([k]) => k === t) ? t : "ringkasan";
};

async function muat() {
  if (data.status === "loading") return;
  data = { ...data, status: "loading", error: "" };
  render();
  try {
    if (!(await cekAdmin())) {
      data = { status: "bukan", list: [], at: null, error: "" };
    } else {
      const { data: list, error } = await sb().rpc("admin_merchants");
      if (error) throw new Error(error.message);
      data = { status: "ok", list: Array.isArray(list) ? list : [], at: new Date(), error: "" };
      detail.clear();
    }
  } catch (e) {
    data = { ...data, status: "error", error: e.message || "Gagal memuat data" };
  }
  render();
}

async function muatDetail(id) {
  detail.set(id, "loading");
  render();
  const { data: d, error } = await sb().rpc("admin_merchant_detail", { p_owner: id });
  detail.set(id, error ? { error: error.message } : d);
  render();
}

const pill = (st) => `<span class="sehat-pill ${STATUS[st].cls}">${STATUS[st].nama}</span>`;
const tgl = (t) => (t ? fmtDate(String(t).slice(0, 10), { day: "numeric", month: "short", year: "2-digit" }) : "-");
const trenTxt = (t) => (t === null ? "baru jualan" : `${t >= 0 ? "+" : ""}${Math.round(t)}%`);
const delta = (now, prev) => (prev ? `${now >= prev ? "+" : ""}${Math.round(((now - prev) / prev) * 100)}%` : "");

function bars(items, { label = (x) => x.label, nilai = (x) => x.n, fmt = (n) => n } = {}) {
  const max = Math.max(1, ...items.map(nilai));
  return `<div class="adm-bars">${items
    .map((x) => `<div class="adm-bar"><span class="adm-bar-label">${esc(label(x))}</span><span class="adm-bar-track"><i style="width:${(nilai(x) / max) * 100}%"></i></span><b class="mono">${fmt(nilai(x))}</b></div>`)
    .join("")}</div>`;
}

function grafik(harian) {
  const max = Math.max(1, ...harian.map((h) => Number(h.order) || 0));
  return `<div class="adm-chart" role="img" aria-label="Order harian 60 hari">${harian
    .map((h) => `<i style="height:${((Number(h.order) || 0) / max) * 100}%" title="${esc(h.tgl)}: ${h.order} order · ${rupiah(h.omzet)}"></i>`)
    .join("")}</div><div class="row-between small muted"><span>${tgl(harian[0]?.tgl)}</span><span>hari ini</span></div>`;
}

function detailView(m) {
  const d = detail.get(m.id);
  if (!d || d === "loading") return `<div class="inline-form"><p class="small muted">Memuat detail…</p></div>`;
  if (d.error) return `<div class="inline-form"><p class="warn-box small">${esc(d.error)}</p></div>`;
  return `<div class="inline-form stack adm-detail">
    <div class="row-between small"><span>Pemilik: <b>${esc(m.pemilik || "-")}</b></span><a class="link" href="mailto:${esc(m.email)}">${esc(m.email)}</a></div>
    <p class="small muted">${esc([m.jenis, m.konsep, m.kota].filter(Boolean).join(" · "))} · daftar ${tgl(m.daftar)} · login terakhir ${tgl(m.login_terakhir)}${(m.masalah || []).length ? ` · fokus: ${esc(m.masalah.join(", "))}` : ""}</p>
    <h4>Order harian (60 hari)</h4>${grafik(d.harian || [])}
    <div class="stats3">
      <div><small>Omzet 7 hari</small><b>${short(m.omzet7)}</b></div>
      <div><small>Omzet 30 hari</small><b>${short(m.omzet30)}</b></div>
      <div><small>Rata/order</small><b>${m.order30 ? short(m.omzet30 / m.order30) : "-"}</b></div>
    </div>
    ${(d.terlaris || []).length ? `<h4>Menu terlaris 30 hari</h4>${bars(d.terlaris, { label: (x) => x.nama, nilai: (x) => x.porsi })}` : ""}
    <div class="row2">
      <div><h4>Tim</h4><p class="small">${(d.tim || []).length ? d.tim.map((t) => `${t.n} ${esc(t.role)}`).join(", ") : "Sendirian"}</p></div>
      <div><h4>AI 30 hari</h4><p class="small">${(d.ai || []).length ? d.ai.map((a) => `${esc(a.task)} ${a.n}`).join(", ") : "Belum pakai"}</p></div>
    </div>
    <p class="small">${m.menu} menu · ${m.bahan} bahan · ${m.pelanggan} pelanggan kartu stempel · ${d.meja} pesanan meja 30 hari</p>
    <div class="chips">${FITUR.map(([k, n]) => `<span class="tag ${m.fitur?.[k] ? "pos" : "off"}">${n}</span>`).join("")}</div>
  </div>`;
}

const nyala = (m) => (m.st.sepi === null ? "belum jualan" : m.st.sepi === 0 ? "jualan hari ini" : `${m.st.sepi} hari lalu`);

/** Baris merchant (bisa dibuka detailnya). */
function barisMerchant(m) {
  return `<div class="pos-order adm-row">
    <button class="pos-order-head" data-action="detail" data-id="${esc(m.id)}">
      <span class="adm-nama"><b>${esc(m.nama)}</b><small class="muted">${esc([m.kota, m.jenis].filter(Boolean).join(" · ") || "-")} · ${m.tahap === "jalan" ? "udah jalan" : "baru ide"}${isTes(m) ? " · tes" : ""}</small></span>
      <span class="adm-angka"><b class="mono">${m.order30}</b><small class="muted">order 30h · ${short(m.omzet30)}</small></span>
      <span class="adm-st">${pill(m.st.status)}<small class="muted">${nyala(m)}${m.order30 || m.order_prev30 ? ` · ${trenTxt(m.st.tren)}` : ""}</small></span>
    </button>
    ${buka === m.id ? detailView(m) : ""}
  </div>`;
}

/** Kepala halaman admin: judul tab, waktu data, muat ulang, akun tes. */
function kepala(judul, sub, aksi = "") {
  const nTes = data.list.filter(isTes).length;
  return `<header class="page-head adm-page-head"><h1>${esc(judul)}</h1><span class="pill adm-badge">${icon("lock", 12)} Admin</span></header>
    <section class="card adm-head">
      <div class="row-between"><div><p class="small" style="margin:0">${esc(sub)}</p><p class="small muted" style="margin:0">Diperbarui ${data.at ? data.at.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : "-"} · data read-only</p></div>
        <span class="row-gap"><button class="btn ghost sm" data-action="muat">${icon("sync", 14)} Muat ulang</button>${aksi}</span></div>
      ${nTes ? `<label class="impor-cek"><input type="checkbox" data-change="tes" ${f.tes ? "checked" : ""}><span>Ikutkan ${nTes} akun tes (@racikin.test)</span></label>` : ""}
    </section>`;
}

function kpi(r) {
  return `<section class="card">
      <div class="adm-kpi">
        <div><small>Merchant</small><b>${r.total}</b><span class="small muted">+${r.baru30} baru 30 hari</span></div>
        <div><small>Aktif 7 hari</small><b class="pos">${r.aktif7}</b><span class="small muted">${r.aktif30} aktif 30 hari</span></div>
        <div><small>Berisiko berhenti</small><b class="${r.berisiko ? "neg" : ""}">${r.berisiko}</b><span class="small muted">jualan terakhir &gt;14 hari</span></div>
        <div><small>Order 30 hari</small><b>${r.order30.toLocaleString("id-ID")}</b><span class="small muted">${delta(r.order30, r.orderPrev30)} vs 30 hari sebelumnya</span></div>
        <div><small>Omzet merchant 30 hari</small><b>${short(r.omzet30)}</b><span class="small muted">${delta(r.omzet30, r.omzetPrev30)}</span></div>
        <div><small>Pemakaian AI 30 hari</small><b>${r.ai30.toLocaleString("id-ID")}</b><span class="small muted">${r.meja30} pesanan meja</span></div>
      </div>
    </section>`;
}

/** Daftar pendek di Ringkasan; klik = buka detail di tab Merchant. */
function daftarPendek(judul, list, kosong, ket) {
  return `<section class="card">
    <h2 class="card-title">${esc(judul)}</h2>
    ${
      list.length
        ? `<div class="adm-mini">${list
            .map((m) => `<a href="#/admin?tab=merchant&id=${esc(m.id)}" class="adm-mini-row"><span><b>${esc(m.nama)}</b><small class="muted">${esc([m.kota, m.jenis].filter(Boolean).join(" · ") || "-")}</small></span><span class="small">${ket(m)}</span>${icon("chevron", 14)}</a>`)
            .join("")}</div>`
        : `<p class="small muted">${esc(kosong)}</p>`
    }
  </section>`;
}

function ringkasanTab() {
  const today = todayISO();
  const semua = f.tes ? data.list : data.list.filter((m) => !isTes(m));
  const r = ringkasPlatform(semua, today);
  const x = semua.map((m) => ({ ...m, st: statusMerchant(m, today) }));
  const berisiko = x.filter((m) => m.st.status === "berisiko").sort((a, b) => (b.omzet_prev30 || 0) - (a.omzet_prev30 || 0)).slice(0, 5);
  const baru = [...x].sort((a, b) => String(b.daftar).localeCompare(String(a.daftar))).slice(0, 5);
  const top = x.filter((m) => m.omzet30 > 0).sort((a, b) => b.omzet30 - a.omzet30).slice(0, 5);
  return `${kepala("Ringkasan", "Kondisi platform Racikin hari ini")}
    ${kpi(r)}
    ${daftarPendek("Perlu disapa", berisiko, "Aman, nggak ada merchant yang berhenti jualan.", (m) => `${pill("berisiko")} <small class="muted">${nyala(m)}</small>`)}
    ${daftarPendek("Paling rame 30 hari", top, "Belum ada merchant yang jualan lewat Kasir.", (m) => `<b class="mono">${short(m.omzet30)}</b> <small class="muted">${m.order30} order</small>`)}
    ${daftarPendek("Pendaftar terbaru", baru, "Belum ada pendaftar.", (m) => `<small class="muted">daftar ${tgl(m.daftar)}</small> ${pill(m.st.status)}`)}`;
}

function merchantTab() {
  const today = todayISO();
  const rows = saringMerchant(data.list, f, today);
  return `${kepala("Merchant", "Cari, saring & lihat detail tiap usaha", `<button class="btn soft sm" data-action="csv">${icon("download", 14)} CSV</button>`)}
    <section class="card adm-list">
      <div class="adm-filter">
        <input type="search" value="${esc(f.q)}" placeholder="Cari nama usaha, email, kota…" data-change="q" aria-label="Cari merchant">
        <select data-change="status" aria-label="Status"><option value="">Semua status</option>${Object.entries(STATUS).map(([k, x]) => `<option value="${k}" ${f.status === k ? "selected" : ""}>${x.nama}</option>`).join("")}</select>
        <select data-change="tahap" aria-label="Tahap"><option value="">Semua tahap</option><option value="ide" ${f.tahap === "ide" ? "selected" : ""}>Baru ide</option><option value="jalan" ${f.tahap === "jalan" ? "selected" : ""}>Udah jalan</option></select>
        <select data-change="urut" aria-label="Urutkan">${URUT.map(([k, n]) => `<option value="${k}" ${f.urut === k ? "selected" : ""}>${n}</option>`).join("")}</select>
      </div>
      <p class="small muted">${rows.length} merchant</p>
      ${rows.length ? rows.map(barisMerchant).join("") : `<p class="muted">Nggak ada merchant yang cocok.</p>`}
    </section>`;
}

function trenTab() {
  const today = todayISO();
  const semua = f.tes ? data.list : data.list.filter((m) => !isTes(m));
  const r = ringkasPlatform(semua, today);
  return `${kepala("Pertumbuhan", "Pendaftar, adopsi fitur & sebaran merchant")}
    <section class="card">
      <h2 class="card-title">Pendaftar per minggu</h2>
      ${bars(r.daftarMinggu, { label: (x) => fmtDate(x.minggu, { day: "numeric", month: "short" }), nilai: (x) => x.n })}
    </section>
    <section class="card">
      <h2 class="card-title">Adopsi fitur</h2>
      ${bars(r.fitur, { label: (x) => x.nama, nilai: (x) => x.n, fmt: (n) => `${n}/${r.total}` })}
    </section>
    <section class="card">
      <h2 class="card-title">Sebaran merchant</h2>
      <div class="row2">
        <div><h4>Tahap</h4><p class="small">Baru ide <b>${r.tahap.ide}</b> · Udah jalan <b>${r.tahap.jalan}</b></p>
          <h4>Status</h4><p class="small">${r.status.map(([k, n]) => `${STATUS[k].nama} <b>${n}</b>`).join(" · ")}</p></div>
        <div><h4>Kota teratas</h4><p class="small">${r.kota.map(([k, n]) => `${esc(k)} <b>${n}</b>`).join(" · ") || "-"}</p>
          <h4>Jenis usaha</h4><p class="small">${r.jenis.map(([k, n]) => `${esc(k)} <b>${n}</b>`).join(" · ") || "-"}</p></div>
      </div>
    </section>
    <section class="card">
      <h2 class="card-title">Transaksi lewat Racikin</h2>
      <div class="stats3">
        <div><small>Order 30 hari</small><b>${r.order30.toLocaleString("id-ID")}</b></div>
        <div><small>Omzet 30 hari</small><b>${short(r.omzet30)}</b></div>
        <div><small>Pesanan meja</small><b>${r.meja30.toLocaleString("id-ID")}</b></div>
      </div>
      <p class="small muted">Dibanding 30 hari sebelumnya: order ${delta(r.order30, r.orderPrev30) || "-"}, omzet ${delta(r.omzet30, r.omzetPrev30) || "-"}. Pemakaian AI ${r.ai30.toLocaleString("id-ID")} kali.</p>
    </section>`;
}

const TAB_VIEW = { ringkasan: ringkasanTab, merchant: merchantTab, tren: trenTab };

export const admin = {
  render() {
    const h = `<header class="page-head"><h1>Dashboard Admin</h1></header>`;
    if (!cloud.available) return `${h}<section class="card"><p>Koneksi ke server belum siap. Cek internet lalu muat ulang.</p></section>`;
    if (!cloud.user && !cloud.authSiap) return `${h}<section class="card"><p class="muted">Memuat…</p></section>`;
    if (!cloud.user) return `${h}<section class="card empty"><div class="empty-icon">${icon("lock", 30)}</div><h3>Khusus admin Racikin</h3><p>Masuk pakai akun admin dulu.</p><a href="#/akun" class="btn primary">Masuk</a></section>`;
    if (data.status === "idle" || (data.status === "ok" && adminCache?.uid !== cloud.user.id)) {
      muat();
      return `${h}<section class="card"><p class="muted">Memuat data merchant…</p></section>`;
    }
    if (data.status === "loading" && !data.list.length) return `${h}<section class="card"><p class="muted">Memuat data merchant…</p></section>`;
    if (data.status === "bukan") return `${h}<section class="card empty"><div class="empty-icon">${icon("lock", 30)}</div><h3>Khusus admin Racikin</h3><p>Akun ${esc(cloud.user.email)} bukan admin platform.</p><a href="#/" class="btn ghost">Ke Beranda</a></section>`;
    if (data.status === "error") return `${h}<section class="card"><p class="warn-box small">${esc(data.error)}</p><button class="btn primary" data-action="muat">Coba lagi</button></section>`;
    const tab = tabAdmin();
    // Link dari Ringkasan: buka detail merchant tertentu
    const id = new URLSearchParams(location.hash.split("?")[1] || "").get("id");
    if (tab === "merchant" && id && buka !== id && data.list.some((m) => m.id === id)) {
      buka = id;
      gulir = id;
      history.replaceState(null, "", "#/admin?tab=merchant");
      if (!detail.has(id)) queueMicrotask(() => muatDetail(id));
    }
    return TAB_VIEW[tab]();
  },
  after(root) {
    if (gulir && tabAdmin() === "merchant") {
      const el = root.querySelector(`.adm-row [data-id="${CSS.escape(gulir)}"]`);
      if (el) {
        gulir = null;
        setTimeout(() => el.scrollIntoView({ block: "start" }), 0); // setelah scroll-ke-atas bawaan pindah halaman
      }
    }
  },
  changes: {
    q(el) {
      f.q = el.value;
      render();
    },
    status(el) {
      f.status = el.value;
      render();
    },
    tahap(el) {
      f.tahap = el.value;
      render();
    },
    urut(el) {
      f.urut = el.value;
      render();
    },
    tes(el) {
      f.tes = el.checked;
      render();
    },
  },
  actions: {
    muat: () => muat(),
    detail(el) {
      const id = el.dataset.id;
      buka = buka === id ? null : id;
      if (buka && !detail.has(id)) return muatDetail(id);
      render();
    },
    csv() {
      const rows = saringMerchant(data.list, f, todayISO());
      download(`racikin-merchant-${todayISO()}.csv`, toCSV(rows), "text/csv");
      toast(`${rows.length} merchant diekspor`);
    },
  },
};
