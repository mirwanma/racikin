// Dashboard admin platform Racikin (#/admin). Hanya akun di tabel platform_admins (dicek di server).
// READ-ONLY: ringkasan platform, adopsi fitur, daftar merchant (cari/filter/urut), detail merchant, export CSV.
import { icon } from "../icons.js";
import { FITUR as FITUR_PAKET, SELALU_GRATIS, FITUR_DEFAULT } from "../paket.js";
import { esc, rupiah, short, todayISO, fmtDate, download, toast } from "../ui.js";
import { render } from "../app.js";
import { sb, cloud } from "../cloud.js";
import { FITUR, STATUS, statusMerchant, ringkasPlatform, saringMerchant, URUT, toCSV, isTes, PERIODE, ringkasHarian, persen, angkaPeriode, perluDisapa, ringkasPaket, jenisPaket, PAKET_NAMA, perpanjang } from "../admin.js";

let data = { status: "idle", list: [], harian: [], paket: {}, setting: null, at: null, error: "" }; // idle | loading | ok | bukan | error
let f = { q: "", status: "", tahap: "", urut: "aktif", tes: false, periode: 30 };
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
  data = { status: "idle", list: [], harian: [], at: null, error: "" };
  detail.clear();
  buka = null;
}

export const TAB_ADMIN = [
  ["ringkasan", "Ringkasan"],
  ["merchant", "Merchant"],
  ["tren", "Pertumbuhan"],
  ["paket", "Paket & harga"],
];
export const tabAdmin = () => {
  const t = new URLSearchParams(location.hash.split("?")[1] || "").get("tab");
  return TAB_ADMIN.some(([k]) => k === t) ? t : "ringkasan";
};


// ---------- Data ----------
async function muat() {
  if (data.status === "loading") return;
  data = { ...data, status: "loading", error: "" };
  render();
  try {
    if (!(await cekAdmin())) {
      data = { status: "bukan", list: [], harian: [], at: null, error: "" };
    } else {
      const [m, h, pk, set] = await Promise.all([
        sb().rpc("admin_merchants"),
        sb().rpc("admin_harian", { p_hari: 90, p_tes: f.tes }),
        sb().rpc("admin_paket"),
        sb().rpc("admin_setting"),
      ]);
      if (m.error) throw new Error(m.error.message);
      const paket = Object.fromEntries((Array.isArray(pk.data) ? pk.data : []).map((x) => [x.id, x]));
      data = { status: "ok", list: Array.isArray(m.data) ? m.data : [], harian: !h.error && Array.isArray(h.data) ? h.data : [], paket, setting: set.error ? null : set.data, at: new Date(), error: "" };
      detail.clear();
    }
  } catch (e) {
    data = { ...data, status: "error", error: e.message || "Gagal memuat data" };
  }
  render();
}

async function muatHarian() {
  const { data: h, error } = await sb().rpc("admin_harian", { p_hari: 90, p_tes: f.tes });
  if (!error && Array.isArray(h)) data = { ...data, harian: h };
  render();
}

async function muatDetail(id) {
  detail.set(id, "loading");
  render();
  const { data: d, error } = await sb().rpc("admin_merchant_detail", { p_owner: id });
  detail.set(id, error ? { error: error.message } : d);
  render();
}

// ---------- Komponen kecil ----------
const tgl = (t) => (t ? fmtDate(String(t).slice(0, 10), { day: "numeric", month: "short", year: "2-digit" }) : "-");
const rp = (n) => "Rp " + short(n);
const WARNA_AV = ["#FFC531", "#F4A6A0", "#9BD5B1", "#A9C8F0", "#E9C1F2", "#F7C59F"];
const warnaAv = (s) => WARNA_AV[[...String(s)].reduce((a, c) => a + c.charCodeAt(0), 0) % WARNA_AV.length];
const avatar = (m) => `<span class="a-av" style="background:${warnaAv(m.nama)}">${esc(String(m.nama || "?").trim()[0]?.toUpperCase() || "?")}</span>`;
const status = (st) => `<span class="a-st ${st}">${STATUS[st].nama}</span>`;
const sepiTxt = (st) => (st.sepi === null ? "belum jualan" : st.sepi === 0 ? "jualan hari ini" : `${st.sepi} hari lalu`);

/** Badge perubahan: +18% hijau / -6% merah. */
function naik(p, { kebalik = false } = {}) {
  if (p === null || !Number.isFinite(p)) return "";
  const r = Math.round(p);
  const baik = kebalik ? r <= 0 : r >= 0;
  return `<span class="a-d ${baik ? "up" : "dn"}">${r > 0 ? "+" : ""}${r}%</span>`;
}

/** Garis (sparkline / area) SVG yang melebar ikut wadah. */
function garis(vals, { h = 40, area = true, cls = "" } = {}) {
  const v = vals.map((x) => Number(x) || 0);
  if (v.length < 2) return "";
  const W = 100;
  const max = Math.max(1, ...v);
  const pts = v.map((x, i) => `${((i / (v.length - 1)) * W).toFixed(2)},${(h - 1.5 - (x / max) * (h - 4)).toFixed(2)}`).join(" ");
  return `<svg class="a-line ${cls}" viewBox="0 0 ${W} ${h}" preserveAspectRatio="none" height="${h}" aria-hidden="true">${area ? `<polygon points="0,${h} ${pts} ${W},${h}" class="a-fill"/>` : ""}<polyline points="${pts}" vector-effect="non-scaling-stroke"/></svg>`;
}

/** Batang harian (dengan label awal & akhir). */
function batang(seri, k, fmt = (n) => n) {
  const max = Math.max(1, ...seri.map((x) => Number(x[k]) || 0));
  return `<div class="a-cols" role="img" aria-label="Grafik harian">${seri
    .map((x) => `<i style="height:${Math.max(1.5, ((Number(x[k]) || 0) / max) * 100)}%" title="${esc(tgl(x.tgl))}: ${esc(String(fmt(Number(x[k]) || 0)))}"></i>`)
    .join("")}</div><div class="a-axis"><span>${tgl(seri[0]?.tgl)}</span><span>hari ini</span></div>`;
}

function meter(items, total, label = (x, max) => `${Math.round((x.n / max) * 100)}%`) {
  const max = Math.max(1, total);
  return `<div class="a-meter">${items
    .map((x) => `<div class="a-meter-row"><span>${esc(x.nama)}</span><span class="a-meter-track"><i style="width:${(x.n / max) * 100}%"></i></span><b>${label(x, max)}</b></div>`)
    .join("")}</div>`;
}

const tile = (judul, isi, cls = "") => `<section class="a-tile ${cls}"><h3>${judul}</h3>${isi}</section>`;

function detailView(m) {
  const d = detail.get(m.id);
  if (!d || d === "loading") return `<div class="a-detail"><p class="a-mut">Memuat detail…</p></div>`;
  if (d.error) return `<div class="a-detail"><p class="warn-box small">${esc(d.error)}</p></div>`;
  return `<div class="a-detail adm-detail">
    <div class="a-detail-head"><span>Pemilik <b>${esc(m.pemilik || "-")}</b></span><a class="a-link" href="mailto:${esc(m.email)}">${esc(m.email)}</a></div>
    <p class="a-mut">${esc([m.jenis, m.konsep, m.kota].filter(Boolean).join(" · "))} · daftar ${tgl(m.daftar)} · login terakhir ${tgl(m.login_terakhir)}${(m.masalah || []).length ? ` · fokus: ${esc(m.masalah.join(", "))}` : ""}</p>
    <div class="a-detail-grid">
      <div class="a-panel"><h4>Order harian 60 hari</h4><div class="adm-chart">${(d.harian || []).map((h) => `<i style="height:${Math.max(1.5, ((Number(h.order) || 0) / Math.max(1, ...(d.harian || []).map((x) => Number(x.order) || 0))) * 100)}%" title="${esc(h.tgl)}: ${h.order} order"></i>`).join("")}</div><div class="a-axis"><span>${tgl(d.harian?.[0]?.tgl)}</span><span>hari ini</span></div></div>
      <div class="a-panel a-kv">
        <div><small>Omzet 7 hari</small><b>${rp(m.omzet7)}</b></div>
        <div><small>Omzet 30 hari</small><b>${rp(m.omzet30)}</b></div>
        <div><small>Rata/order</small><b>${m.order30 ? rp(m.omzet30 / m.order30) : "-"}</b></div>
        <div><small>Pesanan meja 30h</small><b>${d.meja}</b></div>
      </div>
    </div>
    <div class="a-detail-grid">
      <div class="a-panel"><h4>Menu terlaris 30 hari</h4>${(d.terlaris || []).length ? meter(d.terlaris.map((x) => ({ nama: x.nama, n: x.porsi })), Math.max(...d.terlaris.map((x) => x.porsi)), (x) => `${x.n} porsi`) : `<p class="a-mut">Belum ada.</p>`}</div>
      <div class="a-panel"><h4>Tim & AI</h4><p>${(d.tim || []).length ? d.tim.map((t) => `${t.n} ${esc(t.role)}`).join(", ") : "Sendirian"}</p><p class="a-mut">${(d.ai || []).length ? d.ai.map((a) => `${esc(a.task)} ${a.n}`).join(" · ") : "Belum pakai AI"}</p>
        <p class="a-mut">${m.menu} menu · ${m.bahan} bahan · ${m.pelanggan} pelanggan stempel</p></div>
    </div>
    <div class="a-tags">${FITUR.map(([k, n]) => `<span class="${m.fitur?.[k] ? "on" : ""}">${n}</span>`).join("")}</div>
    ${paketPanel(m)}
  </div>`;
}

const pkTag = (m) => {
  const j = jenisPaket(data.paket[m.id]);
  return data.paket[m.id] ? `<span class="a-pk ${j}">${PAKET_NAMA[j]}</span>` : "";
};
const catatanPro = {}; // catatan pembayaran yang diketik admin per merchant

/** Panel paket di detail merchant: status + aktifkan / perpanjang / hentikan Pro. */
function paketPanel(m) {
  const p = data.paket[m.id];
  if (!p) return "";
  const j = jenisPaket(p);
  const ket =
    j === "gratis"
      ? `Gratis${p.pro_terakhir ? ` · Pro terakhir ${tgl(p.pro_terakhir)}` : ""}`
      : `${PAKET_NAMA[j]} sampai ${tgl(p.sampai)}${j === "bayar" ? ` · ${p.periode === "tahun" ? "tahunan" : "bulanan"}` : ""}`;
  return `<div class="a-panel a-paket">
    <h4>Paket</h4>
    <p><span class="a-pk ${j}">${PAKET_NAMA[j]}</span> ${esc(ket)}</p>
    ${p.catatan ? `<p class="a-mut">Catatan: ${esc(p.catatan)}</p>` : ""}
    <input class="a-input" value="${esc(catatanPro[m.id] || "")}" maxlength="200" placeholder="Catatan pembayaran (cth: transfer BCA 20/11)" data-change="catatanPro" data-id="${esc(m.id)}" aria-label="Catatan pembayaran">
    <div class="a-paket-act">
      <button class="a-btn" data-action="proSet" data-id="${esc(m.id)}" data-periode="bulan">${j === "bayar" ? "Perpanjang" : "Aktifkan"} 1 bulan</button>
      <button class="a-btn" data-action="proSet" data-id="${esc(m.id)}" data-periode="tahun">${j === "bayar" ? "Perpanjang" : "Aktifkan"} 1 tahun</button>
      ${j === "bayar" ? `<button class="a-btn neg" data-action="proHenti" data-id="${esc(m.id)}">Hentikan</button>` : ""}
    </div>
  </div>`;
}

/** Setelan platform (harga & nomor WA upgrade), dipakai di halaman Akun mode admin. */
export function platformCard() {
  return `<a href="#/admin?tab=paket" class="card module"><span class="module-num">${icon("receipt", 18)}</span><div><h3>Paket & harga</h3><p class="muted small">Atur fitur Gratis / Pro, kuota AI, harga, masa coba & nomor WA upgrade</p></div><span class="chev">${icon("chevron", 18)}</span></a>`;
}

// ---------- Bagian halaman ----------
function kepala(judul, sub, aksi = "") {
  const nTes = data.list.filter(isTes).length;
  return `<header class="a-top">
      <div><h1>${esc(judul)}</h1><p class="a-mut">${esc(sub)} · diperbarui ${data.at ? data.at.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : "-"}</p></div>
      <div class="a-top-act">
        <div class="a-seg" role="group" aria-label="Periode">${PERIODE.map((n) => `<button data-action="periode" data-n="${n}" class="${f.periode === n ? "on" : ""}" aria-pressed="${f.periode === n}">${n} hari</button>`).join("")}</div>
        <button class="a-btn" data-action="muat" aria-label="Muat ulang">${icon("sync", 15)}<span>Muat ulang</span></button>${aksi}
      </div>
    </header>
    ${nTes ? `<label class="a-tes"><input type="checkbox" data-change="tes" ${f.tes ? "checked" : ""}><span>Ikutkan ${nTes} akun tes (@racikin.test)</span></label>` : ""}`;
}

function semuaMerchant() {
  return f.tes ? data.list : data.list.filter((m) => !isTes(m));
}

function tabelMerchant(rows, { ringkas = false } = {}) {
  const n = f.periode;
  if (!rows.length) return `<p class="a-mut a-pad">Nggak ada merchant yang cocok.</p>`;
  return `<div class="a-table" role="table">
    <div class="a-tr a-th" role="row"><span>Usaha</span><span>Status</span><span class="a-hide-sm">Order 14 hari</span><span class="num">Order ${n}h</span><span class="num">Omzet ${n}h</span><span class="num a-hide-sm">Tren</span></div>
    ${rows
      .map((m) => {
        const a = angkaPeriode(m, n);
        const t = m.st.tren;
        return `<div class="a-row ${buka === m.id ? "open" : ""}">
          <button class="a-tr" data-action="detail" data-id="${esc(m.id)}" role="row" aria-expanded="${buka === m.id}">
            <span class="a-usaha">${avatar(m)}<span><b>${esc(m.nama)}</b><small>${pkTag(m)} ${esc([m.kota, m.jenis].filter(Boolean).join(" · ") || "-")}${isTes(m) ? " · tes" : ""}</small></span></span>
            <span>${status(m.st.status)}<small class="a-sm-only">${sepiTxt(m.st)}</small></span>
            <span class="a-hide-sm a-spark ${m.st.status === "berisiko" ? "neg" : ""}">${garis(m.seri14 || [], { h: 26 })}</span>
            <span class="num">${a.order.toLocaleString("id-ID")}</span>
            <span class="num">${a.omzet ? short(a.omzet) : "-"}</span>
            <span class="num a-hide-sm ${t === null || (!m.order30 && !m.order_prev30) ? "" : t >= 0 ? "pos" : "neg"}">${!m.order30 && !m.order_prev30 ? "-" : t === null ? "baru" : `${t > 0 ? "+" : ""}${Math.round(t)}%`}</span>
          </button>
          ${!ringkas && buka === m.id ? detailView(m) : ""}
        </div>`;
      })
      .join("")}
  </div>`;
}

function disapaList(list, maks = 5) {
  if (!list.length) return `<p class="a-mut">Aman, nggak ada yang perlu disapa.</p>`;
  return list
    .slice(0, maks)
    .map(
      (x) => `<a class="a-alert" href="#/admin?tab=merchant&id=${esc(x.m.id)}"><i class="a-dot ${x.jenis}"></i><span><b>${esc(x.m.nama)}</b><small>${esc(x.teks)}</small></span><span class="a-alert-act">${x.jenis === "setup" ? "Bantu" : "Lihat"}</span></a>`,
    )
    .join("");
}

function ringkasanTab() {
  const today = todayISO();
  const semua = semuaMerchant();
  const r = ringkasPlatform(semua, today);
  const n = f.periode;
  const h = ringkasHarian(data.harian, n);
  const x = semua.map((m) => ({ ...m, st: statusMerchant(m, today) }));
  const sapa = perluDisapa(semua, today);
  const berisiko = x.filter((m) => m.st.status === "berisiko");
  const top = [...x].sort((a, b) => angkaPeriode(b, n).omzet - angkaPeriode(a, n).omzet || String(b.jualan_terakhir || "").localeCompare(String(a.jualan_terakhir || ""))).slice(0, 6);
  const baruPeriode = x.filter((m) => m.st.umur < n).length;
  const nBerisiko = berisiko.length;
  const adaHarian = h.seri.length > 0;
  const omzet = adaHarian ? h.omzet : semua.reduce((a, m) => a + angkaPeriode(m, n).omzet, 0);
  const order = adaHarian ? h.order : semua.reduce((a, m) => a + angkaPeriode(m, n).order, 0);
  return `${kepala("Ringkasan", `${fmtDate(today, { weekday: "long", day: "numeric", month: "short" })} · data read-only`)}
    <div class="a-bento">
      <section class="a-tile a-hero">
        <h3>Omzet merchant ${n} hari</h3>
        <div class="a-big-row"><b class="a-big xl">${rp(omzet)}</b>${adaHarian && h.adaPrev ? naik(persen(h.omzet, h.prev.omzet)) : ""}</div>
        <p class="a-mut">${order.toLocaleString("id-ID")} order · rata-rata ${order ? rp(omzet / order) : "-"}/order${adaHarian ? ` · ${h.jualanRata.toFixed(1).replace(".", ",")} merchant jualan per hari` : ""}</p>
        <div class="a-hero-chart">${adaHarian ? garis(h.seri.map((d) => d.omzet), { h: 110 }) : ""}</div>
      </section>
      ${tile("Merchant", `<div class="a-big-row"><b class="a-big">${r.total}</b>${baruPeriode ? `<span class="a-d up">+${baruPeriode}</span>` : ""}</div><p class="a-mut">${baruPeriode} daftar ${n} hari terakhir</p>`)}
      ${tile("Aktif 7 hari", `<div class="a-big-row"><b class="a-big">${r.aktif7}</b><span class="a-mut">/ ${r.total}</span></div><div class="a-prog"><i style="width:${r.total ? (r.aktif7 / r.total) * 100 : 0}%"></i></div><p class="a-mut">${r.aktif30} aktif 30 hari</p>`)}
      ${tile("Berisiko berhenti", `<div class="a-big-row"><b class="a-big ${nBerisiko ? "neg" : ""}">${nBerisiko}</b></div><p class="a-mut">${nBerisiko ? `${esc(berisiko[0].nama)}${nBerisiko > 1 ? ` +${nBerisiko - 1} lagi` : ""} · ${sepiTxt(berisiko[0].st)}` : "Semua masih jualan"}</p>`, nBerisiko ? "warn" : "")}
      ${tile("Pemakaian AI", `<div class="a-big-row"><b class="a-big">${(adaHarian ? h.ai : r.ai30).toLocaleString("id-ID")}</b>${adaHarian && h.adaPrev ? naik(persen(h.ai, h.prev.ai)) : ""}</div><div class="a-mini-chart sky">${adaHarian ? garis(h.seri.map((d) => d.ai), { h: 30 }) : ""}</div>`)}
    </div>
    ${langgananTiles(semua)}
    <div class="a-split">
      <section class="a-tile a-flush">
        <div class="a-tile-head"><h2>Merchant teratas</h2><a class="a-link" href="#/admin?tab=merchant">Lihat semua ${icon("chevron", 13)}</a></div>
        ${tabelMerchant(top, { ringkas: true })}
      </section>
      <div class="a-stack">
        ${tile(`Perlu disapa${sapa.length ? ` <span class="a-count">${sapa.length}</span>` : ""}`, disapaList(sapa))}
        ${tile("Adopsi fitur", meter([...r.fitur].sort((a, b) => b.n - a.n).slice(0, 6), r.total))}
      </div>
    </div>`;
}

function langgananTiles(semua) {
  const r = ringkasPaket(semua, data.paket, data.setting || {});
  return `<div class="a-bento a-bento-4">
    ${tile("Pendapatan / bulan (MRR)", `<div class="a-big-row"><b class="a-big">${rp(r.mrr)}</b></div><p class="a-mut">${r.bayar} Pro berbayar${r.tahunan ? ` (${r.tahunan} tahunan)` : ""}</p>`)}
    ${tile("Pro berbayar", `<div class="a-big-row"><b class="a-big">${r.bayar}</b></div><p class="a-mut">${r.konversi === null ? "belum ada yang selesai coba" : `${r.konversi}% dari yang selesai coba`}</p>`)}
    ${tile("Masa coba / transisi", `<div class="a-big-row"><b class="a-big">${r.coba + r.transisi}</b></div><p class="a-mut">${r.coba} coba · ${r.transisi} transisi</p>`)}
    ${tile("Gratis", `<div class="a-big-row"><b class="a-big">${r.gratis}</b></div><p class="a-mut">calon pelanggan Pro</p>`)}
  </div>`;
}

const CHIP = [["", "Semua"], ["aktif", "Aktif"], ["berisiko", "Berisiko"], ["baru", "Baru"], ["tidur", "Belum jualan"]];

function merchantTab() {
  const today = todayISO();
  const rows = saringMerchant(data.list, f, today);
  const dasar = saringMerchant(data.list, { ...f, status: "" }, today);
  const hitung = (k) => (k ? dasar.filter((m) => m.st.status === k).length : dasar.length);
  return `${kepala("Merchant", "Cari, saring & lihat detail tiap usaha", `<button class="a-btn" data-action="csv">${icon("download", 15)}<span>CSV</span></button>`)}
    <section class="a-tile a-flush">
      <div class="a-filter">
        <div class="a-chips">${CHIP.map(([k, n]) => `<button data-action="chip" data-k="${k}" class="${f.status === k ? "on" : ""}">${n} <span>${hitung(k)}</span></button>`).join("")}</div>
        <div class="a-filter-row">
          <input type="search" value="${esc(f.q)}" placeholder="Cari nama usaha, email, kota…" data-change="q" aria-label="Cari merchant">
          <select data-change="tahap" aria-label="Tahap"><option value="">Semua tahap</option><option value="ide" ${f.tahap === "ide" ? "selected" : ""}>Baru ide</option><option value="jalan" ${f.tahap === "jalan" ? "selected" : ""}>Udah jalan</option></select>
          <select data-change="urut" aria-label="Urutkan">${URUT.map(([k, n]) => `<option value="${k}" ${f.urut === k ? "selected" : ""}>${n}</option>`).join("")}</select>
          <select data-change="status" aria-label="Status" class="a-hide"><option value="">Semua status</option>${Object.entries(STATUS).map(([k, x]) => `<option value="${k}" ${f.status === k ? "selected" : ""}>${x.nama}</option>`).join("")}</select>
        </div>
      </div>
      <p class="a-mut a-pad">${rows.length} merchant</p>
      ${tabelMerchant(rows)}
    </section>`;
}

function trenTab() {
  const today = todayISO();
  const semua = semuaMerchant();
  const r = ringkasPlatform(semua, today);
  const n = f.periode;
  const h = ringkasHarian(data.harian, n);
  const ada = h.seri.length > 0;
  const tahapTotal = r.tahap.ide + r.tahap.jalan || 1;
  return `${kepala("Pertumbuhan", "Transaksi, pendaftar, adopsi fitur & sebaran merchant")}
    <div class="a-bento a-bento-4">
      ${tile(`Order ${n} hari`, `<div class="a-big-row"><b class="a-big">${(ada ? h.order : r.order30).toLocaleString("id-ID")}</b>${ada && h.adaPrev ? naik(persen(h.order, h.prev.order)) : ""}</div>`)}
      ${tile(`Omzet ${n} hari`, `<div class="a-big-row"><b class="a-big">${rp(ada ? h.omzet : r.omzet30)}</b>${ada && h.adaPrev ? naik(persen(h.omzet, h.prev.omzet)) : ""}</div>`)}
      ${tile(`Pendaftar ${n} hari`, `<div class="a-big-row"><b class="a-big">${ada ? h.daftar : r.baru30}</b>${ada && h.adaPrev ? naik(persen(h.daftar, h.prev.daftar)) : ""}</div>`)}
      ${tile(`Pakai AI ${n} hari`, `<div class="a-big-row"><b class="a-big">${(ada ? h.ai : r.ai30).toLocaleString("id-ID")}</b>${ada && h.adaPrev ? naik(persen(h.ai, h.prev.ai)) : ""}</div>`)}
    </div>
    ${ada ? `<div class="a-split even">
      ${tile("Order harian", batang(h.seri, "order", (v) => `${v} order`))}
      ${tile("Merchant yang jualan per hari", batang(h.seri, "jualan", (v) => `${v} merchant`))}
    </div>` : ""}
    <div class="a-split even">
      ${tile("Pendaftar per minggu (8 minggu)", batang(r.daftarMinggu.map((x) => ({ tgl: x.minggu, n: x.n })), "n", (v) => `${v} pendaftar`))}
      ${tile("Adopsi fitur", meter([...r.fitur].sort((a, b) => b.n - a.n), r.total))}
    </div>
    <div class="a-split even">
      ${tile("Tahap & status", `<div class="a-stackbar"><i style="width:${(r.tahap.jalan / tahapTotal) * 100}%"></i></div><p class="a-legend"><span><i class="y"></i>Udah jalan <b>${r.tahap.jalan}</b></span><span><i></i>Baru ide <b>${r.tahap.ide}</b></span></p>
        <div class="a-status-grid">${r.status.map(([k, nn]) => `<div>${status(k)}<b>${nn}</b></div>`).join("")}</div>`)}
      ${tile("Kota & jenis usaha", `<h4>Kota</h4>${r.kota.length ? meter(r.kota.map(([k, nn]) => ({ nama: k, n: nn })), r.total, (x) => x.n) : `<p class="a-mut">-</p>`}<h4>Jenis</h4>${r.jenis.length ? meter(r.jenis.map(([k, nn]) => ({ nama: k, n: nn })), r.total, (x) => x.n) : `<p class="a-mut">-</p>`}`)}
    </div>`;
}

const tglInput = (t) => (t ? new Date(t).toLocaleDateString("sv-SE", { timeZone: "Asia/Jakarta" }) : "");

/** Halaman Paket & harga: tabel fitur Gratis / Pro, kuota AI, harga, masa coba & transisi, nomor WA upgrade. */
function paketTab() {
  const st = data.setting || {};
  const fitur = { ...FITUR_DEFAULT, ...(st.fitur || {}) };
  const r = ringkasPaket(semuaMerchant(), data.paket, st);
  const hb = Number(st.harga_bulan ?? 49000);
  const ht = Number(st.harga_tahun ?? 490000);
  const seg = (id, v) => `<div class="a-seg a-seg-sm" role="radiogroup" aria-label="${esc(id)}">
      <label class="${v === "gratis" ? "on" : ""}"><input type="radio" name="f_${id}" value="gratis" ${v === "gratis" ? "checked" : ""} data-change="segPaket">Gratis</label>
      <label class="${v !== "gratis" ? "on" : ""}"><input type="radio" name="f_${id}" value="pro" ${v !== "gratis" ? "checked" : ""} data-change="segPaket">Pro</label>
    </div>`;
  return `<header class="a-top"><div><h1>Paket & harga</h1><p class="a-mut">Atur fitur Gratis vs Pro, kuota AI & harga. Langsung berlaku ke semua merchant (dicek server).</p></div>
      <div class="a-top-act"><button class="a-btn" data-action="muat">${icon("sync", 15)}<span>Muat ulang</span></button></div></header>
    <div class="a-bento a-bento-4">
      ${tile("Pro berbayar", `<div class="a-big-row"><b class="a-big">${r.bayar}</b></div><p class="a-mut">MRR ${rp(r.mrr)}</p>`)}
      ${tile("Masa coba / transisi", `<div class="a-big-row"><b class="a-big">${r.coba + r.transisi}</b></div><p class="a-mut">tetap dapat semua fitur Pro</p>`)}
      ${tile("Gratis", `<div class="a-big-row"><b class="a-big">${r.gratis}</b></div><p class="a-mut">kena aturan di bawah</p>`)}
      ${tile("Terakhir diubah", `<div class="a-big-row"><b class="a-big sm">${st.diubah ? tgl(st.diubah) : "-"}</b></div>`)}
    </div>
    <form class="a-stack" data-form="paketAdmin">
      <section class="a-tile a-flush">
        <div class="a-tile-head"><h2>Tabel fitur</h2><span class="a-mut">pilih Gratis / Pro per fitur</span></div>
        <div class="a-table a-ptable">
          <div class="a-tr a-th"><span>Fitur</span><span>Paket</span></div>
          ${FITUR_PAKET.map((f) => `<div class="a-tr"><span class="a-usaha"><span><b>${esc(f.nama)}</b><small>${esc(f.ket)}</small></span></span><span>${seg(f.id, fitur[f.id])}</span></div>`).join("")}
          <div class="a-tr"><span class="a-usaha"><span><b>Kuota AI per akun per hari</b><small>Mentor, analisa, konten, baca menu/nota dari foto</small></span></span>
            <span class="a-ai-kuota"><label>Gratis <input class="a-input" type="number" name="ai_gratis" min="0" max="1000" value="${st.ai_gratis ?? 20}"></label><label>Pro <input class="a-input" type="number" name="ai_pro" min="0" max="5000" value="${st.ai_pro ?? 300}"></label></span></div>
          ${SELALU_GRATIS.map((n) => `<div class="a-tr a-tetap"><span class="a-usaha"><span><b>${esc(n)}</b><small>fitur inti</small></span></span><span class="a-mut">Selalu gratis</span></div>`).join("")}
        </div>
      </section>
      <div class="a-split even">
        <section class="a-tile">
          <h3>Harga Pro</h3>
          <div class="a-form-grid">
            <label>Bulanan (Rp)<input class="a-input" type="number" name="harga_bulan" min="0" step="1000" value="${hb}" required></label>
            <label>Tahunan (Rp)<input class="a-input" type="number" name="harga_tahun" min="0" step="1000" value="${ht}" required></label>
          </div>
          <p class="a-mut">${ht < hb * 12 ? `Tahunan hemat ${rp(hb * 12 - ht)} (±${Math.round((hb * 12 - ht) / Math.max(1, hb))} bulan gratis)` : "Tahunan nggak lebih murah dari 12x bulanan"}</p>
        </section>
        <section class="a-tile">
          <h3>Masa coba & transisi</h3>
          <div class="a-form-grid">
            <label>Masa coba pendaftar baru (hari)<input class="a-input" type="number" name="coba_hari" min="0" max="90" value="${st.coba_hari ?? 14}" required></label>
            <label>Akun lama gratis Pro sampai<input class="a-input" type="date" name="transisi_sampai" value="${tglInput(st.transisi_sampai) || "2027-02-20"}" required></label>
          </div>
          <p class="a-mut">0 hari = tanpa masa coba. Mengubah masa coba berlaku juga ke pendaftar yang lagi coba.</p>
        </section>
      </div>
      <section class="a-tile">
        <h3>Upgrade</h3>
        <div class="a-form-grid">
          <label>Nomor WA admin (tombol upgrade di app merchant)<input class="a-input" type="tel" inputmode="tel" name="wa" maxlength="20" value="${esc(st.wa || "")}" placeholder="08xx / 628xx"></label>
        </div>
        <p class="a-mut">${st.wa ? "Merchant yang klik Upgrade langsung chat ke nomor ini (pesan berisi email & nama usaha)." : "Masih kosong: tombol upgrade di app merchant tampil \"sebentar lagi dibuka\"."}</p>
      </section>
      <div class="a-save"><button class="btn primary">Simpan pengaturan paket</button></div>
    </form>`;
}

/** Simpan konfigurasi paket dari form. */
async function simpanPaket(form) {
  const fd = new FormData(form);
  const fitur = Object.fromEntries(FITUR_PAKET.map((f) => [f.id, fd.get("f_" + f.id) === "gratis" ? "gratis" : "pro"]));
  const p = {
    wa: String(fd.get("wa") || ""),
    harga_bulan: Number(fd.get("harga_bulan")) || 0,
    harga_tahun: Number(fd.get("harga_tahun")) || 0,
    coba_hari: Number(fd.get("coba_hari")) || 0,
    transisi_sampai: `${fd.get("transisi_sampai")}T23:59:59+07:00`,
    ai_gratis: Number(fd.get("ai_gratis")) || 0,
    ai_pro: Number(fd.get("ai_pro")) || 0,
    fitur,
  };
  const gratisJadi = FITUR_PAKET.filter((f) => fitur[f.id] === "gratis" && (data.setting?.fitur?.[f.id] || "pro") !== "gratis").map((f) => f.nama);
  const proJadi = FITUR_PAKET.filter((f) => fitur[f.id] === "pro" && (data.setting?.fitur?.[f.id] || "pro") === "gratis").map((f) => f.nama);
  const ubah = [gratisJadi.length ? `Jadi Gratis: ${gratisJadi.join(", ")}` : "", proJadi.length ? `Jadi Pro (merchant Gratis kehilangan akses): ${proJadi.join(", ")}` : ""].filter(Boolean).join("\n");
  if (!confirm(`Simpan pengaturan paket? Langsung berlaku ke semua merchant.${ubah ? "\n\n" + ubah : ""}`)) return;
  const { data: st, error } = await sb().rpc("admin_set_paket", { p });
  if (error) throw new Error(error.message);
  data = { ...data, setting: st };
  toast("Pengaturan paket disimpan");
  render();
}

const TAB_VIEW = { ringkasan: ringkasanTab, merchant: merchantTab, tren: trenTab, paket: paketTab };

/** Angka "berisiko" di menu samping (badge di Merchant). */
function badgeMenu() {
  const el = document.querySelector('.tabbar a[data-tab="admin-merchant"] .a-nav-badge');
  if (!el) return;
  const n = data.status === "ok" ? perluDisapa(semuaMerchant(), todayISO()).length : 0;
  el.textContent = n || "";
  el.hidden = !n;
}

export const admin = {
  render() {
    const h = `<header class="a-top"><div><h1>Dashboard Admin</h1></div></header>`;
    const kartu = (isi) => `${h}<section class="a-tile a-empty">${isi}</section>`;
    if (!cloud.available) return kartu(`<p>Koneksi ke server belum siap. Cek internet lalu muat ulang.</p>`);
    if (!cloud.user && !cloud.authSiap) return kartu(`<p class="a-mut">Memuat…</p>`);
    if (!cloud.user) return kartu(`${icon("lock", 30)}<h3>Khusus admin Racikin</h3><p class="a-mut">Masuk pakai akun admin dulu.</p><a href="#/akun" class="btn primary">Masuk</a>`);
    if (data.status === "idle" || (data.status === "ok" && adminCache?.uid !== cloud.user.id)) {
      muat();
      return skeleton();
    }
    if (data.status === "loading" && !data.list.length) return skeleton();
    if (data.status === "bukan") return kartu(`${icon("lock", 30)}<h3>Khusus admin Racikin</h3><p class="a-mut">Akun ${esc(cloud.user.email)} bukan admin platform.</p><a href="#/" class="btn ghost">Ke Beranda</a>`);
    if (data.status === "error") return kartu(`<p class="warn-box small">${esc(data.error)}</p><button class="btn primary" data-action="muat">Coba lagi</button>`);
    const tab = tabAdmin();
    // Link dari Ringkasan: buka detail merchant tertentu
    const id = new URLSearchParams(location.hash.split("?")[1] || "").get("id");
    if (tab === "merchant" && id && buka !== id && data.list.some((m) => m.id === id)) {
      buka = id;
      gulir = id;
      history.replaceState(null, "", "#/admin?tab=merchant");
      if (!detail.has(id)) queueMicrotask(() => muatDetail(id));
    }
    return `<div class="a-wrap">${TAB_VIEW[tab]()}</div>`;
  },
  after(root) {
    badgeMenu();
    if (gulir && tabAdmin() === "merchant") {
      const el = root.querySelector(`.a-row [data-id="${CSS.escape(gulir)}"]`);
      if (el) {
        gulir = null;
        setTimeout(() => el.scrollIntoView({ block: "start" }), 0); // setelah scroll-ke-atas bawaan pindah halaman
      }
    }
  },
  forms: {
    paketAdmin(form) {
      return simpanPaket(form);
    },
  },
  changes: {
    segPaket(el) {
      el.closest(".a-seg")?.querySelectorAll("label").forEach((l) => l.classList.toggle("on", l.contains(el)));
    },
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
    catatanPro(el) {
      catatanPro[el.dataset.id] = el.value;
    },
    tes(el) {
      f.tes = el.checked;
      render();
      muatHarian();
    },
  },
  actions: {
    muat: () => muat(),
    periode(el) {
      f.periode = Number(el.dataset.n) || 30;
      render();
    },
    async proSet(el) {
      const id = el.dataset.id;
      const m = data.list.find((x) => x.id === id);
      const p = data.paket[id];
      const sampai = perpanjang(p, el.dataset.periode);
      if (!confirm(`${jenisPaket(p) === "bayar" ? "Perpanjang" : "Aktifkan"} Pro ${m?.nama || ""} sampai ${tgl(sampai)}?`)) return;
      const { data: info, error } = await sb().rpc("admin_set_langganan", { p_owner: id, p_sampai: sampai, p_periode: el.dataset.periode, p_catatan: catatanPro[id] || "" });
      if (error) return toast(error.message, "err");
      data.paket = { ...data.paket, [id]: { ...info, id, catatan: catatanPro[id] || "" } };
      delete catatanPro[id];
      toast(`Pro ${m?.nama || ""} aktif sampai ${tgl(sampai)}`);
      render();
    },
    async proHenti(el) {
      const id = el.dataset.id;
      const m = data.list.find((x) => x.id === id);
      if (!confirm(`Hentikan Pro berbayar ${m?.nama || ""} sekarang?`)) return;
      const { data: info, error } = await sb().rpc("admin_set_langganan", { p_owner: id, p_sampai: null, p_periode: "lain", p_catatan: catatanPro[id] || "dihentikan admin" });
      if (error) return toast(error.message, "err");
      data.paket = { ...data.paket, [id]: { ...info, id, catatan: "" } };
      toast("Pro berbayar dihentikan");
      render();
    },
    chip(el) {
      f.status = el.dataset.k;
      render();
    },
    detail(el) {
      const id = el.dataset.id;
      if (tabAdmin() !== "merchant") {
        location.hash = "#/admin?tab=merchant&id=" + encodeURIComponent(id);
        return;
      }
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

function skeleton() {
  return `<div class="a-wrap"><header class="a-top"><div><h1>Ringkasan</h1><p class="a-mut">Memuat data merchant…</p></div></header>
    <div class="a-bento">${'<section class="a-tile a-skel"></section>'.repeat(5).replace('a-tile a-skel', "a-tile a-skel a-hero")}</div></div>`;
}
