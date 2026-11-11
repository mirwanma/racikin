import { store } from "../store.js";
import { esc, todayISO } from "../ui.js";
import { ai } from "../ai.js";
import { render } from "../app.js";
import { busy, runAI, head, monthStats } from "./_shared.js";

const SARAN = [
  "Gimana cara dapet 100 pelanggan pertama?",
  "Menu apa yang sebaiknya aku tambah?",
  "Harga jualku kemurahan nggak?",
  "Ide promo buat tanggal tua?",
];

// Teks sederhana → HTML (baris & poin)
const fmt = (t) =>
  esc(t)
    .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
    .replace(/^[-•] (.*)$/gm, "• $1")
    .replace(/\n/g, "<br>");

export const mentor = {
  render(s) {
    const chat = s.chat;
    return `
      ${head("Mentor AI", "#/")}
      <div class="chat">
        <div class="bubble ai">Halo ${esc(s.profile.owner)}! Aku mentor bisnismu. Tanya apa aja soal ${esc(s.brand?.terpilih?.nama || s.profile.nama || "usahamu")}: harga, menu, promo, pembukuan, konten. Gas! 🚀</div>
        ${chat.map((m) => `<div class="bubble ${m.role === "user" ? "me" : "ai"}">${fmt(m.content)}</div>`).join("")}
        ${busy.chat ? `<div class="bubble ai typing"><span></span><span></span><span></span></div>` : ""}
      </div>
      ${chat.length ? "" : `<div class="chips suggest">${SARAN.map((q) => `<button class="chip-btn" data-action="ask" data-q="${esc(q)}">${esc(q)}</button>`).join("")}</div>`}
      <form data-form="send" class="chat-input">
        <input name="q" placeholder="Tulis pertanyaanmu…" autocomplete="off" required ${busy.chat ? "disabled" : ""}>
        <button class="btn primary" ${busy.chat ? "disabled" : ""} aria-label="Kirim">➤</button>
      </form>
      ${chat.length ? `<button class="btn ghost sm block" data-action="clear">Hapus obrolan</button>` : ""}`;
  },
  after() {
    window.scrollTo(0, document.body.scrollHeight);
  },
  actions: {
    ask: (el) => send(el.dataset.q),
    clear() {
      if (confirm("Hapus semua obrolan?")) {
        store.set({ chat: [] });
        render();
      }
    },
  },
  forms: {
    send(form) {
      const q = new FormData(form).get("q").trim();
      if (q) return send(q);
    },
  },
};

function send(q) {
  store.set((s) => ({ chat: [...s.chat, { role: "user", content: q }] }));
  return runAI("chat", async () => {
    const s = store.get();
    const st = monthStats(s.transactions, todayISO().slice(0, 7));
    const r = await ai("mentor_chat", {
      messages: s.chat.slice(-12),
      konteks: {
        brand: s.brand?.terpilih || null,
        skor_ide: s.idea?.skor ?? null,
        harga: s.idea?.harga || null,
        kas_bulan_ini: { masuk: st.masuk, keluar: st.keluar, laba: st.laba },
      },
    });
    store.set((s2) => ({ chat: [...s2.chat, { role: "assistant", content: r.balasan }] }));
  });
}
