// Manajemen meja & QR (pemilik/manajer). Fitur opsional "Pesan lewat meja".
import { store, uid } from "../store.js";
import { bolehPro } from "../paket.js";
import { kunciPro } from "./paket.js";
import { esc, rupiah, toast, copy } from "../ui.js";
import { render } from "../app.js";
import { icon } from "../icons.js";
import { head } from "./_shared.js";
import { cloud, role } from "../cloud.js";
import { mejaAktif, digitalAktif, linkMeja, tokenBaru, publikasi, statusPublik, qrSvg, dengarPesanan, pesananHariIni } from "../meja.js";

let qrCache = {}; // token -> svg
let buka = null; // id meja yang QR-nya dibuka besar
let edit = null;
let cetak = false;
let lepas = null;

const bisaAtur = () => ["owner", "manajer"].includes(role());
const bisnisOf = (s) => s.brand?.terpilih?.nama || s.profile?.nama || "Menu";

function pastikanQr(list) {
  const kurang = list.filter((m) => !qrCache[m.token]);
  if (!kurang.length) return;
  Promise.all(kurang.map(async (m) => (qrCache[m.token] = await qrSvg(linkMeja(m.token), 6)))).then(() => render());
}

const setMeja = (fn) => store.set((s) => ({ meja: fn(s.meja || []) }));

function kartuCetak(s, m) {
  return `<div class="meja-print-card">
    <b class="mpc-bisnis">${esc(bisnisOf(s))}</b>
    <div class="mpc-qr">${qrCache[m.token] || ""}</div>
    <div class="mpc-meja">${esc(m.nama)}</div>
    <small>Scan untuk lihat menu & pesan</small>
  </div>`;
}

export const meja = {
  render(s) {
    const h = head("Meja & QR", "#/bisnis");
    if (!cloud.user) {
      return `${h}<section class="card empty"><div class="empty-icon">${icon("grid", 30)}</div><h3>Masuk dulu</h3><p>Pesan lewat meja butuh akun, supaya pesanan pelanggan bisa masuk ke Kasir.</p><a href="#/akun" class="btn primary">Masuk / Daftar</a></section>`;
    }
    if (!bisaAtur()) return `${h}<section class="card"><p>Hanya pemilik atau manajer yang bisa mengatur meja.</p></section>`;
    if (!bolehPro()) return `${h}${kunciPro("meja", mejaAktif(s) ? "Paket Pro usaha ini habis, jadi pelanggan sementara nggak bisa pesan lewat QR. Upgrade buat nyalain lagi." : "")}`;
    const list = s.meja || [];
    pastikanQr(list);
    if (cetak) {
      return `<div class="no-print row2" style="margin-bottom:12px"><button class="btn ghost" data-action="tutupCetak">${icon("back", 16)} Kembali</button><button class="btn primary" data-action="print">Cetak</button></div>
        <div class="meja-print">${list.map((m) => kartuCetak(s, m)).join("")}</div>`;
    }
    const aktif = mejaAktif(s);
    const orders = pesananHariIni();
    const perMeja = {};
    for (const o of orders) {
      perMeja[o.meja_id] ??= { n: 0, total: 0, baru: 0 };
      if (o.status !== "batal") {
        perMeja[o.meja_id].n++;
        perMeja[o.meja_id].total += o.total;
      }
      if (o.status === "baru") perMeja[o.meja_id].baru++;
    }
    return `${h}
      <section class="card ${aktif ? "" : "accent"}">
        <label class="todo set-opt"><input type="checkbox" data-change="aktif" ${aktif ? "checked" : ""}>
          <span><b>Pesan lewat meja</b><small class="muted">Pelanggan scan QR di meja, lihat menu & pesan dari HP sendiri. Pesanan masuk ke Kasir.</small></span></label>
        ${
          aktif
            ? `<label class="todo set-opt" style="margin-top:10px"><input type="checkbox" data-change="digital" ${digitalAktif(s) ? "checked" : ""}>
                <span><b>Tampilkan bayar digital (QRIS)</b><small class="muted">Saat ini masih SIMULASI (belum terhubung payment gateway). Matikan kalau mau pelanggan selalu bayar di kasir.</small></span></label>`
            : `<p class="small muted" style="margin-top:8px">Fitur opsional. Kalau tidak diaktifkan, link QR yang sudah tersebar menampilkan "pesan lewat meja tidak aktif".</p>`
        }
        <p class="small muted" style="margin-top:8px">${statusPublik.error ? `<span class="neg">Gagal memperbarui menu publik: ${esc(statusPublik.error)}</span>` : statusPublik.at ? `Menu publik diperbarui ${statusPublik.at.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}` : "Menu & harga untuk pelanggan otomatis ikut resep & stok."}</p>
      </section>

      <section class="card">
        <div class="row-between"><h2 class="card-title" style="margin:0">Meja (${list.length})</h2>
          ${list.length ? `<button class="btn ghost sm" data-action="cetakSemua">Cetak semua QR</button>` : ""}</div>
        ${
          list.length
            ? list
                .map((m) => {
                  const st = perMeja[m.id];
                  return `<div class="meja-row">
                    <div class="meja-mini">${qrCache[m.token] || ""}</div>
                    <div><b>${esc(m.nama)}</b><p class="small muted">${st ? `${st.n} pesanan hari ini · ${rupiah(st.total)}${st.baru ? ` · <b class="neg">${st.baru} menunggu kasir</b>` : ""}` : "Belum ada pesanan hari ini"}</p></div>
                    <button class="btn ghost sm" data-action="buka" data-id="${m.id}">${buka === m.id ? "Tutup" : "QR"}</button>
                  </div>
                  ${
                    buka === m.id
                      ? `<div class="inline-form meja-detail">
                          <div class="meja-qr-big">${qrCache[m.token] || ""}</div>
                          <p class="small mono meja-link">${esc(linkMeja(m.token))}</p>
                          <div class="row2"><button class="btn ghost" data-action="salin" data-token="${m.token}">Salin link</button><a class="btn soft" href="${esc(linkMeja(m.token))}" target="_blank" rel="noopener">Buka sebagai pelanggan</a></div>
                          ${
                            edit === m.id
                              ? `<form class="row2" data-form="ganti" data-id="${m.id}"><input name="nama" value="${esc(m.nama)}" maxlength="30" required><button class="btn primary">Simpan</button></form>`
                              : `<div class="row2"><button class="btn ghost sm" data-action="edit" data-id="${m.id}">Ganti nama</button><button class="btn ghost sm" data-action="tokenBaru" data-id="${m.id}">Ganti QR</button></div>`
                          }
                          <button class="btn danger sm" data-action="hapus" data-id="${m.id}">Hapus meja</button>
                        </div>`
                      : ""
                  }`;
                })
                .join("")
            : `<p class="small muted">Belum ada meja. Tambah di bawah, lalu cetak QR-nya untuk ditempel di meja.</p>`
        }
        <form class="row3 meja-add" data-form="tambah">
          <input name="nama" maxlength="30" placeholder="Nama meja, cth: Meja 1 / Teras A">
          <input name="jumlah" type="number" min="1" max="50" value="1" aria-label="Jumlah meja">
          <button class="btn primary">Tambah</button>
        </form>
        <p class="small muted">Isi jumlah lebih dari 1 untuk menambah sekaligus (Meja 1, Meja 2, …).</p>
      </section>

      <section class="card info-card">
        <h2 class="card-title">Cara kerja</h2>
        <ul class="checks small">
          <li>Pelanggan scan QR → lihat menu & harga toko (menu yang stoknya habis otomatis ditandai).</li>
          <li>Checkout: isi nama & catatan, pilih bayar di kasir atau digital (simulasi).</li>
          <li>Pesanan masuk ke Kasir di kotak "Pesanan meja". Kasir tekan Terima → keranjang terisi otomatis → selesaikan pembayaran seperti biasa (masuk Kas, stok, shift & dapur).</li>
          <li>Harga dihitung ulang di server dari menu ini, jadi tidak bisa diakali dari HP pelanggan.</li>
        </ul>
      </section>`;
  },

  after(root) {
    if (!root.querySelector(".meja-row, .meja-add") || lepas) return;
    // Pasang pendengar SEKALI saja (render ulang di bawah tidak memasang lagi -> tidak ada loop).
    lepas = dengarPesanan((e) => {
      if (!location.hash.startsWith("#/meja")) {
        lepas?.();
        lepas = null;
        return;
      }
      if (e.type === "local") return;
      if (!["INPUT", "SELECT", "TEXTAREA"].includes(document.activeElement?.tagName)) render(); // perbarui jumlah pesanan per meja
    });
  },

  actions: {
    buka(el) {
      buka = buka === el.dataset.id ? null : el.dataset.id;
      edit = null;
      render();
    },
    edit(el) {
      edit = el.dataset.id;
      render();
    },
    async salin(el) {
      await copy(linkMeja(el.dataset.token));
      toast("Link meja disalin");
    },
    tokenBaru(el) {
      if (!confirm("Ganti QR meja ini? QR lama tidak bisa dipakai lagi, jadi cetak & tempel ulang QR yang baru.")) return;
      setMeja((list) => list.map((m) => (m.id === el.dataset.id ? { ...m, token: tokenBaru() } : m)));
      publikasi(true);
      render();
    },
    hapus(el) {
      const m = store.get().meja.find((x) => x.id === el.dataset.id);
      if (!confirm(`Hapus ${m.nama}? QR-nya tidak bisa dipakai lagi.`)) return;
      setMeja((list) => list.filter((x) => x.id !== m.id));
      buka = null;
      publikasi(true);
      render();
    },
    cetakSemua() {
      cetak = true;
      render();
      window.scrollTo(0, 0);
    },
    tutupCetak() {
      cetak = false;
      render();
    },
    print() {
      window.print();
    },
  },

  changes: {
    async aktif(el) {
      store.set((s) => ({ posSetting: { ...(s.posSetting || {}), pesanMeja: el.checked } }));
      if (el.checked && !(store.get().meja || []).length) {
        setMeja(() => Array.from({ length: 4 }, (_, i) => ({ id: uid(), nama: `Meja ${i + 1}`, token: tokenBaru() })));
        toast("Pesan lewat meja aktif · 4 meja dibuat, silakan cetak QR-nya");
      } else toast(el.checked ? "Pesan lewat meja aktif" : "Pesan lewat meja dimatikan");
      await publikasi(true);
      render();
    },
    async digital(el) {
      store.set((s) => ({ posSetting: { ...(s.posSetting || {}), mejaDigital: el.checked } }));
      await publikasi(true);
      render();
    },
  },

  forms: {
    async tambah(form) {
      const fd = new FormData(form);
      const n = Math.min(50, Math.max(1, Number(fd.get("jumlah")) || 1));
      const nama = String(fd.get("nama") || "").trim();
      const ada = store.get().meja || [];
      const baru = Array.from({ length: n }, (_, i) => ({
        id: uid(),
        nama: n === 1 && nama ? nama : `${nama || "Meja"} ${ada.length + i + 1}`.trim(),
        token: tokenBaru(),
      }));
      setMeja((list) => [...list, ...baru]);
      await publikasi(true);
      toast(`${n} meja ditambahkan`);
      render();
    },
    async ganti(form) {
      const nama = String(new FormData(form).get("nama")).trim();
      setMeja((list) => list.map((m) => (m.id === form.dataset.id ? { ...m, nama } : m)));
      edit = null;
      await publikasi(true);
      render();
    },
  },
};
