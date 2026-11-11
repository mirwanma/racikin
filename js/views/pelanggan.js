import { store, uid } from "../store.js";
import { esc, toast, todayISO, copy } from "../ui.js";
import { render } from "../app.js";
import { ai } from "../ai.js";
import { icon } from "../icons.js";
import { busy, runAI, head } from "./_shared.js";
import { cloud, markCards } from "../cloud.js";
import {
  program, DEFAULT_PROGRAM, normWa, waLink, cardUrl, newToken, daysSince, siapTukar, perluDiajak, AJAK_HARI,
  patchStempel, patchTukar, isiPesan, PESAN_AJAK_DEFAULT, PESAN_KARTU,
} from "../loyalty.js";

let open = null; // { type: menu|edit|kartu, id }
const isOpen = (type, id) => open && open.type === type && open.id === id;
const bisnisOf = (s) => s.brand?.terpilih?.nama || s.profile?.nama || "kami";

function lalu(iso) {
  const d = daysSince(iso);
  if (d === Infinity) return "belum pernah beli";
  if (d <= 0) return "hari ini";
  if (d === 1) return "kemarin";
  return `${d} hari lalu`;
}

export function stampDots(n, target, cls = "") {
  n = Number(n) || 0;
  if (target > 12) return `<div class="stamps-bar ${cls}"><span style="width:${Math.min(100, (n / target) * 100)}%"></span></div><small class="mono">${n}/${target}</small>`;
  return `<div class="stamps ${cls}">${Array.from({ length: target }, (_, i) => `<span class="stamp ${i < n ? "on" : ""}">${i < n ? icon("check", 12) : ""}</span>`).join("")}</div>`;
}

function programForm(prog, first) {
  return `<form class="stack" data-form="program">
    <label class="field"><span>Nama program</span><input name="nama" value="${esc(prog.nama)}" required></label>
    <div class="row2">
      <label class="field"><span>Stempel untuk hadiah</span><input name="target" type="number" min="2" max="30" value="${esc(prog.target)}" required></label>
      <label class="field"><span>Min. belanja / stempel</span><input name="minBelanja" type="number" min="0" step="1000" value="${esc(prog.minBelanja || "")}" placeholder="0 = bebas"></label>
    </div>
    <label class="field"><span>Hadiahnya</span><input name="hadiah" value="${esc(prog.hadiah)}" placeholder="cth: 1 porsi Tahu Guyur gratis" required></label>
    <button class="btn primary">${first ? "Mulai program" : "Simpan program"}</button>
  </form>`;
}

function row(p, s, prog) {
  const ready = siapTukar(p, prog);
  const link = p.token ? cardUrl(p.token) : "";
  const bisnis = bisnisOf(s);
  const panel = isOpen("kartu", p.id)
    ? `<div class="inline-form stack">
        <p class="small">Link kartu ${esc(p.nama)}. Pelanggan bisa buka tanpa login & tanpa install.</p>
        ${cloud.user ? "" : `<p class="warn-box small">Login dulu supaya kartu bisa dibuka pelanggan. <a href="#/akun" class="link">Masuk</a></p>`}
        <div class="row2">
          <button class="btn ghost" data-action="copyLink" data-id="${p.id}">Salin link</button>
          ${
            p.wa
              ? `<a class="btn primary" href="${esc(waLink(p.wa, isiPesan(PESAN_KARTU, p, prog, bisnis, link)))}" target="_blank" rel="noopener" data-action="sendCard" data-id="${p.id}">Kirim via WA</a>`
              : `<button class="btn ghost" disabled>Belum ada no. WA</button>`
          }
        </div>
        <a href="${esc(link)}" target="_blank" rel="noopener" class="link small">Lihat kartu seperti pelanggan</a>
      </div>`
    : isOpen("edit", p.id)
      ? `<form class="inline-form stack" data-form="edit" data-id="${p.id}">
          <div class="row2">
            <label class="field"><span>Nama</span><input name="nama" value="${esc(p.nama)}" required></label>
            <label class="field"><span>No. WhatsApp</span><input name="wa" type="tel" inputmode="tel" value="${esc(p.wa)}" placeholder="08…"></label>
          </div>
          <div class="row2">
            <button type="button" class="btn ghost" data-action="koreksi" data-id="${p.id}" ${p.stempel ? "" : "disabled"}>−1 stempel (salah input)</button>
            <button type="button" class="btn danger" data-action="hapus" data-id="${p.id}">Hapus</button>
          </div>
          <div class="row2"><button type="button" class="btn ghost" data-action="close">Batal</button><button class="btn primary">Simpan</button></div>
        </form>`
      : "";
  return `<div class="cust ${ready ? "ready" : ""}" data-nama="${esc(String(p.nama).toLowerCase())}">
    <div class="row-between">
      <div class="cust-main">
        <b>${esc(p.nama)}</b> ${ready ? `<span class="tag ready">Hadiah siap</span>` : ""}
        <p class="small muted">${p.kunjungan || 0}× datang · ${lalu(p.terakhir)}${p.hadiahDiambil ? ` · ${p.hadiahDiambil} hadiah diambil` : ""}</p>
      </div>
      <button class="btn primary sm stamp-btn" data-action="stempel" data-id="${p.id}" aria-label="Tambah stempel">${icon("plus", 14)} Stempel</button>
    </div>
    ${stampDots(p.stempel, prog.target)}
    <div class="bahan-actions">
      ${ready ? `<button class="btn soft sm" data-action="tukar" data-id="${p.id}">${icon("check", 14)} Tukar hadiah</button>` : ""}
      <button class="btn ghost sm" data-action="open" data-type="kartu" data-id="${p.id}">Kartu</button>
      <button class="btn ghost sm" data-action="open" data-type="edit" data-id="${p.id}">Edit</button>
    </div>
    ${panel}
  </div>`;
}

export const pelanggan = {
  render(s) {
    if (!s.loyalty) {
      return `${head("Pelanggan Setia", "#/")}
        <section class="card empty">
          <div class="empty-icon">${icon("receipt", 30)}</div>
          <h3>Bikin kartu stempel digital</h3>
          <p>Pelanggan dapat stempel tiap beli. Kumpulkan sejumlah stempel, dapat hadiah. Kartunya bisa dikirim lewat WhatsApp, tanpa kertas & tanpa install.</p>
        </section>
        <section class="card">${programForm({ ...DEFAULT_PROGRAM, hadiah: s.resep[0] ? `1 porsi ${s.resep[0].nama} gratis` : DEFAULT_PROGRAM.hadiah }, true)}</section>`;
    }
    const prog = program(s);
    const list = [...s.pelanggan].sort((a, b) => (b.terakhir || "").localeCompare(a.terakhir || "") || a.nama.localeCompare(b.nama, "id"));
    const ready = list.filter((p) => siapTukar(p, prog));
    const ajak = perluDiajak(list);
    const tpl = prog.pesanAjak || PESAN_AJAK_DEFAULT;
    const bisnis = bisnisOf(s);

    return `
      ${head("Pelanggan Setia", "#/")}
      <section class="card program-card">
        <div class="row-between">
          <div><small class="mono muted">${esc(prog.nama)}</small><h2 style="margin:2px 0 0">${prog.target} stempel = ${esc(prog.hadiah)}</h2>
          ${prog.minBelanja ? `<p class="small muted">Min. belanja ${prog.minBelanja.toLocaleString("id-ID")} per stempel</p>` : ""}</div>
          <button class="btn ghost sm" data-action="open" data-type="program" data-id="p">Ubah</button>
        </div>
        ${isOpen("program", "p") ? `<div class="inline-form">${programForm(prog, false)}</div>` : ""}
      </section>

      <div class="stats3">
        <div><small>Pelanggan</small><b>${list.length}</b></div>
        <div><small>Hadiah siap</small><b class="${ready.length ? "pos" : ""}">${ready.length}</b></div>
        <div><small>Perlu diajak</small><b class="${ajak.length ? "neg" : ""}">${ajak.length}</b></div>
      </div>

      <details class="card" ${list.length ? "" : "open"}>
        <summary><b>Tambah pelanggan</b></summary>
        <form class="stack" data-form="add">
          <div class="row2">
            <input name="nama" placeholder="Nama" required>
            <input name="wa" type="tel" inputmode="tel" placeholder="No. WA (opsional)">
          </div>
          <label class="todo"><input type="checkbox" name="stempel" checked><span>Langsung kasih 1 stempel (dia beli sekarang)</span></label>
          <button class="btn primary">Simpan pelanggan</button>
        </form>
      </details>

      ${
        list.length
          ? `<section class="card">
              ${list.length > 6 ? `<input class="cust-search" type="search" placeholder="Cari nama pelanggan…" aria-label="Cari pelanggan">` : ""}
              <div class="cust-list">${list.map((p) => row(p, s, prog)).join("")}</div>
            </section>`
          : ""
      }

      ${
        ajak.length
          ? `<section class="card warn-card">
              <h2 class="card-title">Ajak balik</h2>
              <p class="small muted">${ajak.length} pelanggan belum mampir lagi ≥ ${AJAK_HARI} hari. Kirim pesan biar balik lagi.</p>
              ${ajak
                .map(
                  (p) => `<div class="tx"><div><b>${esc(p.nama)}</b><p class="muted small">${lalu(p.terakhir)} · stempel ${p.stempel || 0}/${prog.target}</p></div>${
                    p.wa
                      ? `<a class="btn primary sm" target="_blank" rel="noopener" href="${esc(waLink(p.wa, isiPesan(tpl, p, prog, bisnis, p.token ? cardUrl(p.token) : "")))}">Kirim WA</a>`
                      : `<span class="small muted">no. WA kosong</span>`
                  }</div>`,
                )
                .join("")}
              <details class="tpl">
                <summary class="small"><b>Ubah pesan</b></summary>
                <form class="stack" data-form="tpl">
                  <textarea name="pesan" rows="4">${esc(tpl)}</textarea>
                  <p class="muted small">Kode otomatis: {nama} {stempel} {sisa} {target} {hadiah} {bisnis} {hari} {link}</p>
                  <div class="row2">
                    <button type="button" class="btn soft" data-action="aiTpl" ${busy.tpl ? "disabled" : ""}>${icon("spark", 16)} ${busy.tpl ? "Lagi nulis…" : "Tulis pakai AI"}</button>
                    <button class="btn primary">Simpan pesan</button>
                  </div>
                </form>
              </details>
            </section>`
          : ""
      }`;
  },

  after(root) {
    root.querySelector("[autofocus]")?.focus();
    const search = root.querySelector(".cust-search");
    search?.addEventListener("input", () => {
      const q = search.value.trim().toLowerCase();
      root.querySelectorAll(".cust").forEach((el) => (el.hidden = q && !el.dataset.nama.includes(q)));
    });
  },

  actions: {
    open(el) {
      open = isOpen(el.dataset.type, el.dataset.id) ? null : { type: el.dataset.type, id: el.dataset.id };
      render();
    },
    close() {
      open = null;
      render();
    },
    stempel(el) {
      const s = store.get();
      const p = s.pelanggan.find((x) => x.id === el.dataset.id);
      store.set(patchStempel(s, p.id, 1, "beli"));
      markCards({ ids: [p.id] });
      const prog = program(store.get());
      const now = store.get().pelanggan.find((x) => x.id === p.id);
      toast(siapTukar(now, prog) ? `${p.nama} dapat ${prog.hadiah}! Stempel ${now.stempel}/${prog.target}` : `+1 stempel untuk ${p.nama} (${now.stempel}/${prog.target})`);
      render();
    },
    tukar(el) {
      const s = store.get();
      const p = s.pelanggan.find((x) => x.id === el.dataset.id);
      const prog = program(s);
      if (!confirm(`Tukar ${prog.target} stempel ${p.nama} dengan "${prog.hadiah}"?`)) return;
      store.set(patchTukar(s, p.id));
      markCards({ ids: [p.id] });
      toast(`Hadiah untuk ${p.nama} sudah ditukar`);
      render();
    },
    koreksi(el) {
      const s = store.get();
      store.set(patchStempel(s, el.dataset.id, -1, "koreksi"));
      markCards({ ids: [el.dataset.id] });
      toast("1 stempel dikurangi");
      render();
    },
    hapus(el) {
      const s = store.get();
      const p = s.pelanggan.find((x) => x.id === el.dataset.id);
      if (!confirm(`Hapus ${p.nama}? Kartu digitalnya juga tidak bisa dibuka lagi.`)) return;
      store.set({ pelanggan: s.pelanggan.filter((x) => x.id !== p.id) });
      if (p.token) markCards({ hapus: [p.token] });
      open = null;
      render();
    },
    copyLink(el) {
      const p = store.get().pelanggan.find((x) => x.id === el.dataset.id);
      if (!cloud.user) toast("Login dulu supaya link kartunya bisa dibuka", "err");
      else copy(cardUrl(p.token));
    },
    sendCard(el, ev) {
      if (!cloud.user) {
        ev.preventDefault();
        toast("Login dulu supaya kartu bisa dibuka pelanggan", "err");
        return;
      }
      markCards({ ids: [el.dataset.id] }); // pastikan versi terbaru ter-upload
    },
    aiTpl() {
      const s = store.get();
      const prog = program(s);
      return runAI("tpl", async () => {
        const r = await ai("winback_template", { program: prog.nama, target: prog.target, hadiah: prog.hadiah, hari: AJAK_HARI, bisnis: bisnisOf(s) });
        store.set({ loyalty: { ...prog, pesanAjak: r.pesan } });
        toast("Pesan baru dari AI siap dipakai");
      });
    },
  },

  forms: {
    program(form) {
      const fd = new FormData(form);
      const first = !store.get().loyalty;
      const prev = program(store.get());
      store.set({
        loyalty: { ...prev, nama: fd.get("nama").trim(), target: Math.max(2, Number(fd.get("target")) || 5), hadiah: fd.get("hadiah").trim(), minBelanja: Number(fd.get("minBelanja")) || 0 },
      });
      markCards({ ids: store.get().pelanggan.map((p) => p.id) }); // perbarui semua kartu
      open = null;
      toast(first ? "Program kartu stempel aktif" : "Program disimpan");
      render();
    },
    add(form) {
      const fd = new FormData(form);
      const nama = fd.get("nama").trim();
      const wa = normWa(fd.get("wa"));
      const s = store.get();
      if (wa && s.pelanggan.some((p) => normWa(p.wa) === wa)) return toast("No. WA ini sudah terdaftar", "err");
      const p = { id: uid(), nama, wa, stempel: 0, kunjungan: 0, hadiahDiambil: 0, terakhir: null, dibuat: todayISO(), token: newToken() };
      let patch = { pelanggan: [...s.pelanggan, p] };
      if (fd.get("stempel")) patch = { ...patch, ...patchStempel({ ...s, ...patch }, p.id, 1, "beli") };
      store.set(patch);
      markCards({ ids: [p.id] });
      toast(`${nama} ditambahkan${fd.get("stempel") ? " · 1 stempel" : ""}`);
      render();
    },
    edit(form) {
      const fd = new FormData(form);
      const id = form.dataset.id;
      store.set((s) => ({ pelanggan: s.pelanggan.map((p) => (p.id === id ? { ...p, nama: fd.get("nama").trim(), wa: normWa(fd.get("wa")) } : p)) }));
      markCards({ ids: [id] });
      open = null;
      toast("Pelanggan disimpan");
      render();
    },
    tpl(form) {
      const pesan = new FormData(form).get("pesan").trim();
      store.set((s) => ({ loyalty: { ...program(s), pesanAjak: pesan } }));
      toast("Pesan disimpan");
      render();
    },
  },
};

