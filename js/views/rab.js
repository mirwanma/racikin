import { icon } from "../icons.js";
import { store, uid } from "../store.js";
import { esc, rupiah, list, loading, empty, download, toast } from "../ui.js";
import { ai } from "../ai.js";
import { render } from "../app.js";
import { busy, runAI, head, disclaimer } from "./_shared.js";
import { rataHpp } from "../stok-utils.js";

const totalOf = (items, f) => items.reduce((a, i) => a + f(i), 0);
const sub = (i) => (Number(i.qty) || 0) * (Number(i.harga) || 0);

function bepCalc(s) {
  const b = s.bep || {};
  const harga = Number(b.harga ?? s.idea?.harga.harga_jual ?? s.profile.harga) || 0;
  const hpp = Number(b.hpp ?? rataHpp(s) ?? s.idea?.harga.hpp ?? Math.round(harga * 0.4)) || 0;
  const tetap = Number(b.tetap ?? totalOf(s.rab?.biaya_bulanan || [], (x) => x.nominal)) || 0;
  const porsi = Number(b.porsi ?? 40) || 0;
  const hari = Number(b.hari ?? 26) || 0;
  const modal = totalOf((s.rab?.items || []).filter((i) => i.prioritas === "wajib"), sub);
  const untungPorsi = harga - hpp;
  const bepBulan = untungPorsi > 0 ? Math.ceil(tetap / untungPorsi) : Infinity;
  const labaBulan = untungPorsi * porsi * hari - tetap;
  const balikModal = labaBulan > 0 ? modal / labaBulan : Infinity;
  return { harga, hpp, tetap, porsi, hari, modal, untungPorsi, bepBulan, bepHari: hari ? Math.ceil(bepBulan / hari) : Infinity, labaBulan, balikModal };
}

export const rab = {
  render(s) {
    if (busy.rab) return head("RAB & Modal") + loading("AI lagi ngitung kebutuhan modal…");
    const r = s.rab;
    if (!r)
      return (
        head("RAB & Modal") +
        empty({
          icon: "calc",
          title: "Butuh modal berapa sih?",
          text: `AI susun RAB sesuai konsep ${s.profile.konsep} dan modalmu ${rupiah(s.profile.modal)}.`,
          action: "gen",
          label: "Bikin RAB",
        }) +
        `<button class="btn ghost block" data-action="gen" data-mode="hemat">Bikin versi hemat</button>`
      );

    const modal = s.profile.modal;
    const wajib = totalOf(r.items.filter((i) => i.prioritas === "wajib"), sub);
    const semua = totalOf(r.items, sub);
    const real = totalOf(r.items, (i) => Number(i.realisasi) || 0);
    const pct = (n) => Math.min(100, modal ? (n / modal) * 100 : 0);
    const groups = {};
    r.items.forEach((i, idx) => (groups[i.kategori] ??= []).push({ ...i, idx }));
    const b = bepCalc(s);

    return `
      ${head("RAB & Modal")}
      <section class="card">
        <p>${esc(r.ringkasan)}</p>
        <div class="budget">
          <div class="bar-label"><span>Rencana (wajib)</span><b>${rupiah(wajib)}</b></div>
          <div class="bar"><span style="width:${pct(wajib)}%" class="${wajib > modal ? "over" : ""}"></span></div>
          <div class="bar-label"><span>Realisasi</span><b>${rupiah(real)}</b></div>
          <div class="bar"><span style="width:${pct(real)}%" class="real ${real > modal ? "over" : ""}"></span></div>
          <div class="bar-label muted small"><span>Modal kamu</span><span>${rupiah(modal)}</span></div>
        </div>
        ${wajib > modal ? `<p class="warn-box">Item wajib melebihi modal ${rupiah(wajib - modal)}. Coba versi hemat atau kurangi item.</p>` : `<p class="ok-box">Sisa modal setelah item wajib: <b>${rupiah(modal - wajib)}</b></p>`}
        <p class="muted small">Total termasuk opsional: ${rupiah(semua)}</p>
      </section>

      ${Object.entries(groups)
        .map(
          ([kat, items]) => `
        <section class="card">
          <h2 class="card-title">${esc(kat)}</h2>
          ${items
            .map(
              (i) => `
            <div class="rab-item ${i.prioritas}">
              <div class="rab-top">
                <div><b>${esc(i.item)}</b> <span class="tag ${i.prioritas}">${i.prioritas}</span>
                  <p class="muted small">${esc(i.qty)} ${esc(i.satuan)} × ${rupiah(i.harga)} = <b>${rupiah(sub(i))}</b>${i.catatan ? ` · ${esc(i.catatan)}` : ""}</p></div>
                <button class="icon-btn sm" data-action="del" data-idx="${i.idx}" aria-label="Hapus">${icon("x", 14)}</button>
              </div>
              <label class="real-input"><span>Realisasi</span>
                <input type="number" inputmode="numeric" min="0" placeholder="0" value="${i.realisasi ?? ""}" data-change="real" data-idx="${i.idx}"></label>
            </div>`,
            )
            .join("")}
        </section>`,
        )
        .join("")}

      <form class="card stack" data-form="add">
        <h2 class="card-title">+ Tambah item</h2>
        <div class="row2">
          <input name="item" placeholder="Nama item" required>
          <input name="kategori" placeholder="Kategori" value="Lainnya" required>
        </div>
        <div class="row3">
          <input name="qty" type="number" min="1" value="1" required>
          <input name="harga" type="number" min="0" placeholder="Harga satuan" required>
          <select name="prioritas"><option value="wajib">wajib</option><option value="opsional">opsional</option></select>
        </div>
        <button class="btn soft">Tambah</button>
      </form>

      <section class="card">
        <h2 class="card-title">Biaya bulanan</h2>
        ${r.biaya_bulanan.map((x) => `<div class="row-between"><span>${esc(x.item)}</span><b>${rupiah(x.nominal)}</b></div>`).join("")}
        <div class="row-between total"><span>Total/bulan</span><b>${rupiah(totalOf(r.biaya_bulanan, (x) => x.nominal))}</b></div>
      </section>

      <section class="card accent">
        <h2 class="card-title">Kalkulator BEP</h2>
        <div class="row2">
          <label class="field"><span>Harga jual</span><input type="number" data-change="bep" name="harga" value="${b.harga}"></label>
          <label class="field"><span>HPP/porsi</span><input type="number" data-change="bep" name="hpp" value="${b.hpp}"></label>
          <label class="field"><span>Biaya tetap/bulan</span><input type="number" data-change="bep" name="tetap" value="${b.tetap}"></label>
          <label class="field"><span>Target porsi/hari</span><input type="number" data-change="bep" name="porsi" value="${b.porsi}"></label>
        </div>
        <div class="stats3">
          <div><small>BEP/hari</small><b>${isFinite(b.bepHari) ? b.bepHari + " porsi" : "—"}</b></div>
          <div><small>Laba/bulan</small><b class="${b.labaBulan >= 0 ? "pos" : "neg"}">${rupiah(b.labaBulan)}</b></div>
          <div><small>Balik modal</small><b>${isFinite(b.balikModal) ? b.balikModal.toFixed(1) + " bln" : "—"}</b></div>
        </div>
        <p class="muted small">Hitungan: ${b.hari} hari jualan/bulan, untung kotor ${rupiah(b.untungPorsi)}/porsi, modal wajib ${rupiah(b.modal)}.</p>
      </section>

      <section class="card"><h2 class="card-title">Tips hemat</h2>${list(r.tips_hemat, "checks")}</section>

      <div class="row2">
        <button class="btn ghost" data-action="gen" data-mode="${r.mode === "hemat" ? "normal" : "hemat"}">Versi ${r.mode === "hemat" ? "normal" : "hemat"}</button>
        <button class="btn ghost" data-action="csv">${icon("download", 16)} Export CSV</button>
      </div>
      <a href="#/brand" class="btn primary block">Lanjut ke Brand Kit</a>
      ${disclaimer}`;
  },

  actions: {
    gen(el) {
      const mode = el.dataset.mode || "normal";
      if (store.get().rab && !confirm("RAB lama (termasuk realisasi) akan diganti. Lanjut?")) return;
      return runAI("rab", async () => {
        const r = await ai("generate_rab", { mode, analisa: store.get().idea?.harga || null });
        store.set({ rab: { ...r, mode, items: r.items.map((i) => ({ ...i, id: uid() })) } });
      });
    },
    del(el) {
      const r = store.get().rab;
      store.set({ rab: { ...r, items: r.items.filter((_, i) => i !== Number(el.dataset.idx)) } });
      render();
    },
    csv() {
      const r = store.get().rab;
      const rows = [["Kategori", "Item", "Qty", "Satuan", "Harga", "Subtotal", "Prioritas", "Realisasi", "Catatan"]];
      r.items.forEach((i) => rows.push([i.kategori, i.item, i.qty, i.satuan, i.harga, sub(i), i.prioritas, i.realisasi || 0, i.catatan]));
      download("rab-racikin.csv", rows.map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n"), "text/csv");
    },
  },
  changes: {
    real(el) {
      const r = store.get().rab;
      const idx = Number(el.dataset.idx);
      store.set({ rab: { ...r, items: r.items.map((i, k) => (k === idx ? { ...i, realisasi: Number(el.value) || 0 } : i)) } });
      render();
    },
    bep(el) {
      store.set((s) => ({ bep: { ...(s.bep || {}), [el.name]: Number(el.value) || 0 } }));
      render();
    },
  },
  forms: {
    add(form) {
      const fd = new FormData(form);
      const r = store.get().rab;
      const item = { id: uid(), item: fd.get("item"), kategori: fd.get("kategori"), qty: Number(fd.get("qty")), satuan: "pcs", harga: Number(fd.get("harga")), prioritas: fd.get("prioritas"), catatan: "" };
      store.set({ rab: { ...r, items: [...r.items, item] } });
      toast("Item ditambah");
      render();
    },
  },
};
