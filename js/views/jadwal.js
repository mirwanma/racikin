// Jadwal kerja / shift: tab "Jadwal" di #/karyawan (pemilik & manajer) + halaman #/jadwal "Jadwal saya" (akun kasir).
// Isi jadwal pakai "kuas": pilih shift lalu ketuk kotak-kotaknya. Isi cepat: pola mingguan / gilir, salin periode lalu.
import { icon } from "../icons.js";
import { esc, toast, todayISO, fmtDate } from "../ui.js";
import { store } from "../store.js";
import { render } from "../app.js";
import { head } from "./_shared.js";
import { cloud, role } from "../cloud.js";
import { waLink } from "../loyalty.js";
import { bisnisOf } from "../wa.js";
import { karyawanAktif } from "../absen.js";
import {
  LIBUR, HARI, templateShift, jadwalOf, shiftDi, setSel, rentang, geserAnchor, terapkanPola, salinSebelumnya, kosongkan,
  tambahShift, ubahShift, hapusShift, pakaiShift, kodeShift, hitungPerHari, teksJadwal, masukHari, jadwalAkun, hariKe, adaJadwal, durasi, sinkronAkun,
} from "../jadwal.js";

/** Simpan perubahan jadwal + perbarui peta akun kasir (biar "Jadwal saya" selalu cocok dengan data karyawan). */
const simpan = (patch) => store.set({ jadwal: sinkronAkun({ ...store.get(), ...patch }).jadwal });

let mode = "minggu"; // minggu | bulan
let anchor = todayISO();
let kuas = null; // shift id | "libur" | "hapus"
const pendek = (iso) => fmtDate(iso, { day: "numeric", month: "short" });
const jamTeks = (sh) => `${sh.mulai}–${sh.selesai}`;
const WARNA = ["#FFC531", "#7FB7E6", "#B9A2E8", "#8CCB9B", "#F3A07A", "#E8B4CF"];
const warnaOf = (list, id) => (id === LIBUR ? "" : WARNA[Math.max(0, list.findIndex((x) => x.id === id)) % WARNA.length]);

/** Label jadwal untuk baris absen: "Pagi 07:00–15:00" / "Libur" / "". */
export function labelJadwal(s, tanggal, karyawanId) {
  const sh = shiftDi(s, tanggal, karyawanId);
  return !sh ? "" : sh.libur ? "jadwal libur" : `${sh.nama} ${jamTeks(sh)}`;
}

/** Beranda (pemilik/manajer): yang dijadwalkan masuk hari ini. */
export function masukCard(s) {
  if (!s.absenSetting?.aktif || !adaJadwal(s)) return "";
  const m = masukHari(s, todayISO());
  if (!m.length) return "";
  return `<a href="#/karyawan?tab=jadwal" class="card pajak-mini">
    ${icon("calendar", 22)}
    <span><b>Hari ini masuk ${m.length} orang</b><small class="muted">${m.slice(0, 4).map((x) => `${esc(x.k.nama)} (${esc(x.shift.nama)})`).join(", ")}${m.length > 4 ? ` +${m.length - 4}` : ""}</small></span>
    ${icon("chevron", 18)}
  </a>`;
}

function grid(s, r) {
  const ks = karyawanAktif(s);
  const list = templateShift(s);
  const today = todayISO();
  const hitung = hitungPerHari(s, r.hari);
  return `<div class="jadwal-grid ${mode}" role="grid">
    <table>
      <thead><tr><th class="jg-nama">Nama</th>${r.hari.map((t) => `<th class="${t === today ? "hari-ini" : ""} ${hariKe(t) === 6 ? "minggu" : ""}"><small>${HARI[hariKe(t)]}</small><b>${Number(t.slice(8))}</b></th>`).join("")}</tr></thead>
      <tbody>${ks
        .map(
          (k) => `<tr><th class="jg-nama">${esc(k.nama)}</th>${r.hari
            .map((t) => {
              const v = jadwalOf(s).hari[t]?.[k.id] || "";
              const sh = v ? shiftDi(s, t, k.id) : null;
              return `<td><button class="jg-sel ${v === LIBUR ? "libur" : v ? "isi" : ""}" style="${v && v !== LIBUR ? `background:${warnaOf(list, v)}` : ""}" data-action="sel" data-t="${t}" data-k="${k.id}" aria-label="${esc(k.nama)} ${t}: ${sh ? esc(sh.nama) : "kosong"}">${v ? kodeShift(list, v) : ""}</button></td>`;
            })
            .join("")}</tr>`,
        )
        .join("")}</tbody>
      <tfoot><tr><th class="jg-nama"><small>Masuk</small></th>${hitung.map((h) => `<td><small>${h.total || ""}</small></td>`).join("")}</tr></tfoot>
    </table>
  </div>`;
}

function polaForm(s, r) {
  const ks = karyawanAktif(s);
  const list = templateShift(s);
  return `<details class="card"><summary><b>Isi cepat ${mode === "bulan" ? "sebulan" : "seminggu"}</b></summary>
    <form class="stack inline-form" data-form="pola">
      <div class="field"><span>Karyawan</span><div class="chips">${ks.map((k) => `<label class="chip"><input type="checkbox" name="k" value="${k.id}" checked><span>${esc(k.nama)}</span></label>`).join("")}</div></div>
      <div class="field"><span>Shift (pilih lebih dari satu = bergilir)</span><div class="chips">${list.map((x, i) => `<label class="chip"><input type="checkbox" name="sh" value="${x.id}" ${i === 0 ? "checked" : ""}><span>${esc(x.nama)}</span></label>`).join("")}</div></div>
      <label class="field"><span>Kalau bergilir, ganti tiap (minggu)</span><input type="number" name="ganti" min="1" max="8" value="1"></label>
      <div class="field"><span>Libur tiap</span><div class="chips">${HARI.map((h, i) => `<label class="chip"><input type="checkbox" name="libur" value="${i}" ${i === 6 ? "checked" : ""}><span>${h}</span></label>`).join("")}</div></div>
      <label class="impor-cek"><input type="checkbox" name="timpa"><span>Timpa kotak yang sudah diisi</span></label>
      <button class="btn primary">Terapkan ke ${pendek(r.dari)} – ${pendek(r.sampai)}</button>
    </form>
    <div class="row2"><button class="btn soft sm" data-action="salinJadwal">Salin dari ${mode === "bulan" ? "4 minggu" : "minggu"} lalu</button><button class="btn ghost sm" data-action="kosongkanJadwal">Kosongkan periode ini</button></div>
  </details>`;
}

function templateView(s) {
  const list = templateShift(s);
  return `<details class="card"><summary><b>Template shift</b> <small class="muted">${list.map((x) => esc(x.nama)).join(", ")}</small></summary>
    <div class="stack inline-form">
      ${list
        .map(
          (x) => `<div class="shift-tpl" data-id="${x.id}">
          <span class="jg-dot" style="background:${warnaOf(list, x.id)}"></span>
          <input value="${esc(x.nama)}" maxlength="20" data-change="ubahShift" data-id="${x.id}" data-f="nama" aria-label="Nama shift">
          <input type="time" value="${x.mulai}" data-change="ubahShift" data-id="${x.id}" data-f="mulai" aria-label="Jam mulai ${esc(x.nama)}">
          <input type="time" value="${x.selesai}" data-change="ubahShift" data-id="${x.id}" data-f="selesai" aria-label="Jam selesai ${esc(x.nama)}">
          <button class="icon-btn sm" data-action="hapusShift" data-id="${x.id}" aria-label="Hapus shift ${esc(x.nama)}">${icon("x", 14)}</button>
        </div>`,
        )
        .join("")}
      <form class="shift-tpl" data-form="shiftBaru"><span class="jg-dot"></span><input name="nama" maxlength="20" placeholder="Shift baru, cth: Middle" aria-label="Nama shift baru" required><input type="time" name="mulai" value="09:00" aria-label="Jam mulai"><input type="time" name="selesai" value="17:00" aria-label="Jam selesai"><button class="btn soft sm">Tambah</button></form>
      <p class="small muted">Jam shift dipakai buat hitung telat (dari jam mulai) & lembur (lewat jam selesai). Shift lewat tengah malam boleh (cth 18:00–02:00).</p>
    </div>
  </details>`;
}

function kirimView(s, r) {
  const ks = karyawanAktif(s).filter((k) => r.hari.some((t) => shiftDi(s, t, k.id)));
  if (!ks.length) return "";
  return `<section class="card stack"><h2 class="card-title" style="margin:0">Kirim jadwal</h2>
    <div class="chips">${ks
      .map((k) => {
        const teks = teksJadwal(s, k, r.dari, r.sampai, bisnisOf(s));
        return `<a class="chip-btn" target="_blank" rel="noopener" href="${esc(k.wa ? waLink(k.wa, teks) : `https://wa.me/?text=${encodeURIComponent(teks)}`)}">${icon("chat", 14)} ${esc(k.nama)}</a>`;
      })
      .join("")}</div>
    <p class="small muted">Karyawan yang dihubungkan ke akun kasir juga bisa lihat jadwalnya sendiri di app (Kasir → Hari ini → Jadwal saya).</p>
  </section>`;
}

export function jadwalTab(s) {
  const ks = karyawanAktif(s);
  if (!ks.length) return `<section class="card"><p class="small" style="margin:0">Tambah karyawan dulu di tab <b>Karyawan</b>.</p></section>`;
  const r = rentang(mode, anchor);
  const list = templateShift(s);
  const judul = mode === "bulan" ? new Date(r.dari + "T00:00:00").toLocaleDateString("id-ID", { month: "long", year: "numeric" }) : `${pendek(r.dari)} – ${pendek(r.sampai)}`;
  return `
    <div class="row-between"><div class="seg jg-mode">${[["minggu", "Mingguan"], ["bulan", "Bulanan"]].map(([k, v]) => `<label><input type="radio" name="jmode" value="${k}" data-change="jMode" ${mode === k ? "checked" : ""}><span>${v}</span></label>`).join("")}</div></div>
    <div class="month-nav"><button class="icon-btn" data-action="jGeser" data-d="-1" aria-label="Sebelumnya">${icon("back", 16)}</button><b>${esc(judul)}</b><button class="icon-btn" data-action="jGeser" data-d="1" aria-label="Berikutnya">${icon("chevron", 16)}</button></div>
    <section class="card stack">
      <div class="jg-kuas"><small class="muted">Pilih, lalu ketuk kotaknya:</small>
        <div class="chips">${list.map((x) => `<button class="chip-btn ${kuas === x.id ? "on" : ""}" data-action="kuas" data-v="${x.id}"><span class="jg-dot" style="background:${warnaOf(list, x.id)}"></span>${esc(x.nama)} <small>${jamTeks(x)}</small></button>`).join("")}<button class="chip-btn ${kuas === LIBUR ? "on" : ""}" data-action="kuas" data-v="${LIBUR}">Libur</button><button class="chip-btn ${kuas === "hapus" ? "on" : ""}" data-action="kuas" data-v="hapus">${icon("x", 12)} Hapus</button></div>
      </div>
      ${grid(s, r)}
      ${!kuas ? `<p class="small muted" style="margin:0">Pilih shift di atas dulu, baru ketuk kotak jadwal.</p>` : ""}
    </section>
    ${polaForm(s, r)}
    ${templateView(s)}
    ${kirimView(s, r)}`;
}

export const jadwalChanges = {
  jMode(el) {
    mode = el.value;
    render();
  },
  ubahShift(el) {
    const s = store.get();
    const sh = templateShift(s).find((x) => x.id === el.dataset.id);
    try {
      store.set(ubahShift(s, el.dataset.id, { ...sh, [el.dataset.f]: el.value }));
    } catch (e) {
      toast(e.message, "err");
    }
    render();
  },
};

export const jadwalActions = {
  jGeser(el) {
    anchor = geserAnchor(mode, anchor, Number(el.dataset.d));
    render();
  },
  kuas(el) {
    kuas = kuas === el.dataset.v ? null : el.dataset.v;
    render();
  },
  sel(el) {
    if (!kuas) return toast("Pilih shift dulu di atas");
    simpan(setSel(store.get(), el.dataset.t, el.dataset.k, kuas === "hapus" ? null : kuas));
    render();
  },
  salinJadwal() {
    const r = rentang(mode, anchor);
    try {
      const x = salinSebelumnya(store.get(), mode, r.dari, r.sampai);
      simpan({ jadwal: x.jadwal });
      toast(`${x.n} jadwal disalin (kotak yang sudah diisi nggak ditimpa)`);
    } catch (e) {
      toast(e.message, "err");
    }
    render();
  },
  kosongkanJadwal() {
    const r = rentang(mode, anchor);
    if (!confirm(`Kosongkan jadwal ${pendek(r.dari)} – ${pendek(r.sampai)}?`)) return;
    simpan(kosongkan(store.get(), r.dari, r.sampai));
    render();
  },
  hapusShift(el) {
    const s = store.get();
    const n = pakaiShift(s, el.dataset.id);
    const sh = templateShift(s).find((x) => x.id === el.dataset.id);
    if (!confirm(`Hapus shift ${sh?.nama}?${n ? ` ${n} kotak jadwal yang pakai shift ini ikut dikosongkan.` : ""}`)) return;
    try {
      store.set(hapusShift(s, el.dataset.id));
      if (kuas === el.dataset.id) kuas = null;
    } catch (e) {
      toast(e.message, "err");
    }
    render();
  },
};

export const jadwalForms = {
  pola(f) {
    const fd = new FormData(f);
    const r = rentang(mode, anchor);
    try {
      simpan(terapkanPola(store.get(), { karyawanIds: fd.getAll("k"), dari: r.dari, sampai: r.sampai, shiftIds: fd.getAll("sh"), libur: fd.getAll("libur").map(Number), ganti: fd.get("ganti"), timpa: fd.get("timpa") === "on" }));
      toast("Jadwal diisi");
    } catch (e) {
      return toast(e.message, "err");
    }
    render();
  },
  shiftBaru(f) {
    const fd = new FormData(f);
    try {
      store.set(tambahShift(store.get(), { nama: fd.get("nama"), mulai: fd.get("mulai"), selesai: fd.get("selesai") }));
      toast("Shift ditambahkan");
    } catch (e) {
      return toast(e.message, "err");
    }
    render();
  },
};

// ---------- #/jadwal: Jadwal saya (akun kasir / anggota tim) ----------
export const jadwalSaya = {
  render(s) {
    if (role() === "owner" || role() === "manajer") {
      location.hash = "#/karyawan?tab=jadwal";
      return "";
    }
    const back = "#/kasir";
    const id = cloud.user?.id;
    const ini = rentang("minggu", todayISO());
    const depan = rentang("minggu", geserAnchor("minggu", todayISO(), 1));
    const a = id ? jadwalAkun(s, id, ini.dari, depan.sampai) : null;
    if (!a)
      return `${head("Jadwal saya", back)}<section class="card"><p class="small" style="margin:0">Jadwalmu belum ada. Minta pemilik / manajer menghubungkan akunmu ke data karyawan & mengisi jadwal.</p></section>`;
    const blok = (judul, list) => `<section class="card stack"><h2 class="card-title" style="margin:0">${judul}</h2>${list
      .map(({ tanggal, shift }) => `<div class="row-between pos-sum ${tanggal === todayISO() ? "jadwal-hari-ini" : ""}"><span>${HARI[hariKe(tanggal)]} ${pendek(tanggal)}${tanggal === todayISO() ? " · hari ini" : ""}</span><b>${!shift ? "-" : shift.libur ? "Libur" : `${esc(shift.nama)} ${jamTeks(shift)}`}</b></div>`)
      .join("")}</section>`;
    const hariIni = a.find((x) => x.tanggal === todayISO())?.shift;
    return `${head("Jadwal saya", back)}
      ${hariIni ? `<section class="card accent"><b>${hariIni.libur ? "Hari ini kamu libur" : `Hari ini: ${esc(hariIni.nama)} ${jamTeks(hariIni)}`}</b>${hariIni.libur ? "" : `<p class="small muted" style="margin:4px 0 0">${Math.round(durasi(hariIni) / 6) / 10} jam</p>`}</section>` : ""}
      ${blok("Minggu ini", a.slice(0, 7))}
      ${blok("Minggu depan", a.slice(7))}`;
  },
};
