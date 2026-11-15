// E2E Racikin (rotate.js). Lihat tests/README.md untuk cara menjalankan.
const { chromium } = require('playwright');
const B = (process.env.RACIKIN_URL || 'http://localhost:8766/'), OUT = process.argv[2];
const txt = async (p, sel) => (await p.textContent(sel)).replace(/\s+/g, ' ').trim();
(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 1180, height: 820 } })).newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  p.on('dialog', d => d.accept());
  await p.goto(B); await p.click('[data-action=dummy]'); await p.waitForSelector('.journey');
  await p.goto(B + '#/kasir'); await p.waitForSelector('.pos-split');
  await p.click('.pos-item >> nth=0'); await p.click('.pos-item >> nth=1');
  console.log('landscape: split', !!(await p.$('.pos-split')), '| tombol selesai terlihat', await p.locator('[data-action=selesai]').isVisible(), '| rail kiri', await p.evaluate(() => getComputedStyle(document.querySelector('.tabbar')).flexDirection));
  const box = await p.locator('[data-action=selesai]').boundingBox();
  console.log('tombol selesai di dalam layar:', box.y + box.height <= 820);
  await p.click('[data-action=uang] >> nth=0'); await p.click('[data-action=selesai]'); await p.waitForSelector('.pos-right .struk');
  console.log('struk di panel kanan:', (await txt(p, '.pos-right .struk-head')));
  await p.click('.pos-item >> nth=2');
  console.log('klik menu saat struk -> panel:', (await txt(p, '.pos-right .card-title')).slice(0, 30));
  // Putar ke portrait
  await p.setViewportSize({ width: 820, height: 1180 }); await p.waitForTimeout(300);
  console.log('portrait: split', !!(await p.$('.pos-split')), '| pos-bar', !!(await p.$('.pos-bar')), '| tabbar arah', await p.evaluate(() => getComputedStyle(document.querySelector('.tabbar')).display));
  await p.screenshot({ path: OUT + '/rotate-portrait.png' });
  await p.setViewportSize({ width: 1180, height: 820 }); await p.waitForTimeout(300);
  console.log('balik landscape: split', !!(await p.$('.pos-split')), '| item di keranjang tetap:', await p.$$eval('.pos-line', l => l.length));
  // Laptop lebar: 3 kolom bisnis
  await p.setViewportSize({ width: 1440, height: 900 }); await p.goto(B + '#/bisnis'); await p.waitForTimeout(300);
  console.log('1440 bisnis kolom:', await p.evaluate(() => getComputedStyle(document.querySelector('#view')).columnCount));
  console.log('errors:', errs);
  await b.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
