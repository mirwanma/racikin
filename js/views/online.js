import { store } from "../store.js";
import { esc, rupiah, toast } from "../ui.js";
import { render } from "../app.js";
import { icon } from "../icons.js";
import { head } from "./_shared.js";
import { bahanMap, hppOf } from "../stok-utils.js";
import { CHANNELS, channelCfg, activeChannels, saranMarkup, hargaAuto, untungPorsi } from "../online.js";

const setChannel = (id, patch) =>
  store.set((s) => {
    const cur = s.online || { channels: {}, harga: {} };
    return { online: { ...cur, channels: { ...cur.channels, [id]: { ...channelCfg(s, id), ...patch } } } };
  });

function channelCard(s, c) {
  const saran = saranMarkup(c.komisi);
  return `<section class="card ch-card ${c.aktif ? "on" : ""}">
    <label class="todo ch-toggle"><input type="checkbox" data-change="aktif" data-ch="${c.id}" ${c.aktif ? "checked" : ""}><span><b>${esc(c.nama)}</b></span></label>
    ${
      c.aktif
        ? `<div class="row3 ch-fields">
            <label class="field"><span>Komisi %</span><input type="number" min="0" max="60" step="0.5" value="${c.komisi}" data-change="komisi" data-ch="${c.id}"></label>
            <label class="field"><span>Markup %</span><input type="number" min="0" max="200" step="1" value="${c.markup}" data-change="markup" data-ch="${c.id}"></label>
            <label class="field"><span>Bulatkan</span><select data-change="bulat" data-ch="${c.id}">${[100, 500, 1000].map((b) => `<option value="${b}" ${c.bulat === b ? "selected" : ""}>${rupiah(b)}</option>`).join("")}</select></label>
          </div>
          ${
            c.markup !== saran
              ? `<button class="btn soft sm" data-action="saran" data-ch="${c.id}">${icon("spark", 14)} Pakai saran markup ${saran}%</button>`
              : `<p class="small muted">Markup ${c.markup}% bikin untung per porsi sama seperti jual di toko.</p>`
          }`
        : `<p class="small muted">Aktifkan kalau kamu jualan di ${esc(c.nama)}.</p>`
    }
  </section>`;
}

function menuTable(s) {
  const act = activeChannels(s);
  if (!act.length) return "";
  if (!s.resep.length) return `<section class="card"><p class="muted">Belum ada menu. <a href="#/resep?id=new" class="link">Bikin resep</a> dulu biar harga online & untungnya bisa dihitung.</p></section>`;
  const map = bahanMap(s.bahan);
  return `<section class="card">
    <div class="row-between"><h2 class="card-title" style="margin:0">Harga per menu</h2>
      ${Object.keys(s.online?.harga || {}).length ? `<button class="btn ghost sm" data-action="resetHarga">Hapus harga manual</button>` : ""}</div>
    <p class="small muted">Kosongkan kolom harga untuk pakai harga otomatis (markup). "Terima" = harga − komisi.</p>
    ${s.resep
      .map((r) => {
        const hpp = Math.round(hppOf(r, map).hpp);
        const toko = untungPorsi(s, r, "toko", hpp);
        return `<div class="om-menu">
          <div class="row-between"><b>${esc(r.nama)}</b><small class="mono muted">HPP ${rupiah(hpp)}</small></div>
          <div class="om-row toko"><span>Toko</span><b>${rupiah(toko.harga)}</b><span class="small">untung <b>${rupiah(toko.untung)}</b></span></div>
          ${act
            .map((c) => {
              const u = untungPorsi(s, r, c.id, hpp);
              const manual = s.online?.harga?.[r.id]?.[c.id] || "";
              const cls = u.untung < 0 ? "neg" : u.untung < toko.untung ? "warn" : "pos";
              return `<div class="om-row">
                <span>${esc(c.nama)}</span>
                <input type="number" inputmode="numeric" min="0" step="500" value="${manual}" placeholder="${hargaAuto(s, r, c.id)}" data-change="harga" data-r="${r.id}" data-ch="${c.id}" aria-label="Harga ${esc(c.nama)}">
                <span class="small">terima ${rupiah(u.terima)} · untung <b class="${cls}">${rupiah(u.untung)}</b></span>
              </div>`;
            })
            .join("")}
        </div>`;
      })
      .join("")}
    <p class="small muted">Hijau = untung sama/lebih dari jual di toko · kuning = lebih tipis · merah = rugi.</p>
  </section>`;
}

export const online = {
  render(s) {
    const all = CHANNELS.map((c) => channelCfg(s, c.id));
    return `${head("Harga Online", "#/kasir")}
      <p class="muted small">Platform ojol memotong komisi dari tiap pesanan, jadi harga online biasanya dibuat lebih tinggi supaya untungmu nggak tergerus. Harga ini dipakai otomatis saat kamu pilih saluran online di Kasir.</p>
      ${all.map((c) => channelCard(s, c)).join("")}
      ${menuTable(s)}
      <section class="card info-card">
        <h2 class="card-title">Catatan</h2>
        <ul class="checks small">
          <li>Besar komisi beda-beda tiap merchant (umumnya 20–30%, bisa + PPN). Cek angka pastinya di aplikasi merchant kamu.</li>
          <li>Di Kas, penjualan online dicatat penuh sebagai Penjualan, dan komisinya sebagai pengeluaran "Komisi Ojol".</li>
          <li>Promo yang kamu biayai sendiri di platform bisa diinput sebagai diskon di Kasir.</li>
        </ul>
      </section>`;
  },

  actions: {
    saran(el) {
      const c = channelCfg(store.get(), el.dataset.ch);
      setChannel(c.id, { markup: saranMarkup(c.komisi) });
      toast(`Markup ${c.nama} jadi ${saranMarkup(c.komisi)}%`);
      render();
    },
    resetHarga() {
      if (!confirm("Hapus semua harga manual? Harga kembali dihitung dari markup.")) return;
      store.set((s) => ({ online: { ...(s.online || { channels: {} }), harga: {} } }));
      render();
    },
  },

  changes: {
    aktif(el) {
      setChannel(el.dataset.ch, { aktif: el.checked });
      render();
    },
    komisi(el) {
      const k = Math.min(60, Math.max(0, Number(el.value) || 0));
      setChannel(el.dataset.ch, { komisi: k });
      render();
    },
    markup(el) {
      setChannel(el.dataset.ch, { markup: Math.max(0, Number(el.value) || 0) });
      render();
    },
    bulat(el) {
      setChannel(el.dataset.ch, { bulat: Number(el.value) || 500 });
      render();
    },
    harga(el) {
      const v = Number(el.value) || 0;
      store.set((s) => {
        const cur = s.online || { channels: {}, harga: {} };
        const harga = { ...(cur.harga || {}) };
        const row = { ...(harga[el.dataset.r] || {}) };
        if (v > 0) row[el.dataset.ch] = v;
        else delete row[el.dataset.ch];
        if (Object.keys(row).length) harga[el.dataset.r] = row;
        else delete harga[el.dataset.r];
        return { online: { ...cur, harga } };
      });
      render();
    },
  },
};
