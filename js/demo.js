// Generator lokal untuk Mode Demo. Output-nya WAJIB sama shape-nya dengan
// schema di supabase/functions/racikin-ai/tasks.ts.
// Bukan AI beneran — cuma template yang dipersonalisasi dari profil.

const pick = (arr, seed = 0) => arr[Math.abs(seed) % arr.length];
const hash = (s) => [...String(s)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 7);
const round = (n, to = 500) => Math.round(n / to) * to;

const JENIS = {
  "Makanan berat": { hpp: 0.42, harga: 18000, alat: ["Kompor 2 tungku", "Wajan & panci set", "Rice cooker besar"], bahan: "beras, protein, bumbu" },
  "Jajanan / snack": { hpp: 0.38, harga: 12000, alat: ["Kompor 1 tungku", "Wajan & saringan", "Steamer"], bahan: "bahan utama, minyak, bumbu" },
  "Minuman / kopi": { hpp: 0.32, harga: 15000, alat: ["Blender", "Dispenser/termos", "Shaker & takaran"], bahan: "kopi/teh, susu, gula aren, es" },
  Dessert: { hpp: 0.36, harga: 16000, alat: ["Mixer", "Kulkas/showcase", "Cetakan"], bahan: "susu, krim, buah, topping" },
  "Frozen food": { hpp: 0.45, harga: 35000, alat: ["Freezer", "Vacuum sealer", "Timbangan digital"], bahan: "bahan utama, kemasan vakum" },
  Katering: { hpp: 0.5, harga: 25000, alat: ["Kompor besar", "Panci jumbo", "Rantang/box"], bahan: "bahan menu harian" },
};
const jenisOf = (p) => JENIS[p.jenis] || JENIS["Jajanan / snack"];
const brandName = (p, s) => p.nama || s?.brand?.terpilih?.nama || "Usahamu";
const area = (p) => [p.area, p.kota].filter(Boolean).join(", ") || "lokasimu";
const target = (p) => (p.target && p.target.length ? p.target.join(", ") : "warga sekitar");

export const demo = {
  analyze_idea(p) {
    const j = jenisOf(p);
    const harga = Number(p.harga) || j.harga;
    const hpp = round(harga * j.hpp);
    const modal = Number(p.modal) || 5_000_000;
    let skor = 62;
    if (modal >= 5_000_000) skor += 6;
    if (modal >= 15_000_000) skor += 4;
    if ((p.target || []).includes("Mahasiswa") && harga <= 15000) skor += 8;
    if (p.waktu === "Full-time") skor += 6;
    if ((p.skill || []).includes("Masak")) skor += 5;
    if ((p.skill || []).includes("Sosmed / konten")) skor += 4;
    if (p.konsep === "Kios / ruko" && modal < 10_000_000) skor -= 12;
    skor = Math.max(30, Math.min(92, skor));
    const verdict = skor >= 78 ? "Gas, potensinya kuat! 🔥" : skor >= 60 ? "Layak, asal eksekusi rapi" : "Hati-hati, perlu dimatengin";
    return {
      skor,
      verdict,
      ringkasan: `Ide "${p.ide || p.jenis}" di ${area(p)} buat ${target(p)} punya peluang, apalagi kalau kamu konsisten di rasa dan konten. Dengan modal sekitar ${(modal / 1e6).toFixed(1)} juta, konsep ${p.konsep || "booth"} masih masuk akal asal pengeluaran awal fokus ke yang wajib dulu.`,
      persona: [
        { nama: (p.target || [])[0] === "Mahasiswa" ? "Dimas, mahasiswa semester 5" : "Sinta, karyawan muda", deskripsi: `Cari makanan enak & terjangkau di sekitar ${area(p)}, sering lihat rekomendasi dari TikTok.` },
        { nama: "Bu Rina, ibu rumah tangga", deskripsi: "Beli buat keluarga, peduli kebersihan & porsi, suka pesan lewat WhatsApp/GoFood." },
      ],
      swot: {
        kekuatan: ["Produk mudah dipahami & disukai banyak orang", "Modal awal relatif kecil", "Bisa diproduksi cepat"],
        kelemahan: ["Brand masih baru, belum ada kepercayaan", "Tergantung tenaga sendiri", "Belum punya data pelanggan"],
        peluang: ["Tren kuliner viral di TikTok", `Keramaian di sekitar ${area(p)}`, "Ojol bikin jangkauan lebih luas"],
        ancaman: ["Kompetitor sejenis banyak & gampang ditiru", "Harga bahan baku naik-turun", "Cuaca hujan bikin sepi (kalau jualan outdoor)"],
      },
      kompetitor: [
        { nama: "Pedagang kaki lima sejenis", catatan: "Harga murah, tapi branding & kebersihan biasanya lemah." },
        { nama: "Brand franchise kecil", catatan: "Branding rapi, tapi rasa seragam & kurang personal." },
        { nama: "Kuliner viral di ojol", catatan: "Kuat di foto & promo, kamu harus menang di rasa & pelayanan." },
      ],
      pembeda: ["Rasa signature yang konsisten + level pedas/topping custom", "Packaging rapi & Instagramable", "Konten behind-the-scene yang personal"],
      harga: {
        harga_jual: harga,
        hpp,
        margin_persen: Math.round(((harga - hpp) / harga) * 100),
        catatan: `Estimasi HPP ~${Math.round(j.hpp * 100)}% dari harga jual (${j.bahan}). Hitung ulang pakai harga belanja aslimu ya.`,
      },
      risiko: ["Modal habis di peralatan, nggak sisa buat marketing", "Rasa belum konsisten di minggu-minggu awal", "Lupa pisah uang pribadi & usaha"],
      validasi: [
        "Bikin 20–30 porsi tester, bagi ke teman/tetangga, minta nilai 1–10",
        "Polling di IG Story: pilih menu & harga favorit",
        `Pantau 2 jam di calon lokasi: hitung orang lewat di ${area(p)}`,
        "Pre-order lewat WhatsApp 1 minggu sebelum buka",
      ],
    };
  },

  generate_rab(p, input) {
    const j = jenisOf(p);
    const hemat = input.mode === "hemat";
    const k = hemat ? 0.65 : 1;
    const konsep = p.konsep || "Gerobak / booth";
    const tempat =
      konsep === "Kios / ruko"
        ? { item: "Sewa kios 3 bulan", harga: 4_500_000 }
        : konsep === "Online / dari rumah"
          ? { item: "Rapikan dapur rumah", harga: 500_000 }
          : konsep === "Cloud kitchen"
            ? { item: "Sewa slot dapur 1 bulan", harga: 2_000_000 }
            : { item: hemat ? "Gerobak/booth bekas" : "Gerobak/booth custom", harga: 3_500_000 };
    const items = [
      { kategori: "Peralatan", item: j.alat[0], qty: 1, satuan: "unit", harga: round(850_000 * k, 1000), prioritas: "wajib", catatan: hemat ? "Cari bekas di marketplace" : "" },
      { kategori: "Peralatan", item: j.alat[1], qty: 1, satuan: "set", harga: round(450_000 * k, 1000), prioritas: "wajib", catatan: "" },
      { kategori: "Peralatan", item: j.alat[2], qty: 1, satuan: "unit", harga: round(600_000 * k, 1000), prioritas: "opsional", catatan: "" },
      { kategori: "Peralatan", item: "Tabung gas 3kg + isi", qty: 2, satuan: "tabung", harga: 230_000, prioritas: "wajib", catatan: "" },
      { kategori: "Tempat", item: tempat.item, qty: 1, satuan: "paket", harga: round(tempat.harga * k, 1000), prioritas: "wajib", catatan: "" },
      { kategori: "Bahan Baku Awal", item: `Stok bahan 1 minggu (${j.bahan})`, qty: 1, satuan: "paket", harga: round(900_000 * k, 1000), prioritas: "wajib", catatan: "Belanja di pasar induk biar lebih murah" },
      { kategori: "Branding & Kemasan", item: "Kemasan + stiker logo", qty: 300, satuan: "pcs", harga: hemat ? 900 : 1500, prioritas: "wajib", catatan: "" },
      { kategori: "Branding & Kemasan", item: "Desain logo & banner", qty: 1, satuan: "paket", harga: hemat ? 0 : 350_000, prioritas: "opsional", catatan: hemat ? "DIY pakai Canva" : "" },
      { kategori: "Perizinan", item: "NIB via OSS + PIRT", qty: 1, satuan: "paket", harga: 0, prioritas: "wajib", catatan: "NIB gratis, PIRT bisa menyusul" },
      { kategori: "Marketing Launching", item: "Tester gratis + promo grand opening", qty: 1, satuan: "paket", harga: round(400_000 * k, 1000), prioritas: "wajib", catatan: "" },
      { kategori: "Marketing Launching", item: "Iklan IG/TikTok lokal", qty: 1, satuan: "paket", harga: hemat ? 0 : 300_000, prioritas: "opsional", catatan: "" },
      { kategori: "Dana Darurat", item: "Cadangan operasional", qty: 1, satuan: "paket", harga: round((Number(p.modal) || 5_000_000) * 0.1, 50_000), prioritas: "wajib", catatan: "Jangan disentuh kecuali darurat" },
    ];
    return {
      ringkasan: `RAB ${hemat ? "versi hemat " : ""}untuk konsep ${konsep}. Fokus belanja yang wajib dulu, item opsional bisa nyusul setelah ada omzet.`,
      items,
      biaya_bulanan: [
        { item: konsep === "Kios / ruko" ? "Sewa tempat" : "Retribusi / sewa lapak", nominal: konsep === "Kios / ruko" ? 1_500_000 : 300_000 },
        { item: "Gas & listrik", nominal: 350_000 },
        { item: "Kuota & marketing rutin", nominal: 200_000 },
        { item: p.waktu === "Full-time" ? "Gaji 1 helper" : "Uang transport", nominal: p.waktu === "Full-time" ? 1_500_000 : 300_000 },
      ],
      tips_hemat: ["Beli peralatan bekas yang masih bagus", "Belanja bahan bareng sesama pedagang", "Mulai dengan menu sedikit, fokus 2–3 andalan", "Desain sendiri pakai Canva dulu"],
    };
  },

  generate_brand(p) {
    const base = (p.nama || p.ide || p.jenis || "Rasa").split(" ")[0];
    const h = hash(base);
    const nama = p.nama
      ? [p.nama, `${p.nama} Express`, `Kedai ${p.nama}`]
      : [`${base}in Aja`, `Dapur ${pick(["Gaskeun", "Ceria", "Kece", "Kita"], h)}`, `${pick(["Rasa", "Kuy", "Mampir"], h + 1)} ${base}`];
    const palettes = [
      [["Cabai", "#E4572E", "Utama"], ["Kunyit", "#F3A712", "Aksen"], ["Krem", "#FFF4E0", "Latar"], ["Kecap", "#2B1B17", "Teks"]],
      [["Daun", "#2E7D5B", "Utama"], ["Jeruk", "#FF9F1C", "Aksen"], ["Susu", "#FDFBF6", "Latar"], ["Arang", "#1F2421", "Teks"]],
      [["Gula Aren", "#8C4A2F", "Utama"], ["Karamel", "#D9A35B", "Aksen"], ["Busa", "#F7EFE6", "Latar"], ["Espresso", "#2A1A14", "Teks"]],
    ];
    const pal = p.jenis === "Minuman / kopi" ? palettes[2] : pick(palettes, h);
    return {
      opsi_nama: nama.map((n, i) => ({ nama: n, alasan: ["Gampang diingat & diucapkan", "Kesan anak muda & dekat", "Unik buat username sosmed"][i] })),
      tagline: ["Sekali coba, pasti balik lagi", `Rasa juara, harga ${(p.target || []).includes("Mahasiswa") ? "mahasiswa" : "bersahabat"}`, "Racikan hangat buat harimu"],
      brand_story: `Berawal dari kecintaan pada ${p.jenis?.toLowerCase() || "kuliner"} dan keinginan menghadirkan rasa yang jujur di ${area(p)}, ${nama[0]} hadir buat ${target(p)} yang butuh makanan enak tanpa ribet. Setiap porsi diracik fresh, dengan bahan pilihan dan sentuhan yang bikin kangen.`,
      tone_of_voice: ["Santai & akrab kayak temen", "Lucu tapi nggak lebay", "Jujur soal bahan & proses", "Semangat & positif"],
      palet: pal.map(([n, hex, peran]) => ({ nama: n, hex, peran })),
      font: { judul: pick(["Poppins ExtraBold", "Fredoka", "Baloo 2"], h), isi: "Inter" },
      konsep_logo: `Logo wordmark "${nama[0]}" dengan huruf tebal membulat, ikon sederhana ${p.jenis === "Minuman / kopi" ? "gelas dengan uap" : "mangkuk/kemasan dengan uap"} di atas huruf pertama, warna ${pal[0][0].toLowerCase()} di latar ${pal[2][0].toLowerCase()}. Harus tetap terbaca saat dicetak kecil di stiker kemasan.`,
      ide_menu: [
        { nama: `${base} Original`, deskripsi: "Menu andalan, rasa paling aman buat first-timer" },
        { nama: `${base} Pedes Nampol`, deskripsi: "Level pedas 1–5, bikin nagih" },
        { nama: "Paket Bestie", deskripsi: "2 porsi + minum, cocok buat berdua" },
        { nama: "Topping Sultan", deskripsi: "Topping lengkap buat yang lagi gajian" },
      ],
      kemasan: ["Paper bowl kraft + stiker logo", "Tulis nama pembeli & pesan lucu di kemasan", "Kartu stempel kecil ditempel di kemasan", "Kantong kertas dengan QR ke IG"],
    };
  },

  activation_plan(p) {
    const online = p.konsep === "Online / dari rumah" || p.konsep === "Cloud kitchen";
    const ch = [
      { channel: "Instagram", prioritas: "tinggi", langkah: ["Buat akun bisnis (Profesional → Bisnis)", "Bio: menu, jam buka, lokasi, link WA", "Upload 9 post pertama sebelum buka", "Highlight: Menu, Lokasi, Testimoni, Promo"], tips: "Pakai foto natural dengan cahaya matahari sore." },
      { channel: "TikTok", prioritas: "tinggi", langkah: ["Buat akun bisnis", "Post video proses masak 15–30 detik", "Pakai sound yang lagi tren", "Tag lokasi tiap posting"], tips: "Video 'satisfying' (kuah dituang, keju meleleh) paling cepat viral." },
      { channel: "Google Maps / Business Profile", prioritas: online ? "sedang" : "tinggi", langkah: ["Daftar di business.google.com", "Isi jam buka, foto, menu, nomor WA", "Verifikasi lokasi", "Minta 10 ulasan pertama dari pembeli"], tips: "Balas setiap ulasan, Google suka bisnis yang aktif." },
      { channel: "WhatsApp Business", prioritas: "tinggi", langkah: ["Install WA Business", "Isi katalog menu + harga", "Pasang pesan sambutan & jam buka", "Simpan nomor pelanggan untuk broadcast promo"], tips: "Label pelanggan: baru, langganan, pre-order." },
      { channel: "GoFood", prioritas: online ? "tinggi" : "sedang", langkah: ["Siapkan KTP, NPWP (opsional), foto tempat, rekening", "Daftar lewat GoBiz", "Upload foto menu kualitas bagus", "Atur harga (naikkan ±20% untuk komisi)"], tips: "Aktifkan promo di 2 minggu pertama biar dapat ranking." },
      { channel: "GrabFood", prioritas: "sedang", langkah: ["Daftar lewat GrabMerchant", "Siapkan dokumen sama seperti GoFood", "Upload menu & foto", "Atur jam operasional"], tips: "Jam makan siang & malam = jam emas." },
      { channel: "ShopeeFood", prioritas: "rendah", langkah: ["Daftar via ShopeePartner", "Upload menu", "Ikut program diskon platform"], tips: "Banyak dipakai mahasiswa yang suka voucher." },
    ];
    return {
      channels: ch,
      launching: [
        { minggu: 1, fokus: "Teaser & bangun penasaran", aktivitas: ["Post countdown 'coming soon'", "Video behind-the-scene persiapan", "Buka pre-order via WA"] },
        { minggu: 2, fokus: "Grand opening", aktivitas: ["Promo beli 1 gratis 1 / diskon 50 pembeli pertama", "Ajak teman & micro-influencer lokal", "Live TikTok saat opening"] },
        { minggu: 3, fokus: "Kumpulin ulasan & testimoni", aktivitas: ["Minta ulasan Google Maps + bonus topping", "Repost story pembeli", "Daftar & aktifkan GoFood"] },
        { minggu: 4, fokus: "Retensi pelanggan", aktivitas: ["Luncurkan kartu stempel (beli 5 gratis 1)", "Broadcast WA menu baru", "Evaluasi menu terlaris & tidak laku"] },
      ],
      deskripsi_menu: [
        { menu: `${brandName(p)} Original`, deskripsi: "Menu andalan kami! Diracik fresh tiap hari, gurih, hangat, bikin pengen nambah. Wajib coba buat first-timer 🔥" },
        { menu: "Paket Bestie", deskripsi: "2 porsi + 2 minuman, lebih hemat buat makan bareng bestie. Cocok buat nugas atau nongkrong!" },
        { menu: "Level Pedes Nampol", deskripsi: "Buat pecinta pedas, pilih level 1–5. Hati-hati, level 5 bikin keringetan tapi nagih 🌶️" },
      ],
    };
  },

  content_calendar(p, input, s) {
    const nama = brandName(p, s);
    const pilar = [
      { nama: "Produk", deskripsi: "Foto/video menu yang bikin ngiler" },
      { nama: "Behind the scene", deskripsi: "Proses masak, belanja, persiapan" },
      { nama: "Pelanggan", deskripsi: "Testimoni, reaksi, repost pembeli" },
      { nama: "Promo & info", deskripsi: "Promo, jam buka, menu baru" },
    ];
    const ide = [
      ["Produk", "Reels", "Video slow-mo menu andalan", "POV: kamu laper jam 4 sore…", "TikTok"],
      ["Behind the scene", "TikTok", "Proses persiapan bahan dari pagi", "Ini yang terjadi sebelum kami buka 👀", "TikTok"],
      ["Pelanggan", "Story", "Repost story pembeli + stiker terima kasih", "Makasih udah mampir, bestie!", "Instagram"],
      ["Promo & info", "Foto", "Info jam buka & lokasi", "Kamu di sekitar sini? Mampir yuk!", "Instagram"],
      ["Produk", "Carousel", "3 menu terlaris minggu ini", "Ranking menu paling laku minggu ini 🏆", "Instagram"],
      ["Behind the scene", "Reels", "Kenalan sama owner", "Kenapa aku mulai usaha ini…", "Instagram"],
      ["Promo & info", "Story", "Promo weekend via WA", "Weekend promo, cuma hari ini!", "WhatsApp Status"],
      ["Pelanggan", "TikTok", "Tanya pembeli: rating 1–10", "Kita tanya jujur, enak nggak sih?", "TikTok"],
    ];
    const n = Number(input.hari) || 14;
    const jadwal = [];
    for (let d = 1; d <= n; d++) {
      if (d % 7 === 0) continue; // libur 1 hari/minggu
      const [pl, format, i, hook, platform] = ide[(d - 1) % ide.length];
      jadwal.push({
        hari_ke: d,
        platform,
        pilar: pl,
        format,
        ide: i,
        hook,
        caption: `${hook} ${nama} siap nemenin harimu di ${area(p)}. Pesan via WA atau langsung mampir ya!`,
        hashtag: `#${nama.replace(/\s+/g, "")} #kuliner${(p.kota || "lokal").replace(/\s+/g, "")} #jajananviral #fyp`,
        jam: platform === "TikTok" ? "19:00" : "16:30",
      });
    }
    return { pilar, jadwal };
  },

  caption(p, input, s) {
    const nama = brandName(p, s);
    const t = input.topik || "menu andalan";
    return {
      captions: [
        { hook: `Siapa yang belum coba ${t}? 👀`, caption: `${t} dari ${nama} lagi hangat-hangatnya. Dijamin bikin mood naik! Pesan sekarang lewat WA ya.`, hashtag: `#${nama.replace(/\s+/g, "")} #kulinerlokal #fyp` },
        { hook: "Stop scroll dulu bentar…", caption: `Ini dia ${t} yang lagi rame dibicarain. Udah cobain belum? Tag temen yang harus kamu traktir!`, hashtag: "#jajanankekinian #racikin #foodie" },
        { hook: "Jujur, ini favorit kami 🥹", caption: `${t} diracik fresh tiap hari. Kalau suka, jangan lupa kasih ulasan di Google Maps ya!`, hashtag: `#kuliner${(p.kota || "").replace(/\s+/g, "")} #umkm` },
      ],
    };
  },

  parse_transactions(_p, input) {
    const toNum = (raw) => {
      let s = raw.toLowerCase().replace(/rp\.?\s*/g, "").trim();
      let mult = 1;
      if (/(jt|juta)$/.test(s)) { mult = 1e6; s = s.replace(/(jt|juta)$/, ""); }
      else if (/(rb|ribu|k)$/.test(s)) { mult = 1e3; s = s.replace(/(rb|ribu|k)$/, ""); }
      s = mult > 1 ? s.replace(",", ".") : s.replace(/[.,]/g, "");
      return Math.round(parseFloat(s) * mult) || 0;
    };
    const NUM = "(?:rp\\.?\\s*)?\\d+(?:[.,]\\d+)*\\s*(?:jt|juta|rb|ribu|k)?";
    const out = [];
    for (const part of String(input.text || "").split(/[,;\n]+| dan /i)) {
      const t = part.trim();
      if (!t) continue;
      const lower = t.toLowerCase();
      const masuk = /(jual|laku|terjual|omzet|pemasukan|dapat|order|pesanan)/.test(lower);
      let nominal = 0;
      const at = lower.match(new RegExp(`(\\d+)\\s*(?:porsi|pcs|cup|gelas|bungkus|box|x)?\\s*[@x]\\s*(${NUM})`));
      if (at) nominal = Number(at[1]) * toNum(at[2]);
      else {
        const nums = lower.match(new RegExp(NUM, "g")) || [];
        const withUnit = nums.filter((n) => /(jt|juta|rb|ribu|k|rp)/.test(n));
        nominal = toNum((withUnit.length ? withUnit : nums).slice(-1)[0] || "0");
      }
      if (!nominal) continue;
      let kategori = "Lainnya";
      if (masuk) kategori = "Penjualan";
      else if (/(gaji|upah|bayar karyawan)/.test(lower)) kategori = "Gaji";
      else if (/(kemasan|cup|plastik|box|stiker|bowl)/.test(lower)) kategori = "Kemasan";
      else if (/(iklan|promo|endorse|ads)/.test(lower)) kategori = "Marketing";
      else if (/(gas|listrik|sewa|air|parkir|bensin|kuota)/.test(lower)) kategori = "Operasional";
      else if (/(beli|belanja)/.test(lower)) kategori = "Bahan Baku";
      out.push({ jenis: masuk ? "masuk" : "keluar", kategori, nominal, catatan: t });
    }
    return { transaksi: out };
  },

  cashflow_insight(_p, input) {
    const { masuk = 0, keluar = 0, kategori_keluar = {}, hari_aktif = 0 } = input;
    const laba = masuk - keluar;
    const top = Object.entries(kategori_keluar).sort((a, b) => b[1] - a[1])[0];
    const margin = masuk ? Math.round((laba / masuk) * 100) : 0;
    return {
      headline: laba >= 0 ? `Bulan ini masih cuan ${margin}%, mantap! 💰` : "Bulan ini masih minus, yuk evaluasi 🔍",
      insight: [
        `Total pemasukan Rp ${masuk.toLocaleString("id-ID")} dan pengeluaran Rp ${keluar.toLocaleString("id-ID")}.`,
        top ? `Pengeluaran terbesar ada di ${top[0]} (Rp ${top[1].toLocaleString("id-ID")}).` : "Belum ada catatan pengeluaran.",
        `Kamu mencatat transaksi di ${hari_aktif} hari berbeda bulan ini.`,
      ],
      saran: [
        top ? `Coba tawar atau cari supplier alternatif untuk ${top[0]}.` : "Catat juga pengeluaran kecil biar laporan akurat.",
        "Dorong menu dengan margin paling tinggi di konten minggu ini.",
        "Catat transaksi setiap hari sebelum tutup, biar kebiasaan.",
      ],
    };
  },

  generate_recipe(p, input) {
    const porsi = Number(input.porsi) || 1;
    const nama = String(input.menu || "Menu").toLowerCase();
    const base = /kopi|teh|es |susu|minum|jus/.test(nama)
      ? [
          ["Kopi bubuk / teh", 15, "gram", 120],
          ["Susu UHT", 120, "ml", 18],
          ["Gula aren cair", 25, "ml", 30],
          ["Es batu", 150, "gram", 2],
          ["Cup plastik + tutup", 1, "pcs", 900],
          ["Sedotan", 1, "pcs", 100],
        ]
      : [
          [/tahu/.test(nama) ? "Tahu putih" : "Bahan utama", /tahu/.test(nama) ? 4 : 120, /tahu/.test(nama) ? "pcs" : "gram", /tahu/.test(nama) ? 500 : 60],
          ["Kaldu / kuah", 200, "ml", 10],
          ["Cabai rawit", 10, "gram", 80],
          ["Bawang putih", 5, "gram", 40],
          ["Minyak goreng", 20, "ml", 18],
          ["Paper bowl", 1, "pcs", 900],
          ["Sendok plastik", 1, "pcs", 150],
        ];
    return {
      porsi_hasil: porsi,
      bahan: base.map(([n, q, sat, h]) => ({ nama: n, qty: q * porsi, satuan: sat, harga_per_satuan: h })),
      tips: ["Timbang bahan pakai timbangan digital biar rasa konsisten", "Belanja bahan kering seminggu sekali di pasar induk biar lebih murah"],
    };
  },

  mentor_chat(p, input) {
    const last = (input.messages || []).slice(-1)[0]?.content || "";
    return {
      balasan: `(Mode Demo) Pertanyaan bagus soal "${last.slice(0, 80)}"! Buat jawaban yang beneran dipersonalisasi untuk ${p.nama || "bisnismu"} di ${area(p)}, aktifkan Mode AI Online di Setelan ya. Sementara itu, tips umum: fokus ke 2–3 menu andalan, catat kas tiap hari, dan posting konten minimal 5x seminggu. Gas! 🚀`,
    };
  },
};
