// E2E Racikin (kasir.js). Lihat tests/README.md untuk cara menjalankan.
const { chromium } = require('playwright');
const B = (process.env.RACIKIN_URL || 'http://localhost:8766/'), OUT = process.argv[2];
const st = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('racikin:v1')));
const txt = async (p, sel) => (await p.textContent(sel)).replace(/\s+/g, ' ').trim();
(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })).newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
  p.on('dialog', d => d.accept());
  await p.goto(B); await p.click('[data-action=sample]'); await p.waitForSelector('.journey');
  console.log('tabbar:', await p.$$eval('.tabbar a', a => a.map(x => x.textContent.trim()).join(' | ')));
  // kasir kosong
  await p.click('.tabbar a[data-tab=kasir]'); await p.waitForSelector('.empty');
  console.log('kasir tanpa menu:', await txt(p, '.empty h3'));
  // 2 resep (demo AI) + isi stok sekaligus
  const mkResep = async (nama, harga) => {
    await p.goto(B + '#/resep?id=new');
    await p.fill('[data-f=nama][data-change=field]', nama); await p.press('[data-f=nama][data-change=field]', 'Tab');
    await p.fill('[data-f=harga][data-change=field]', String(harga)); await p.press('[data-f=harga][data-change=field]', 'Tab');
    await p.click('[data-action=aiFill]'); await p.waitForSelector('.resep-row .new-price, .resep-row .row-hint'); await p.click('[data-action=save]'); await p.waitForTimeout(300);
  };
  await mkResep('Tahu Guyur Original', 12000);
  await p.waitForSelector('form[data-form=bulk]');
  for (const inp of await p.$$('form[data-form=bulk] input')) await inp.fill('1000');
  await p.click('form[data-form=bulk] button.primary');
  await mkResep('Tahu Guyur Pedas Nampol', 14000);
  // loyalty + pelanggan
  await p.goto(B + '#/pelanggan'); await p.fill('form[data-form=program] input[name=minBelanja]', '20000'); await p.click('form[data-form=program] button.primary');
  await p.evaluate(() => { document.querySelector('details:has(form[data-form=add])').open = true; });
  await p.fill('form[data-form=add] input[name=nama]', 'Sinta'); await p.fill('form[data-form=add] input[name=wa]', '081299998888');
  await p.uncheck('form[data-form=add] input[name=stempel]'); await p.click('form[data-form=add] button.primary');
  let s = await st(p); const tahuStok0 = s.bahan.find(x => x.nama === 'Tahu putih').stok;

  // ORDER 1: 2x Original + 1x Pedas + es teh, diskon 1000, pelanggan Sinta, tunai uang 50rb
  await p.click('.tabbar a[data-tab=kasir]'); await p.waitForSelector('.pos-grid');
  const items = await p.$$('.pos-item');
  await items[0].click(); await p.click('.pos-item >> nth=0'); await p.click('.pos-item >> nth=1');
  await p.click('details:has(form[data-form=custom]) summary');
  await p.fill('form[data-form=custom] input[name=nama]', 'Es teh'); await p.fill('form[data-form=custom] input[name=harga]', '4000'); await p.click('form[data-form=custom] button');
  console.log('bar:', await txt(p, '.pos-bar'));
  await p.screenshot({ path: OUT + '/1-menu.png' });
  await p.click('[data-action=checkout]'); await p.waitForSelector('.pos-line');
  await p.fill('.pos-diskon', '1000'); await p.press('.pos-diskon', 'Tab');
  await p.selectOption('select[data-change=pelanggan]', { label: 'Sinta · 0/5' });
  console.log('tombol uang:', await p.$$eval('[data-action=uang]', bs => bs.map(x => x.textContent).join(', ')));
  await p.click('[data-action=uang] >> nth=2');
  console.log('kembalian:', await txt(p, '.pos-total >> nth=1'));
  await p.screenshot({ path: OUT + '/2-bayar.png', fullPage: true });
  await p.click('[data-action=selesai]'); await p.waitForSelector('.struk');
  console.log('struk:', await txt(p, '.struk'));
  console.log('WA struk:', decodeURIComponent(await p.getAttribute('.struk + .row2 a', 'href')).slice(0, 120));
  await p.screenshot({ path: OUT + '/3-struk.png' });
  // ORDER 2: 1x Original QRIS
  await p.click('[data-action=baru]'); await p.click('.pos-item >> nth=0'); await p.click('[data-action=checkout]');
  await p.click('label:has(input[name=metode][value=qris])'); await p.click('[data-action=selesai]'); await p.waitForSelector('.struk');
  // ORDER 3: tunai, uang kurang -> tombol nonaktif
  await p.click('[data-action=baru]'); await p.click('.pos-item >> nth=1'); await p.click('[data-action=checkout]');
  await p.fill('input[data-change=bayar]', '10000'); await p.press('input[data-change=bayar]', 'Tab');
  console.log('uang kurang -> tombol disabled:', await p.isDisabled('[data-action=selesai]'));
  await p.click('[data-action=uang] >> nth=0'); await p.click('[data-action=selesai]'); await p.waitForSelector('.struk');

  s = await st(p);
  console.log('kas kasir:', s.transactions.filter(t => t.ref === 'pos').map(t => `${t.catatan} = ${t.nominal}`).join(' | '));
  console.log('tahu putih stok:', tahuStok0, '->', s.bahan.find(x => x.nama === 'Tahu putih').stok, '| Sinta stempel:', s.pelanggan[0].stempel);
  // Rekap
  await p.click('label:has(input[value=rekap])'); await p.waitForSelector('.pos-order');
  console.log('rekap:', await txt(p, '.stats3'), '|', await txt(p, '.card:has(h2:text("Per metode"))'));
  await p.screenshot({ path: OUT + '/4-rekap.png', fullPage: true });
  // Batalkan order #1
  await p.click('.pos-order-head:has-text("#1")'); await p.click('[data-action=batal]');
  s = await st(p);
  console.log('batal #1 -> kas:', s.transactions.filter(t => t.ref === 'pos').map(t => `${t.catatan} = ${t.nominal}`).join(' | '), '| tahu', s.bahan.find(x => x.nama === 'Tahu putih').stok, '| Sinta', s.pelanggan[0].stempel);
  // Kas page
  await p.goto(B + '#/kas'); await p.waitForSelector('.tx');
  console.log('kas page tag Kasir:', await p.$$eval('.tx a.tag', a => a.length), '| masuk bulan ini:', await txt(p, '.stats3 > div'));
  await p.screenshot({ path: OUT + '/5-kas.png', fullPage: true });
  console.log('errors:', errs);
  await b.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
