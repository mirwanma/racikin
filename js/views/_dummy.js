// Muat data dummy TAHGUY (2 bulan) ke perangkat ini.
import { store } from "../store.js";
import { toast, loading } from "../ui.js";
import { go } from "../app.js";
import { cloud, role, listTeam } from "../cloud.js";

export async function muatDummy() {
  const ada = !!store.get().profile;
  const pesan =
    "Muat data contoh TAHGUY: 15 menu, stok bahan, penjualan kasir & kas 2 bulan terakhir, pelanggan setia, RAB, brand & jadwal konten." +
    (ada ? "\n\nSemua data bisnis di perangkat ini akan DIGANTI." : "") +
    (cloud.user ? "\nKamu sedang login, jadi data di cloud akunmu juga ikut terganti." : "") +
    "\n\nLanjut?";
  if (!confirm(pesan)) return;
  document.querySelector("#view").innerHTML = loading("Lagi bikin data 2 bulan…");
  const { buatDataDummy, TIM_CONTOH } = await import("../dummy.js");
  // Login sebagai pemilik yang punya tim: order & shift contoh dicatat atas nama anggota tim sungguhan.
  let tim = TIM_CONTOH;
  if (cloud.user && role() === "owner" && cloud.team?.anggota) {
    const anggota = await listTeam().catch(() => []);
    const kasir = anggota.find((m) => m.role === "kasir");
    const manajer = anggota.find((m) => m.role === "manajer");
    tim = [
      { id: cloud.user.id, nama: "Pemilik" },
      kasir ? { id: kasir.member_id, nama: kasir.nama } : TIM_CONTOH[1],
      manajer ? { id: manajer.member_id, nama: manajer.nama } : TIM_CONTOH[2],
    ];
  }
  store.replaceAll(buatDataDummy({ tim }));
  toast("Data contoh TAHGUY (2 bulan) dimuat");
  go("");
}
