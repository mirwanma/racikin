// Mode tim: pemilik mengundang karyawan (kasir / manajer); karyawan bergabung pakai kode.
import { esc, toast, copy } from "../ui.js";
import { render, go } from "../app.js";
import { icon } from "../icons.js";
import { head } from "./_shared.js";
import { cloud, role, loadTeam, createInvite, listTeam, listInvites, cancelInvite, removeMember, setMemberRole, joinTeam, leaveTeam } from "../cloud.js";

export const PERAN = {
  kasir: { nama: "Kasir", akses: ["Jualan di Kasir & lihat rekap hari ini", "Tambah stempel & data pelanggan", "Catat stok bahan masuk / opname"], tidak: "Tidak bisa lihat Kas, laporan, RAB, ide & rencana bisnis, atau ubah harga & resep." },
  manajer: { nama: "Manajer", akses: ["Semua fitur: Kasir, Kas & laporan, stok, resep, harga, konten", "Pakai AI dengan kuota akunnya sendiri"], tidak: "Tidak bisa mengundang / mengeluarkan anggota tim." },
};
export const peranNama = (r) => (r === "owner" ? "Pemilik" : PERAN[r]?.nama || r);

let data = { anggota: null, undangan: null, loading: false, error: "", at: 0 };
let baru = null; // undangan yang baru dibuat { code, nama, role, expires_at }
let busy = false;

const linkGabung = (code) => `${location.origin}${location.pathname}#/gabung?kode=${encodeURIComponent(code)}`;
const pesanUndangan = (inv, bisnis) =>
  `Halo ${inv.nama}! Kamu diundang jadi ${peranNama(inv.role)} di ${bisnis} lewat app Racikin.\n\n` +
  `1. Buka link ini: ${linkGabung(inv.code)}\n2. Daftar / masuk pakai email kamu\n3. Kode undangan: ${inv.code}\n\nBerlaku 7 hari.`;
const tglPendek = (iso) => new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "short" });

// Tiap kali halaman Tim dibuka, daftar anggota dimuat ulang (anggota baru bisa bergabung kapan saja).
window.addEventListener("hashchange", () => {
  if (location.hash.startsWith("#/tim")) data.at = 0;
});
// Masih ada undangan yang belum dipakai & halaman Tim terbuka: cek tiap 10 detik,
// supaya karyawan yang baru bergabung langsung muncul.
setInterval(() => {
  if (location.hash.startsWith("#/tim") && document.visibilityState === "visible" && data.undangan?.length) refresh();
}, 10000);

let seq = 0; // hanya hasil muat terakhir yang dipakai (hindari daftar basi)
async function refresh(force = false) {
  if ((data.loading && !force) || !cloud.user || role() !== "owner") return;
  const my = ++seq;
  data.loading = true;
  try {
    const [anggota, undangan] = await Promise.all([listTeam(), listInvites()]);
    if (my !== seq) return;
    data = { anggota, undangan, loading: false, error: "", at: Date.now() };
    if (cloud.team && cloud.team.anggota !== anggota.length) await loadTeam();
  } catch (err) {
    if (my !== seq) return;
    data = { ...data, loading: false, error: err.message, at: Date.now() };
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

const aksesList = (r) => `<ul class="checks small">${PERAN[r].akses.map((a) => `<li>${esc(a)}</li>`).join("")}</ul><p class="small muted">${esc(PERAN[r].tidak)}</p>`;

function loginDulu(teks) {
  return `<section class="card empty">
    <div class="empty-icon">${icon("team", 30)}</div>
    <h3>Masuk dulu</h3>
    <p>${esc(teks)}</p>
    <a href="#/akun" class="btn primary">Masuk / Daftar</a>
  </section>`;
}

function memberView() {
  const t = cloud.team;
  return `${head("Tim", "#/akun")}
    <section class="card accent">
      <small class="mono">KAMU ANGGOTA TIM</small>
      <h2 style="margin:4px 0">${esc(t.bisnis || "Usaha")}</h2>
      <p class="small">Sebagai <b>${esc(peranNama(t.role))}</b> · tercatat atas nama <b>${esc(t.nama)}</b></p>
    </section>
    <section class="card">
      <h2 class="card-title">Yang bisa kamu lakukan</h2>
      ${aksesList(t.role)}
    </section>
    <section class="card">
      <h2 class="card-title">Keluar dari tim</h2>
      <p class="small muted">Data usaha ini akan dihapus dari HP ini. Kalau kamu punya usaha sendiri di Racikin, datanya muncul lagi setelah keluar.</p>
      <button class="btn danger" data-action="leave" ${busy ? "disabled" : ""}>Keluar dari tim</button>
    </section>`;
}

function inviteCard(s) {
  if (!baru) return "";
  const bisnis = s.brand?.terpilih?.nama || s.profile?.nama || "usaha kami";
  return `<section class="card invite-card">
    <div class="row-between"><h2 class="card-title" style="margin:0">Undangan untuk ${esc(baru.nama)}</h2><button class="icon-btn sm" data-action="tutupBaru" aria-label="Tutup">${icon("x", 14)}</button></div>
    <p class="small muted">${esc(peranNama(baru.role))} · berlaku sampai ${tglPendek(baru.expires_at)} · sekali pakai</p>
    <div class="invite-code mono">${esc(baru.code)}</div>
    <div class="row2">
      <button class="btn ghost" data-action="salin" data-code="${esc(baru.code)}">Salin link</button>
      <a class="btn primary" href="https://wa.me/?text=${encodeURIComponent(pesanUndangan(baru, bisnis))}" target="_blank" rel="noopener">Kirim via WA</a>
    </div>
  </section>`;
}

function ownerView(s) {
  if (!data.loading && (data.anggota === null || Date.now() - data.at > 10000)) refresh(); // anggota baru bisa bergabung kapan saja
  const anggota = data.anggota || [];
  const undangan = data.undangan || [];
  return `${head("Tim & Karyawan", "#/bisnis")}
    <p class="muted small">Ajak karyawan pakai Racikin di HP masing-masing. Penjualan dari semua HP masuk ke data usahamu, dan tiap order tercatat siapa kasirnya.</p>
    ${inviteCard(s)}
    <form class="card stack" data-form="undang">
      <h2 class="card-title">Undang anggota</h2>
      <label class="field"><span>Nama panggilan</span><input name="nama" maxlength="40" placeholder="cth: Rina" required></label>
      <div class="seg">
        <label><input type="radio" name="role" value="kasir" checked><span>Kasir</span></label>
        <label><input type="radio" name="role" value="manajer"><span>Manajer</span></label>
      </div>
      <details class="small"><summary>Bedanya kasir & manajer</summary>
        <h4>Kasir</h4>${aksesList("kasir")}
        <h4>Manajer</h4>${aksesList("manajer")}
      </details>
      <button class="btn primary" ${busy ? "disabled" : ""}>${icon("plus", 16)} ${busy ? "Membuat…" : "Bikin kode undangan"}</button>
    </form>

    <section class="card">
      <h2 class="card-title">Anggota tim${anggota.length ? ` <small class="muted">· ${anggota.length}</small>` : ""}</h2>
      ${data.error ? `<p class="warn-box small">${esc(data.error)}</p>` : ""}
      ${
        data.anggota === null
          ? `<p class="muted small">Memuat…</p>`
          : anggota.length
            ? anggota
                .map(
                  (m) => `<div class="team-row">
                    <span class="avatar">${esc(m.nama[0].toUpperCase())}</span>
                    <div><b>${esc(m.nama)}</b><p class="small muted">${esc(m.email)} · sejak ${tglPendek(m.created_at)}</p></div>
                    <select data-change="peran" data-id="${m.member_id}" aria-label="Peran ${esc(m.nama)}">
                      ${Object.entries(PERAN).map(([k, v]) => `<option value="${k}" ${m.role === k ? "selected" : ""}>${v.nama}</option>`).join("")}
                    </select>
                    <button class="icon-btn sm" data-action="keluarkan" data-id="${m.member_id}" data-nama="${esc(m.nama)}" aria-label="Keluarkan ${esc(m.nama)}">${icon("x", 14)}</button>
                  </div>`,
                )
                .join("")
            : `<p class="muted small">Belum ada anggota. Bikin kode undangan di atas lalu kirim ke karyawanmu.</p>`
      }
    </section>

    ${
      undangan.length
        ? `<section class="card">
            <h2 class="card-title">Undangan belum dipakai</h2>
            ${undangan
              .map(
                (u) => `<div class="team-row">
                  <span class="mono invite-mini">${esc(u.code)}</span>
                  <div><b>${esc(u.nama)}</b><p class="small muted">${esc(peranNama(u.role))} · s.d. ${tglPendek(u.expires_at)}</p></div>
                  <button class="btn ghost sm" data-action="salin" data-code="${esc(u.code)}">Salin</button>
                  <button class="icon-btn sm" data-action="batalUndang" data-code="${esc(u.code)}" aria-label="Batalkan undangan">${icon("x", 14)}</button>
                </div>`,
              )
              .join("")}
          </section>`
        : ""
    }
    <section class="card info-card">
      <h2 class="card-title">Catatan</h2>
      <ul class="checks small">
        <li>Data Kas, RAB & rencana bisnis tidak dikirim ke HP kasir sama sekali.</li>
        <li>Penjualan per kasir kelihatan di Kasir &gt; Hari ini.</li>
        <li>Kalau anggota dikeluarkan, data usahamu otomatis dihapus dari HP-nya saat app dibuka lagi.</li>
      </ul>
    </section>`;
}

export const tim = {
  render(s) {
    if (!cloud.user) return `${head("Tim & Karyawan", "#/bisnis")}${loginDulu("Mode tim butuh akun, supaya data usahamu bisa dipakai bareng karyawan di HP masing-masing.")}`;
    if (!cloud.team) return `${head("Tim & Karyawan", "#/bisnis")}<section class="card"><p class="muted">Memuat info tim…</p></section>`;
    return role() === "owner" ? ownerView(s) : memberView();
  },

  actions: {
    tutupBaru() {
      baru = null;
      render();
    },
    async salin(el) {
      await copy(linkGabung(el.dataset.code));
      toast("Link undangan disalin");
    },
    batalUndang(el) {
      if (!confirm("Batalkan undangan ini? Kodenya tidak bisa dipakai lagi.")) return;
      return run(async () => {
        await cancelInvite(el.dataset.code);
        if (baru?.code === el.dataset.code) baru = null;
        data.anggota = null;
        await refresh(true);
      });
    },
    keluarkan(el) {
      if (!confirm(`Keluarkan ${el.dataset.nama} dari tim? Dia tidak bisa membuka data usahamu lagi.`)) return;
      return run(async () => {
        await removeMember(el.dataset.id);
        toast(`${el.dataset.nama} dikeluarkan`);
        data.anggota = null;
        await refresh(true);
      });
    },
    leave() {
      if (!confirm("Keluar dari tim? Data usaha ini akan dihapus dari HP ini.")) return;
      return run(async () => {
        await leaveTeam();
        toast("Kamu sudah keluar dari tim");
        go("");
      });
    },
  },

  changes: {
    peran(el) {
      return run(async () => {
        await setMemberRole(el.dataset.id, el.value);
        toast(`Peran diubah jadi ${peranNama(el.value)}`);
        data.anggota = null;
        await refresh(true);
      });
    },
  },

  forms: {
    undang(form) {
      const fd = new FormData(form);
      return run(async () => {
        baru = await createInvite(String(fd.get("role")), String(fd.get("nama")).trim());
        data.anggota = null;
        await refresh(true);
        window.scrollTo(0, 0);
      });
    },
  },
};

// ---------- Halaman gabung (dibuka karyawan dari link undangan) ----------
const kodeDariUrl = () => new URLSearchParams(location.hash.split("?")[1] || "").get("kode") || "";

export const gabung = {
  render() {
    const kode = kodeDariUrl().toUpperCase();
    const back = head("Gabung ke tim", "#/");
    if (!cloud.available) return `${back}<section class="card"><p>Fitur akun belum bisa dimuat. Cek koneksi lalu muat ulang.</p></section>`;
    if (!cloud.user) {
      if (kode) sessionStorage.setItem("racikin:gabung", kode); // lanjut ke sini setelah login
      return `${back}${loginDulu("Kamu diundang bergabung ke tim usaha. Masuk atau daftar pakai email kamu dulu, nanti otomatis lanjut ke sini.")}`;
    }
    if (!cloud.team) return `${back}<section class="card"><p class="muted">Memuat…</p></section>`;
    if (role() !== "owner") {
      sessionStorage.removeItem("racikin:gabung");
      return `${back}<section class="card"><p>Kamu sudah jadi ${esc(peranNama(role()))} di <b>${esc(cloud.team.bisnis || "tim lain")}</b>. Keluar dulu dari tim itu kalau mau gabung ke tim lain.</p><a href="#/tim" class="btn ghost">Info tim</a></section>`;
    }
    return `${back}
      <form class="card stack" data-form="gabung">
        <h2 class="card-title">Masukkan kode undangan</h2>
        <input name="kode" class="invite-input mono" maxlength="8" autocomplete="off" autocapitalize="characters" value="${esc(kode)}" placeholder="8 huruf/angka" required>
        <p class="small muted">Masuk sebagai ${esc(cloud.user.email)}</p>
        <button class="btn primary" ${busy ? "disabled" : ""}>${busy ? "Bergabung…" : "Gabung"}</button>
      </form>
      <section class="card info-card">
        <h2 class="card-title">Setelah bergabung</h2>
        <ul class="checks small">
          <li>HP ini memakai data usaha pemilik (menu, stok, pelanggan).</li>
          <li>Data di HP ini sekarang diganti. Kalau kamu punya usaha sendiri di Racikin, datanya tetap aman di akunmu dan muncul lagi setelah keluar dari tim.</li>
          <li>Setiap penjualan yang kamu catat tercatat atas namamu.</li>
        </ul>
      </section>`;
  },

  forms: {
    gabung(form) {
      const kode = String(new FormData(form).get("kode")).trim().toUpperCase();
      if (!confirm("Gabung ke tim? Data usaha di HP ini akan diganti dengan data tim.")) return;
      return run(async () => {
        const t = await joinTeam(kode);
        sessionStorage.removeItem("racikin:gabung");
        toast(`Selamat bergabung di ${t.bisnis || "tim"}!`);
        go(t.role === "kasir" ? "kasir" : "");
      });
    },
  },
};
