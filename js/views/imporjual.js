// Impor riwayat penjualan (#/impor-jual): CSV atau tabel yang di-copy dari Excel / Google Sheets.
// Langkah: masukin data -> cek kolom -> ringkasan & simpan. Riwayat impor bisa dibatalkan.
import { icon } from "../icons.js";
import { store } from "../store.js";
import { esc, rupiah, toast, todayISO, fmtDate, download } from "../ui.js";
import { render } from "../app.js";
import { head } from "./_shared.js";
import { parseTabel, tebakKolom, olahPenjualan, simpanPenjualan, batalImpor, PERAN, CONTOH_CSV } from "../imporjual.js";
import { CHANNELS, channelCfg } from "../online.js";

let st = null; // { step, text, nama, tabel, map, hasil, opsi, info }
const awal = () => ({ step: "input", text: "", nama: "", tabel: null, map: null, hasil: null, opsi: { kas: true, komisi: true, menuBaru: true }, info: null });
if (typeof addEventListener === "function") addEventListener("hashchange", () => !location.hash.startsWith("#/impor-jual") && (st = null));

const tgl = (t) => (t ? fmtDate(t, { day: "numeric", month: "short", year: "numeric" }) : "-");
const namaSaluran = (id) => (id === "toko" ? "Toko" : CHANNELS.find((c) => c.id === id)?.nama || id);

function baca(text, nama) {
  const tabel = parseTabel(text);
  if (!tabel.header.length || !tabel.rows.length) return toast("Datanya kosong atau cuma ada judul kolom", "err");
  st.tabel = tabel;
  st.nama = nama || "Tempel dari spreadsheet";
  st.map = tebakKolom(tabel.header);
  st.step = "kolom";
  render();
  window.scrollTo(0, 0);
}

function riwayat(s) {
  const list = [...(s.imporJual || [])].reverse();
  if (!list.length) return "";
  return `<section class="card">
    <h2 class="card-title">Riwayat impor</h2>
    ${list
      .map(
        (b) => `<div class="row-between impor-batch"><div><b>${esc(b.nama)}</b><p class="small muted">${b.hari} hari · ${tgl(b.dari)} – ${tgl(b.sampai)} · ${rupiah(b.omzet)}${b.kas ? " · masuk Kas" : ""}</p></div>
          <button class="btn ghost sm" data-action="batal" data-id="${esc(b.id)}">Batalkan</button></div>`,
      )
      .join("")}
    <p class="small muted">Batalkan = rekap harian & catatan Kas dari impor itu dihapus. Menu yang sempat ditambahkan tetap ada.</p>
  </section>`;
}

function inputView(s) {
  return `
    <section class="card stack">
      <p class="small" style="margin:0">Punya catatan penjualan lama dari aplikasi kasir lain, Excel, atau laporan GoFood / GrabFood? Masukin di sini biar laporan, menu terlaris & cek kesehatan langsung keisi.</p>
      <label class="impor-foto">${icon("download", 24)}<span>Pilih file CSV</span><small class="muted">Dari Excel: File → Save As → CSV</small><input type="file" accept=".csv,.tsv,.txt,text/csv,text/plain" data-change="file" hidden></label>
      <p class="center small muted" style="margin:0">atau</p>
      <textarea rows="6" data-change="text" placeholder="Copy tabel dari Excel / Google Sheets (termasuk baris judul kolom), lalu tempel di sini" aria-label="Tempel tabel">${esc(st.text)}</textarea>
      <button class="btn primary block lg" data-action="bacaTeks">Baca tabel</button>
      <button class="btn ghost sm" data-action="contoh">${icon("download", 14)} Unduh contoh format CSV</button>
      <p class="small muted">Minimal ada kolom <b>tanggal</b> dan <b>total</b> (atau harga × qty). Kolom menu, saluran (GoFood dkk) & no. order bikin laporannya lebih lengkap.</p>
    </section>
    ${riwayat(s)}`;
}

function kolomView() {
  const { tabel, map } = st;
  const opsi = (sel) => `<option value="-1">— tidak ada —</option>${tabel.header.map((h, i) => `<option value="${i}" ${sel === i ? "selected" : ""}>${esc(h || `Kolom ${i + 1}`)}</option>`).join("")}`;
  const ok = map.tanggal >= 0 && (map.total >= 0 || map.harga >= 0);
  return `
    <section class="card stack">
      <div class="row-between"><h2 class="card-title" style="margin:0">Cocokkan kolom</h2><button class="btn ghost sm" data-action="ulang">Ganti data</button></div>
      <p class="small muted">${esc(st.nama)} · ${tabel.rows.length} baris${tabel.terpotong ? " (dipotong, maks. 20.000)" : ""}. Kolom udah ditebak otomatis, cek lagi ya.</p>
      <div class="kolom-map">${PERAN.map(
        (p) => `<label class="field"><span>${p.nama}${p.wajib ? " *" : ""}</span><select data-change="kolom" data-p="${p.id}">${opsi(map[p.id])}</select></label>`,
      ).join("")}</div>
      ${map.total < 0 && map.harga >= 0 ? `<p class="small muted">Nggak ada kolom total: dihitung dari harga × qty${map.qty < 0 ? " (qty dianggap 1)" : ""}.</p>` : ""}
      ${map.menu < 0 ? `<p class="small muted">Tanpa kolom menu, yang diimpor cuma omzet per hari (menu terlaris & HPP nggak keisi).</p>` : ""}
      <div class="tabel-wrap"><table class="lr-table impor-tabel"><thead><tr>${tabel.header.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead>
        <tbody>${tabel.rows.slice(0, 5).map((r) => `<tr>${tabel.header.map((_, i) => `<td>${esc(r[i] ?? "")}</td>`).join("")}</tr>`).join("")}</tbody></table></div>
      ${ok ? "" : `<p class="warn-box small">Pilih kolom tanggal dan kolom total (atau harga) dulu.</p>`}
      <button class="btn primary block lg" data-action="olah" ${ok ? "" : "disabled"}>Lanjut</button>
    </section>`;
}

function ringkasView(s) {
  const h = st.hasil;
  const lewat = new Set(h.dilewati);
  const hariList = Object.keys(h.hari).filter((t) => !lewat.has(t)).sort();
  const omzet = hariList.reduce((a, t) => a + h.hari[t].omzet, 0);
  const saluran = {};
  for (const t of hariList) for (const [ch, v] of Object.entries(h.hari[t].saluran)) saluran[ch] = (saluran[ch] || 0) + v;
  const online = Object.keys(saluran).filter((c) => c !== "toko");
  const baru = h.menu.filter((m) => !m.adaId);
  const porsi = h.menu.reduce((a, m) => a + m.qty, 0);
  return `
    <section class="card stack">
      <div class="row-between"><h2 class="card-title" style="margin:0">Ringkasan</h2><span class="row-gap"><button class="btn ghost sm" data-action="keKolom">Ubah kolom</button><button class="btn ghost sm" data-action="ulang">Mulai ulang</button></span></div>
      ${
        hariList.length
          ? `<div class="stats3">
              <div><small>Hari</small><b>${hariList.length}</b></div>
              <div><small>Omzet</small><b class="pos">${rupiah(omzet)}</b></div>
              <div><small>Porsi</small><b>${porsi || "-"}</b></div>
            </div>
            <p class="small">${tgl(hariList[0])} – ${tgl(hariList[hariList.length - 1])} · rata-rata ${rupiah(omzet / hariList.length)}/hari</p>`
          : `<p class="warn-box small">Nggak ada hari yang bisa diimpor.</p>`
      }
      ${Object.keys(saluran).length > 1 ? `<p class="small">Per saluran: ${Object.entries(saluran).map(([c, v]) => `${esc(namaSaluran(c))} ${rupiah(v)}`).join(" · ")}</p>` : ""}
      ${h.dilewati.length ? `<p class="small muted">${h.dilewati.length} hari dilewati karena sudah ada catatan penjualan (${tgl(h.dilewati[0])}${h.dilewati.length > 1 ? ` – ${tgl(h.dilewati[h.dilewati.length - 1])}` : ""}), biar nggak dobel.</p>` : ""}
      ${h.gagal ? `<p class="small muted">${h.gagal} baris nggak kebaca${h.alasan.tanggal ? ` (${h.alasan.tanggal} tanggalnya nggak dikenali)` : ""} dan dilewati.</p>` : ""}
      ${h.alasan.masaDepan ? `<p class="small muted">${h.alasan.masaDepan} baris hari ini / ke depan dilewati (hari ini dicatat lewat Kasir).</p>` : ""}
      ${
        h.menu.length
          ? `<h4>Menu terlaris</h4>${h.menu
              .slice(0, 8)
              .map((m) => `<div class="row-between pos-sum"><span>${esc(m.nama)} ${m.adaId ? "" : `<span class="tag">baru</span>`}</span><b>${m.qty} porsi</b></div>`)
              .join("")}${h.menu.length > 8 ? `<p class="small muted">+${h.menu.length - 8} menu lain</p>` : ""}`
          : ""
      }
    </section>
    ${
      hariList.length
        ? `<section class="card stack">
            <label class="impor-cek"><input type="checkbox" data-change="opsi" data-o="kas" ${st.opsi.kas ? "checked" : ""}><span>Catat ke Kas sebagai pemasukan Penjualan</span></label>
            ${st.opsi.kas && online.length ? `<label class="impor-cek"><input type="checkbox" data-change="opsi" data-o="komisi" ${st.opsi.komisi ? "checked" : ""}><span>Catat komisi ${online.map((c) => `${esc(namaSaluran(c))} ${channelCfg(s, c).komisi}%`).join(", ")} sebagai pengeluaran</span></label>` : ""}
            ${baru.length ? `<label class="impor-cek"><input type="checkbox" data-change="opsi" data-o="menuBaru" ${st.opsi.menuBaru ? "checked" : ""}><span>Tambahin ${baru.length} menu baru ke daftar menu (harga rata-rata dari data)</span></label>` : ""}
            <p class="small muted">Stok bahan nggak dikurangi (ini penjualan lama). Kalau ada yang salah, impornya bisa dibatalkan.</p>
            <button class="btn primary block lg" data-action="simpan">Impor ${hariList.length} hari · ${rupiah(omzet)}</button>
          </section>`
        : ""
    }`;
}

function selesaiView(s) {
  const x = st.info;
  return `<section class="card stack center">
    <div class="empty-icon">${icon("check", 30)}</div>
    <h3>${x.hari} hari penjualan masuk · ${rupiah(x.omzet)}</h3>
    <p class="small muted">${x.menuBaru ? `${x.menuBaru} menu baru ditambahkan (lengkapi resepnya biar HPP keitung). ` : ""}Laporan, menu terlaris & cek kesehatan sekarang pakai data ini.</p>
    <div class="row2"><a href="#/sehat" class="btn primary">Cek kesehatan</a><a href="#/laporan" class="btn ghost">Lihat laporan</a></div>
  </section>${riwayat(s)}`;
}

export const imporJual = {
  render(s) {
    st ||= awal();
    const body = st.step === "kolom" ? kolomView() : st.step === "ringkas" ? ringkasView(s) : st.step === "selesai" ? selesaiView(s) : inputView(s);
    return `${head("Impor Penjualan Lama", "#/bisnis")}${body}`;
  },

  changes: {
    text(el) {
      st.text = el.value;
    },
    async file(el) {
      const f = el.files?.[0];
      el.value = "";
      if (!f) return;
      if (f.size > 8 * 1024 * 1024) return toast("File terlalu besar (maks. 8 MB)", "err");
      if (/\.xlsx?$/i.test(f.name)) return toast("File Excel simpan dulu sebagai CSV, atau copy tabelnya lalu tempel ya", "err");
      baca(await f.text(), f.name);
    },
    kolom(el) {
      st.map = { ...st.map, [el.dataset.p]: Number(el.value) };
      render();
    },
    opsi(el) {
      st.opsi[el.dataset.o] = el.checked;
      render();
    },
  },

  actions: {
    bacaTeks() {
      if (!st.text.trim()) return toast("Tempel tabelnya dulu ya", "err");
      baca(st.text, "Tempel dari spreadsheet");
    },
    contoh() {
      download("contoh-impor-penjualan.csv", CONTOH_CSV, "text/csv");
    },
    ulang() {
      st = awal();
      render();
    },
    keKolom() {
      st.step = "kolom";
      render();
    },
    olah() {
      st.hasil = olahPenjualan(store.get(), st.tabel, st.map, todayISO());
      st.step = "ringkas";
      render();
      window.scrollTo(0, 0);
    },
    simpan() {
      const s = store.get();
      const { patch, info } = simpanPenjualan(s, st.hasil, { ...st.opsi, nama: st.nama });
      store.set(patch);
      st.info = info;
      st.step = "selesai";
      toast(`${info.hari} hari penjualan diimpor`);
      render();
      window.scrollTo(0, 0);
    },
    batal(el) {
      const s = store.get();
      const b = (s.imporJual || []).find((x) => x.id === el.dataset.id);
      if (!b || !confirm(`Batalkan impor "${b.nama}" (${b.hari} hari, ${rupiah(b.omzet)})? Rekap & catatan Kas dari impor ini dihapus.`)) return;
      store.set(batalImpor(s, b.id));
      toast("Impor dibatalkan");
      render();
    },
  },
};
