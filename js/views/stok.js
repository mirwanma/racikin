import { icon } from "../icons.js";
import { store, uid } from "../store.js";
import { esc, rupiah, todayISO, fmtDate, toast } from "../ui.js";
import { render } from "../app.js";
import { head } from "./_shared.js";
import { program, patchStempel, siapTukar } from "../loyalty.js";
import { markCards, isKasir } from "../cloud.js";
import { SATUAN, bahanMap, hppOf, bisaDibuat, menipis, belumDiisi, kebutuhan, fmtQty } from "../stok-utils.js";

let tab = "menu"; // menu | bahan
let open = null; // { type: beli|opname|edit|jual, id }

const isOpen = (type, id) => open && open.type === type && open.id === id;
const satuanOpts = (cur) => SATUAN.map((s) => `<option ${s === cur ? "selected" : ""}>${s}</option>`).join("");

function menuTab(s) {
  const map = bahanMap(s.bahan);
  if (!s.resep.length) {
    return `<section class="card empty">
      <div class="empty-icon">${icon("bowl", 30)}</div>
      <h3>Belum ada resep</h3>
      <p>Masukkan komposisi bahan tiap menu, nanti HPP per porsi & margin dihitung otomatis dari harga bahan.</p>
      <a href="#/resep?id=new" class="btn primary">+ Bikin resep pertama</a>
    </section>`;
  }
  return `
    ${s.resep
      .map((r) => {
        const h = hppOf(r, map);
        const bd = bisaDibuat(r, map);
        const marginCls = h.margin >= 50 ? "pos" : h.margin >= 30 ? "" : "neg";
        return `<section class="card resep-card">
          <div class="row-between"><h3>${esc(r.nama)}</h3><a href="#/resep?id=${r.id}" class="btn ghost sm">Edit</a></div>
          <div class="stats3">
            <div><small>Harga jual</small><b>${rupiah(r.harga)}</b></div>
            <div><small>HPP/porsi</small><b>${rupiah(h.hpp)}</b></div>
            <div><small>Margin</small><b class="${marginCls}">${Math.round(h.margin)}%</b></div>
          </div>
          ${h.kurangHarga ? `<p class="warn-box small">${h.kurangHarga} bahan belum ada harganya, HPP belum akurat.</p>` : ""}
          <p class="small muted">${
            !r.items.length
              ? "Belum ada bahan di resep."
              : bd.porsi === null
                ? `Stok bahannya belum diisi. <a href="#/stok?tab=bahan&isi=1" class="link">Isi stok</a> biar kelihatan bisa bikin berapa porsi.`
                : `Stok cukup untuk <b>${bd.porsi} porsi</b>${bd.pembatas ? ` · habis duluan: ${esc(bd.pembatas.nama)}` : ""}${
                    bd.belumDiisi ? ` · <a href="#/stok?tab=bahan&isi=1" class="link">${bd.belumDiisi} bahan belum diisi stoknya</a>` : ""
                  }`
          }</p>
          ${
            isOpen("jual", r.id)
              ? `<form class="inline-form stack" data-form="jual" data-id="${r.id}">
                  <div class="row2">
                    <label class="field"><span>Porsi terjual</span><input name="porsi" type="number" min="1" step="1" required autofocus></label>
                    <label class="field"><span>Harga/porsi</span><input name="harga" type="number" min="0" value="${esc(r.harga)}"></label>
                  </div>
                  <label class="todo"><input type="checkbox" name="kas" checked><span>Catat pemasukan ke Kas</span></label>
                  ${
                    s.loyalty && s.pelanggan.length
                      ? `<label class="field"><span>Pelanggan (dapat stempel)</span><select name="pelanggan"><option value="">Tanpa kartu stempel</option>${[...s.pelanggan]
                          .sort((a, b) => a.nama.localeCompare(b.nama, "id"))
                          .map((p) => `<option value="${p.id}">${esc(p.nama)} · ${p.stempel || 0}/${program(s).target}</option>`)
                          .join("")}</select></label>`
                      : ""
                  }
                  <div class="row2"><button type="button" class="btn ghost" data-action="close">Batal</button><button class="btn primary">Simpan</button></div>
                </form>`
              : `<button class="btn soft block" data-action="open" data-type="jual" data-id="${r.id}">Catat penjualan</button>`
          }
        </section>`;
      })
      .join("")}
    <a href="#/resep?id=new" class="btn primary block">+ Menu / resep baru</a>`;
}

function bahanRow(b) {
  const low = b.tracked && (Number(b.stok) || 0) <= (Number(b.min) || 0);
  const forms = {
    beli: `<form class="inline-form stack" data-form="beli" data-id="${b.id}">
        <div class="row2">
          <label class="field"><span>Jumlah beli (${esc(b.satuan)})</span><input name="qty" type="number" min="0" step="any" required autofocus></label>
          <label class="field"><span>Total bayar (Rp)</span><input name="total" type="number" min="0" placeholder="opsional"></label>
        </div>
        ${isKasir() ? "" : `<label class="todo"><input type="checkbox" name="kas" checked><span>Catat pengeluaran ke Kas</span></label>`}
        <div class="row2"><button type="button" class="btn ghost" data-action="close">Batal</button><button class="btn primary">Tambah stok</button></div>
      </form>`,
    opname: `<form class="inline-form stack" data-form="opname" data-id="${b.id}">
        <label class="field"><span>${b.tracked ? "Stok sebenarnya sekarang" : "Stok yang kamu punya sekarang"} (${esc(b.satuan)})</span><input name="stok" type="number" min="0" step="any" value="${b.tracked ? esc(fmtQty(Number(b.stok) || 0).replace(",", ".")) : ""}" placeholder="0" required autofocus></label>
        <div class="row2"><button type="button" class="btn ghost" data-action="close">Batal</button><button class="btn primary">Simpan</button></div>
      </form>`,
    edit: `<form class="inline-form stack" data-form="edit" data-id="${b.id}">
        <label class="field"><span>Nama</span><input name="nama" value="${esc(b.nama)}" required></label>
        <div class="row2">
          <label class="field"><span>Satuan</span><select name="satuan">${satuanOpts(b.satuan)}</select></label>
          <label class="field"><span>Harga per ${esc(b.satuan)}</span><input name="harga" type="number" min="0" step="any" value="${esc(b.harga)}"></label>
        </div>
        <label class="field"><span>Ingatkan kalau stok ≤</span><input name="min" type="number" min="0" step="any" value="${esc(b.min)}"></label>
        <div class="row2"><button type="button" class="btn danger" data-action="delBahan" data-id="${b.id}">Hapus</button><button class="btn primary">Simpan</button></div>
        <button type="button" class="btn ghost" data-action="close">Batal</button>
      </form>`,
  };
  const formOpen = ["beli", "opname", "edit"].find((t) => isOpen(t, b.id));
  return `<div class="bahan ${low ? "low" : ""}">
    <div class="row-between">
      <div><b>${esc(b.nama)}</b>${b.estimasi ? ` <span class="tag sedang" title="Harga dari estimasi AI">estimasi</span>` : ""}
        <p class="small muted">${rupiah(b.harga)}/${esc(b.satuan)}</p></div>
      ${
        b.tracked
          ? `<div class="stok-num ${low ? "neg" : ""}"><b>${fmtQty(Number(b.stok) || 0)}</b><small>${esc(b.satuan)}</small></div>`
          : `<div class="stok-num"><span class="tag opsional">stok belum diisi</span></div>`
      }
    </div>
    ${
      formOpen
        ? forms[formOpen]
        : `<div class="bahan-actions">
            ${
              b.tracked
                ? `<button class="btn soft sm" data-action="open" data-type="beli" data-id="${b.id}">+ Beli</button>
            <button class="btn ghost sm" data-action="open" data-type="opname" data-id="${b.id}">Opname</button>`
                : `<button class="btn soft sm" data-action="open" data-type="opname" data-id="${b.id}">Isi stok</button>
            <button class="btn ghost sm" data-action="open" data-type="beli" data-id="${b.id}">+ Beli</button>`
            }
            ${isKasir() ? "" : `<button class="btn ghost sm" data-action="open" data-type="edit" data-id="${b.id}">Edit</button>`}
          </div>`
    }
  </div>`;
}

function bulkForm(list) {
  return `<form class="card stack" data-form="bulk">
    <h2 class="card-title">Isi stok awal</h2>
    <p class="muted small">Hitung stok yang ada sekarang. Kosongkan kalau belum tahu, bisa diisi nanti.</p>
    ${list
      .map(
        (b) => `<label class="bulk-row"><span>${esc(b.nama)}</span>
          <input name="${b.id}" type="number" min="0" step="any" inputmode="decimal" placeholder="0">
          <small>${esc(b.satuan)}</small></label>`,
      )
      .join("")}
    <div class="row2"><button type="button" class="btn ghost" data-action="close">Nanti saja</button><button class="btn primary">Simpan stok</button></div>
  </form>`;
}

function bahanTab(s) {
  const low = menipis(s.bahan);
  const kosong = belumDiisi(s.bahan);
  if (isOpen("bulk", "all") && kosong.length) return bulkForm(kosong);
  const sorted = [...s.bahan].sort((a, b) => a.nama.localeCompare(b.nama, "id"));
  const map = bahanMap(s.bahan);
  const log = [...s.stokLog].slice(-15).reverse();
  return `
    ${
      kosong.length
        ? `<section class="card info-card">
            <p><b>${kosong.length} bahan belum diisi stoknya.</b> Bahan ini belum dihitung di stok & tidak dikurangi saat penjualan.</p>
            <button class="btn primary block" data-action="open" data-type="bulk" data-id="all">Isi stok awal sekaligus</button>
          </section>`
        : ""
    }
    ${low.length ? `<section class="card warn-card"><b class="neg">${low.length} bahan menipis:</b> ${low.map((b) => esc(b.nama)).join(", ")}</section>` : ""}
    <section class="card">
      ${sorted.length ? sorted.map(bahanRow).join("") : `<p class="muted">Belum ada bahan. Tambah di bawah, atau bikin resep pakai AI biar bahannya terisi otomatis.</p>`}
    </section>

    ${isKasir() ? "" : `<details class="card">
      <summary><b>Tambah bahan</b></summary>
      <form class="stack" data-form="addBahan">
        <input name="nama" placeholder="Nama bahan, cth: Tahu putih" required>
        <div class="row2">
          <select name="satuan">${satuanOpts("pcs")}</select>
          <input name="harga" type="number" min="0" step="any" placeholder="Harga per satuan">
        </div>
        <div class="row2">
          <input name="stok" type="number" min="0" step="any" placeholder="Stok awal">
          <input name="min" type="number" min="0" step="any" placeholder="Ingatkan kalau ≤">
        </div>
        <button class="btn primary">Simpan bahan</button>
      </form>
    </details>`}

    ${
      log.length
        ? `<section class="card"><h2 class="card-title">Riwayat stok</h2>
          ${log
            .map((l) => {
              const b = map[l.bahanId];
              return `<div class="tx ${l.delta >= 0 ? "masuk" : "keluar"}"><div><b>${esc(b?.nama || "(bahan dihapus)")}</b><p class="muted small">${fmtDate(l.tanggal)} · ${esc(l.alasan)}${l.catatan ? " · " + esc(l.catatan) : ""}</p></div><b>${l.delta >= 0 ? "+" : ""}${fmtQty(l.delta)} ${esc(b?.satuan || "")}</b></div>`;
            })
            .join("")}</section>`
        : ""
    }`;
}

export const stok = {
  render(s) {
    if (location.hash.includes("tab=bahan")) tab = "bahan";
    if (isKasir()) {
      // Kasir: cukup bahan & stok (resep, HPP & penjualan manual lewat Kasir saja).
      tab = "bahan";
      if (open?.type === "bulk") open = null;
      return `${head("Stok Bahan", "#/kasir")}${bahanTab(s)}`;
    }
    if (location.hash.includes("isi=1")) {
      open = { type: "bulk", id: "all" };
      history.replaceState(null, "", "#/stok?tab=bahan");
    }
    return `
      ${head("Stok & Resep", "#/")}
      <div class="seg">
        <label><input type="radio" name="tab" value="menu" data-change="tab" ${tab === "menu" ? "checked" : ""}><span>Menu & Resep</span></label>
        <label><input type="radio" name="tab" value="bahan" data-change="tab" ${tab === "bahan" ? "checked" : ""}><span>Bahan & Stok</span></label>
      </div>
      ${tab === "menu" ? menuTab(s) : bahanTab(s)}`;
  },
  after(root) {
    root.querySelector("[autofocus]")?.focus();
  },

  changes: {
    tab(el) {
      tab = el.value;
      open = null;
      history.replaceState(null, "", "#/stok");
      render();
    },
  },

  actions: {
    open(el) {
      open = { type: el.dataset.type, id: el.dataset.id };
      render();
    },
    close() {
      open = null;
      render();
    },
    delBahan(el) {
      const id = el.dataset.id;
      const s = store.get();
      const dipakai = s.resep.filter((r) => r.items.some((it) => it.bahanId === id));
      const b = s.bahan.find((x) => x.id === id);
      if (!confirm(`Hapus bahan "${b.nama}"?${dipakai.length ? `\nBahan ini juga akan dihapus dari resep: ${dipakai.map((r) => r.nama).join(", ")}` : ""}`)) return;
      store.set({
        bahan: s.bahan.filter((x) => x.id !== id),
        resep: s.resep.map((r) => ({ ...r, items: r.items.filter((it) => it.bahanId !== id) })),
      });
      open = null;
      render();
    },
  },

  forms: {
    beli(form) {
      const fd = new FormData(form);
      const id = form.dataset.id;
      const qty = Number(fd.get("qty")) || 0;
      const total = Number(fd.get("total")) || 0;
      if (qty <= 0) return toast("Isi jumlah beli dulu", "err");
      const s = store.get();
      const b = s.bahan.find((x) => x.id === id);
      const harga = total > 0 ? total / qty : b.harga;
      const tanggal = todayISO();
      const patch = {
        bahan: s.bahan.map((x) =>
          x.id === id ? { ...x, stok: (x.tracked ? Number(x.stok) || 0 : 0) + qty, tracked: true, harga, estimasi: total > 0 ? false : x.estimasi } : x,
        ),
        stokLog: [...s.stokLog, { id: uid(), tanggal, bahanId: id, delta: qty, alasan: "beli", catatan: total ? rupiah(total) : "" }],
      };
      if (fd.get("kas") && total > 0) {
        patch.transactions = [...s.transactions, { id: uid(), tanggal, jenis: "keluar", kategori: "Bahan Baku", nominal: Math.round(total), catatan: `Beli ${fmtQty(qty)} ${b.satuan} ${b.nama}` }];
      }
      store.set(patch);
      open = null;
      toast(`Stok ${b.nama} +${fmtQty(qty)} ${b.satuan}${patch.transactions ? " · tercatat di Kas" : ""}`);
      render();
    },
    opname(form) {
      const id = form.dataset.id;
      const nyata = Number(new FormData(form).get("stok")) || 0;
      const s = store.get();
      const b = s.bahan.find((x) => x.id === id);
      const awal = !b.tracked;
      const delta = nyata - (awal ? 0 : Number(b.stok) || 0);
      store.set({
        bahan: s.bahan.map((x) => (x.id === id ? { ...x, stok: nyata, tracked: true } : x)),
        stokLog: delta || awal ? [...s.stokLog, { id: uid(), tanggal: todayISO(), bahanId: id, delta, alasan: "opname", catatan: awal ? "stok awal" : "" }] : s.stokLog,
      });
      open = null;
      toast(awal ? `Stok ${b.nama} diisi: ${fmtQty(nyata)} ${b.satuan}` : delta ? `Stok disesuaikan (${delta > 0 ? "+" : ""}${fmtQty(delta)} ${b.satuan})` : "Stok sudah pas");
      render();
    },
    edit(form) {
      const fd = new FormData(form);
      const id = form.dataset.id;
      store.set((s) => ({
        bahan: s.bahan.map((x) =>
          x.id === id
            ? { ...x, nama: fd.get("nama").trim(), satuan: fd.get("satuan"), harga: Number(fd.get("harga")) || 0, min: Number(fd.get("min")) || 0, estimasi: Number(fd.get("harga")) === Number(x.harga) ? x.estimasi : false }
            : x,
        ),
      }));
      open = null;
      toast("Bahan disimpan");
      render();
    },
    bulk(form) {
      const fd = new FormData(form);
      const s = store.get();
      const tanggal = todayISO();
      const isi = {};
      for (const b of s.bahan) {
        if (b.tracked) continue;
        const v = fd.get(b.id);
        if (v !== null && v !== "") isi[b.id] = Math.max(0, Number(v) || 0);
      }
      const n = Object.keys(isi).length;
      if (!n) return toast("Isi minimal satu stok dulu ya", "err");
      store.set({
        bahan: s.bahan.map((b) => (b.id in isi ? { ...b, stok: isi[b.id], tracked: true } : b)),
        stokLog: [...s.stokLog, ...Object.entries(isi).map(([bahanId, q]) => ({ id: uid(), tanggal, bahanId, delta: q, alasan: "opname", catatan: "stok awal" }))],
      });
      open = null;
      const sisa = s.bahan.filter((b) => !b.tracked).length - n;
      toast(`Stok ${n} bahan disimpan${sisa ? ` · ${sisa} masih kosong` : ""}`);
      render();
    },
    addBahan(form) {
      const fd = new FormData(form);
      const nama = fd.get("nama").trim();
      const s = store.get();
      if (s.bahan.some((b) => b.nama.toLowerCase() === nama.toLowerCase())) return toast("Bahan dengan nama itu sudah ada", "err");
      const diisi = fd.get("stok") !== "";
      const stokAwal = Number(fd.get("stok")) || 0;
      const b = { id: uid(), nama, satuan: fd.get("satuan"), harga: Number(fd.get("harga")) || 0, stok: stokAwal, min: Number(fd.get("min")) || 0, estimasi: false, tracked: diisi };
      store.set({
        bahan: [...s.bahan, b],
        stokLog: diisi ? [...s.stokLog, { id: uid(), tanggal: todayISO(), bahanId: b.id, delta: stokAwal, alasan: "opname", catatan: "stok awal" }] : s.stokLog,
      });
      toast(`${nama} ditambahkan`);
      render();
    },
    jual(form) {
      const fd = new FormData(form);
      const id = form.dataset.id;
      const porsi = Number(fd.get("porsi")) || 0;
      if (porsi <= 0) return toast("Isi jumlah porsi", "err");
      const s = store.get();
      const r = s.resep.find((x) => x.id === id);
      const harga = Number(fd.get("harga")) || 0;
      const tracked = new Set(s.bahan.filter((b) => b.tracked).map((b) => b.id));
      const semua = kebutuhan(r, porsi);
      const butuh = semua.filter((k) => tracked.has(k.bahanId)); // bahan yang stoknya belum diisi tidak dikurangi
      const dilewati = semua.filter((k) => k.qty && !tracked.has(k.bahanId)).length;
      const tanggal = todayISO();
      const pakai = Object.fromEntries(butuh.map((k) => [k.bahanId, k.qty]));
      const bahan = s.bahan.map((b) => (pakai[b.id] ? { ...b, stok: (Number(b.stok) || 0) - pakai[b.id] } : b));
      const patch = {
        bahan,
        stokLog: [...s.stokLog, ...butuh.filter((k) => k.qty).map((k) => ({ id: uid(), tanggal, bahanId: k.bahanId, delta: -k.qty, alasan: "jual", catatan: `${porsi}× ${r.nama}` }))],
      };
      if (fd.get("kas") && harga > 0) {
        patch.transactions = [...s.transactions, { id: uid(), tanggal, jenis: "masuk", kategori: "Penjualan", nominal: Math.round(porsi * harga), catatan: `Jual ${porsi} porsi ${r.nama}` }];
      }
      // Kartu stempel: +1 stempel kalau memenuhi minimal belanja
      let stempelInfo = "";
      const pid = fd.get("pelanggan");
      if (pid) {
        const prog = program(s);
        const p = s.pelanggan.find((x) => x.id === pid);
        if (porsi * harga >= (prog.minBelanja || 0)) {
          Object.assign(patch, patchStempel(s, pid, 1, "beli", `${porsi}× ${r.nama}`));
          const now = patch.pelanggan.find((x) => x.id === pid);
          stempelInfo = siapTukar(now, prog) ? ` · ${p.nama} dapat hadiah!` : ` · +1 stempel ${p.nama} (${now.stempel}/${prog.target})`;
          markCards({ ids: [pid] });
        } else {
          stempelInfo = ` · belum dapat stempel (min. belanja ${rupiah(prog.minBelanja)})`;
        }
      }
      store.set(patch);
      open = null;
      const habis = bahan.filter((b) => pakai[b.id] && b.tracked && (Number(b.stok) || 0) <= (Number(b.min) || 0));
      toast(
        `${porsi} porsi ${r.nama} tercatat${patch.transactions ? ` · +${rupiah(porsi * harga)}` : ""}${stempelInfo}` +
          (habis.length ? ` · menipis: ${habis.map((b) => b.nama).join(", ")}` : "") +
          (dilewati ? ` · ${dilewati} bahan belum diisi stoknya (tidak dikurangi)` : ""),
      );
      render();
    },
  },
};
