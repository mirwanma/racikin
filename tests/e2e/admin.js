// E2E Racikin (admin.js): Dashboard Admin (#/admin) dengan sesi & RPC Supabase yang di-mock (tidak menyentuh data asli).
// Cek: akun non-admin ditolak, mode admin (menu Ringkasan/Merchant/Pertumbuhan/Akun, menu usaha diblokir), ringkasan,
// daftar merchant (cari/filter/urut), detail, CSV, pertumbuhan, pindah ke app usaha & balik, akun tes disembunyikan.
const { chromium } = require('playwright');
const B = (process.env.RACIKIN_URL || 'http://localhost:8766/'), OUT = process.argv[2];
const txt = async (p, sel) => (await p.textContent(sel)).replace(/\s+/g, ' ').trim();
const ok = (cond, label) => { console.log((cond ? 'OK   ' : 'GAGAL') + ' ' + label); if (!cond) process.exitCode = 1; };
const iso = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
const F = (on) => Object.fromEntries(['kasir', 'tim', 'shift', 'stempel', 'online', 'varian', 'promo', 'wa', 'meja', 'dapur', 'foto', 'impor'].map((k) => [k, on.includes(k)]));

const MERCHANT = [
  { id: '11111111-1111-1111-1111-111111111111', nama: 'Bakso Bu Sari', pemilik: 'Sari', email: 'sari@contoh.id', kota: 'Bandung', jenis: 'Makanan berat', konsep: 'Kios / ruko', tahap: 'jalan', masalah: ['stok'], daftar: iso(70) + 'T03:00:00Z', login_terakhir: iso(0) + 'T03:00:00Z', diubah: iso(0) + 'T03:00:00Z', jualan_terakhir: iso(0), order7: 70, omzet7: 1400000, order30: 300, omzet30: 6000000, order_prev30: 250, omzet_prev30: 5000000, hari_jualan30: 28, menu: 12, bahan: 20, pelanggan: 40, tim: 2, ai30: 15, meja_order30: 30, fitur: F(['kasir', 'tim', 'shift', 'stempel', 'promo', 'wa', 'meja', 'varian']) },
  { id: '22222222-2222-2222-2222-222222222222', nama: 'Kopi Senja', pemilik: 'Dian', email: 'senja@contoh.id', kota: 'Bandung', jenis: 'Minuman / kopi', konsep: 'Kios / ruko', tahap: 'jalan', masalah: [], daftar: iso(100) + 'T03:00:00Z', login_terakhir: iso(27) + 'T03:00:00Z', diubah: iso(27) + 'T03:00:00Z', jualan_terakhir: iso(27), order7: 0, omzet7: 0, order30: 10, omzet30: 200000, order_prev30: 400, omzet_prev30: 8000000, hari_jualan30: 3, menu: 8, bahan: 5, pelanggan: 0, tim: 0, ai30: 0, meja_order30: 0, fitur: F(['kasir']) },
  { id: '33333333-3333-3333-3333-333333333333', nama: 'Dimsum Mama', pemilik: 'Rina', email: 'mama@contoh.id', kota: 'Depok', jenis: 'Jajanan / snack', konsep: 'Online / dari rumah', tahap: 'ide', masalah: [], daftar: iso(3) + 'T03:00:00Z', login_terakhir: iso(2) + 'T03:00:00Z', diubah: iso(2) + 'T03:00:00Z', jualan_terakhir: null, order7: 0, omzet7: 0, order30: 0, omzet30: 0, order_prev30: 0, omzet_prev30: 0, hari_jualan30: 0, menu: 0, bahan: 0, pelanggan: 0, tim: 0, ai30: 6, meja_order30: 0, fitur: F([]) },
  { id: '55555555-5555-5555-5555-555555555555', nama: 'Akun Tes', pemilik: 'Tes', email: 'racikin-tim-owner@racikin.test', kota: 'Cimahi', jenis: 'Jajanan / snack', konsep: 'Gerobak / booth', tahap: 'jalan', masalah: [], daftar: iso(5) + 'T03:00:00Z', login_terakhir: iso(1) + 'T03:00:00Z', diubah: iso(1) + 'T03:00:00Z', jualan_terakhir: iso(1), order7: 50, omzet7: 1000000, order30: 50, omzet30: 1000000, order_prev30: 0, omzet_prev30: 0, hari_jualan30: 5, menu: 15, bahan: 25, pelanggan: 35, tim: 3, ai30: 40, meja_order30: 5, fitur: F(['kasir', 'tim']) },
];
const SERI = { '11111111-1111-1111-1111-111111111111': [8,9,10,9,11,10,12,9,11,10,12,11,10,9], '22222222-2222-2222-2222-222222222222': [6,5,4,3,0,0,0,0,0,0,0,0,0,0] };
for (const m of MERCHANT) { m.seri14 = SERI[m.id] || Array(14).fill(0); m.order90 = m.order30 + m.order_prev30; m.omzet90 = m.omzet30 + m.omzet_prev30; }
// Total platform per hari, 180 hari (90 sekarang + 90 sebelumnya). 30 hari terakhir: order 10/hari, omzet 200rb/hari; 30 hari sebelumnya: 5/hari.
const HARIAN = Array.from({ length: 180 }, (_, i) => { const umur = 179 - i; const o = umur < 30 ? 10 : umur < 60 ? 5 : 2; return { tgl: iso(umur), order: o, omzet: o * 20000, jualan: umur < 30 ? 2 : 1, daftar: umur === 3 ? 1 : 0, ai: umur < 30 ? 1 : 0 }; });
// Paket: Bakso Bu Sari Pro bayar bulanan, Kopi Senja gratis, Dimsum Mama masa coba, akun tes transisi.
const PAKET = [
  { id: '11111111-1111-1111-1111-111111111111', paket: 'pro', sumber: 'bayar', periode: 'bulan', sampai: iso(-20) + 'T00:00:00Z', catatan: 'transfer BCA' },
  { id: '22222222-2222-2222-2222-222222222222', paket: 'gratis', sumber: null, pro_terakhir: iso(40) + 'T00:00:00Z', catatan: '' },
  { id: '33333333-3333-3333-3333-333333333333', paket: 'pro', sumber: 'coba', sampai: iso(-11) + 'T00:00:00Z', catatan: '' },
  { id: '55555555-5555-5555-5555-555555555555', paket: 'pro', sumber: 'transisi', sampai: '2027-02-20T16:59:59Z', catatan: '' },
];
const SETTING = { wa: '', harga_bulan: 49000, harga_tahun: 490000, coba_hari: 14, transisi_sampai: '2027-02-20T16:59:59Z', ai_gratis: 20, ai_pro: 300, fitur: { tim: 'pro', meja: 'pro', dapur: 'pro', bill: 'pro', foto: 'pro', imporJual: 'pro' }, diubah: '2026-11-20T10:00:00Z' };
let SET_PAKET = null;
const SET = [];
const DETAIL = { harian: Array.from({ length: 60 }, (_, i) => ({ tgl: iso(59 - i), order: 5 + (i % 7), omzet: (5 + (i % 7)) * 20000 })), terlaris: [{ nama: 'Bakso Urat', porsi: 420 }, { nama: 'Es Teh', porsi: 210 }], tim: [{ role: 'kasir', n: 2 }], ai: [{ task: 'mentor_chat', n: 10 }], meja: 30 };

async function halaman(b, { admin }) {
  const ctx = await b.newContext({ viewport: { width: 1180, height: 860 }, acceptDownloads: true });
  const uid = '99999999-9999-9999-9999-999999999999';
  // Sesi palsu (supabase-js membaca sesi dari localStorage; token tidak pernah dikirim ke server asli karena semua request di-mock).
  await ctx.addInitScript((u) => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    localStorage.setItem('sb-ujdxslztjcufidhqpmcd-auth-token', JSON.stringify({ access_token: 'x.y.z', refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: exp, user: { id: u, email: 'admin@contoh.id', aud: 'authenticated', role: 'authenticated' } }));
  }, uid);
  await ctx.route('https://ujdxslztjcufidhqpmcd.supabase.co/**', (route) => {
    const url = route.request().url();
    const json = (x, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(x) });
    if (url.includes('/rpc/is_platform_admin')) return json(admin);
    if (url.includes('/rpc/admin_merchants')) return admin ? json(MERCHANT) : json({ message: 'Khusus admin Racikin' }, 400);
    if (url.includes('/rpc/admin_merchant_detail')) return json(DETAIL);
    if (url.includes('/rpc/admin_harian')) return json(HARIAN);
    if (url.includes('/rpc/admin_paket')) return json(PAKET);
    if (url.includes('/rpc/admin_setting')) return json(SETTING);
    if (url.includes('/rpc/admin_set_paket')) { SET_PAKET = JSON.parse(route.request().postData()).p; Object.assign(SETTING, SET_PAKET, { wa: SET_PAKET.wa.replace(/\D/g, '') }); return json(SETTING); }
    if (url.includes('/rpc/admin_set_langganan')) { const b = JSON.parse(route.request().postData()); SET.push(b); return json({ paket: 'pro', sumber: 'bayar', sampai: b.p_sampai, periode: b.p_periode }); }
    if (url.includes('/rpc/paket_saya')) return json({ paket: 'pro', sumber: 'transisi', sampai: '2027-02-20T16:59:59Z' });
    if (url.includes('/auth/v1/user')) return json({ id: uid, email: 'admin@contoh.id', aud: 'authenticated', role: 'authenticated' });
    if (url.includes('/rpc/my_team')) return json(null);
    if (url.includes('/rpc/doc_get')) return json(null);
    if (url.includes('/rpc/doc_save')) return json({ ok: true, rev: 1, updated_at: new Date().toISOString() });
    return json(null);
  });
  const p = await ctx.newPage();
  p.errs = []; p.on('pageerror', (e) => p.errs.push(e.message));
  return p;
}

(async () => {
  const b = await chromium.launch();

  // Non-admin
  const n = await halaman(b, { admin: false });
  await n.goto(B + '#/admin'); await n.waitForSelector('text=bukan admin platform', { timeout: 20000 });
  ok(true, 'akun non-admin ditolak');
  await n.goto(B + '#/akun'); await n.waitForSelector('text=Keluar'); await n.waitForTimeout(800);
  ok(!(await n.$('.view a[href="#/admin"]')) && (await n.getAttribute('body', 'data-admin')) === '', 'non-admin: link dashboard tidak muncul di Akun, menu admin nggak aktif');

  // Admin: app langsung masuk mode admin (menu usaha disembunyikan)
  const p = await halaman(b, { admin: true });
  await p.goto(B); await p.waitForSelector('.a-hero', { timeout: 20000 });
  ok(p.url().endsWith('#/admin'), 'admin: buka app langsung ke dashboard admin (tanpa isi profil usaha)');
  const nav = await p.$$eval('.tabbar a', (a) => a.filter((x) => getComputedStyle(x).display !== 'none').map((x) => x.childNodes[1]?.textContent.trim()));
  ok(nav.join() === 'Ringkasan,Merchant,Pertumbuhan,Paket,Akun', 'menu admin: ' + nav.join());
  ok(await p.isVisible('.adm-brand'), 'sidebar: brand Racikin Admin platform');
  ok((await p.getAttribute('.tabbar a.active', 'data-tab')) === 'admin-ringkasan', 'tab Ringkasan aktif');
  ok((await txt(p, '.a-nav-badge')) === '2', 'badge Merchant: 2 perlu disapa');
  const hero = await txt(p, '.a-hero');
  console.log('hero:', hero);
  ok(/Omzet merchant 30 hari\s*Rp 6jt\s*\+100%/.test(hero) && hero.includes('300 order'), 'hero: omzet 30 hari dari deret harian + perbandingan');
  const tiles = await p.$$eval('.a-bento .a-tile:not(.a-hero)', (a) => a.map((x) => x.textContent.replace(/\s+/g, ' ').trim()));
  console.log('tiles:', tiles.join(' | '));
  ok(/^Merchant\s*3/.test(tiles[0]) && /2\s*\/ 3/.test(tiles[1]) && /Berisiko berhenti\s*1\s*Kopi Senja/.test(tiles[2]), 'kotak angka: 3 merchant (akun tes disembunyikan), 2/3 aktif, 1 berisiko');
  ok((await p.$$eval('.a-hero .a-line', (a) => a.length)) === 1, 'grafik omzet di hero');
  const top = await p.$$eval('.a-flush .a-usaha b', (a) => a.map((x) => x.textContent));
  ok(top[0] === 'Bakso Bu Sari' && top.length === 3, 'Merchant teratas: ' + top.join());
  ok((await p.$$eval('.a-flush .a-spark .a-line', (a) => a.length)) === 3, 'grafik mini order 14 hari per merchant');
  const sapa = await p.$$eval('.a-alert', (a) => a.map((x) => x.textContent.replace(/\s+/g, ' ').trim()));
  console.log('sapa:', sapa);
  ok(sapa.length === 2 && sapa[0].includes('Kopi Senja') && sapa[1].includes('Dimsum Mama') && sapa[1].includes('menu masih kosong'), 'Perlu disapa: Kopi Senja (berhenti) & Dimsum Mama (menu kosong)');
  const lg = await p.$$eval('.a-bento-4 .a-tile', (a) => a.map((x) => x.textContent.replace(/\s+/g, ' ').trim()));
  console.log('langganan:', lg.join(' | '));
  ok(/MRR\)\s*Rp 49rb/i.test(lg[0]) && /Pro berbayar\s*1/.test(lg[1]) && /Masa coba \/ transisi\s*1/.test(lg[2]) && /Gratis\s*1/.test(lg[3]), 'langganan: MRR 49rb, 1 Pro, 1 coba (akun tes disembunyikan), 1 gratis');
  ok((await txt(p, '.a-flush')).includes('PRO') || (await p.$$eval('.a-flush .a-pk', (a) => a.length)) >= 2, 'tabel: tag paket per merchant');
  await p.screenshot({ path: OUT + '/a1-ringkasan.png', fullPage: true });

  // Periode 7 hari
  await p.click('[data-action=periode][data-n="7"]'); await p.waitForTimeout(150);
  ok(/Omzet merchant 7 hari\s*Rp 1\.4jt\s*\+?0%/.test(await txt(p, '.a-hero')), 'periode 7 hari: 70 order × 20rb, sama dengan minggu lalu');
  await p.click('[data-action=periode][data-n="30"]');

  // Menu usaha diblokir di mode admin
  await p.goto(B + '#/kasir'); await p.waitForSelector('.a-hero');
  ok(p.url().endsWith('#/admin'), 'mode admin: #/kasir dialihkan ke dashboard');

  // Klik Perlu disapa -> tab Merchant dengan detail terbuka
  await p.click('.a-alert:has-text("Kopi Senja")'); await p.waitForSelector('.adm-detail');
  ok((await p.getAttribute('.tabbar a.active', 'data-tab')) === 'admin-merchant' && (await txt(p, '.adm-detail')).includes('senja@contoh.id'), 'dari Ringkasan: detail Kopi Senja terbuka di tab Merchant');
  await p.click('.a-row:has-text("Kopi Senja") button.a-tr'); // tutup

  const rows = await p.$$eval('.a-row .a-usaha b', (a) => a.map((x) => x.textContent));
  ok(rows.join() === 'Bakso Bu Sari,Dimsum Mama,Kopi Senja', 'urut terakhir aktif, tanpa akun tes: ' + rows.join());

  // Filter chip, cari, akun tes
  ok((await txt(p, '[data-action=chip][data-k=berisiko]')) === 'Berisiko 1', 'chip berisiko dengan jumlah');
  await p.click('[data-action=chip][data-k=berisiko]'); await p.waitForTimeout(150);
  ok((await p.$$eval('.a-row', (a) => a.length)) === 1 && (await txt(p, '.a-row')).includes('Kopi Senja'), 'filter berisiko');
  await p.click('[data-action=chip][data-k=""]');
  await p.fill('input[data-change=q]', 'depok'); await p.press('input[data-change=q]', 'Tab'); await p.waitForTimeout(150);
  ok((await p.$$eval('.a-row', (a) => a.length)) === 1, 'cari kota');
  await p.fill('input[data-change=q]', ''); await p.press('input[data-change=q]', 'Tab');
  await p.check('input[data-change=tes]'); await p.waitForTimeout(300);
  ok((await p.$$eval('.a-row', (a) => a.length)) === 4, 'akun tes bisa diikutkan');
  await p.uncheck('input[data-change=tes]'); await p.waitForTimeout(200);
  await p.selectOption('select[data-change=urut]', 'omzet30'); await p.waitForTimeout(150);

  // Detail
  await p.click('.a-row:has-text("Bakso Bu Sari") button.a-tr'); await p.waitForSelector('.adm-chart i');
  const det = await txt(p, '.adm-detail');
  console.log('detail:', det.slice(0, 260));
  ok((await p.$$eval('.adm-chart i', (a) => a.length)) === 60 && det.includes('Bakso Urat') && det.includes('sari@contoh.id') && det.includes('2 kasir'), 'detail: grafik 60 hari, terlaris, email, tim');
  ok((await txt(p, '.a-paket')).includes('transfer BCA'), 'detail: panel paket + catatan pembayaran');
  await p.fill('[data-change=catatanPro]', 'transfer 20/11'); await p.press('[data-change=catatanPro]', 'Tab');
  p.once('dialog', (d) => d.accept());
  await p.click('[data-action=proSet][data-periode=tahun]'); await p.waitForTimeout(300);
  ok(SET.length === 1 && SET[0].p_periode === 'tahun' && SET[0].p_catatan === 'transfer 20/11' && SET[0].p_owner.startsWith('1111') && new Date(SET[0].p_sampai) > new Date(Date.now() + 360 * 864e5), 'perpanjang Pro 1 tahun dari sisa masa aktif');
  await p.screenshot({ path: OUT + '/a2-merchant.png', fullPage: true });

  // CSV
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('[data-action=csv]')]);
  const isi = await (await dl.createReadStream()).toArray().then((c) => Buffer.concat(c).toString('utf8'));
  ok(dl.suggestedFilename().startsWith('racikin-merchant-') && isi.split('\n').length === 4 && isi.includes('Bakso Bu Sari'), 'CSV 3 merchant');

  // Pertumbuhan
  await p.click('.tabbar a[data-tab="admin-tren"]'); await p.waitForSelector('.a-cols');
  const tren = await txt(p, '.a-wrap');
  ok(/Order 30 hari\s*300\s*\+100%/.test(tren) && tren.includes('Pendaftar per minggu') && /Kasir\s*67%/.test(tren), 'Pertumbuhan: order + perbandingan, pendaftar, adopsi fitur (Kasir 2/3)');
  ok((await p.$$eval('.a-cols', (a) => a.length)) === 3, 'grafik harian order, merchant jualan, pendaftar');
  await p.screenshot({ path: OUT + '/a3-tren.png', fullPage: true });

  // Paket & harga: tabel fitur Gratis/Pro, kuota AI, harga, masa coba, WA -> satu kali simpan
  await p.click('.tabbar a[data-tab="admin-paket"]'); await p.waitForSelector('form[data-form=paketAdmin]');
  const baris = await p.$$eval('.a-ptable .a-tr:not(.a-th)', (a) => a.length);
  ok(baris === 6 + 1 + 6, `tabel fitur: 6 fitur bisa diatur + kuota AI + 6 fitur inti (${baris} baris)`);
  ok(await p.isChecked('input[name=f_meja][value=pro]'), 'awal: pesan meja = Pro');
  await p.click('label:has(input[name=f_meja][value=gratis])');
  await p.click('label:has(input[name=f_foto][value=gratis])');
  await p.fill('input[name=ai_gratis]', '50'); await p.fill('input[name=harga_bulan]', '59000'); await p.fill('input[name=harga_tahun]', '590000');
  await p.fill('input[name=coba_hari]', '7'); await p.fill('input[name=wa]', '0812 1111 2222');
  await p.screenshot({ path: OUT + '/a3b-paket.png', fullPage: true });
  let konfirmasi = '';
  p.once('dialog', (d) => { konfirmasi = d.message(); d.accept(); });
  await p.click('form[data-form=paketAdmin] button.primary'); await p.waitForTimeout(400);
  console.log('konfirmasi:', konfirmasi.replace(/\n/g, ' | '));
  ok(/Jadi Gratis: Pesan lewat QR meja, Foto menu AI/.test(konfirmasi), 'konfirmasi menyebut fitur yang berubah');
  ok(SET_PAKET && SET_PAKET.fitur.meja === 'gratis' && SET_PAKET.fitur.foto === 'gratis' && SET_PAKET.fitur.tim === 'pro' && SET_PAKET.ai_gratis === 50 && SET_PAKET.harga_bulan === 59000 && SET_PAKET.coba_hari === 7 && SET_PAKET.transisi_sampai.startsWith('2027-02-2'), 'semua pengaturan paket terkirim sekaligus');
  ok(await p.isChecked('input[name=f_meja][value=gratis]') && (await p.inputValue('input[name=wa]')) === '081211112222', 'tampilan ikut data tersimpan');

  // Akun versi admin + pindah ke app usaha & balik
  await p.click('.tabbar a[data-tab="akun"]'); await p.waitForSelector('[data-action=keUsaha]');
  ok((await txt(p, '.view')).includes('Admin platform') && !(await p.$('a[href="#/tim"]')), 'Akun admin: tanpa menu usaha (Tim, Pengingat)');
  ok(!!(await p.$('a[href="#/admin?tab=paket"].card')), 'Akun admin: link ke Paket & harga');
  await p.click('[data-action=keUsaha]'); await p.waitForSelector('.hero, form[data-form]', { timeout: 10000 }); await p.waitForTimeout(300);
  ok(p.url().includes('#/profil') && (await p.getAttribute('body', 'data-admin')) === '', 'Buka app usaha: keluar dari mode admin (ke isi profil)');
  await p.goto(B + '#/akun'); await p.waitForSelector('[data-action=keAdmin]');
  await p.click('[data-action=keAdmin]'); await p.waitForSelector('.a-hero');
  ok((await p.getAttribute('body', 'data-admin')) === '1', 'balik ke mode admin dari Akun');

  // Buka ulang: langsung mode admin
  await p.reload(); await p.waitForSelector('.a-hero', { timeout: 20000 });
  ok(p.url().endsWith('#/admin'), 'muat ulang: tetap di dashboard admin');

  // Layar lebar, mode gelap & terang
  await p.setViewportSize({ width: 1360, height: 900 }); await p.waitForTimeout(300);
  await p.emulateMedia({ colorScheme: 'dark' }); await p.waitForTimeout(200);
  ok(await p.evaluate(() => getComputedStyle(document.body).backgroundColor === 'rgb(18, 17, 16)'), 'mode gelap: latar pusat kontrol gelap');
  await p.screenshot({ path: OUT + '/a4-gelap.png', fullPage: true });
  await p.emulateMedia({ colorScheme: 'light' }); await p.waitForTimeout(200);
  ok(await p.evaluate(() => getComputedStyle(document.body).backgroundColor === 'rgb(243, 240, 232)'), 'mode terang: latar terang');
  await p.screenshot({ path: OUT + '/a5-terang.png', fullPage: true });
  ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'layar lebar: tidak ada scroll ke samping');

  // HP
  const m = await halaman(b, { admin: true });
  await m.setViewportSize({ width: 390, height: 844 });
  await m.emulateMedia({ colorScheme: 'dark' });
  await m.goto(B + '#/admin'); await m.waitForSelector('.a-hero', { timeout: 20000 });
  await m.screenshot({ path: OUT + '/a6-hp.png', fullPage: true });
  ok(await m.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'HP Ringkasan: tidak ada scroll ke samping');
  await m.goto(B + '#/admin?tab=merchant'); await m.waitForSelector('.a-row');
  await m.click('.a-row:has-text("Bakso Bu Sari") button.a-tr'); await m.waitForSelector('.adm-chart i');
  await m.screenshot({ path: OUT + '/a7-hp-merchant.png', fullPage: true });
  ok(await m.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'HP Merchant: tidak ada scroll ke samping');

  console.log('errors:', [...n.errs, ...p.errs, ...m.errs]);
  await b.close();
})();
