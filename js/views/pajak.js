// Pajak UMKM (#/pajak): PPh Final 0,5% dari omzet Kas per bulan, sisa bebas Rp500 juta (orang pribadi),
// jatuh tempo, catat bayar (NTPN, opsional ke Kas), cara bayar lewat kode billing, rekap untuk SPT Tahunan.
import { icon } from "../icons.js";
import { esc, rupiah, short, toast, todayISO, fmtDate, copy } from "../ui.js";
const angka = (n) => rupiah(n).replace(/^Rp\s*/, "");
import { store } from "../store.js";
import { render } from "../app.js";
import { head } from "./_shared.js";
import { BENTUK, BEBAS_OP, BATAS_OMZET, KAP, KJS, DICEK, bentukDari, hitungPajak, tagihanPajak, catatBayar, batalBayar, namaBulan, teksSpt } from "../pajak.js";

let tahun = Number(todayISO().slice(0, 4));
let pilihYm = null; // bulan yang lagi dicatat bayarnya
const tgl = (iso) => fmtDate(iso, { day: "numeric", month: "short", year: "numeric" });
const STATUS = {
  lunas: ["Lunas", "pos"],
  belum: ["Belum bayar", "warn"],
  telat: ["Lewat tempo", "neg"],
  nol: ["Bebas", "muted"],
  kosong: ["-", "muted"],
  berjalan: ["Berjalan", "info"],
  nanti: ["-", "muted"],
};

/** Pengingat di Beranda: PPh bulan lalu belum dibayar. */
export function pajakCard(s) {
  const t = tagihanPajak(s, todayISO());
  if (!t) return "";
  return `<a href="#/pajak" class="card pajak-mini ${t.telat ? "neg" : ""}">
    ${icon("receipt", 22)}
    <span><b>PPh Final ${esc(namaBulan(t.ym))}: ${rupiah(t.pph)}</b><small class="muted">${t.telat ? `Lewat jatuh tempo ${tgl(t.tempo)}, bayar secepatnya biar dendanya kecil` : `Bayar paling lambat ${tgl(t.tempo)}`}</small></span>
    ${icon("chevron", 18)}
  </a>`;
}

function formBayar(s, b) {
  return `<form class="card stack pajak-bayar" data-form="bayar" data-ym="${b.ym}">
    <h2 class="card-title" style="margin:0">Catat bayar PPh ${esc(namaBulan(b.ym))}</h2>
    <p class="small muted">Terutang ${rupiah(b.pph)} · jatuh tempo ${tgl(b.tempo)}</p>
    <div class="row2">
      <label class="field"><span>Tanggal bayar</span><input type="date" name="tanggal" value="${todayISO()}" required></label>
      <label class="field"><span>Jumlah (Rp)</span><input type="number" name="nominal" min="1" value="${b.pph}" required></label>
    </div>
    <label class="field"><span>NTPN (dari bukti bayar, opsional)</span><input name="ntpn" maxlength="30" placeholder="16 karakter di bukti setor"></label>
    <label class="impor-cek"><input type="checkbox" name="kas" ${s.pajak?.catatKas === false ? "" : "checked"}><span>Catat juga sebagai pengeluaran Kas (kategori Pajak)</span></label>
    <div class="row2"><button class="btn primary">Simpan</button><button type="button" class="btn ghost" data-action="tutupBayar">Batal</button></div>
  </form>`;
}

export const pajak = {
  render(s) {
    const today = todayISO();
    const h = hitungPajak(s, tahun, today);
    const bentuk = bentukDari(s);
    const b = BENTUK[bentuk];
    const tagihan = h.bulan.filter((x) => x.status === "belum" || x.status === "telat");
    const pilih = pilihYm ? h.bulan.find((x) => x.ym === pilihYm) : null;
    const persenBebas = Math.min(100, (h.omzet / BEBAS_OP) * 100);
    return `
      ${head("Pajak UMKM", "#/bisnis")}
      <section class="card stack">
        <label class="field"><span>Bentuk usaha</span><select data-change="bentuk">${Object.entries(BENTUK).map(([k, x]) => `<option value="${k}" ${bentuk === k ? "selected" : ""}>${esc(x.nama)}</option>`).join("")}</select></label>
        <p class="small muted">${
          b.umum
            ? "CV, firma & PT biasa pakai tarif umum (pembukuan & tarif badan), bukan PPh Final 0,5%. Konsultasikan ke konsultan pajak / KPP."
            : b.bebas
              ? "PPh Final 0,5% dari omzet. Rp500 juta pertama tiap tahun bebas pajak."
              : "PPh Final 0,5% dari seluruh omzet (fasilitas bebas Rp500 juta cuma buat orang pribadi)."
        }</p>
      </section>
      <div class="month-nav"><button class="icon-btn" data-action="tahun" data-d="-1" aria-label="Tahun sebelumnya">${icon("back", 16)}</button><b>Tahun ${tahun}</b><button class="icon-btn" data-action="tahun" data-d="1" aria-label="Tahun berikutnya" ${tahun >= Number(today.slice(0, 4)) ? "disabled" : ""}>${icon("chevron", 16)}</button></div>
      ${
        b.umum
          ? ""
          : `<section class="card accent">
        <div class="stats3">
          <div><small>Omzet ${tahun}</small><b title="${rupiah(h.omzet)}">Rp${short(h.omzet)}</b></div>
          <div><small>PPh Final</small><b>${rupiah(h.pph)}</b></div>
          <div><small>Belum dibayar</small><b class="${h.total.belum ? "neg" : ""}">${rupiah(h.total.belum)}</b></div>
        </div>
        ${
          b.bebas
            ? `<div class="pajak-bebas"><div class="row-between small"><span>Batas bebas pajak Rp500 juta</span><b>${h.sisaBebas ? `sisa ${rupiah(h.sisaBebas)}` : "sudah lewat"}</b></div><div class="progress"><span style="width:${persenBebas}%"></span></div></div>`
            : ""
        }
        ${h.lewatBatas ? `<p class="warn-box small">${icon("alert", 14)} Omzet setahun lewat ${rupiah(BATAS_OMZET)}: mulai tahun depan nggak bisa pakai PPh Final 0,5% lagi (pakai tarif umum + pembukuan). Ngobrol sama konsultan pajak ya.</p>` : ""}
        <p class="small muted">Omzet diambil dari Kas: pemasukan Penjualan, Pre-order & Katering/pesanan (Kasir, impor & catatan manual). Makin rapi nyatet, makin pas hitungannya.</p>
      </section>`
      }
      ${pilih ? formBayar(s, pilih) : !b.umum && tagihan.length ? `<section class="card pajak-tagih ${tagihan[0].status}"><div class="row-between"><div><b>PPh ${esc(namaBulan(tagihan[0].ym))}: ${rupiah(tagihan[0].pph)}</b><p class="small muted">${tagihan[0].status === "telat" ? `Lewat jatuh tempo ${tgl(tagihan[0].tempo)}` : `Bayar paling lambat ${tgl(tagihan[0].tempo)}`}</p></div><button class="btn primary sm" data-action="bayar" data-ym="${tagihan[0].ym}">Catat bayar</button></div></section>` : ""}
      ${
        b.umum
          ? ""
          : `<section class="card">
        <h2 class="card-title">Per bulan</h2>
        <div class="pajak-tabel">
          <div class="pajak-row pajak-th"><span>Bulan</span><span class="num">Omzet (Rp)</span><span class="num">PPh (Rp)</span><span>Status</span></div>
          ${h.bulan
            .filter((x) => x.status !== "nanti")
            .map((x) => {
              const [nm, cls] = STATUS[x.status];
              return `<div class="pajak-row">
                <span>${esc(namaBulan(x.ym).split(" ")[0])}<small class="muted">${x.dpp && x.dpp !== x.omzet ? `kena Rp${short(x.dpp)}` : ""}</small></span>
                <span class="num">${x.omzet ? angka(x.omzet) : "-"}</span>
                <span class="num">${x.pph ? angka(x.pph) : "-"}</span>
                <span>${
                  x.status === "belum" || x.status === "telat"
                    ? `<button class="chip-btn ${cls}" data-action="bayar" data-ym="${x.ym}">${x.status === "telat" ? "Telat" : "Belum"} · catat</button>`
                    : x.status === "lunas"
                      ? `<span class="sehat-pill pos">${nm}</span> <button class="link small" data-action="batal" data-ym="${x.ym}" aria-label="Batalkan catatan bayar">batal</button>${x.bayar?.ntpn ? `<small class="muted mono">${esc(x.bayar.ntpn)}</small>` : ""}`
                      : `<span class="small ${cls === "muted" ? "muted" : ""}">${nm}</span>`
                }</span>
              </div>`;
            })
            .join("")}
        </div>
        <div class="row-between pos-sum"><span>Sudah dibayar ${tahun}</span><b>${rupiah(h.total.lunas)}</b></div>
      </section>
      <section class="card stack">
        <h2 class="card-title" style="margin:0">Cara bayar (setor sendiri)</h2>
        <ol class="izin-langkah">
          <li>Login <a href="https://coretaxdjp.pajak.go.id" target="_blank" rel="noopener" class="link">Coretax DJP</a> → menu <b>Pembayaran</b> → <b>Layanan Mandiri Kode Billing</b>.</li>
          <li>Pilih jenis pajak PPh Final UMKM: <b>KAP ${KAP}</b>, <b>KJS ${KJS}</b> <button class="link small" data-action="salin" data-t="KAP ${KAP} KJS ${KJS}">salin</button>. Isi masa pajak (bulan omzetnya) & jumlah PPh di atas.</li>
          <li>Bayar kode billing lewat m-banking / ATM / teller / kantor pos paling lambat <b>tanggal 15 bulan berikutnya</b>.</li>
          <li>Simpan bukti bayar (ada <b>NTPN</b>), lalu catat di sini. Bukti setor sudah dianggap lapor bulanan.</li>
          <li>Awal tahun, lapor <b>SPT Tahunan</b> (orang pribadi paling lambat 31 Maret): masukkan omzet tiap bulan dari rekap di bawah.</li>
        </ol>
        <button class="btn soft" data-action="spt">${icon("download", 16)} Salin rekap omzet ${tahun} untuk SPT</button>
      </section>`
      }
      <p class="small muted">Panduan umum, bukan nasihat pajak. Terakhir dicek: ${DICEK} (PP 55/2022 jo. PP 20/2026). Aturan bisa berubah, cek <a href="https://pajak.go.id" target="_blank" rel="noopener" class="link">pajak.go.id</a> atau tanya KPP / konsultan pajak.</p>`;
  },
  changes: {
    bentuk(el) {
      store.set((s) => ({ pajak: { ...(s.pajak || {}), bentuk: el.value } }));
      render();
    },
  },
  actions: {
    tahun(el) {
      tahun += Number(el.dataset.d);
      pilihYm = null;
      render();
    },
    bayar(el) {
      pilihYm = el.dataset.ym;
      render();
      window.scrollTo(0, 0);
    },
    tutupBayar() {
      pilihYm = null;
      render();
    },
    batal(el) {
      if (!confirm(`Batalkan catatan bayar PPh ${namaBulan(el.dataset.ym)}? Pengeluaran Kas-nya ikut dihapus.`)) return;
      store.set((s) => batalBayar(s, el.dataset.ym));
      render();
    },
    async salin(el) {
      await copy(el.dataset.t);
      toast("Disalin");
    },
    async spt() {
      const s = store.get();
      await copy(teksSpt(hitungPajak(s, tahun, todayISO()), rupiah));
      toast(`Rekap omzet ${tahun} disalin`);
    },
  },
  forms: {
    bayar(form) {
      const fd = new FormData(form);
      const ym = form.dataset.ym;
      const catatKas = fd.get("kas") === "on";
      try {
        const s = store.get();
        const r = catatBayar(s, ym, { tanggal: String(fd.get("tanggal")), nominal: fd.get("nominal"), ntpn: fd.get("ntpn"), catatKas });
        store.set({ transactions: r.transactions, pajak: { ...r.pajak, catatKas } });
      } catch (e) {
        return toast(e.message, "err");
      }
      pilihYm = null;
      toast(`PPh ${namaBulan(ym)} tercatat lunas`);
      render();
    },
  },
};
