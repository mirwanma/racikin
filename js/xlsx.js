// Pemuat SheetJS (js/vendor/xlsx-*.js, ±950 KB): baru dimuat saat perlu baca / bikin file Excel, tidak masuk SHELL.
const SRC = "js/vendor/xlsx-0.20.3.full.min.js";
let muat = null;

export function muatXlsx() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  muat ||= new Promise((ok, gagal) => {
    const el = document.createElement("script");
    el.src = SRC;
    el.onload = () => ok(window.XLSX);
    el.onerror = () => {
      muat = null;
      gagal(new Error("Pembaca Excel gagal dimuat (cek internet)"));
    };
    document.head.appendChild(el);
  });
  return muat;
}
