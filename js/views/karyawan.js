// Karyawan & absen (#/karyawan, pemilik/manajer): absen harian sekali ketuk, otomatis dari shift kasir,
// impor file mesin absen fingerprint (Excel .xls/.xlsx, CSV, log teks), rekap per bulan, data karyawan.
import { icon } from "../icons.js";
import { esc, rupiah, toast, todayISO, addDays, fmtDate, download } from "../ui.js";
import { store } from "../store.js";
import { render } from "../app.js";
import { head } from "./_shared.js";
import { normWa, waLink } from "../loyalty.js";
import { role } from "../cloud.js";
import { parseTabel } from "../imporjual.js";
import {
  STATUS, KOLOM, setelan, tambahPosisi, hapusPosisi, hitungPosisi, absenAktif, karyawanAktif, absenHari, catatAbsen, semuaHadir, rekapAbsen, ringkasHari,
  simpanKaryawan, kenaliTabel, olahAbsen, simpanImpor,
} from "../absen.js";
import { gajiOf, punyaGaji, periodeDi, hitungGaji, gajianDi, saldoKasbonKaryawan, pinjamKasbon, hapusPinjam, bayarGaji, batalGajian, belumGajian, teksSlip, METODE as METODE_GAJI, bolehAturGaji, hitungThr, thrDi, bayarThr, batalThr, batasThr, pengingatThr, rekapGajiCsv, THR_DICEK } from "../gaji.js";
import { bisnisOf } from "../wa.js";
import { jadwalTab, jadwalActions, jadwalChanges, jadwalForms, labelJadwal } from "./jadwal.js";
import { sinkronAkun } from "../jadwal.js";

let tab = "absen"; // absen | jadwal | rekap | gaji | orang
let geser = -1; // periode gaji: -1 = periode lalu, 0 = periode ini, -2 dst.
let bayarId = null; // karyawan yang lagi dibayar gajinya
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
    <div class="absen-nama"><b>${esc(k.nama)}</b><small class="muted">${esc([k.posisi, labelJadwal(s, tgl, k.id)].filter(Boolean).join(" · "))}${a?.sumber === "shift" ? " · dari shift kasir" : a?.sumber === "mesin" ? " · mesin absen" : ""}${a?.telat ? ` · <span class="neg">telat</span>` : ""}</small></div>
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

// ---------- Gaji ----------
/** Pengingat Beranda: gaji periode lalu belum dibayar. */
export function gajiCard(s) {
  if (!absenAktif(s)) return "";
  const b = belumGajian(s, todayISO());
  if (!b.length) return "";
  return `<a href="#/karyawan?tab=gaji" class="card pajak-mini">
    ${icon("wallet", 22)}
    <span><b>Gajian belum dibayar: ${rupiah(b.reduce((a, x) => a + x.kotor, 0))}</b><small class="muted">${b.slice(0, 3).map((x) => esc(x.k.nama)).join(", ")}${b.length > 3 ? ` +${b.length - 3}` : ""} · periode ${pendek(b[0].dari)} – ${pendek(b[0].sampai)}</small></span>
    ${icon("chevron", 18)}
  </a>`;
}

/** Periode gaji karyawan sesuai geser (relatif ke periode yang memuat hari ini). */
function periodeK(k) {
  let p = periodeDi(gajiOf(k).periode, todayISO());
  for (let i = 0; i > geser; i--) p = periodeDi(gajiOf(k).periode, addDays(p.dari, -1));
  return p;
}

function slipBaris(label, val, cls = "") {
  return `<div class="row-between pos-sum ${cls}"><span>${label}</span><b>${val}</b></div>`;
}

function kartuGaji(s, k) {
  const p = periodeK(k);
  const sudah = gajianDi(s, k.id, p.dari, p.sampai);
  const h = hitungGaji(s, k, p.dari, p.sampai);
  const g = gajiOf(k);
  const berjalan = p.sampai >= todayISO();
  if (sudah) {
    const slip = teksSlip(k, sudah, bisnisOf(s), rupiah);
    return `<section class="card stack gaji-card lunas" data-id="${k.id}">
      <div class="row-between"><div><h2 class="card-title" style="margin:0">${esc(k.nama)}</h2><p class="small muted">${pendek(sudah.dari)} – ${pendek(sudah.sampai)} · dibayar ${pendek(sudah.tanggal)}</p></div><span class="sehat-pill pos">Dibayar</span></div>
      ${slipBaris("Total gaji", rupiah(sudah.kotor))}
      ${sudah.potongKasbon ? slipBaris("Potong kasbon", `−${rupiah(sudah.potongKasbon)}`) : ""}
      ${slipBaris("Diterima", rupiah(sudah.bersih), "pos-total")}
      <div class="row2"><a class="btn soft sm" target="_blank" rel="noopener" href="${esc(k.wa ? waLink(k.wa, slip) : `https://wa.me/?text=${encodeURIComponent(slip)}`)}">${icon("chat", 14)} Kirim slip WA</a><button class="btn ghost sm" data-action="batalGaji" data-id="${sudah.id}">Batalkan</button></div>
    </section>`;
  }
  const buka = bayarId === k.id;
  const pot = Math.min(h.sisaKasbon, h.kotor);
  return `<section class="card stack gaji-card" data-id="${k.id}">
    <div class="row-between"><div><h2 class="card-title" style="margin:0">${esc(k.nama)}</h2><p class="small muted">${pendek(p.dari)} – ${pendek(p.sampai)}${berjalan ? " · masih berjalan" : ""}</p></div><b>${rupiah(h.kotor)}</b></div>
    <p class="small">Hadir <b>${h.hadir}</b>${h.izin ? ` · izin ${h.izin}` : ""}${h.sakit ? ` · sakit ${h.sakit}` : ""}${h.libur ? ` · libur ${h.libur}` : ""}${h.alpa ? ` · <span class="neg">alpa ${h.alpa}</span>` : ""}${h.telat ? ` · telat ${h.telat}` : ""}</p>
    ${
      buka
        ? `<form class="stack inline-form" data-form="bayarGaji" data-id="${k.id}" data-dari="${p.dari}" data-sampai="${p.sampai}">
        ${g.skema === "harian" ? slipBaris(`Gaji harian ${h.hadir} × ${rupiah(h.perHari)}`, rupiah(h.pokok)) : slipBaris("Gaji pokok", rupiah(h.pokok))}
        ${h.potongAbsen ? slipBaris(`Potongan nggak masuk (${h.alpa + h.izin} hari)`, `−${rupiah(h.potongAbsen)}`) : ""}
        ${h.makan ? slipBaris(`Uang makan ${h.hadir} hari`, rupiah(h.makan)) : ""}
        ${h.lembur ? slipBaris(`Lembur ${h.lemburJam} jam <small class="muted">(${h.lemburHari.map((x) => `${pendek(x.tanggal)} ${x.jam}j`).join(", ")})</small>`, rupiah(h.lembur)) : ""}
        <div class="row2">
          <label class="field"><span>Bonus / lembur (Rp)</span><input type="number" inputmode="numeric" name="bonus" min="0" step="1" placeholder="0"></label>
          <label class="field"><span>Potong kasbon (sisa ${rupiah(h.sisaKasbon)})</span><input type="number" inputmode="numeric" name="potong" min="0" max="${h.sisaKasbon}" step="1" value="${pot || ""}" placeholder="0" ${h.sisaKasbon ? "" : "disabled"}></label>
        </div>
        <div class="row2">
          <label class="field"><span>Tanggal bayar</span><input type="date" name="tanggal" value="${todayISO()}" required></label>
          <label class="field"><span>Dibayar</span><select name="metode">${METODE_GAJI.map((m) => `<option value="${m.id}">${m.nama}</option>`).join("")}</select></label>
        </div>
        <p class="small muted">Tercatat di Kas: Gaji (total gaji)${h.sisaKasbon ? " + potongan kasbon kembali masuk" : ""}.${berjalan ? " Periode ini belum selesai, absen sisa harinya belum terhitung." : ""}</p>
        <div class="row2"><button type="button" class="btn ghost" data-action="tutupBayar">Batal</button><button class="btn primary">Bayar gaji</button></div>
      </form>`
        : `<button class="btn primary sm" data-action="bukaBayar" data-id="${k.id}" ${h.kotor ? "" : "disabled"}>${h.kotor ? "Hitung & bayar" : "Belum ada yang dibayar"}</button>`
    }
  </section>`;
}

function kasbonKaryawanView(s) {
  const ks = karyawanAktif(s);
  const ada = ks.map((k) => ({ k, sisa: saldoKasbonKaryawan(s, k.id) })).filter((x) => x.sisa > 0);
  const riwayat = [...(s.kasbonKaryawan || [])].sort((a, b) => b.tanggal.localeCompare(a.tanggal)).slice(0, 8);
  const nama = new Map((s.karyawan || []).map((k) => [k.id, k.nama]));
  return `<section class="card stack">
    <h2 class="card-title" style="margin:0">Kasbon karyawan</h2>
    ${ada.length ? ada.map((x) => slipBaris(esc(x.k.nama), rupiah(x.sisa))).join("") : `<p class="small muted" style="margin:0">Nggak ada kasbon karyawan.</p>`}
    <form class="stack" data-form="pinjam">
      <div class="row2">
        <label class="field"><span>Karyawan</span><select name="karyawan" required><option value="">Pilih</option>${ks.map((k) => `<option value="${k.id}">${esc(k.nama)}</option>`).join("")}</select></label>
        <label class="field"><span>Jumlah (Rp)</span><input type="number" inputmode="numeric" name="nominal" min="1" step="1" required></label>
      </div>
      <input name="catatan" maxlength="80" placeholder="Catatan (opsional), cth: buat bayar sekolah" aria-label="Catatan">
      <button class="btn soft">Catat kasbon (uang keluar dari Kas)</button>
    </form>
    ${
      riwayat.length
        ? `<div>${riwayat.map((x) => `<div class="row-between pos-sum"><span>${esc(nama.get(x.karyawanId) || "-")} · ${x.jenis === "pinjam" ? "kasbon" : "potong gaji"} <small class="muted">${pendek(x.tanggal)}</small></span><span><b class="${x.jenis === "pinjam" ? "neg" : "pos"}">${x.jenis === "pinjam" ? "+" : "−"}${rupiah(x.nominal)}</b>${x.jenis === "pinjam" ? ` <button class="link small" data-action="hapusPinjam" data-id="${x.id}">hapus</button>` : ""}</span></div>`).join("")}</div>`
        : ""
    }
    <p class="small muted">Kasbon karyawan dipotong waktu bayar gaji. Di laporan laba rugi kasbon nggak dihitung biaya (uangnya kembali lewat potongan).</p>
  </section>`;
}

function gajiTab(s) {
  const ks = karyawanAktif(s);
  const adaGaji = ks.filter(punyaGaji);
  const belum = ks.filter((k) => !punyaGaji(k));
  const label = geser === -1 ? "Periode lalu" : geser === 0 ? "Periode ini (berjalan)" : `${-geser} periode lalu`;
  return `
    <div class="month-nav"><button class="icon-btn" data-action="geserGaji" data-d="-1" aria-label="Periode sebelumnya">${icon("back", 16)}</button><b>${label}</b><button class="icon-btn" data-action="geserGaji" data-d="1" aria-label="Periode berikutnya" ${geser >= 0 ? "disabled" : ""}>${icon("chevron", 16)}</button></div>
    ${adaGaji.length ? adaGaji.map((k) => kartuGaji(s, k)).join("") : `<section class="card"><p class="small" style="margin:0">Atur gaji tiap karyawan dulu di tab <b>Karyawan</b> (Edit → Gaji): harian atau bulanan, uang makan, dibayar mingguan / bulanan.</p></section>`}
    ${belum.length && adaGaji.length ? `<p class="small muted">Gaji belum diatur: ${belum.map((k) => esc(k.nama)).join(", ")}.</p>` : ""}
    ${kasbonKaryawanView(s)}
    ${thrView(s)}
    ${(s.gajian || []).length || (s.thr || []).length ? `<button class="btn soft block" data-action="csvGaji">${icon("download", 16)} Unduh rekap gaji & THR (CSV)</button>` : ""}`;
}

function thrView(s) {
  const st = setelan(s);
  const hr = st.hariRaya || "";
  const ks = karyawanAktif(s).filter(punyaGaji);
  return `<section class="card stack thr">
    <h2 class="card-title" style="margin:0">THR</h2>
    <div class="row2">
      <label class="field"><span>Tanggal hari raya</span><input type="date" value="${esc(hr)}" data-change="hariRaya"></label>
      ${hr ? `<div class="field"><span>Batas bayar (H-7)</span><b class="${todayISO() > batasThr(hr) ? "neg" : ""}">${esc(hariTeks(batasThr(hr)))}</b></div>` : ""}
    </div>
    ${
      hr
        ? ks
            .map((k) => {
              const sudah = thrDi(s, k.id, hr);
              const h = hitungThr(s, k, hr);
              return `<div class="thr-row" data-id="${k.id}">
            <div><b>${esc(k.nama)}</b><small class="muted">${h.masa === null ? `<span class="neg">${h.catatan}</span>` : `masa kerja ${h.masa} bulan · upah ${rupiah(h.upah)}${h.estimasi ? " (perkiraan)" : ""} · ${h.catatan}`}</small>${h.kurang ? `<small class="neg">Riwayat gaji di app baru ${h.upah && h.bulan} bulan, rata-ratanya bisa kekecilan. Cek lagi nominalnya.</small>` : ""}</div>
            ${
              sudah
                ? `<span><span class="sehat-pill pos">Dibayar ${rupiah(sudah.nominal)}</span> <button class="link small" data-action="batalThr" data-id="${sudah.id}">batal</button></span>`
                : h.masa === null
                  ? `<button class="btn ghost sm" data-action="tab" data-t="orang">Isi mulai kerja</button>`
                  : `<form class="thr-bayar" data-form="thr" data-id="${k.id}"><input type="number" inputmode="numeric" name="nominal" min="1" step="1" value="${h.nominal || ""}" aria-label="THR ${esc(k.nama)}" required><select name="metode" aria-label="Metode">${METODE_GAJI.map((m) => `<option value="${m.id}">${m.nama}</option>`).join("")}</select><button class="btn primary sm">Bayar</button></form>`
            }
          </div>`;
            })
            .join("") || `<p class="small muted">Atur gaji karyawan dulu.</p>`
        : `<p class="small muted" style="margin:0">Isi tanggal hari raya (cth Idul Fitri) buat hitung THR & pengingat H-7.</p>`
    }
    <p class="small muted">Masa kerja ≥ 12 bulan: 1 bulan upah. 1–12 bulan: masa kerja ÷ 12 × upah. Pekerja harian: rata-rata gaji pokok per bulan yang sudah dibayar. Wajib dibayar penuh paling lambat H-7. Karyawan non-muslim boleh dibayar di hari raya agamanya. Aturan dicek ${THR_DICEK} (Permenaker 6/2016).</p>
  </section>`;
}

/** Pengingat Beranda: THR belum dibayar menjelang hari raya. */
export function thrCard(s) {
  if (!absenAktif(s)) return "";
  const p = pengingatThr(s, todayISO());
  if (!p) return "";
  return `<a href="#/karyawan?tab=gaji" class="card pajak-mini ${p.telat ? "neg" : ""}">
    ${icon("calendar", 22)}
    <span><b>THR ${p.list.length} karyawan${p.total ? `: ${rupiah(p.total)}` : ""}</b><small class="muted">${p.telat ? "Sudah lewat batas H-7, bayar secepatnya" : `Bayar paling lambat ${esc(hariTeks(p.batas))}`}</small></span>
    ${icon("chevron", 18)}
  </a>`;
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
    <label class="field"><span>Mulai kerja (opsional)</span><input type="date" name="mulai" value="${esc(k?.mulai || "")}" max="${todayISO()}"></label>
    ${akun.length ? `<label class="field"><span>Akun kasir (absen otomatis dari shift)</span><select name="akunId"><option value="">Tidak dihubungkan</option>${akun.map(([id, nm]) => `<option value="${esc(id)}" ${k?.akunId === id ? "selected" : ""}>${esc(nm)}</option>`).join("")}</select></label>` : ""}
    <fieldset class="gaji-set stack" ${bolehAturGaji(s, role()) ? "" : "disabled"}><legend>Gaji & lembur${bolehAturGaji(s, role()) ? "" : " (diatur pemilik)"}</legend>
      <div class="row2">
        <label class="field"><span>Skema</span><select name="skema"><option value="harian" ${gajiOf(k).skema === "harian" ? "selected" : ""}>Harian (per hari hadir)</option><option value="bulanan" ${gajiOf(k).skema === "bulanan" ? "selected" : ""}>Bulanan (tetap)</option></select></label>
        <label class="field"><span>Nominal (Rp per hari / bulan)</span><input type="number" inputmode="numeric" name="nominal" min="0" step="1" value="${gajiOf(k).nominal || ""}" placeholder="cth: 75000"></label>
      </div>
      <div class="row2">
        <label class="field"><span>Uang makan per hari hadir (Rp)</span><input type="number" inputmode="numeric" name="makan" min="0" step="1" value="${gajiOf(k).makan || ""}" placeholder="0"></label>
        <label class="field"><span>Dibayar tiap</span><select name="periode"><option value="mingguan" ${gajiOf(k).periode === "mingguan" ? "selected" : ""}>Minggu (Senin–Minggu)</option><option value="bulanan" ${gajiOf(k).periode === "bulanan" ? "selected" : ""}>Bulan</option></select></label>
      </div>
      <label class="impor-cek"><input type="checkbox" name="potong" ${gajiOf(k).potong ? "checked" : ""}><span>Gaji bulanan dipotong per hari alpa / izin (gaji ÷ 26 hari kerja)</span></label>
      <div class="row2">
        <label class="field"><span>Lembur (dari jam masuk–pulang)</span><select name="lembur">
          <option value="tidak" ${gajiOf(k).lembur === "tidak" ? "selected" : ""}>Nggak dihitung</option>
          <option value="tetap" ${gajiOf(k).lembur === "tetap" ? "selected" : ""}>Tarif tetap per jam</option>
          <option value="depnaker" ${gajiOf(k).lembur === "depnaker" ? "selected" : ""}>Rumus Depnaker (1/173 upah, 1,5× lalu 2×)</option>
        </select></label>
        <label class="field"><span>Tarif lembur per jam (Rp, kalau tarif tetap)</span><input type="number" inputmode="numeric" name="tarifLembur" min="0" step="1" value="${gajiOf(k).tarifLembur || ""}" placeholder="cth: 10000"></label>
      </div>
    </fieldset>
    ${k ? `<label class="impor-cek"><input type="checkbox" name="aktif" ${k.aktif !== false ? "checked" : ""}><span>Masih bekerja (hilangkan centang kalau sudah keluar, riwayat absen tetap ada)</span></label>` : ""}
    <div class="row2"><button type="button" class="btn ghost" data-action="batalEdit">Batal</button><button class="btn primary">Simpan</button></div>
  </form>`;
}

function orangTab(s) {
  const list = [...(s.karyawan || [])].sort((a, b) => (a.aktif === false) - (b.aktif === false) || a.nama.localeCompare(b.nama, "id"));
  const st = setelan(s);
  const hitung = hitungPosisi(s);
  const atur = bolehAturGaji(s, role());
  return `
    ${list
      .map(
        (k) => `<section class="card ${k.aktif === false ? "muted" : ""}">
        <div class="row-between"><div><h2 class="card-title" style="margin:0">${esc(k.nama)}${k.aktif === false ? ` <small class="muted">(sudah keluar)</small>` : ""}</h2>
          <p class="small muted">${[k.posisi, k.pin ? `PIN ${esc(k.pin)}` : "", k.akunId ? "akun kasir" : "", k.wa ? esc(k.wa) : "", punyaGaji(k) ? `${rupiah(gajiOf(k).nominal)}/${gajiOf(k).skema === "harian" ? "hari" : "bulan"}` : "gaji belum diatur"].filter(Boolean).join(" · ") || "-"}</p></div>
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
    </section>
    <section class="card stack">
      <h2 class="card-title" style="margin:0">Setelan gaji & lembur</h2>
      <label class="field"><span>Jam kerja normal per hari (lebihnya dihitung lembur)</span><input type="number" min="1" max="16" step="0.5" value="${st.jamKerja}" data-change="jamKerja" ${atur ? "" : "disabled"}></label>
      ${
        role() === "owner"
          ? `<label class="impor-cek"><input type="checkbox" data-change="manajerAtur" ${st.manajerAturGaji ? "checked" : ""}><span>Manajer boleh ikut atur gaji & lembur (nominal, uang makan, potongan, tarif lembur, jam kerja)</span></label>
             <p class="small muted">Kalau nggak dicentang, manajer tetap bisa catat absen & bayar gaji sesuai setelanmu, tapi nggak bisa ubah angkanya.</p>`
          : `<p class="small muted">${atur ? "Pemilik mengizinkan manajer mengatur gaji & lembur." : "Gaji & lembur diatur pemilik. Kamu tetap bisa catat absen & bayar gaji sesuai setelannya."}</p>`
      }
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
    const minta = location.hash.match(/tab=(gaji|jadwal)/);
    if (minta) {
      tab = minta[1];
      history.replaceState(null, "", "#/karyawan");
    }
    const tabs = `<div class="seg seg5">${[["absen", "Absen"], ["jadwal", "Jadwal"], ["rekap", "Rekap"], ["gaji", "Gaji"], ["orang", "Orang"]].map(([k, v]) => `<label><input type="radio" name="tab" value="${k}" data-change="tab" ${tab === k ? "checked" : ""}><span>${v}</span></label>`).join("")}</div>`;
    return `${head("Karyawan & Absen", "#/bisnis")}${tabs}${tab === "jadwal" ? jadwalTab(s) : tab === "rekap" ? rekapTab(s) : tab === "gaji" ? gajiTab(s) : tab === "orang" ? orangTab(s) : absenTab(s)}`;
  },
  changes: {
    ...jadwalChanges,
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
    manajerAtur(el) {
      if (role() !== "owner") return;
      store.set((s) => ({ absenSetting: { ...setelan(s), manajerAturGaji: el.checked } }));
      toast(el.checked ? "Manajer boleh atur gaji & lembur" : "Gaji & lembur cuma bisa diatur pemilik");
      render();
    },
    jamKerja(el) {
      if (!bolehAturGaji(store.get(), role())) return render();
      store.set((s) => ({ absenSetting: { ...setelan(s), jamKerja: Math.max(1, Math.min(16, Number(el.value) || 8)) } }));
      render();
    },
    hariRaya(el) {
      store.set((s) => ({ absenSetting: { ...setelan(s), hariRaya: el.value || null } }));
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
    ...jadwalActions,
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
    geserGaji(el) {
      geser = Math.min(0, geser + Number(el.dataset.d));
      bayarId = null;
      render();
    },
    bukaBayar(el) {
      bayarId = el.dataset.id;
      render();
    },
    tutupBayar() {
      bayarId = null;
      render();
    },
    batalGaji(el) {
      if (!confirm("Batalkan catatan gaji ini? Pengeluaran Kas & potongan kasbonnya ikut dihapus.")) return;
      store.set(batalGajian(store.get(), el.dataset.id));
      render();
    },
    batalThr(el) {
      if (!confirm("Batalkan catatan THR ini? Pengeluaran Kas-nya ikut dihapus.")) return;
      store.set(batalThr(store.get(), el.dataset.id));
      render();
    },
    csvGaji() {
      const rows = rekapGajiCsv(store.get());
      download(`rekap-gaji-${todayISO()}.csv`, rows.map((x) => x.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\n"), "text/csv");
    },
    hapusPinjam(el) {
      if (!confirm("Hapus catatan kasbon ini? Pengeluaran Kas-nya ikut dihapus.")) return;
      const r = hapusPinjam(store.get(), el.dataset.id);
      if (r) store.set(r);
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
    ...jadwalForms,
    bayarGaji(f) {
      const fd = new FormData(f);
      const s = store.get();
      try {
        const r = bayarGaji(s, f.dataset.id, { dari: f.dataset.dari, sampai: f.dataset.sampai, bonus: fd.get("bonus"), potongKasbon: fd.get("potong") || 0, tanggal: String(fd.get("tanggal")), metode: String(fd.get("metode")) });
        store.set({ gajian: r.gajian, kasbonKaryawan: r.kasbonKaryawan, transactions: r.transactions });
        toast(`Gaji ${s.karyawan.find((k) => k.id === f.dataset.id).nama} dibayar ${rupiah(r.entri.bersih)}`);
      } catch (e) {
        return toast(e.message, "err");
      }
      bayarId = null;
      render();
    },
    thr(f) {
      const fd = new FormData(f);
      const s = store.get();
      try {
        const r = bayarThr(s, f.dataset.id, { hariRaya: setelan(s).hariRaya, nominal: fd.get("nominal"), tanggal: todayISO(), metode: String(fd.get("metode")) });
        store.set({ thr: r.thr, transactions: r.transactions });
        toast(`THR ${rupiah(r.entri.nominal)} tercatat`);
      } catch (e) {
        return toast(e.message, "err");
      }
      render();
    },
    pinjam(f) {
      const fd = new FormData(f);
      try {
        store.set(pinjamKasbon(store.get(), String(fd.get("karyawan")), { nominal: fd.get("nominal"), tanggal: todayISO(), catatan: fd.get("catatan") || "" }));
        toast("Kasbon karyawan tercatat");
      } catch (e) {
        return toast(e.message, "err");
      }
      render();
    },
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
        const r = simpanKaryawan(s, { id: f.dataset.id || null, nama: fd.get("nama"), posisi: fd.get("posisi"), wa: normWa(fd.get("wa")), pin: fd.get("pin"), akunId: fd.get("akunId") || null, gaji: !bolehAturGaji(s, role()) ? undefined : { skema: fd.get("skema") === "bulanan" ? "bulanan" : "harian", nominal: Math.max(0, Math.round(Number(fd.get("nominal")) || 0)), makan: Math.max(0, Math.round(Number(fd.get("makan")) || 0)), periode: fd.get("periode") === "bulanan" ? "bulanan" : "mingguan", potong: fd.get("potong") === "on", hariKerja: 26, lembur: ["tetap", "depnaker"].includes(fd.get("lembur")) ? fd.get("lembur") : "tidak", tarifLembur: Math.max(0, Math.round(Number(fd.get("tarifLembur")) || 0)) }, aktif: f.dataset.id ? fd.get("aktif") === "on" : true, mulai: String(fd.get("mulai") || "") || null });
        store.set({ karyawan: r.karyawan });
        store.set(sinkronAkun(store.get())); // akun kasir -> jadwal saya
        toast(f.dataset.id ? "Tersimpan" : `${r.karyawanBaru.nama} ditambahkan`);
      } catch (e) {
        return toast(e.message, "err");
      }
      edit = null;
      render();
    },
  },
};
