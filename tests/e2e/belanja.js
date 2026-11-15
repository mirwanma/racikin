// E2E Racikin (belanja.js). Lihat tests/README.md untuk cara menjalankan.
const { chromium } = require('playwright');
const B = (process.env.RACIKIN_URL || 'http://localhost:8766/'), OUT = process.argv[2];
const txt = async (p, sel) => (await p.textContent(sel)).replace(/\s+/g, ' ').trim();
const st = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('racikin:v1')));
(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })).newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
  p.on('dialog', d => d.accept());
  await p.goto(B); await p.click('[data-action=dummy]'); await p.waitForSelector('.journey');
  let s = await st(p);
  console.log('supplier:', s.supplier.length, '| bahan ber-supplier:', s.bahan.filter(x => x.supplierId).length, '| beli ber-harga:', s.stokLog.filter(l => l.alasan === 'beli' && l.harga).length);
  // dari Stok
  await p.goto(B + '#/stok?tab=bahan'); await p.waitForSelector('.bahan');
  await p.click('a[href="#/belanja"] >> nth=0'); await p.waitForSelector('.bl-row');
  console.log('grup:', await p.$$eval('section.card h2.card-title', h => h.map(x => x.textContent).join(' | ')));
  console.log('total:', await txt(p, '.bl-total'));
  await p.screenshot({ path: OUT + '/1-daftar.png', fullPage: true });
  await p.click('[data-action=hari][data-h="7"]'); await p.waitForTimeout(150);
  console.log('7 hari total:', await txt(p, '.bl-total'));
  // grup pertama: WA link
  const wa = await p.getAttribute('.bl-actions a >> nth=0', 'href');
  console.log('WA:', decodeURIComponent(wa).slice(0, 170));
  // ubah qty & uncheck satu item di grup pertama
  const firstId = await p.getAttribute('.bl-row input[data-change=qty] >> nth=0', 'data-id');
  await p.fill(`input[data-change=qty][data-id="${firstId}"]`, '999'); await p.press(`input[data-change=qty][data-id="${firstId}"]`, 'Tab');
  const secondId = await p.getAttribute('.bl-row input[data-change=ikut] >> nth=1', 'data-id');
  await p.uncheck(`input[data-change=ikut][data-id="${secondId}"]`);
  // catat belanja grup pertama
  s = await st(p);
  const before = Object.fromEntries(s.bahan.map(x => [x.id, x]));
  const txBefore = s.transactions.length;
  await p.click('[data-action=catat] >> nth=0'); await p.waitForSelector('form[data-form=catat]');
  const inputs = await p.$$eval('form[data-form=catat] input[name^="q-"]', a => a.map(x => [x.name.slice(2), x.value]));
  console.log('form catat items:', inputs.length, '| item 1 qty:', inputs[0][1], '| item ke-2 ikut?', inputs.some(([id]) => id === secondId));
  await p.fill(`input[name="t-${firstId}"]`, String(999 * 700)); // harga baru 700/satuan
  await p.click('form[data-form=catat] button.primary'); await p.waitForTimeout(300); console.log('toast setelah simpan:', await p.textContent('#toast'));
  s = await st(p);
  const bf = s.bahan.find(x => x.id === firstId);
  console.log(`bahan ${bf.nama}: stok ${before[firstId].stok} -> ${bf.stok}, harga ${before[firstId].harga} -> ${bf.harga}`);
  console.log('kas baru:', s.transactions.slice(txBefore).map(t => `${t.kategori} ${t.nominal} ${t.catatan}`));
  console.log('riwayat terakhir:', JSON.stringify(s.stokLog.filter(l => l.bahanId === firstId && l.alasan === 'beli').slice(-1)[0]));
  // Supplier tab
  await p.click('label:has(input[value=supplier])'); await p.waitForSelector('[data-action=editSup]');
  console.log('supplier 1:', (await txt(p, 'section.card >> nth=0')).slice(0, 160));
  await p.click('details:has(form[data-form=sup]) summary');
  await p.fill('details form[data-form=sup] input[name=nama]', 'Toko Keju Murah'); await p.fill('details form[data-form=sup] input[name=wa]', '0812-0000-0199');
  const kejuId = s.bahan.find(x => /Keju/.test(x.nama)).id;
  await p.click(`details form[data-form=sup] label:has(input[name=bahan][value="${kejuId}"])`, { force: true });
  await p.click('details form[data-form=sup] button.primary'); await p.waitForTimeout(200);
  s = await st(p);
  const tk = s.supplier.find(x => x.nama === 'Toko Keju Murah');
  console.log('supplier baru:', tk.wa, '| keju pindah supplier:', s.bahan.find(x => x.id === kejuId).supplierId === tk.id);
  await p.screenshot({ path: OUT + '/2-supplier.png', fullPage: true });
  // Harga tab
  await p.click('label:has(input[value=harga])'); await p.waitForSelector('.bl-harga');
  console.log('harga naik:', (await txt(p, '.warn-card')).slice(0, 300));
  await p.click('.warn-card [data-action=openHarga] >> nth=0'); await p.waitForTimeout(150);
  console.log('riwayat:', (await txt(p, '.warn-card .lr-table')).slice(0, 200));
  await p.screenshot({ path: OUT + '/3-harga.png', fullPage: true });
  // Form beli di Stok punya pilihan supplier
  await p.goto(B + '#/stok?tab=bahan'); await p.waitForSelector('.bahan');
  await p.click('[data-action=open][data-type=beli] >> nth=0'); await p.waitForSelector('form[data-form=beli]');
  console.log('stok beli: select supplier ada:', !!(await p.$('form[data-form=beli] select[name=supplier]')));
  await p.fill('form[data-form=beli] input[name=qty]', '10'); await p.fill('form[data-form=beli] input[name=total]', '20000');
  await p.selectOption('form[data-form=beli] select[name=supplier]', { index: 1 });
  await p.click('form[data-form=beli] button.primary'); await p.waitForTimeout(200);
  s = await st(p);
  console.log('stok beli tercatat:', JSON.stringify(s.stokLog[s.stokLog.length - 1]));
  console.log('errors:', errs);
  await b.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
