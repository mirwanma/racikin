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
const detail = new Map(); // id -> detail | "loading" | { error }
let adminCache = null; // hasil is_platform_admin untuk user sekarang { uid, ok }

/** Cek admin (dipakai halaman Akun untuk menampilkan link). */
export async function cekAdmin() {
  if (!cloud.user || !sb()) return false;
  if (adminCache?.uid === cloud.user.id) return adminCache.ok;
  const { data: ok, error } = await sb().rpc("is_platform_admin");
  adminCache = { uid: cloud.user.id, ok: !error && ok === true };
  return adminCache.ok;
}
export const adminDiketahui = () => (adminCache?.uid === cloud.user?.id ? adminCache.ok : null);

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

function dashboard() {
  const today = todayISO();
  const semua = f.tes ? data.list : data.list.filter((m) => !isTes(m));
  const r = ringkasPlatform(semua, today);
  const rows = saringMerchant(data.list, f, today);
  const nTes = data.list.filter(isTes).length;
  return `
    <section class="card adm-head">
      <div class="row-between"><div><h2 class="card-title" style="margin:0">Semua merchant Racikin</h2><p class="small muted">Diperbarui ${data.at ? data.at.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : "-"} · data read-only</p></div>
        <span class="row-gap"><button class="btn ghost sm" data-action="muat">${icon("sync", 14)} Muat ulang</button><button class="btn soft sm" data-action="csv">${icon("download", 14)} CSV</button></span></div>
      ${nTes ? `<label class="impor-cek"><input type="checkbox" data-change="tes" ${f.tes ? "checked" : ""}><span>Ikutkan ${nTes} akun tes (@racikin.test)</span></label>` : ""}
    </section>
    <section class="card">
      <div class="adm-kpi">
        <div><small>Merchant</small><b>${r.total}</b><span class="small muted">+${r.baru30} baru 30 hari</span></div>
        <div><small>Aktif 7 hari</small><b class="pos">${r.aktif7}</b><span class="small muted">${r.aktif30} aktif 30 hari</span></div>
        <div><small>Berisiko berhenti</small><b class="${r.berisiko ? "neg" : ""}">${r.berisiko}</b><span class="small muted">jualan terakhir &gt;14 hari</span></div>
        <div><small>Order 30 hari</small><b>${r.order30.toLocaleString("id-ID")}</b><span class="small muted">${delta(r.order30, r.orderPrev30)} vs 30 hari sebelumnya</span></div>
        <div><small>Omzet merchant 30 hari</small><b>${short(r.omzet30)}</b><span class="small muted">${delta(r.omzet30, r.omzetPrev30)}</span></div>
        <div><small>Pemakaian AI 30 hari</small><b>${r.ai30.toLocaleString("id-ID")}</b><span class="small muted">${r.meja30} pesanan meja</span></div>
      </div>
    </section>
    <section class="card">
      <h2 class="card-title">Adopsi fitur</h2>
      ${bars(r.fitur, { label: (x) => x.nama, nilai: (x) => x.n, fmt: (n) => `${n}/${r.total}` })}
    </section>
    <section class="card">
      <h2 class="card-title">Pendaftar per minggu</h2>
      ${bars(r.daftarMinggu, { label: (x) => fmtDate(x.minggu, { day: "numeric", month: "short" }), nilai: (x) => x.n })}
      <div class="row2">
        <div><h4>Tahap</h4><p class="small">Baru ide <b>${r.tahap.ide}</b> · Udah jalan <b>${r.tahap.jalan}</b></p>
          <h4>Status</h4><p class="small">${r.status.map(([k, n]) => `${STATUS[k].nama} <b>${n}</b>`).join(" · ")}</p></div>
        <div><h4>Kota teratas</h4><p class="small">${r.kota.map(([k, n]) => `${esc(k)} <b>${n}</b>`).join(" · ") || "-"}</p>
          <h4>Jenis usaha</h4><p class="small">${r.jenis.map(([k, n]) => `${esc(k)} <b>${n}</b>`).join(" · ") || "-"}</p></div>
      </div>
    </section>
    <section class="card adm-list">
      <div class="adm-filter">
        <input type="search" value="${esc(f.q)}" placeholder="Cari nama usaha, email, kota…" data-change="q" aria-label="Cari merchant">
        <select data-change="status" aria-label="Status"><option value="">Semua status</option>${Object.entries(STATUS).map(([k, x]) => `<option value="${k}" ${f.status === k ? "selected" : ""}>${x.nama}</option>`).join("")}</select>
        <select data-change="tahap" aria-label="Tahap"><option value="">Semua tahap</option><option value="ide" ${f.tahap === "ide" ? "selected" : ""}>Baru ide</option><option value="jalan" ${f.tahap === "jalan" ? "selected" : ""}>Udah jalan</option></select>
        <select data-change="urut" aria-label="Urutkan">${URUT.map(([k, n]) => `<option value="${k}" ${f.urut === k ? "selected" : ""}>${n}</option>`).join("")}</select>
      </div>
      <p class="small muted">${rows.length} merchant</p>
      ${
        rows.length
          ? rows
              .map(
                (m) => `<div class="pos-order adm-row">
                  <button class="pos-order-head" data-action="detail" data-id="${esc(m.id)}">
                    <span class="adm-nama"><b>${esc(m.nama)}</b><small class="muted">${esc([m.kota, m.jenis].filter(Boolean).join(" · ") || "-")} · ${m.tahap === "jalan" ? "udah jalan" : "baru ide"}${isTes(m) ? " · tes" : ""}</small></span>
                    <span class="adm-angka"><b class="mono">${m.order30}</b><small class="muted">order 30h · ${short(m.omzet30)}</small></span>
                    <span class="adm-st">${pill(m.st.status)}<small class="muted">${m.st.sepi === null ? "belum jualan" : m.st.sepi === 0 ? "jualan hari ini" : `${m.st.sepi} hari lalu`}${m.order30 || m.order_prev30 ? ` · ${trenTxt(m.st.tren)}` : ""}</small></span>
                  </button>
                  ${buka === m.id ? detailView(m) : ""}
                </div>`,
              )
              .join("")
          : `<p class="muted">Nggak ada merchant yang cocok.</p>`
      }
    </section>`;
}

export const admin = {
  render() {
    const h = `<header class="page-head"><a href="#/akun" class="back" aria-label="Kembali">${icon("back", 18)}</a><h1>Dashboard Admin</h1></header>`;
    if (!cloud.available) return `${h}<section class="card"><p>Koneksi ke server belum siap. Cek internet lalu muat ulang.</p></section>`;
    if (!cloud.user) return `${h}<section class="card empty"><div class="empty-icon">${icon("lock", 30)}</div><h3>Khusus admin Racikin</h3><p>Masuk pakai akun admin dulu.</p><a href="#/akun" class="btn primary">Masuk</a></section>`;
    if (data.status === "idle" || (data.status === "ok" && adminCache?.uid !== cloud.user.id)) {
      muat();
      return `${h}<section class="card"><p class="muted">Memuat data merchant…</p></section>`;
    }
    if (data.status === "loading" && !data.list.length) return `${h}<section class="card"><p class="muted">Memuat data merchant…</p></section>`;
    if (data.status === "bukan") return `${h}<section class="card empty"><div class="empty-icon">${icon("lock", 30)}</div><h3>Khusus admin Racikin</h3><p>Akun ${esc(cloud.user.email)} bukan admin platform.</p></section>`;
    if (data.status === "error") return `${h}<section class="card"><p class="warn-box small">${esc(data.error)}</p><button class="btn primary" data-action="muat">Coba lagi</button></section>`;
    return `${h}${dashboard()}`;
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
