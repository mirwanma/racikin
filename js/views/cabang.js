// Multi-cabang (#/cabang, paket Max): daftar cabang & pindah cabang, tambah cabang (salin menu dari cabang yang lagi
// dibuka), kirim menu ke cabang lain, ringkasan gabungan (omzet, order, laba per cabang), ganti nama & hapus cabang.
// Khusus pemilik. Tiap cabang punya Kasir, stok, Kas, pelanggan & tim sendiri.
import { icon } from "../icons.js";
import { esc, rupiah, toast, todayISO } from "../ui.js";
import { store } from "../store.js";
import { render } from "../app.js";
import { head } from "./_shared.js";
import { cloud, role, isMember, loadTeam, sync, pindahCabang, cabangAktif, cabangBuat, cabangUbah, cabangHapus, cabangRingkasan, docCabang, simpanDocCabang } from "../cloud.js";
import { bolehFitur } from "../paket.js";
import { kunciPro } from "./paket.js";
import { docCabangBaru, kirimMenu, ringkasCabang, dariRingkasan, namaCabang, BAGIAN, MAKS_CABANG } from "../cabang.js";

let ringkas = { status: "idle", data: null, error: "", at: 0, key: "" };
let busy = "";
let ubahId = null;
let kirim = { ke: new Set(), bagian: new Set(["menu"]) };

const daftar = () => cloud.team?.cabang || [];
const kunciRingkas = () => `${cloud.user?.id}|${daftar().map((c) => c.id).join(",")}`;

/** Chip "Cabang X" untuk Beranda & Kasir (pemilik dengan lebih dari satu cabang). */
export function cabangChip() {
  const c = cabangAktif();
  if (!c) return "";
  return `<a href="#/cabang" class="cabang-chip" title="Ganti cabang">${icon("store", 14)}<span>${esc(namaCabang(c))}</span><small>ganti</small></a>`;
}

/** Modul di halaman Bisnis. */
export function cabangModul() {
  const n = daftar().length;
  return `<a href="#/cabang" class="card module">
    <span class="module-num">${icon("store", 18)}</span>
    <div><h3>Cabang</h3><p class="muted small">${n > 1 ? `${n} cabang · lagi buka ${esc(namaCabang(cabangAktif()))}` : "Buka cabang baru, pantau semua cabang dari satu akun"}</p></div>
    <span class="chev">${icon("chevron", 18)}</span>
  </a>`;
}

async function muatRingkas(force = false) {
  const key = kunciRingkas();
  if (!cloud.user || (ringkas.status === "loading" && !force)) return;
  if (!force && ringkas.key === key && Date.now() - ringkas.at < 60_000) return;
  ringkas = { ...ringkas, status: "loading", key };
  render();
  try {
    const data = await cabangRingkasan(dariRingkasan(todayISO()));
    ringkas = { status: "ok", data, error: "", at: Date.now(), key };
  } catch (e) {
    ringkas = { ...ringkas, status: "error", error: e.message, at: Date.now() };
  }
  render();
}

async function jalan(label, fn) {
  if (busy) return;
  busy = label;
  render();
  try {
    await fn();
  } catch (e) {
    toast(e.message || "Gagal", "err");
  } finally {
    busy = "";
    render();
  }
}

function ringkasView() {
  if (daftar().length < 2) return "";
  if (ringkas.status === "error") return `<section class="card"><p class="small neg">Ringkasan gagal dimuat: ${esc(ringkas.error)}</p><button class="btn ghost sm" data-action="muatUlang">Coba lagi</button></section>`;
  if (!ringkas.data) return `<section class="card"><p class="small muted">Memuat ringkasan semua cabang…</p></section>`;
  const today = todayISO();
  const r = ringkasCabang(ringkas.data, today);
  const baris = (x, total = false) => `<div class="cabang-tr ${total ? "total" : ""}">
      <span class="cabang-nama">${total ? "<b>Semua cabang</b>" : `<b>${esc(x.nama)}</b>${x.utama ? ` <span class="tag">utama</span>` : ""}${x.id === cloud.team?.ownerId ? ` <span class="tag ok">dibuka</span>` : ""}`}</span>
      <span class="num"><b>${rupiah(x.hari.omzet)}</b><small>${x.hari.order} order</small></span>
      <span class="num"><b>${rupiah(x.minggu.omzet)}</b><small>${x.minggu.order} order</small></span>
      <span class="num"><b>${rupiah(x.bulan30.omzet)}</b><small>${x.bulan30.order} order</small></span>
      <span class="num"><b class="${x.laba < 0 ? "neg" : "pos"}">${rupiah(x.laba)}</b><small>laba bulan ini</small></span>
    </div>`;
  return `<section class="card stack">
    <div class="row-between"><h2 class="card-title" style="margin:0">Ringkasan semua cabang</h2><button class="btn ghost sm" data-action="muatUlang" ${ringkas.status === "loading" ? "disabled" : ""}>${icon("sync", 14)} Muat ulang</button></div>
    <div class="cabang-tabel">
      <div class="cabang-tr th"><span>Cabang</span><span>Hari ini</span><span>7 hari</span><span>30 hari</span><span>Laba</span></div>
      ${r.list.map((x) => baris(x)).join("")}
      ${baris(r.total, true)}
    </div>
    ${r.terbaik ? `<p class="small muted">Paling rame 30 hari terakhir: <b>${esc(r.terbaik.nama)}</b> (${Math.round((r.terbaik.bulan30.omzet / Math.max(1, r.total.bulan30.omzet)) * 100)}% omzet).</p>` : ""}
    <p class="small muted">Angka dari rekap kasir & Kas tiap cabang (laba pakai cara hitung Laporan). Data cabang lain masuk setelah HP di cabang itu sinkron.</p>
  </section>`;
}

function daftarView() {
  const list = daftar();
  const aktif = cloud.team?.ownerId;
  return `<section class="card stack">
    <h2 class="card-title" style="margin:0">Cabang kamu</h2>
    ${list
      .map(
        (c) => `<div class="cabang-row ${c.id === aktif ? "on" : ""}">
        <div class="cabang-info">
          ${
            ubahId === c.id
              ? `<form class="row2" data-form="ubahNama" data-id="${c.id}"><input name="nama" maxlength="60" value="${esc(c.nama)}" required aria-label="Nama cabang"><button class="btn soft sm">Simpan</button></form>`
              : `<b>${esc(namaCabang(c))}</b>${c.utama ? ` <span class="tag">utama</span>` : ""}${c.id === aktif ? ` <span class="tag ok">lagi dibuka</span>` : ""}<small class="muted">${c.anggota ? `${c.anggota} anggota tim` : "belum ada tim"}</small>`
          }
        </div>
        <div class="cabang-aksi">
          ${c.id === aktif ? "" : `<button class="btn primary sm" data-action="pindah" data-id="${c.id}" ${busy ? "disabled" : ""}>Buka</button>`}
          ${ubahId === c.id ? `<button class="btn ghost sm" data-action="batalUbah">Batal</button>` : `<button class="btn ghost sm" data-action="ubah" data-id="${c.id}">Ganti nama</button>`}
          ${c.utama || c.id === aktif ? "" : `<button class="btn ghost sm danger-text" data-action="hapus" data-id="${c.id}">Hapus</button>`}
        </div>
      </div>`,
      )
      .join("")}
    <p class="small muted">Tiap cabang punya Kasir, stok, Kas, pelanggan & tim sendiri. Undang kasir / manajer cabang dari menu Tim setelah cabangnya dibuka.</p>
  </section>`;
}

function tambahView(s) {
  if (daftar().length >= MAKS_CABANG) return `<section class="card"><p class="small muted">Sudah ${MAKS_CABANG} cabang (maksimal).</p></section>`;
  const sumber = namaCabang(cabangAktif()) || s.profile?.nama || "cabang ini";
  return `<section class="card stack">
    <h2 class="card-title" style="margin:0">Tambah cabang</h2>
    <form class="stack" data-form="tambah">
      <label class="field"><span>Nama cabang</span><input name="nama" maxlength="60" placeholder="cth: Cabang Dago" required></label>
      <button class="btn primary" ${busy ? "disabled" : ""}>${busy === "tambah" ? "Lagi bikin cabang…" : `${icon("plus", 16)} Bikin cabang`}</button>
    </form>
    <p class="small muted">Disalin dari <b>${esc(sumber)}</b>: profil & brand, menu, resep, varian, bahan (stok mulai 0), harga ojol, promo, program stempel, supplier & setelan kasir. Kas, order, pelanggan & karyawan mulai kosong.</p>
  </section>`;
}

function kirimView() {
  const lain = daftar().filter((c) => c.id !== cloud.team?.ownerId);
  if (!lain.length) return "";
  return `<section class="card stack">
    <h2 class="card-title" style="margin:0">Kirim menu ke cabang lain</h2>
    <p class="small muted">Habis ubah harga / menu di <b>${esc(namaCabang(cabangAktif()))}</b>? Kirim ke cabang lain biar sama.</p>
    <div class="stack-sm">${lain.map((c) => `<label class="impor-cek"><input type="checkbox" data-change="ke" value="${c.id}" ${kirim.ke.has(c.id) ? "checked" : ""}><span>${esc(namaCabang(c))}</span></label>`).join("")}</div>
    <h3 class="small muted" style="margin:4px 0 0">Yang dikirim</h3>
    <div class="stack-sm">${BAGIAN.map((b) => `<label class="impor-cek"><input type="checkbox" data-change="bagian" value="${b.id}" ${kirim.bagian.has(b.id) ? "checked" : ""}><span><b>${esc(b.nama)}</b><small class="muted"> · ${esc(b.ket)}</small></span></label>`).join("")}</div>
    <button class="btn soft" data-action="kirim" ${!kirim.ke.size || !kirim.bagian.size || busy ? "disabled" : ""}>${busy === "kirim" ? "Lagi kirim…" : `${icon("send", 16)} Kirim ke ${kirim.ke.size || ""} cabang`}</button>
    <p class="small muted">Yang dikirim menimpa bagian yang sama di cabang tujuan. Stok, Kas & penjualan cabang tujuan nggak berubah.</p>
  </section>`;
}

export const cabang = {
  render(s) {
    const back = "#/bisnis";
    if (!cloud.user) return `${head("Cabang", back)}<section class="card stack"><h2 class="card-title" style="margin:0">Multi-cabang butuh akun</h2><p class="small">Data tiap cabang disimpan di cloud, jadi kamu bisa pantau semua cabang dari satu akun.</p><a href="#/akun" class="btn primary">Daftar / masuk</a></section>`;
    if (!cloud.team) return `${head("Cabang", back)}<section class="card"><p class="muted">Memuat info cabang…</p></section>`;
    if (isMember() || role() !== "owner") return `${head("Cabang", "#/")}<section class="card"><p class="small">Halaman cabang khusus pemilik usaha.</p></section>`;
    const list = daftar();
    const boleh = bolehFitur("cabang");
    if (list.length > 1 && kunciRingkas() !== ringkas.key) setTimeout(() => muatRingkas(), 0);
    if (!boleh && list.length <= 1) {
      return `${head("Cabang", back)}
        <section class="card stack">
          <h2 class="card-title" style="margin:0">Satu akun, banyak cabang</h2>
          <ul class="small">
            <li>Tiap cabang punya Kasir, stok, Kas, pelanggan & tim sendiri.</li>
            <li>Pindah cabang dari HP yang sama, nggak perlu ganti akun.</li>
            <li>Cabang baru langsung dapat menu, resep & promo dari cabang utama.</li>
            <li>Ringkasan gabungan: omzet, order & laba semua cabang di satu layar.</li>
          </ul>
        </section>
        ${kunciPro("cabang", "Multi-cabang ada di paket Max. Data cabang utama kamu tetap aman.")}`;
    }
    return `${head("Cabang", back)}
      ${ringkasView()}
      ${daftarView()}
      ${boleh ? tambahView(s) : `${kunciPro("cabang", "Paket kamu sekarang belum Max: cabang yang sudah ada tetap bisa dibuka, tapi nggak bisa nambah cabang baru.")}`}
      ${kirimView()}`;
  },
  changes: {
    ke(el) {
      if (el.checked) kirim.ke.add(el.value);
      else kirim.ke.delete(el.value);
      render();
    },
    bagian(el) {
      if (el.checked) kirim.bagian.add(el.value);
      else kirim.bagian.delete(el.value);
      render();
    },
  },
  actions: {
    muatUlang() {
      muatRingkas(true);
    },
    pindah(el) {
      const c = daftar().find((x) => x.id === el.dataset.id);
      return jalan("pindah", async () => {
        await pindahCabang(el.dataset.id);
        kirim.ke.clear();
        toast(`Sekarang buka ${namaCabang(c)}`);
        location.hash = "#/";
      });
    },
    ubah(el) {
      ubahId = el.dataset.id;
      render();
      document.querySelector('form[data-form="ubahNama"] input')?.focus();
    },
    batalUbah() {
      ubahId = null;
      render();
    },
    hapus(el) {
      const c = daftar().find((x) => x.id === el.dataset.id);
      if (!c) return;
      const ketik = prompt(`Hapus ${namaCabang(c)} beserta SEMUA datanya (penjualan, Kas, stok, pelanggan, tim)? Nggak bisa dibatalkan.\n\nKetik nama cabangnya untuk konfirmasi:`);
      if (ketik == null) return;
      if (ketik.trim().toLowerCase() !== namaCabang(c).trim().toLowerCase()) return toast("Nama nggak cocok, batal dihapus", "err");
      return jalan("hapus", async () => {
        await cabangHapus(c.id);
        kirim.ke.delete(c.id);
        ringkas.key = "";
        toast(`${namaCabang(c)} dihapus`);
      });
    },
    kirim() {
      const s = store.get();
      const bagian = [...kirim.bagian];
      const ke = daftar().filter((c) => kirim.ke.has(c.id));
      if (!confirm(`Kirim ${bagian.map((b) => BAGIAN.find((x) => x.id === b)?.nama).join(", ")} ke ${ke.map(namaCabang).join(", ")}? Bagian yang sama di cabang tujuan akan ditimpa.`)) return;
      return jalan("kirim", async () => {
        await sync(); // pastikan versi terbaru cabang ini yang dikirim
        const gagal = [];
        for (const c of ke) {
          let ok = false;
          for (let i = 0; i < 3 && !ok; i++) {
            const remote = await docCabang(c.id);
            ok = await simpanDocCabang(c.id, kirimMenu(remote?.data || {}, s, bagian), remote?.rev || 0);
          }
          if (!ok) gagal.push(namaCabang(c));
        }
        ringkas.key = "";
        if (gagal.length) toast(`Gagal kirim ke ${gagal.join(", ")}. Coba lagi ya`, "err");
        else toast(`Terkirim ke ${ke.length} cabang`);
      });
    },
  },
  forms: {
    tambah(f) {
      const nama = String(new FormData(f).get("nama") || "").trim();
      if (!nama) return;
      if (daftar().some((c) => namaCabang(c).toLowerCase() === nama.toLowerCase())) return toast("Nama cabang itu sudah ada", "err");
      return jalan("tambah", async () => {
        await sync();
        const baru = await cabangBuat(nama);
        const ok = await simpanDocCabang(baru.id, docCabangBaru(store.get(), nama, todayISO()), 0);
        if (!ok) throw new Error("Cabang dibuat, tapi datanya gagal disalin. Coba kirim menu ke cabang itu.");
        await loadTeam();
        ringkas.key = "";
        f.reset();
        toast(`${nama} siap. Buka cabangnya dari daftar di atas`);
      });
    },
    ubahNama(f) {
      const nama = String(new FormData(f).get("nama") || "").trim();
      const id = f.dataset.id;
      return jalan("ubah", async () => {
        await cabangUbah(id, nama);
        ubahId = null;
        await loadTeam();
        ringkas.key = "";
        toast("Nama cabang disimpan");
      });
    },
  },
};
