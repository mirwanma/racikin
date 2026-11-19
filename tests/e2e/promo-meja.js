// E2E Racikin (promo-meja.js): kuota voucher per pelanggan di Kasir + promo & voucher di halaman pesan meja.
// Halaman pelanggan memakai RPC Supabase yang di-mock (perhitungan aslinya dites di SQL, lihat
// supabase/migrations/20261119100000_promo_meja_server.sql). Data contoh, Mode Demo.
const { chromium } = require('playwright');
const B = (process.env.RACIKIN_URL || 'http://localhost:8766/'), OUT = process.argv[2];
const st = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('racikin:v1')));
const txt = async (p, sel) => (await p.textContent(sel)).replace(/\s+/g, ' ').trim();
const ok = (cond, label) => { console.log((cond ? 'OK   ' : 'GAGAL') + ' ' + label); if (!cond) process.exitCode = 1; };
const pos = async (p, nama) => { await p.click(`.pos-item:has-text("${nama}")`); if (await p.$('.sheet')) await p.click('.sheet [data-action=pilihTambah]'); };
async function mk(b) {
  const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  p.errs = []; p.on('pageerror', e => p.errs.push(e.message)); p.on('console', m => m.type() === 'error' && p.errs.push(m.text()));
  p.on('dialog', d => d.accept());
  return p;
}

(async () => {
  const b = await chromium.launch();
  const p = await mk(b);
  await p.goto(B); await p.click('[data-action=dummy]'); await p.waitForSelector('.journey', { timeout: 20000 });
  // Cuma voucher TAHGUY5 yang aktif, supaya hasil nggak tergantung jam/hari.
  await p.evaluate(() => { const x = JSON.parse(localStorage.getItem('racikin:v1')); x.promo = x.promo.map((q) => ({ ...q, aktif: q.kode === 'TAHGUY5' })); localStorage.setItem('racikin:v1', JSON.stringify(x)); });
  let s = await st(p);
  const v = s.promo.find((x) => x.kode === 'TAHGUY5');

  // --- Editor: maks per pelanggan
  await p.goto(B + '#/promo?id=' + v.id); await p.waitForSelector('[data-f=maksPerPelanggan]');
  await p.fill('[data-f=maksPerPelanggan]', '1'); await p.press('[data-f=maksPerPelanggan]', 'Tab');
  await p.click('[data-action=simpan]'); await p.waitForSelector('.promo-card');
  s = await st(p);
  ok(s.promo.find((x) => x.id === v.id).maksPerPelanggan === 1, 'voucher tersimpan: maks 1x per pelanggan');
  ok((await txt(p, `.promo-card:has-text("TAHGUY5")`)).includes('maks 1x/pelanggan'), 'kartu promo menampilkan batas per pelanggan');

  // --- Kasir: voucher butuh pelanggan
  const budi = s.pelanggan.find((x) => x.wa);
  const sari = s.pelanggan.filter((x) => x.wa)[1];
  const beli = async () => {
    await p.goto(B + '#/kasir'); await p.waitForSelector('.pos-grid, .struk');
    if (await p.$('[data-action=baru]')) { await p.click('[data-action=baru]'); await p.waitForSelector('.pos-grid'); }
    await pos(p, 'Tahu Guyur Komplit'); await pos(p, 'Tahu Guyur Komplit'); await pos(p, 'Tahu Guyur Komplit');
    await p.click('[data-action=checkout]'); await p.waitForSelector('.pos-kode');
    await p.fill('.pos-kode', 'TAHGUY5'); await p.press('.pos-kode', 'Tab'); await p.waitForTimeout(200);
  };
  await beli();
  console.log('tanpa pelanggan:', await txt(p, '.pos-kode ~ *, p.neg'));
  ok(!(await p.$('.promo-line')) && /per pelanggan/.test(await txt(p, 'p.small.neg')), 'tanpa pelanggan: voucher nggak kepakai + minta pilih pelanggan');
  await p.selectOption('select[data-change=pelanggan]', budi.id); await p.waitForSelector('.promo-line');
  ok((await txt(p, '.promo-line')).includes('5.000'), 'pilih pelanggan ber-WA: voucher kepakai');
  await p.screenshot({ path: OUT + '/pm1-kasir-voucher.png', fullPage: true });
  await p.click('[data-action=uang] >> nth=0'); await p.click('[data-action=selesai]'); await p.waitForSelector('.struk');
  s = await st(p);
  const o = s.orders[s.orders.length - 1];
  ok(o.promo?.kode === 'TAHGUY5' && o.promo.wa && o.promo.wa.startsWith('62'), 'order mencatat voucher + nomor WA pelanggan');

  await beli();
  await p.selectOption('select[data-change=pelanggan]', budi.id); await p.waitForTimeout(200);
  ok(!(await p.$('.promo-line')) && /sudah pakai voucher ini 1x/.test(await txt(p, 'p.small.neg')), 'pelanggan yang sama ditolak (maks 1x)');
  await p.selectOption('select[data-change=pelanggan]', sari.id); await p.waitForSelector('.promo-line');
  ok(true, 'pelanggan lain masih bisa pakai');
  await p.evaluate(() => document.querySelector('[data-action=clear]')?.click());

  // Aturan promo yang diunggah untuk server: nomor WA di-hash
  const pub = await p.evaluate(async () => {
    const { menuPublik, hashPakaiWa } = await import('./js/meja.js');
    return hashPakaiWa(menuPublik({ ...JSON.parse(localStorage.getItem('racikin:v1')), posSetting: { pesanMeja: true } }));
  });
  const a = pub.promoAturan.find((x) => x.kode === 'TAHGUY5');
  ok(a && a.maksPerPelanggan === 1 && Object.keys(a.pakaiWa).length === 1 && /^[0-9a-f]{64}$/.test(Object.keys(a.pakaiWa)[0]), 'promoAturan: kuota per pelanggan dengan nomor WA ter-hash');
  ok(!JSON.stringify(pub.promo).includes('TAHGUY5'), 'kode voucher nggak ada di info promo untuk pelanggan');

  // --- Halaman pelanggan (QR meja) dengan RPC mock
  const c = await mk(b);
  const panggil = []; let kirim = null; let pesanan = null;
  await c.route('**/rest/v1/rpc/**', async (route) => {
    const fn = route.request().url().split('/rpc/')[1].split('?')[0];
    const body = JSON.parse(route.request().postData() || '{}');
    const json = (x) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(x) });
    const sub = () => (body.p_items || []).reduce((t, it) => t + pub.menu.find((m) => m.id === it.id).harga * it.qty, 0);
    const hitung = () => {
      const s0 = sub();
      const auto = s0 >= 20000 ? { id: 'a', nama: 'Diskon 2rb', potongan: 2000 } : null;
      const k = String(body.p_kode || '').toUpperCase();
      if (k === 'HEMAT5' && !body.p_wa) return { subtotal: s0, promo: auto, total: s0 - (auto?.potongan || 0), kodeError: 'Voucher ini maks. 1x per orang. Isi nomor WA kamu dulu', hint: '', butuhWa: true };
      if (k === 'HEMAT5') return { subtotal: s0, promo: { id: 'v', nama: 'Voucher 5rb', potongan: 5000, kode: 'HEMAT5' }, total: s0 - 5000, kodeError: '', hint: '', butuhWa: false };
      if (k) return { subtotal: s0, promo: auto, total: s0 - (auto?.potongan || 0), kodeError: 'Kode voucher nggak ditemukan', hint: '', butuhWa: false };
      return { subtotal: s0, promo: auto, total: s0 - (auto?.potongan || 0), kodeError: '', hint: auto ? '' : 'Tambah Rp5.000 lagi biar dapat Diskon 2rb', butuhWa: false };
    };
    if (fn === 'get_table_menu') return json({ aktif: true, bisnis: pub.bisnis, meja: { id: 'm1', nama: 'Meja 1' }, menu: pub.menu, opsi: pub.opsi, promo: [{ nama: 'Diskon 2rb', ket: 'Diskon Rp2.000 min. belanja Rp20.000' }], digital: true });
    if (fn === 'cek_promo_meja') { panggil.push(body); return json(hitung()); }
    if (fn === 'place_table_order') {
      kirim = body;
      const h = hitung();
      const items = body.p_items.map((it) => { const m = pub.menu.find((x) => x.id === it.id); return { id: m.id, nama: m.nama, harga: m.harga, qty: it.qty }; });
      pesanan = { id: '00000000-0000-0000-0000-000000000001', secret: '00000000-0000-0000-0000-000000000002', no: 1, kode: 'AB34', meja: 'Meja 1', nama: body.p_nama, items, subtotal: h.subtotal, promo: h.promo, total: h.total, catatan: '', metode: body.p_metode, bayar_status: 'belum', status: 'baru', dapur: null, created_at: new Date().toISOString() };
      return json(pesanan);
    }
    if (fn === 'get_table_order') return json(pesanan);
    return json(null);
  });
  await c.goto(B + '#/m/tokenmejacontoh123'); await c.waitForSelector('.pm-item', { timeout: 20000 });
  ok((await txt(c, '.pm-promo')).includes('otomatis dihitung waktu kamu checkout'), 'banner promo: potongan dihitung otomatis');
  await c.click('.pm-item:has-text("Air Mineral") [data-action=tambah]');
  await c.click('[data-action=checkout]'); await c.waitForSelector('form[data-form=pesan] button.primary:not([disabled])');
  ok((await txt(c, '.promo-hint')).includes('Tambah Rp5.000'), 'belanja kurang: saran tambah belanja');
  await c.click('[data-action=lebih]'); await c.click('[data-action=lebih]'); await c.click('[data-action=lebih]'); await c.click('[data-action=lebih]'); await c.click('[data-action=lebih]'); await c.click('[data-action=lebih]'); await c.click('[data-action=lebih]');
  await c.waitForSelector('.promo-line');
  const harga = pub.menu.find((m) => m.nama.startsWith('Air Mineral')).harga;
  ok((await txt(c, '.promo-line')).includes('Diskon 2rb') && (await txt(c, '.pos-total')).includes((harga * 8 - 2000).toLocaleString('id-ID')), 'promo otomatis dari server + total');
  // Voucher per orang -> minta nomor WA
  await c.fill('.pos-kode', 'hemat5'); await c.press('.pos-kode', 'Tab'); await c.waitForSelector('[data-change=wa]');
  ok(/Isi nomor WA/.test(await txt(c, 'p.small.neg')), 'voucher per orang: minta nomor WA');
  await c.fill('[data-change=wa]', '0812 3456 7890'); await c.press('[data-change=wa]', 'Tab'); await c.waitForSelector('.promo-line:has-text("HEMAT5")');
  ok((await txt(c, '.pos-total')).includes((harga * 8 - 5000).toLocaleString('id-ID')), 'voucher kepakai, total diperbarui');
  ok(panggil.every((x) => !('p_harga' in x)) && panggil.at(-1).p_wa === '0812 3456 7890', 'cek ke server pakai kode & nomor WA (harga dari server)');
  await c.screenshot({ path: OUT + '/pm2-pelanggan-voucher.png', fullPage: true });
  await c.fill('form[data-form=pesan] input[name=nama]', 'Budi');
  await c.click('form[data-form=pesan] button.primary'); await c.waitForSelector('.pm-status');
  ok(kirim.p_kode === 'HEMAT5' && kirim.p_wa === '0812 3456 7890', 'pesanan dikirim dengan kode voucher & nomor WA');
  ok((await txt(c, '.view')).includes('Voucher 5rb'), 'status pesanan menampilkan potongan promo');
  await c.screenshot({ path: OUT + '/pm3-pelanggan-status.png', fullPage: true });

  // Kode salah: pesanan tetap jalan tanpa voucher (kode nggak dikirim)
  await c.click('[data-action=lagi]');
  await c.click('.pm-item:has-text("Air Mineral") [data-action=tambah]');
  await c.click('[data-action=checkout]'); await c.waitForSelector('form[data-form=pesan] button.primary:not([disabled])');
  await c.fill('.pos-kode', 'NGASAL'); await c.press('.pos-kode', 'Tab'); await c.waitForSelector('p.small.neg');
  ok((await txt(c, 'p.small.neg')).includes('nggak ditemukan'), 'kode salah ditolak server');
  await c.click('form[data-form=pesan] button.primary'); await c.waitForSelector('.pm-status');
  ok(kirim.p_kode === '' && kirim.p_wa === '', 'kode yang nggak kepakai nggak dikirim (pesanan tetap masuk)');
  ok(await c.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'HP: tidak ada scroll ke samping');

  console.log('errors:', [...p.errs, ...c.errs]);
  ok(![...p.errs, ...c.errs].length, 'tanpa error');
  await b.close();
})();
