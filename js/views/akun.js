import { icon } from "../icons.js";
import { store } from "../store.js";
import { esc, toast } from "../ui.js";
import { render, go } from "../app.js";
import { cloud, signIn, signUp, sendReset, setNewPassword, signOut, syncNow, isMember } from "../cloud.js";
import { peranNama } from "./tim.js";

let mode = "masuk"; // masuk | daftar | lupa
let busy = false;
let info = ""; // pesan sukses (mis. cek email)

const STATUS = {
  off: ["cloud", "Belum login"],
  syncing: ["sync", "Lagi sinkron…"],
  synced: ["check", "Tersimpan di cloud"],
  offline: ["cloud", "Offline, nanti disinkron otomatis"],
  error: ["alert", "Gagal sinkron"],
};

export function syncBadge() {
  if (!cloud.user) return "";
  const [ic, label] = STATUS[cloud.status] || STATUS.off;
  return `<a href="#/akun" class="pill sync ${cloud.status}" title="${esc(label)}">${icon(ic, 13)} ${cloud.status === "synced" ? "Cloud" : esc(label)}</a>`;
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

const head = `<header class="page-head"><a href="#/" class="back" aria-label="Kembali">${icon("back", 18)}</a><h1>Akun</h1></header>`;

export const akun = {
  render() {
    if (!cloud.available) {
      return `${head}<section class="card"><p>Fitur akun belum bisa dimuat. Cek koneksi internet lalu muat ulang halaman.</p></section>`;
    }

    // Datang dari link "reset password" di email
    if (cloud.recovery && cloud.user) {
      return `${head}
        <form class="card stack" data-form="newpass">
          <h2 class="card-title">Bikin password baru</h2>
          <p class="muted small">Untuk ${esc(cloud.user.email)}</p>
          <input name="password" type="password" minlength="6" autocomplete="new-password" placeholder="Password baru (min. 6 karakter)" required>
          <button class="btn primary" ${busy ? "disabled" : ""}>${busy ? "Menyimpan…" : "Simpan password"}</button>
        </form>`;
    }

    if (cloud.user) {
      const [ic, label] = STATUS[cloud.status] || STATUS.off;
      const q = cloud.quota;
      return `${head}
        <section class="card stack">
          <div class="row-between"><div><small class="muted">Masuk sebagai</small><h2 style="margin:0">${esc(cloud.user.email)}</h2></div><span class="avatar">${esc(cloud.user.email[0].toUpperCase())}</span></div>
          <div class="sync-box ${cloud.status}"><span>${icon(ic, 20)}</span><div><b>${esc(label)}</b>${cloud.error ? `<p class="small">${esc(cloud.error)}</p>` : `<p class="small muted">Data bisnismu otomatis tersimpan & bisa dibuka di HP lain.</p>`}</div></div>
          <button class="btn soft" data-action="sync" ${cloud.status === "syncing" ? "disabled" : ""}>${icon("sync", 16)} Sinkron sekarang</button>
        </section>

        <a href="#/tim" class="card module">
          <span class="module-num">${icon("team", 18)}</span>
          <div><h3>${isMember() ? esc(cloud.team.bisnis || "Tim") : "Tim & Karyawan"}</h3><p class="muted small">${
            isMember()
              ? `Kamu ${esc(peranNama(cloud.team.role))} · atas nama ${esc(cloud.team.nama)}`
              : cloud.team?.anggota
                ? `${cloud.team.anggota} anggota tim`
                : "Undang kasir & manajer pakai kode"
          }</p></div>
          <span class="chev">${icon("chevron", 18)}</span>
        </a>

        <a href="#/notif" class="card module">
          <span class="module-num">${icon("bell", 18)}</span>
          <div><h3>Pengingat</h3><p class="muted small">Notifikasi ${isMember() && cloud.team.role === "kasir" ? "stok menipis & rekap tutup kasir" : "jadwal posting, stok menipis, pelanggan & rekap kasir"}</p></div>
          <span class="chev">${icon("chevron", 18)}</span>
        </a>

        <section class="card">
          <h2 class="card-title">AI Online</h2>
          <p class="small">${store.get().settings.aiMode === "online" ? "Aktif" : `Masih Mode Demo. <a href="#/setelan" class="link">Aktifkan di Setelan</a>`}</p>
          ${q ? `<p class="small muted">Pemakaian hari ini: ${q.used_today}/${q.limit_day}</p>` : `<p class="small muted">Kuota: maks. 60 permintaan AI per hari.</p>`}
        </section>

        <button class="btn ghost block" data-action="logout">${icon("logout", 16)} Keluar</button>`;
    }

    const tabs = `<div class="seg">
      <label><input type="radio" name="m" value="masuk" data-change="mode" ${mode === "masuk" ? "checked" : ""}><span>Masuk</span></label>
      <label><input type="radio" name="m" value="daftar" data-change="mode" ${mode === "daftar" ? "checked" : ""}><span>Daftar</span></label>
    </div>`;

    if (mode === "lupa") {
      return `${head}
        <form class="card stack" data-form="lupa">
          <h2 class="card-title">Lupa password</h2>
          <p class="muted small">Kami kirim link untuk bikin password baru ke email kamu.</p>
          <input name="email" type="email" autocomplete="email" placeholder="Email" required>
          <button class="btn primary" ${busy ? "disabled" : ""}>${busy ? "Mengirim…" : "Kirim link reset"}</button>
          ${info ? `<p class="ok-box small">${esc(info)}</p>` : ""}
          <button type="button" class="btn ghost" data-action="mode" data-m="masuk">Kembali ke Masuk</button>
        </form>`;
    }

    return `${head}
      <section class="card accent">
        <h2 class="card-title">Kenapa perlu akun?</h2>
        <ul class="checks">
          <li>Data bisnismu aman di cloud, nggak hilang kalau ganti HP</li>
          <li>Buka dari HP & laptop, datanya sama</li>
          <li>Bisa pakai AI Online yang beneran dipersonalisasi</li>
        </ul>
      </section>
      <form class="card stack" data-form="auth">
        ${tabs}
        <input name="email" type="email" autocomplete="email" placeholder="Email" required>
        <input name="password" type="password" minlength="6" autocomplete="${mode === "daftar" ? "new-password" : "current-password"}" placeholder="Password${mode === "daftar" ? " (min. 6 karakter)" : ""}" required>
        <button class="btn primary" ${busy ? "disabled" : ""}>${busy ? "Tunggu…" : mode === "daftar" ? "Daftar" : "Masuk"}</button>
        ${info ? `<p class="ok-box small">${esc(info)}</p>` : ""}
        ${mode === "masuk" ? `<button type="button" class="btn ghost sm" data-action="mode" data-m="lupa">Lupa password?</button>` : `<p class="muted small">Data yang sudah ada di perangkat ini akan ikut tersimpan ke akunmu.</p>`}
      </form>`;
  },

  changes: {
    mode(el) {
      mode = el.value;
      info = "";
      render();
    },
  },

  actions: {
    mode(el) {
      mode = el.dataset.m;
      info = "";
      render();
    },
    sync: () => syncNow(),
    logout() {
      const clear = isMember()
        ? (confirm("Keluar dari akun? Data usaha tim akan dihapus dari perangkat ini.") || null)
        : confirm("Keluar dari akun.\n\nHapus juga data bisnis dari perangkat ini? (Data tetap aman di cloud)\n\nOK = hapus dari perangkat ini\nBatal = biarkan di perangkat ini");
      if (clear === null) return;
      return run(async () => {
        await signOut({ clearLocal: clear });
        mode = "masuk";
        toast("Sudah keluar");
        if (clear) go("profil");
      });
    },
  },

  forms: {
    auth(form) {
      const fd = new FormData(form);
      const email = fd.get("email").trim();
      const password = fd.get("password");
      return run(async () => {
        info = "";
        if (mode === "daftar") {
          const { needsConfirm } = await signUp(email, password);
          if (needsConfirm) {
            info = `Cek email ${email} lalu klik link konfirmasi. Setelah itu masuk di sini.`;
            mode = "masuk";
            return;
          }
        } else {
          await signIn(email, password);
        }
        toast("Berhasil masuk");
        go(store.get().profile ? "" : "profil");
      });
    },
    lupa(form) {
      const email = new FormData(form).get("email").trim();
      return run(async () => {
        await sendReset(email);
        info = `Link reset sudah dikirim ke ${email}. Buka dari perangkat ini ya.`;
      });
    },
    newpass(form) {
      const password = new FormData(form).get("password");
      return run(async () => {
        await setNewPassword(password);
        toast("Password baru disimpan");
        go("");
      });
    },
  },
};
