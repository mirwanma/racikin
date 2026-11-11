// Muat data dummy TAHGUY (2 bulan) ke perangkat ini.
import { store } from "../store.js";
import { toast, loading } from "../ui.js";
import { go } from "../app.js";
import { cloud } from "../cloud.js";

export async function muatDummy() {
  const ada = !!store.get().profile;
  const pesan =
    "Muat data contoh TAHGUY: 15 menu, stok bahan, penjualan kasir & kas 2 bulan terakhir, pelanggan setia, RAB, brand & jadwal konten." +
    (ada ? "\n\nSemua data bisnis di perangkat ini akan DIGANTI." : "") +
    (cloud.user ? "\nKamu sedang login, jadi data di cloud akunmu juga ikut terganti." : "") +
    "\n\nLanjut?";
  if (!confirm(pesan)) return;
  document.querySelector("#view").innerHTML = loading("Lagi bikin data 2 bulan…");
  const { buatDataDummy } = await import("../dummy.js");
  store.replaceAll(buatDataDummy());
  toast("Data contoh TAHGUY (2 bulan) dimuat");
  go("");
}
