// E2E Racikin (online.js). Lihat tests/README.md untuk cara menjalankan.
const { chromium } = require('playwright');
const B = (process.env.RACIKIN_URL || 'http://localhost:8766/'), OUT = process.argv[2];
// Klik menu di Kasir; menu dengan varian membuka sheet -> langsung Tambah pakai pilihan default.
const pos = async (p, n) => { await p.click(`.pos-item >> nth=${n}`); if (await p.$('.sheet')) await p.click('.sheet [data-action=pilihTambah]'); };
const st = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('racikin:v1')));
const txt = async (p, sel) => (await p.textContent(sel)).replace(/\s+/g, ' ').trim();
(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })).newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
  p.on('dialog', d => d.accept());
  await p.goto(B); await p.click('[data-action=sample]'); await p.waitForSelector('.journey');
  await p.goto(B + '#/resep?id=new');
  await p.fill('[data-f=nama][data-change=field]', 'Tahu Guyur Original'); await p.press('[data-f=nama][data-change=field]', 'Tab');
  await p.fill('[data-f=harga][data-change=field]', '12000'); await p.press('[data-f=harga][data-change=field]', 'Tab');
  await p.click('[data-action=aiFill]'); await p.waitForSelector('.resep-row .new-price'); await p.click('[data-action=save]');
  await p.waitForSelector('form[data-form=bulk]'); for (const i of await p.$$('form[data-form=bulk] input')) await i.fill('1000'); await p.click('form[data-form=bulk] button.primary');
  // Kasir tanpa saluran -> link atur
  await p.goto(B + '#/kasir'); await p.waitForSelector('.pos-grid');
  console.log('kasir tanpa online:', await txt(p, '.pos-online-link'));
  // Harga online
  await p.click('.pos-online-link a'); await p.waitForSelector('.ch-card');
  await p.check('input[data-change=aktif][data-ch=gofood]');
  console.log('gofood default:', await p.inputValue('input[data-change=komisi][data-ch=gofood]'), '% komisi, markup', await p.inputValue('input[data-change=markup][data-ch=gofood]'));
  await p.check('input[data-change=aktif][data-ch=grabfood]');
  await p.fill('input[data-change=komisi][data-ch=grabfood]', '25'); await p.press('input[data-change=komisi][data-ch=grabfood]', 'Tab');
  await p.fill('input[data-change=markup][data-ch=grabfood]', '10'); await p.press('input[data-change=markup][data-ch=grabfood]', 'Tab');
  console.log('grab saran:', await txt(p, '[data-action=saran][data-ch=grabfood]'));
  console.log('tabel:', (await txt(p, '.om-menu')).slice(0, 200));
  console.log('warna grab (markup 10%):', await p.getAttribute('.om-row:nth-child(4) b', 'class'));
  await p.screenshot({ path: OUT + '/1-online.png', fullPage: true });
  await p.click('[data-action=saran][data-ch=grabfood]');
  // override manual gofood 16000
  await p.fill('input[data-change=harga][data-ch=gofood]', '16000'); await p.press('input[data-change=harga][data-ch=gofood]', 'Tab');
  console.log('setelah saran & override:', (await txt(p, '.om-menu')).slice(0, 220));
  // Kasir
  await p.goto(B + '#/kasir'); await p.waitForSelector('.pos-channels');
  console.log('chips:', await p.$$eval('.pos-channels .chip span', s => s.map(x => x.textContent).join(' | ')));
  await p.click('label:has(input[name=channel][value=gofood])');
  console.log('harga gofood di grid:', await txt(p, '.pos-item .pos-price'));
  await pos(p, 0); await pos(p, 0);
  await p.click('label:has(input[name=channel][value=toko])');
  console.log('ganti ke toko -> bar:', await txt(p, '.pos-bar div'));
  await p.click('label:has(input[name=channel][value=gofood])');
  console.log('balik gofood -> bar:', await txt(p, '.pos-bar div'));
  await p.click('[data-action=checkout]'); await p.waitForSelector('.pos-line');
  console.log('bayar online:', await txt(p, '.card:has(h2:text("Pesanan GoFood")) >> nth=1'));
  await p.screenshot({ path: OUT + '/2-bayar-online.png', fullPage: true });
  await p.click('[data-action=selesai]'); await p.waitForSelector('.struk');
  console.log('struk:', await txt(p, '.struk'));
  await p.screenshot({ path: OUT + '/3-struk-online.png' });
  // order toko tunai
  await p.click('[data-action=baru]'); await p.click('label:has(input[name=channel][value=toko])'); await pos(p, 0);
  await p.click('[data-action=checkout]'); await p.click('[data-action=uang] >> nth=0'); await p.click('[data-action=selesai]'); await p.waitForSelector('.struk');
  // rekap & kas
  await p.click('label:has(input[value=rekap])'); await p.waitForSelector('.pos-order');
  console.log('rekap:', await txt(p, '.stats3 >> nth=0'), '|', await txt(p, '.stats3 >> nth=1'));
  await p.screenshot({ path: OUT + '/4-rekap.png', fullPage: true });
  const s = await st(p);
  console.log('kas:', s.transactions.filter(t => t.ref === 'pos').map(t => `${t.jenis} ${t.kategori} ${t.nominal}`).join(' | '));
  await p.goto(B + '#/kas'); await p.waitForSelector('.tx');
  console.log('kas bulan ini:', await txt(p, '.stats3'), '| kategori keluar:', await txt(p, '.cat'));
  console.log('errors:', errs);
  await b.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
