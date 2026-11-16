// E2E Racikin (varian.js): varian & topping di Stok, Kasir, struk, rekap, laporan, dan halaman pesan meja.
// Tanpa akun: halaman pelanggan (#/m/<token>) diuji dengan RPC Supabase yang di-mock dari menu publik lokal.
// Validasi & harga di server diuji terpisah lewat SQL (lihat supabase/migrations/*_varian_topping.sql).
const { chromium } = require('playwright');
const B = (process.env.RACIKIN_URL || 'http://localhost:8766/'), OUT = process.argv[2];
const st = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('racikin:v1')));
const txt = async (p, sel) => (await p.textContent(sel)).replace(/\s+/g, ' ').trim();
const ok = (cond, label) => { console.log((cond ? 'OK   ' : 'GAGAL') + ' ' + label); if (!cond) process.exitCode = 1; };
async function mk(b, w, h) {
  const p = await (await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2 })).newPage();
  p.errs = []; p.on('pageerror', e => p.errs.push(e.message)); p.on('console', m => m.type() === 'error' && p.errs.push(m.text()));
  p.on('dialog', d => d.accept());
  return p;
}
const opsiBtn = (p, nama) => p.click(`.sheet .opsi-btn:has-text("${nama}")`);

(async () => {
  const b = await chromium.launch();
  const p = await mk(b, 390, 844);
  await p.goto(B); await p.click('[data-action=dummy]'); await p.waitForSelector('.journey', { timeout: 20000 });
  // Promo contoh (happy hour / weekend) dimatikan supaya total di tes ini tidak tergantung hari & jam.
  await p.evaluate(() => { const x = JSON.parse(localStorage.getItem('racikin:v1')); x.promo = x.promo.map((q) => ({ ...q, aktif: false })); localStorage.setItem('racikin:v1', JSON.stringify(x)); });
  await p.reload(); await p.waitForSelector('.journey');
  let s = await st(p);
  ok(s.opsi.length === 4, `data contoh punya ${s.opsi.length} grup varian`);
  ok(s.orders.some(o => o.items.some(i => i.opsi?.length)), 'order contoh memakai varian');

  // --- Tab Varian di Stok & Resep ---
  await p.goto(B + '#/stok?tab=varian'); await p.waitForSelector('a[href^="#/varian?id="]');
  console.log('tab varian:', (await txt(p, '.view')).slice(0, 160));
  await p.screenshot({ path: OUT + '/v1-stok-varian.png', fullPage: true });

  // Bikin grup baru dari nol: Saus (pilih satu, opsional), dipasang ke Tahu Crispy
  await p.goto(B + '#/varian?id=new'); await p.waitForSelector('[data-f=nama][data-change=field]');
  await p.fill('[data-f=nama][data-change=field]', 'Saus'); await p.press('[data-f=nama][data-change=field]', 'Tab');
  await p.uncheck('input[data-f=wajib]');
  await p.fill('[data-change=pilihan][data-f=nama][data-i="0"]', 'Saus keju'); await p.press('[data-change=pilihan][data-f=nama][data-i="0"]', 'Tab');
  await p.fill('[data-change=pilihan][data-f=harga][data-i="0"]', '2000'); await p.press('[data-change=pilihan][data-f=harga][data-i="0"]', 'Tab');
  await p.click('[data-action=addPBahan][data-i="0"]');
  await p.selectOption('select[data-change=pbahan][data-i="0"][data-j="0"]', { label: 'Keju cheddar (gram)' });
  await p.fill('input[data-change=pbahan][data-i="0"][data-j="0"]', '10'); await p.press('input[data-change=pbahan][data-i="0"][data-j="0"]', 'Tab');
  console.log('hpp pilihan:', await txt(p, '.opsi-edit .row-between.small span'));
  await p.click('[data-action=addPilihan]');
  await p.fill('[data-change=pilihan][data-f=nama][data-i="1"]', 'Sambal bawang'); await p.press('[data-change=pilihan][data-f=nama][data-i="1"]', 'Tab');
  await p.click('label.chip:has-text("Tahu Crispy Sambal Matah")');
  await p.screenshot({ path: OUT + '/v2-editor.png', fullPage: true });
  await p.click('[data-action=save]'); await p.waitForSelector('.seg.seg3');
  s = await st(p);
  const saus = s.opsi.find(g => g.nama === 'Saus');
  const crispy = s.resep.find(r => r.nama === 'Tahu Crispy Sambal Matah');
  ok(saus && saus.pilihan.length === 2 && saus.pilihan[0].harga === 2000 && saus.pilihan[0].items[0].qty === 10, 'grup Saus tersimpan');
  ok(crispy.opsiIds.includes(saus.id) && crispy.opsiIds.length === 2, 'Saus terpasang di Tahu Crispy (setelah Topping)');

  // Resep editor: centang grup tampil & tersimpan ulang tanpa hilang
  await p.goto(B + '#/resep?id=' + crispy.id); await p.waitForSelector('input[data-change=opsi]');
  ok(await p.isChecked(`input[data-change=opsi][value="${saus.id}"]`), 'resep editor: Saus tercentang');
  await p.click('[data-action=save]'); await p.waitForTimeout(400);
  s = await st(p);
  ok(s.resep.find(r => r.id === crispy.id).opsiIds.length === 2, 'simpan resep mempertahankan varian');

  // --- Kasir ---
  await p.goto(B + '#/kasir'); await p.waitForSelector('.pos-grid');
  const cabai0 = s.bahan.find(x => x.nama === 'Cabai rawit').stok;
  const keju0 = s.bahan.find(x => x.nama === 'Keju cheddar').stok;
  const nOrder0 = s.orders.length;
  await p.click('.pos-item:has-text("Tahu Guyur Original")'); await p.waitForSelector('.sheet');
  ok((await txt(p, '.sheet [data-action=pilihTambah]')).includes('12.000'), 'sheet: harga awal 12.000 (Tidak pedas terpilih)');
  await opsiBtn(p, 'Tidak pedas'); // pilih-satu wajib tidak bisa dikosongkan
  ok(await p.getAttribute('.sheet .opsi-btn:has-text("Tidak pedas")', 'aria-pressed') === 'true', 'level wajib tidak bisa dikosongkan');
  await opsiBtn(p, 'Level 5'); await opsiBtn(p, 'Keju'); await opsiBtn(p, 'Telur'); await opsiBtn(p, 'Bakso'); await opsiBtn(p, 'Bawang goreng ekstra');
  console.log('maks 3:', await txt(p, '.sheet .warn-box'));
  await p.screenshot({ path: OUT + '/v3-sheet.png' });
  ok((await txt(p, '.sheet [data-action=pilihTambah]')).includes('24.000'), 'sheet: 12.000 + Lv5 1.000 + keju 3.000 + telur 4.000 + bakso 4.000 = 24.000');
  await opsiBtn(p, 'Bakso');
  await p.click('.sheet [data-action=pilihTambah]');
  await p.click('.pos-item:has-text("Tahu Guyur Original")'); await opsiBtn(p, 'Level 3'); await p.click('.sheet [data-action=pilihTambah]');
  await p.click('.pos-item:has-text("Tahu Guyur Original")'); await opsiBtn(p, 'Level 3'); await p.click('.sheet [data-action=pilihTambah]'); // sama -> qty 2
  await p.click('.pos-item:has-text("Es Teh Manis")'); await opsiBtn(p, 'Jumbo'); await p.click('.sheet [data-action=pilihTambah]');
  await p.click('.pos-item:has-text("Air Mineral")'); // tanpa varian: langsung masuk
  ok(!(await p.$('.sheet')), 'menu tanpa varian langsung masuk keranjang');
  console.log('bar:', await txt(p, '.pos-bar'));
  ok((await txt(p, '.pos-item:has-text("Tahu Guyur Original") .pos-qty')) === '3', 'badge jumlah menu = 3 (dua kombinasi)');
  await p.click('[data-action=checkout]'); await p.waitForSelector('.pos-line');
  const lines = await p.$$eval('.pos-line', ls => ls.map(l => l.textContent.replace(/\s+/g, ' ').trim()));
  console.log('keranjang:', lines);
  ok(lines.length === 4, 'keranjang 4 baris (per kombinasi)');
  await p.screenshot({ path: OUT + '/v4-bayar.png', fullPage: true });
  await p.click('[data-action=uang] >> nth=0'); await p.click('[data-action=selesai]'); await p.waitForSelector('.struk');
  console.log('struk:', await txt(p, '.struk'));
  await p.screenshot({ path: OUT + '/v5-struk.png' });
  s = await st(p);
  const o = s.orders[s.orders.length - 1];
  ok(s.orders.length === nOrder0 + 1 && o.total === 20000 + 2 * 12000 + 7000 + 4000, `total order ${o.total} = 55.000`);
  ok(o.items[0].opsi.map(x => x.nama).join(',') === 'Level 5,Telur,Keju', 'opsi tersimpan urut grup');
  const cabai1 = s.bahan.find(x => x.nama === 'Cabai rawit').stok, keju1 = s.bahan.find(x => x.nama === 'Keju cheddar').stok;
  // resep Original: cabai 3/porsi ×3 + Lv5 15 + Lv3 8×2 = 40
  ok(Math.abs(cabai0 - cabai1 - 40) < 0.01, `stok cabai berkurang ${Math.round((cabai0 - cabai1) * 100) / 100} (harus 40)`);
  ok(Math.abs(keju0 - keju1 - 15) < 0.01, `stok keju berkurang ${keju0 - keju1} (harus 15)`);
  const totalLog = (nama) => { const id = s.bahan.find(x => x.nama === nama).id; return s.stokLog.filter(l => l.bahanId === id).reduce((a, l) => a + l.delta, 0); };
  ok(Math.abs(totalLog('Cabai rawit') - cabai1) < 0.05, 'stok cabai = total stokLog');
  const hari = s.posHarian[o.tanggal];
  const lv5 = s.opsi.find(g => g.nama === 'Level pedas').pilihan.find(x => x.nama === 'Level 5').id;
  ok(hari.opsi[lv5] >= 1, 'rekap harian menghitung pilihan');

  // Online: harga tambahan ikut markup
  await p.click('[data-action=baru]');
  await p.click('label.chip:has(input[name=channel][value=gofood])');
  await p.click('.pos-item:has-text("Tahu Guyur Original")'); await opsiBtn(p, 'Keju');
  const gofood = await txt(p, '.sheet [data-action=pilihTambah]');
  console.log('gofood:', gofood);
  ok(gofood.includes('19.000'), 'GoFood: 15.000 + keju 3.000×1,25 (dibulatkan 4.000) = 19.000');
  await p.click('.sheet [data-action=pilihTutup]');

  // Rekap hari ini
  await p.click('label:has(input[name=tab][value=rekap])'); await p.waitForSelector('.stats3');
  console.log('rekap varian:', (await txt(p, '.view')).match(/Varian & topping hari ini.*?(?=Penjualan kasir|$)/)?.[0]?.slice(0, 200));
  await p.screenshot({ path: OUT + '/v6-rekap.png', fullPage: true });

  // Batal order -> stok kembali
  await p.click(`[data-action=order][data-id="${o.id}"]`); await p.click(`[data-action=batal][data-id="${o.id}"]`); await p.waitForTimeout(300);
  s = await st(p);
  ok(Math.abs(s.bahan.find(x => x.nama === 'Cabai rawit').stok - cabai0) < 0.01, 'batal: stok cabai kembali');

  // Laporan
  await p.goto(B + '#/laporan'); await p.waitForSelector('.lr-table');
  console.log('laporan varian:', (await txt(p, '.view')).match(/Varian & topping terlaris.*?(?=Perkiraan)/)?.[0]?.slice(0, 200));

  // Dapur: tiket memuat pilihan (fungsi murni lewat import di halaman)
  const tiket = await p.evaluate(async (id) => { const { tiketDari } = await import('./js/dapur.js'); const s = JSON.parse(localStorage.getItem('racikin:v1')); return tiketDari(s.orders.find(o => o.id === id)).data.items; }, o.id);
  ok(tiket[0].opsi === 'Level 5, Telur, Keju', 'tiket dapur: ' + tiket[0].opsi);

  // --- Halaman pelanggan (QR meja) dengan RPC mock ---
  const pub = await p.evaluate(async () => { const { menuPublik } = await import('./js/meja.js'); return menuPublik({ ...JSON.parse(localStorage.getItem('racikin:v1')), posSetting: { pesanMeja: true } }); });
  ok(pub.opsi.length === 5 && !JSON.stringify(pub).includes('bahanId'), 'menu publik: 5 grup, tanpa bahan');
  const c = await mk(b, 390, 844);
  let kirim = null, pesanan = null;
  await c.route('**/rest/v1/rpc/**', async (route) => {
    const fn = route.request().url().split('/rpc/')[1].split('?')[0];
    const body = JSON.parse(route.request().postData() || '{}');
    const json = (x) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(x) });
    if (fn === 'get_table_menu') return json({ aktif: true, bisnis: pub.bisnis, warna: pub.warna, lokasi: pub.lokasi, meja: { id: 'm1', nama: 'Meja 1' }, menu: pub.menu, opsi: pub.opsi, digital: true });
    if (fn === 'place_table_order') {
      kirim = body.p_items;
      const items = body.p_items.map((it) => {
        const m = pub.menu.find(x => x.id === it.id);
        const opsi = (it.opsi || []).map(id => { for (const g of pub.opsi) { const q = g.pilihan.find(x => x.id === id); if (q) return { g: g.id, id, nama: q.nama, harga: q.harga }; } });
        return { id: m.id, nama: m.nama, harga: m.harga + opsi.reduce((a, x) => a + x.harga, 0), qty: it.qty, ...(opsi.length ? { opsi } : {}) };
      });
      pesanan = { id: '00000000-0000-0000-0000-000000000001', secret: '00000000-0000-0000-0000-000000000002', no: 1, kode: 'AB34', meja: 'Meja 1', nama: body.p_nama, items, total: items.reduce((a, x) => a + x.harga * x.qty, 0), catatan: body.p_catatan, metode: body.p_metode, bayar_status: 'belum', status: 'baru', dapur: null, created_at: new Date().toISOString() };
      return json(pesanan);
    }
    if (fn === 'get_table_order') return json(pesanan);
    return json(null);
  });
  await c.goto(B + '#/m/tokenmejacontoh123'); await c.waitForSelector('.pm-item', { timeout: 20000 });
  await c.click('.pm-item:has-text("Tahu Guyur Komplit") [data-action=pilih]'); await c.waitForSelector('.sheet');
  await c.screenshot({ path: OUT + '/v7-pelanggan-sheet.png' });
  await c.click('.sheet .opsi-btn:has-text("Level 3")');
  await c.click('.sheet [data-action=pilihTambah]');
  await c.click('.pm-item:has-text("Air Mineral") [data-action=tambah]');
  await c.click('[data-action=checkout]'); await c.waitForSelector('form[data-form=pesan]');
  console.log('checkout pelanggan:', await txt(c, 'section.card'));
  await c.fill('form[data-form=pesan] input[name=nama]', 'Budi');
  await c.click('form[data-form=pesan] button.primary'); await c.waitForSelector('.pm-status');
  console.log('dikirim:', JSON.stringify(kirim));
  ok(kirim[0].opsi?.length === 1 && !('opsi' in kirim[1]), 'pelanggan kirim id pilihan (tanpa harga)');
  console.log('status:', (await txt(c, '.view')).slice(0, 220));
  await c.screenshot({ path: OUT + '/v8-pelanggan-status.png', fullPage: true });

  // Kasir menerima pesanan meja dengan varian -> keranjang memuat opsi
  const terima = await p.evaluate(async (o) => {
    const { kunciItem } = await import('./js/varian.js');
    return o.items.map(x => kunciItem(x.id, x.opsi));
  }, pesanan);
  ok(terima[0].includes('|'), 'kunci keranjang pesanan meja memuat pilihan');

  // Tablet: sheet di tengah layar
  const t = await mk(b, 1180, 820);
  await t.goto(B); await t.click('[data-action=dummy]'); await t.waitForSelector('.journey', { timeout: 20000 });
  await t.goto(B + '#/kasir'); await t.waitForSelector('.pos-grid');
  await t.click('.pos-item:has-text("Tahu Guyur Telur")'); await t.waitForSelector('.sheet');
  await t.screenshot({ path: OUT + '/v9-tablet-sheet.png' });

  console.log('errors:', [...p.errs, ...c.errs.filter(e => !/Failed to load resource/.test(e)), ...t.errs]);
  await b.close();
})();
