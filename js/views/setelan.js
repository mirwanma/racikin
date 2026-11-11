import { store } from "../store.js";
import { esc, toast, download } from "../ui.js";
import { render, go } from "../app.js";
import { cloud, signOut } from "../cloud.js";

export const setelan = {
  render(s) {
    const st = s.settings;
    return `
      <header class="page-head"><a href="#/" class="back">←</a><h1>Setelan</h1></header>

      <a href="#/akun" class="card module">
        <span class="module-num">☁️</span>
        <div><h3>Akun & Cloud</h3><p class="muted small">${cloud.user ? esc(cloud.user.email) + " · data tersinkron" : "Belum login: data cuma ada di perangkat ini"}</p></div>
        <span class="chev">›</span>
      </a>

      <form class="card stack" data-form="ai">
        <h2 class="card-title">🤖 Mode AI</h2>
        <div class="seg">
          <label><input type="radio" name="aiMode" value="demo" ${st.aiMode !== "online" ? "checked" : ""}><span>Demo (offline)</span></label>
          <label><input type="radio" name="aiMode" value="online" ${st.aiMode === "online" ? "checked" : ""}><span>AI Online</span></label>
        </div>
        <p class="muted small">Mode Demo pakai template lokal, buat coba-coba. Mode Online pakai AI beneran (Gemini) lewat server Racikin, jadi hasilnya dipersonalisasi. <b>AI Online butuh login.</b></p>
        ${st.aiMode === "online" && !cloud.user ? `<p class="warn-box small">AI Online aktif tapi kamu belum login. <a href="#/akun" class="link">Masuk dulu</a></p>` : ""}
        <details><summary class="muted small">Server custom (opsional)</summary>
        <p class="muted small">Kosongin buat pakai server Racikin bawaan.</p>
        <label class="field"><span>URL Edge Function</span>
          <input name="endpoint" type="url" value="${esc(st.endpoint)}" placeholder="https://xxxx.supabase.co/functions/v1/racikin-ai"></label>
        <label class="field"><span>Supabase anon / publishable key</span>
          <input name="anonKey" value="${esc(st.anonKey)}" placeholder="eyJhbGciOi…"></label>
        </details>
        <button class="btn primary">Simpan</button>
      </form>

      <section class="card stack">
        <h2 class="card-title">💾 Data kamu</h2>
        <p class="muted small">${cloud.user ? "Data tersimpan di perangkat ini dan di cloud akunmu." : "Data cuma tersimpan di perangkat ini. Login biar aman di cloud, atau rajin backup ya."}</p>
        <div class="row2">
          <button class="btn soft" data-action="export">⬇ Backup (JSON)</button>
          <label class="btn soft">⬆ Pulihkan<input type="file" accept="application/json" data-change="import" hidden></label>
        </div>
        <button class="btn danger" data-action="reset">Hapus data di perangkat ini</button>
      </section>

      <p class="muted small center">Racikin v0.2 · dibuat bareng tim TAHGUY 🍜</p>`;
  },
  forms: {
    ai(form) {
      const fd = new FormData(form);
      const settings = { aiMode: fd.get("aiMode"), endpoint: fd.get("endpoint").trim(), anonKey: fd.get("anonKey").trim() };
      store.set({ settings });
      toast("Setelan disimpan ✅");
      render();
    },
  },
  actions: {
    export() {
      download(`racikin-backup-${new Date().toISOString().slice(0, 10)}.json`, store.exportJSON(), "application/json");
    },
    async reset() {
      if (cloud.user) {
        if (!confirm("Kamu sedang login. Ini akan KELUAR dari akun dan menghapus data di perangkat ini.\nData di cloud tetap aman. Lanjut?")) return;
        await signOut({ clearLocal: true });
      } else {
        if (!confirm("Yakin hapus SEMUA data? Ini nggak bisa dibatalkan.")) return;
        store.reset();
      }
      toast("Data dihapus dari perangkat ini");
      go("profil");
    },
  },
  changes: {
    async import(el) {
      const file = el.files[0];
      if (!file) return;
      store.importJSON(await file.text());
      toast("Data dipulihkan ✅");
      go("");
    },
  },
};
