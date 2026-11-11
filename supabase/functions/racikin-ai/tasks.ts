// Definisi semua "task" AI Racikin.
// Prompt & schema disimpan di server supaya endpoint tidak bisa dipakai
// sebagai proxy AI umum: klien cuma boleh memilih task + mengirim data.

type Schema = Record<string, unknown>;

const str = (description?: string): Schema => ({ type: "string", ...(description ? { description } : {}) });
const num = (description?: string): Schema => ({ type: "number", ...(description ? { description } : {}) });
const arr = (items: Schema): Schema => ({ type: "array", items });
const strs = () => arr(str());
const en = (values: string[]): Schema => ({ type: "string", enum: values });
function obj(properties: Record<string, Schema>): Schema {
  return {
    type: "object",
    properties,
    required: Object.keys(properties),
    additionalProperties: false,
  };
}

export const BASE_SYSTEM = `Kamu adalah Racikin, co-founder AI buat pelaku usaha F&B (kuliner) di Indonesia.
Gaya bahasa: santai ala anak muda Indonesia (pakai "kamu", boleh selipin kata kayak "gas", "cuan", "worth it"), tapi tetap jelas, jujur, dan praktis.
Aturan:
- Semua jawaban harus spesifik untuk profil bisnis user (lokasi, target pasar, modal, konsep). Jangan generik.
- Pakai angka realistis harga pasar Indonesia (Rupiah, tanpa desimal).
- Kalau idenya punya risiko besar, bilang terus terang dengan sopan.
- Jangan mengarang data statistik spesifik; kalau estimasi, sebut sebagai estimasi.
- Semua teks dalam Bahasa Indonesia.`;

export interface TaskDef {
  instruction: string;
  schema: Schema;
  effort: "low" | "medium" | "high";
}

export const TASKS: Record<string, TaskDef> = {
  analyze_idea: {
    effort: "medium",
    instruction: `Analisa kelayakan ide bisnis F&B user. Beri skor 0-100, verdict singkat (maks 6 kata), ringkasan 2-3 kalimat, 2-3 persona pelanggan, SWOT (3-4 poin tiap bagian), 3 tipe kompetitor di sekitar lokasi, 3 pembeda yang bisa diangkat, estimasi harga jual & HPP per porsi, 3-5 risiko, dan 3-5 langkah validasi pasar murah yang bisa dilakukan minggu ini.`,
    schema: obj({
      skor: num("0-100"),
      verdict: str(),
      ringkasan: str(),
      persona: arr(obj({ nama: str(), deskripsi: str() })),
      swot: obj({ kekuatan: strs(), kelemahan: strs(), peluang: strs(), ancaman: strs() }),
      kompetitor: arr(obj({ nama: str(), catatan: str() })),
      pembeda: strs(),
      harga: obj({ harga_jual: num(), hpp: num(), margin_persen: num(), catatan: str() }),
      risiko: strs(),
      validasi: strs(),
    }),
  },

  generate_rab: {
    effort: "medium",
    instruction: `Susun RAB (Rencana Anggaran Biaya) modal awal untuk bisnis user. Kelompokkan per kategori: Peralatan, Bahan Baku Awal, Tempat, Perizinan, Branding & Kemasan, Marketing Launching, Dana Darurat. Tandai prioritas "wajib" atau "opsional". Usahakan total item wajib tidak melebihi modal user; kalau tidak mungkin, jelaskan di ringkasan. Jika input.mode = "hemat", pilih opsi paling hemat (bekas, sewa, DIY). Sertakan juga biaya operasional bulanan (sewa, gas, listrik, gaji, dll) dan 3-5 tips hemat.
PENTING: field "harga" adalah harga SATUAN (untuk 1 satuan), aplikasi akan menghitung subtotal = qty x harga. Contoh benar: 200 paper bowl @ Rp2.000 -> qty 200, satuan "pcs", harga 2000 (BUKAN 400000). Kalau item dibeli borongan sebagai satu paket, pakai qty 1 dan satuan "paket". Pastikan angka di ringkasan sama dengan jumlah qty x harga item wajib.`,
    schema: obj({
      ringkasan: str(),
      items: arr(obj({
        kategori: str(),
        item: str(),
        qty: num("jumlah unit yang dibeli"),
        satuan: str(),
        harga: num("harga untuk 1 satuan saja (BUKAN total). Subtotal = qty x harga"),
        prioritas: en(["wajib", "opsional"]),
        catatan: str(),
      })),
      biaya_bulanan: arr(obj({ item: str(), nominal: num() })),
      tips_hemat: strs(),
    }),
  },

  generate_brand: {
    effort: "medium",
    instruction: `Bikin brand kit untuk bisnis user: 3 opsi nama brand (kalau user sudah punya nama, opsi pertama = nama itu dan berikan 2 alternatif), 3 opsi tagline, brand story 1 paragraf, 3-4 karakter tone of voice, palet 4 warna (hex valid #RRGGBB) beserta perannya, saran font Google Fonts untuk judul & isi, konsep logo yang bisa dikasih ke desainer atau AI image generator, 4-6 ide nama menu yang catchy, dan 3-4 ide kemasan.`,
    schema: obj({
      opsi_nama: arr(obj({ nama: str(), alasan: str() })),
      tagline: strs(),
      brand_story: str(),
      tone_of_voice: strs(),
      palet: arr(obj({ nama: str(), hex: str(), peran: str() })),
      font: obj({ judul: str(), isi: str() }),
      konsep_logo: str(),
      ide_menu: arr(obj({ nama: str(), deskripsi: str() })),
      kemasan: strs(),
    }),
  },

  activation_plan: {
    effort: "medium",
    instruction: `Bikin rencana aktivasi untuk launching bisnis user. Untuk tiap channel yang relevan (Instagram, TikTok, Google Maps/Business Profile, WhatsApp Business, GoFood, GrabFood, ShopeeFood — sesuaikan dengan konsep), beri prioritas (tinggi/sedang/rendah), 4-6 langkah setup konkret (termasuk dokumen yang perlu disiapkan untuk ojol), dan 1 tips. Lalu rencana launching 4 minggu (teaser, grand opening, dorong ulasan, retensi). Lalu deskripsi menu yang menjual untuk 3-4 menu utama (cocok buat GoFood/GrabFood, maks 200 karakter).`,
    schema: obj({
      channels: arr(obj({
        channel: str(),
        prioritas: en(["tinggi", "sedang", "rendah"]),
        langkah: strs(),
        tips: str(),
      })),
      launching: arr(obj({ minggu: num(), fokus: str(), aktivitas: strs() })),
      deskripsi_menu: arr(obj({ menu: str(), deskripsi: str() })),
    }),
  },

  content_calendar: {
    effort: "medium",
    instruction: `Bikin kalender konten sosmed sebanyak input.hari hari (mulai hari_ke 1). Tentukan 3-4 pilar konten dulu. Tiap hari 1 konten (boleh libur maksimal 1 hari per minggu dengan tidak memasukkan hari itu). Mix platform Instagram & TikTok (dan WhatsApp Status untuk promo). Format: Reels/TikTok, Carousel, Story, Foto. Hook harus bikin berhenti scroll. Caption 1-3 kalimat santai + CTA. Hashtag 4-6, ada yang lokal. Jam posting sesuai kebiasaan target pasar. Perhatikan input.tanggal_mulai untuk momen (weekend, tanggal gajian 25-1, hari besar).`,
    schema: obj({
      pilar: arr(obj({ nama: str(), deskripsi: str() })),
      jadwal: arr(obj({
        hari_ke: num(),
        platform: str(),
        pilar: str(),
        format: str(),
        ide: str(),
        hook: str(),
        caption: str(),
        hashtag: str(),
        jam: str("HH:MM"),
      })),
    }),
  },

  caption: {
    effort: "low",
    instruction: `Bikin 3 variasi caption untuk topik di input.topik pada platform input.platform. Tiap variasi: hook, caption (maks 4 kalimat + CTA), dan hashtag.`,
    schema: obj({ captions: arr(obj({ hook: str(), caption: str(), hashtag: str() })) }),
  },

  parse_transactions: {
    effort: "low",
    instruction: `Ubah catatan bebas di input.text menjadi daftar transaksi. jenis "masuk" untuk penjualan/pemasukan, "keluar" untuk belanja/biaya. Kategori pilih salah satu: Penjualan, Bahan Baku, Kemasan, Operasional, Gaji, Marketing, Peralatan, Lainnya. Nominal dalam Rupiah utuh (contoh: "12rb" = 12000, "1,5jt" = 1500000; "25 porsi @12rb" = 300000). Jangan mengarang transaksi yang tidak disebut.`,
    schema: obj({
      transaksi: arr(obj({
        jenis: en(["masuk", "keluar"]),
        kategori: str(),
        nominal: num(),
        catatan: str(),
      })),
    }),
  },

  cashflow_insight: {
    effort: "medium",
    instruction: `Baca ringkasan pembukuan di input (total, per kategori, per hari, perbandingan periode). Beri 1 headline, 3-4 insight berbasis angka tersebut, dan 3 saran aksi konkret minggu ini. Jangan mengarang angka di luar data.`,
    schema: obj({ headline: str(), insight: strs(), saran: strs() }),
  },

  mentor_chat: {
    effort: "medium",
    instruction: `Kamu sedang ngobrol sebagai mentor bisnis. input.messages berisi riwayat obrolan (role user/assistant). Jawab pesan terakhir user dengan ringkas (maks ~150 kata), praktis, pakai konteks bisnis & data yang ada. Boleh pakai poin-poin.`,
    schema: obj({ balasan: str() }),
  },
};
