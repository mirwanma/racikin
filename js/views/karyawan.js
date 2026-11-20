// Karyawan & absen (#/karyawan, pemilik/manajer): absen harian sekali ketuk, otomatis dari shift kasir,
// impor file mesin absen fingerprint (Excel .xls/.xlsx, CSV, log teks), rekap per bulan, data karyawan.
import { icon } from "../icons.js";
import { esc, toast, todayISO, addDays, fmtDate, download } from "../ui.js";
import { store } from "../store.js";
import { render } from "../app.js";
import { head } from "./_shared.js";
import { normWa } from "../loyalty.js";
import { parseTabel } from "../imporjual.js";
import {
  STATUS, KOLOM, setelan, tambahPosisi, hapusPosisi, hitungPosisi, absenAktif, karyawanAktif, absenHari, catatAbsen, semuaHadir, rekapAbsen, ringkasHari,
  simpanKaryawan, kenaliTabel, olahAbsen, simpanImpor,
} from "../absen.js";

let tab = "absen"; // absen | rekap | orang
let tgl = todayISO();
let ym = todayISO().slice(0, 7);
let edit = null; // id karyawan yang diedit ("baru" = tambah)
let impor = null; // { step: input|kolom|ringkas, nama, tabel, map, hasil, tambah:Set, petakan:{}, timpa }
const XLSX_SRC = "js/vendor/xlsx-0.20.3.full.min.js";
const hariTeks = (iso) => fmtDate(iso, { weekday: "long", day: "numeric", month: "long" });
const pendek = (iso) => fmtDate(iso, { day: "numeric", month: "short" });
const jamKerja = (m) => (m ? `${Math.floor(m / 60)}j ${m % 60 ? `${m % 60}m` : ""}`.trim() : "-");

const CONTOH = "PIN,Nama,Tanggal scan\n1,Ujang,18/11/2026 07:58\n1,Ujang,18/11/2026 17:02\n2,Siti,18/11/2026 08:21\n2,Siti,18/11/2026 16:05\n";

/** Pengingat Beranda: absen hari ini belum dicatat (setelah jam masuk + 1 jam). */
export function absenCard(s) {
  if (!absenAktif(s)) return "";
  const r = ringkasHari(s, todayISO());
  const [h, m] = setelan(s).jamMasuk.split(":").map(Number);
  const now = new Date();
  if (!r.total || !r.belum.length || now.getHours() * 60 + now.getMinutes() < h * 60 + m + 60) return "";
  return `<a href="#/karyawan" class="card pajak-mini">
    ${icon("team", 22)}
    <span><b>Absen hari ini: ${r.tercatat}/${r.total} tercatat</b><small class="muted">Belum: ${r.belum.slice(0, 3).map((k) => esc(k.nama)).join(", ")}${r.belum.length > 3 ? ` +${r.belum.length - 3}` : ""}</small></span>
    ${icon("chevron", 18)}
  </a>`;
}

// ---------- Absen harian ----------
function barisAbsen(s, k, a) {
  return `<div class="absen-row" data-id="${k.id}">
    <div class="absen-nama"><b>${esc(k.nama)}</b><small class="muted">${esc(k.posisi || "")}${a?.sumber === "shift" ? " · dari shift kasir" : a?.sumber === "mesin" ? " · mesin absen" : ""}${a?.telat ? ` · <span class="neg">telat</span>` : ""}</small></div>
    <div class="absen-status">${STATUS.map((x) => `<button class="chip-btn ${a?.status === x.id ? `on ${x.cls}` : ""}" data-action="status" data-id="${k.id}" data-v="${x.id}" aria-pressed="${a?.status === x.id}">${x.nama}</button>`).join("")}</div>
    ${
      a?.status === "hadir"
        ? `<div class="absen-jam"><label><small>Masuk</small><input type="time" value="${esc(a.masuk || "")}" data-change="jam" data-f="masuk" data-id="${k.id}"></label><label><small>Pulang</small><input type="time" value="${esc(a.pulang || "")}" data-change="jam" data-f="pulang" data-id="${k.id}"></label></div>`
        : ""
    }
  </div>`;
}

function absenTab(s) {
  const today = todayISO();
  const ks = karyawanAktif(s);
  if (!ks.length) return `<section class="card empty"><div class="empty-icon">${icon("team", 30)}</div><h3>Belum ada karyawan</h3><p>Tambah karyawan dulu, atau langsung impor file dari mesin absen (nama & PIN-nya ikut masuk).</p><button class="btn primary" data-action="tab" data-t="orang">Tambah karyawan</button> <button class="btn soft" data-action="imporBuka">${icon("download", 16)} Impor dari mesin absen</button></section>`;
  const a = absenHari(s, tgl);
  const r = ringkasHari(s, tgl);
  return `
    <div class="month-nav"><button class="icon-btn" data-action="geser" data-d="-1" aria-label="Hari sebelumnya">${icon("back", 16)}</button><b>${esc(hariTeks(tgl))}</b><button class="icon-btn" data-action="geser" data-d="1" aria-label="Hari berikutnya" ${tgl >= today ? "disabled" : ""}>${icon("chevron", 16)}</button></div>
    <section class="card">
      <div class="row-between"><span class="small">${r.tercatat}/${r.total} tercatat · ${r.hadir} hadir</span>${r.belum.length ? `<button class="btn soft sm" data-action="semuaHadir">${icon("check", 14)} Sisanya hadir</button>` : ""}</div>
      ${ks.map((k) => barisAbsen(s, k, a[k.id])).join("")}
    </section>
    <button class="btn soft block" data-action="imporBuka">${icon("download", 16)} Impor dari mesin absen (fingerprint)</button>
    <p class="small muted">Jam masuk ${esc(setelan(s).jamMasuk)}, toleransi ${setelan(s).toleransi} menit. Karyawan yang dihubungkan ke akun kasir otomatis hadir waktu buka shift.</p>`;
}

// ---------- Rekap ----------
function rekapTab(s) {
  const dari = `${ym}-01`;
  const akhir = `${ym}-${String(new Date(Number(ym.slice(0, 4)), Number(ym.slice(5)), 0).getDate()).padStart(2, "0")}`;
  const sampai = akhir > todayISO() ? todayISO() : akhir;
  const r = rekapAbsen(s, dari, sampai);
  const ks = (s.karyawan || []).filter((k) => k.aktif !== false || Object.values(r[k.id] || {}).some((x) => x));
  const nama = new Date(ym + "-01T00:00:00").toLocaleDateString("id-ID", { month: "long", year: "numeric" });
  return `
    <div class="month-nav"><button class="icon-btn" data-action="bulan" data-d="-1" aria-label="Bulan sebelumnya">${icon("back", 16)}</button><b>${esc(nama)}</b><button class="icon-btn" data-action="bulan" data-d="1" aria-label="Bulan berikutnya" ${ym >= todayISO().slice(0, 7) ? "disabled" : ""}>${icon("chevron", 16)}</button></div>
    <section class="card">
      ${
        ks.length
          ? `<div class="rekap-absen">
        <div class="rk-row rk-th"><span>Nama</span><span>Hadir</span><span>Telat</span><span>Izin/ Sakit</span><span>Libur</span><span>Alpa</span><span>Jam kerja</span></div>
        ${ks
          .map((k) => {
            const x = r[k.id];
            return `<div class="rk-row"><span><b>${esc(k.nama)}</b></span><span class="pos">${x.hadir}</span><span class="${x.telat ? "neg" : ""}">${x.telat}</span><span>${x.izin + x.sakit}</span><span>${x.libur}</span><span class="${x.alpa ? "neg" : ""}">${x.alpa}</span><span class="mono">${jamKerja(x.menit)}</span></div>`;
          })
          .join("")}
      </div>
      <p class="small muted">${pendek(dari)} – ${pendek(sampai)}. Jam kerja dihitung dari hari yang ada jam masuk & pulang.</p>
      <button class="btn soft sm" data-action="csv">${icon("download", 14)} Unduh CSV</button>`
          : `<p class="small muted">Belum ada karyawan.</p>`
      }
    </section>`;
}

// ---------- Karyawan ----------
function akunKasir(s) {
  const m = new Map();
  for (const sh of s.shifts || []) if (sh.kasir?.id) m.set(sh.kasir.id, sh.kasir.nama || "Kasir");
  return [...m.entries()];
}

function formKaryawan(s, k) {
  const akun = akunKasir(s);
  return `<form class="stack inline-form" data-form="karyawan" data-id="${k?.id || ""}">
    <div class="row2">
      <label class="field"><span>Nama</span><input name="nama" maxlength="40" value="${esc(k?.nama || "")}" required></label>
      <label class="field"><span>Posisi</span><select name="posisi"><option value="">-</option>${[...new Set([...setelan(s).posisi, ...(k?.posisi ? [k.posisi] : [])])].map((p) => `<option ${k?.posisi === p ? "selected" : ""}>${esc(p)}</option>`).join("")}</select></label>
    </div>
    <div class="row2">
      <label class="field"><span>No. WA (opsional)</span><input name="wa" inputmode="tel" maxlength="20" value="${esc(k?.wa || "")}"></label>
      <label class="field"><span>PIN / ID di mesin absen</span><input name="pin" maxlength="20" value="${esc(k?.pin || "")}" placeholder="cth: 3"></label>
    </div>
    ${akun.length ? `<label class="field"><span>Akun kasir (absen otomatis dari shift)</span><select name="akunId"><option value="">Tidak dihubungkan</option>${akun.map(([id, nm]) => `<option value="${esc(id)}" ${k?.akunId === id ? "selected" : ""}>${esc(nm)}</option>`).join("")}</select></label>` : ""}
    ${k ? `<label class="impor-cek"><input type="checkbox" name="aktif" ${k.aktif !== false ? "checked" : ""}><span>Masih bekerja (hilangkan centang kalau sudah keluar, riwayat absen tetap ada)</span></label>` : ""}
    <div class="row2"><button type="button" class="btn ghost" data-action="batalEdit">Batal</button><button class="btn primary">Simpan</button></div>
  </form>`;
}

function orangTab(s) {
  const list = [...(s.karyawan || [])].sort((a, b) => (a.aktif === false) - (b.aktif === false) || a.nama.localeCompare(b.nama, "id"));
  const st = setelan(s);
  const hitung = hitungPosisi(s);
  return `
    ${list
      .map(
        (k) => `<section class="card ${k.aktif === false ? "muted" : ""}">
        <div class="row-between"><div><h2 class="card-title" style="margin:0">${esc(k.nama)}${k.aktif === false ? ` <small class="muted">(sudah keluar)</small>` : ""}</h2>
          <p class="small muted">${[k.posisi, k.pin ? `PIN ${esc(k.pin)}` : "", k.akunId ? "akun kasir" : "", k.wa ? esc(k.wa) : ""].filter(Boolean).join(" · ") || "-"}</p></div>
          <button class="btn ghost sm" data-action="edit" data-id="${k.id}">Edit</button></div>
        ${edit === k.id ? formKaryawan(s, k) : ""}
      </section>`,
      )
      .join("")}
    ${edit === "baru" ? `<section class="card">${formKaryawan(s, null)}</section>` : `<button class="btn primary block" data-action="edit" data-id="baru">${icon("plus", 16)} Tambah karyawan</button>`}
    <section class="card stack">
      <h2 class="card-title" style="margin:0">Posisi karyawan</h2>
      <p class="small muted">Atur sendiri sesuai usahamu (cth Barista, Kurir, Cuci piring). Beda dengan peran akun tim (kasir/manajer/dapur) yang mengatur hak akses aplikasi.</p>
      <div class="chips posisi-list">${st.posisi.map((p) => `<span class="chip-btn">${esc(p)}${hitung[p] ? ` <small>${hitung[p]}</small>` : ""} <button class="link small" data-action="hapusPosisi" data-p="${esc(p)}" aria-label="Hapus posisi ${esc(p)}">${icon("x", 12)}</button></span>`).join("")}</div>
      <form class="row2" data-form="posisi"><input name="nama" maxlength="30" placeholder="Posisi baru, cth: Cuci piring" aria-label="Posisi baru" required><button class="btn soft">Tambah posisi</button></form>
    </section>
    <section class="card stack">
      <h2 class="card-title" style="margin:0">Setelan absen</h2>
      <div class="row2">
        <label class="field"><span>Jam masuk</span><input type="time" value="${esc(st.jamMasuk)}" data-change="jamMasuk"></label>
        <label class="field"><span>Toleransi telat (menit)</span><input type="number" min="0" max="120" value="${st.toleransi}" data-change="toleransi"></label>
      </div>
      <button class="btn ghost sm" data-action="mati">Matikan fitur absen</button>
    </section>`;
}

// ---------- Impor mesin absen ----------
async function muatXlsx() {
  if (window.XLSX) return window.XLSX;
  await new Promise((ok, gagal) => {
    const el = document.createElement("script");
    el.src = XLSX_SRC;
    el.onload = ok;
    el.onerror = () => gagal(new Error("Pembaca Excel gagal dimuat (cek internet)"));
    document.head.appendChild(el);
  });
  return window.XLSX;
}

/** File -> array baris (array of array). Excel lewat SheetJS, sisanya teks (CSV / TSV / log .dat). */
async function bacaFile(f) {
  if (/\.(xlsx?|xlsm|ods)$/i.test(f.name)) {
    const X = await muatXlsx();
    const wb = X.read(await f.arrayBuffer(), { type: "array", cellDates: true });
    // Ambil sheet dengan baris paling banyak (laporan mesin kadang punya sheet ringkasan).
    const sheets = wb.SheetNames.map((n) => X.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: "" }));
    return sheets.sort((a, b) => b.length - a.length)[0] || [];
  }
  return teksKeBaris(await f.text());
}

function teksKeBaris(text) {
  const t = parseTabel(text);
  // Log mesin (attlog) dipisah tab / spasi banyak; parseTabel butuh pemisah yang konsisten.
  const rows = [t.header, ...t.rows];
  if (rows.every((r) => r.length <= 1)) return String(text).split(/\r?\n/).filter((l) => l.trim()).map((l) => l.trim().split(/\t|\s{2,}|,|;/));
  return rows;
}

function mulaiImpor(rows, nama) {
  if (!rows.length) return toast("File-nya kosong", "err");
  const k = kenaliTabel(rows);
  impor = { step: "kolom", nama, tabel: k, map: k.map, hasil: null, tambah: new Set(), petakan: {}, timpa: false };
  render();
}

function imporView(s) {
  if (impor.step === "input")
    return `<section class="card stack">
      <h2 class="card-title" style="margin:0">Impor dari mesin absen</h2>
      <p class="small">Di software mesin absen (Solution, Fingerspot, ZKTeco, Secure, dll.) pilih <b>laporan / log scan</b> lalu ekspor ke Excel atau CSV. File log dari flashdisk (cth <span class="mono">attlog.dat</span>) juga bisa.</p>
      <label class="btn primary block file-btn">${icon("download", 16)} Pilih file (.xls, .xlsx, .csv, .txt, .dat)<input type="file" accept=".xls,.xlsx,.csv,.txt,.dat,.tsv" data-change="file" hidden></label>
      <label class="field"><span>Atau tempel isi tabel / log di sini</span><textarea rows="5" data-change="teks" placeholder="PIN, Nama, Tanggal scan&#10;1, Ujang, 18/11/2026 07:58">${esc(impor.teks || "")}</textarea></label>
      <div class="row2"><button class="btn soft" data-action="bacaTeks">Baca tempelan</button><button class="btn ghost" data-action="contoh">Contoh file</button></div>
      <p class="small muted">Yang dibaca: PIN / ID atau nama, tanggal & jam scan (scan pertama = masuk, terakhir = pulang), atau kolom jam masuk & pulang. Shift lewat tengah malam belum didukung.</p>
      <button class="btn ghost block" data-action="imporTutup">Batal</button>
    </section>`;
  const t = impor.tabel;
  if (impor.step === "kolom") {
    const contoh = t.data.slice(0, 4);
    return `<section class="card stack">
      <h2 class="card-title" style="margin:0">Cek kolom · ${esc(impor.nama)}</h2>
      <p class="small muted">${t.data.length} baris. Kolom ditebak otomatis, ganti kalau salah. Minimal: PIN atau nama, plus tanggal & jam.</p>
      <div class="kolom-map">${KOLOM.map((c) => `<label class="field"><span>${c.nama}</span><select data-change="kolom" data-p="${c.id}"><option value="-1">-</option>${t.header.map((h, i) => `<option value="${i}" ${impor.map[c.id] === i ? "selected" : ""}>${esc(h || `Kolom ${i + 1}`)}</option>`).join("")}</select></label>`).join("")}</div>
      <div class="tabel-contoh"><table class="lr-table"><thead><tr>${t.header.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${contoh.map((r) => `<tr>${t.header.map((_, i) => `<td>${esc(r[i] ?? "")}</td>`).join("")}</tr>`).join("")}</tbody></table></div>
      <div class="row2"><button class="btn ghost" data-action="imporTutup">Batal</button><button class="btn primary" data-action="imporCek">Lanjut</button></div>
    </section>`;
  }
  const h = impor.hasil;
  const ks = karyawanAktif(s);
  const kenal = h.hari.filter((x) => x.karyawanId);
  const nama = new Map((s.karyawan || []).map((k) => [k.id, k.nama]));
  const perOrang = {};
  for (const x of kenal) perOrang[x.karyawanId] = (perOrang[x.karyawanId] || 0) + 1;
  return `<section class="card stack">
    <h2 class="card-title" style="margin:0">Hasil baca</h2>
    <p class="small">${h.hari.length} absen (orang × hari) · ${h.dari ? `${pendek(h.dari)} – ${pendek(h.sampai)}` : "-"}${h.dilewati ? ` · ${h.dilewati} baris dilewati (tanpa tanggal/jam)` : ""}</p>
    ${Object.keys(perOrang).length ? `<p class="small">${Object.entries(perOrang).map(([id, n]) => `${esc(nama.get(id))} <b>${n} hari</b>`).join(" · ")}</p>` : ""}
    ${
      h.belumKenal.length
        ? `<h3 class="small" style="margin:6px 0 0">Belum dikenal (${h.belumKenal.length})</h3>
      ${h.belumKenal
        .map(
          (b) => `<label class="field"><span>${b.pin ? `PIN ${esc(b.pin)}` : ""}${b.nama ? ` ${esc(b.nama)}` : ""} · ${b.hari} hari</span><select data-change="petakan" data-k="${esc(b.kunci)}">
            <option value="baru" ${impor.tambah.has(b.kunci) ? "selected" : ""}>Tambah jadi karyawan baru${b.nama ? ` (${esc(b.nama)})` : ""}</option>
            <option value="" ${!impor.tambah.has(b.kunci) && !impor.petakan[b.kunci] ? "selected" : ""}>Abaikan</option>
            ${ks.map((k) => `<option value="${k.id}" ${impor.petakan[b.kunci] === k.id ? "selected" : ""}>Ini ${esc(k.nama)}${k.pin ? ` (PIN ${esc(k.pin)})` : ""}</option>`).join("")}
          </select></label>`,
        )
        .join("")}`
        : ""
    }
    <label class="impor-cek"><input type="checkbox" data-change="timpa" ${impor.timpa ? "checked" : ""}><span>Timpa catatan izin/sakit/libur di hari yang sama (biasanya jangan)</span></label>
    <div class="row2"><button class="btn ghost" data-action="imporKolom">Kembali</button><button class="btn primary" data-action="imporSimpan">Simpan absen</button></div>
  </section>`;
}

export const karyawan = {
  render(s) {
    if (!absenAktif(s))
      return `${head("Karyawan & Absen", "#/bisnis")}
      <section class="card stack">
        <h2 class="card-title" style="margin:0">Catat absen karyawan</h2>
        <p class="small">Buat usaha yang punya karyawan / helper. Karyawan nggak perlu punya akun.</p>
        <ul class="small muted">
          <li>Absen harian sekali ketuk: hadir, izin, sakit, libur, alpa + jam masuk/pulang.</li>
          <li>Otomatis hadir dari shift kasir (karyawan yang dihubungkan ke akun kasir).</li>
          <li>Impor file mesin absen fingerprint (Excel, CSV, log attlog).</li>
          <li>Rekap per bulan: hadir, telat, izin/sakit, alpa, jam kerja.</li>
        </ul>
        <button class="btn primary" data-action="nyala">Aktifkan</button>
      </section>`;
    if (impor) return `${head("Karyawan & Absen", "#/bisnis")}${imporView(s)}`;
    const tabs = `<div class="seg seg3">${[["absen", "Absen"], ["rekap", "Rekap"], ["orang", "Karyawan"]].map(([k, v]) => `<label><input type="radio" name="tab" value="${k}" data-change="tab" ${tab === k ? "checked" : ""}><span>${v}</span></label>`).join("")}</div>`;
    return `${head("Karyawan & Absen", "#/bisnis")}${tabs}${tab === "rekap" ? rekapTab(s) : tab === "orang" ? orangTab(s) : absenTab(s)}`;
  },
  changes: {
    tab(el) {
      tab = el.value;
      edit = null;
      render();
    },
    jam(el) {
      const s = store.get();
      const a = absenHari(s, tgl)[el.dataset.id];
      store.set(catatAbsen(s, tgl, el.dataset.id, { status: "hadir", masuk: a?.masuk || "", pulang: a?.pulang || "", [el.dataset.f]: el.value, sumber: "manual" }));
      render();
    },
    jamMasuk(el) {
      if (el.value) store.set((s) => ({ absenSetting: { ...setelan(s), jamMasuk: el.value } }));
      render();
    },
    toleransi(el) {
      store.set((s) => ({ absenSetting: { ...setelan(s), toleransi: Math.max(0, Math.min(120, Math.round(Number(el.value) || 0))) } }));
      render();
    },
    async file(el) {
      const f = el.files?.[0];
      el.value = "";
      if (!f) return;
      if (f.size > 15 * 1024 * 1024) return toast("File terlalu besar (maks. 15 MB)", "err");
      try {
        mulaiImpor(await bacaFile(f), f.name);
      } catch (e) {
        toast(`File nggak kebaca: ${e.message}`, "err");
      }
    },
    teks(el) {
      impor.teks = el.value;
    },
    kolom(el) {
      impor.map = { ...impor.map, [el.dataset.p]: Number(el.value) };
    },
    petakan(el) {
      const k = el.dataset.k;
      impor.tambah.delete(k);
      delete impor.petakan[k];
      if (el.value === "baru") impor.tambah.add(k);
      else if (el.value) impor.petakan[k] = el.value;
    },
    timpa(el) {
      impor.timpa = el.checked;
    },
  },
  actions: {
    nyala() {
      store.set((s) => ({ absenSetting: { ...setelan(s), aktif: true } }));
      tab = (store.get().karyawan || []).length ? "absen" : "orang";
      edit = tab === "orang" ? "baru" : null;
      render();
    },
    mati() {
      if (!confirm("Matikan fitur absen? Data karyawan & riwayat absen tetap tersimpan.")) return;
      store.set((s) => ({ absenSetting: { ...setelan(s), aktif: false } }));
      render();
    },
    tab(el) {
      tab = el.dataset.t;
      edit = tab === "orang" && !(store.get().karyawan || []).length ? "baru" : null;
      render();
    },
    geser(el) {
      const n = addDays(tgl, Number(el.dataset.d));
      if (n <= todayISO()) tgl = n;
      render();
    },
    bulan(el) {
      const [y, m] = ym.split("-").map(Number);
      const d = new Date(y, m - 1 + Number(el.dataset.d), 1);
      ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      render();
    },
    status(el) {
      const s = store.get();
      const a = absenHari(s, tgl)[el.dataset.id];
      // Ketuk status yang sama lagi = hapus catatan (kecuali dari shift, yang memang otomatis).
      const v = a?.status === el.dataset.v && a.sumber !== "shift" ? null : { status: el.dataset.v, ...(el.dataset.v === "hadir" && a?.status === "hadir" ? { masuk: a.masuk, pulang: a.pulang } : {}), sumber: "manual" };
      store.set(catatAbsen(s, tgl, el.dataset.id, v));
      render();
    },
    semuaHadir() {
      store.set(semuaHadir(store.get(), tgl));
      toast("Sisanya ditandai hadir");
      render();
    },
    edit(el) {
      edit = edit === el.dataset.id ? null : el.dataset.id;
      render();
    },
    hapusPosisi(el) {
      const p = el.dataset.p;
      const n = hitungPosisi(store.get())[p] || 0;
      if (n && !confirm(`${n} karyawan masih di posisi ${p}. Hapus dari pilihan? (posisi mereka nggak berubah)`)) return;
      store.set((s) => ({ absenSetting: { ...setelan(s), posisi: hapusPosisi(setelan(s).posisi, p) } }));
      render();
    },
    batalEdit() {
      edit = null;
      render();
    },
    csv() {
      const s = store.get();
      const dari = `${ym}-01`;
      const r = rekapAbsen(s, dari, `${ym}-31`);
      const rows = [["Nama", "Posisi", "Hadir", "Telat", "Izin", "Sakit", "Libur", "Alpa", "Jam kerja (menit)"], ...(s.karyawan || []).map((k) => [k.nama, k.posisi || "", ...["hadir", "telat", "izin", "sakit", "libur", "alpa", "menit"].map((f) => r[k.id][f])])];
      download(`absen-${ym}.csv`, rows.map((x) => x.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n"), "text/csv");
    },
    imporBuka() {
      impor = { step: "input", teks: "" };
      render();
      window.scrollTo(0, 0);
    },
    imporTutup() {
      impor = null;
      render();
    },
    bacaTeks() {
      if (!impor.teks?.trim()) return toast("Tempel isinya dulu ya", "err");
      mulaiImpor(teksKeBaris(impor.teks), "Tempelan");
    },
    contoh() {
      download("contoh-absen-mesin.csv", CONTOH, "text/csv");
    },
    imporKolom() {
      impor.step = "kolom";
      render();
    },
    imporCek() {
      const m = impor.map;
      if (m.pin < 0 && m.nama < 0) return toast("Pilih kolom PIN atau nama", "err");
      if (m.waktu < 0 && m.tanggal < 0 && m.jam < 0) return toast("Pilih kolom tanggal / waktu scan", "err");
      const h = olahAbsen(store.get(), impor.tabel.data, m);
      if (!h.hari.length) return toast("Nggak ada absen yang kebaca. Cek lagi kolom tanggal & jamnya", "err");
      impor.hasil = h;
      impor.tambah = new Set(h.belumKenal.filter((b) => b.nama).map((b) => b.kunci)); // yang ada namanya default ditambah
      impor.petakan = {};
      impor.step = "ringkas";
      render();
    },
    imporSimpan() {
      const s = store.get();
      try {
        const r = simpanImpor(s, impor.hasil, { tambah: [...impor.tambah], petakan: impor.petakan, timpa: impor.timpa });
        store.set(r.patch);
        toast(`${r.n} absen tersimpan${r.dilewati ? ` · ${r.dilewati} hari izin/sakit dipertahankan` : ""}`);
        tgl = impor.hasil.sampai || tgl;
      } catch (e) {
        return toast(e.message, "err");
      }
      impor = null;
      tab = "absen";
      render();
    },
  },
  forms: {
    posisi(f) {
      const s = store.get();
      try {
        const posisi = tambahPosisi(setelan(s).posisi, new FormData(f).get("nama"));
        store.set({ absenSetting: { ...setelan(s), posisi } });
        toast(`Posisi ${posisi[posisi.length - 1]} ditambahkan`);
      } catch (e) {
        return toast(e.message, "err");
      }
      render();
    },
    karyawan(f) {
      const fd = new FormData(f);
      const s = store.get();
      try {
        const r = simpanKaryawan(s, { id: f.dataset.id || null, nama: fd.get("nama"), posisi: fd.get("posisi"), wa: normWa(fd.get("wa")), pin: fd.get("pin"), akunId: fd.get("akunId") || null, aktif: f.dataset.id ? fd.get("aktif") === "on" : true, mulai: (s.karyawan || []).find((x) => x.id === f.dataset.id)?.mulai || todayISO() });
        store.set({ karyawan: r.karyawan });
        toast(f.dataset.id ? "Tersimpan" : `${r.karyawanBaru.nama} ditambahkan`);
      } catch (e) {
        return toast(e.message, "err");
      }
      edit = null;
      render();
    },
  },
};
