// E2E Racikin (studio.js). Lihat tests/README.md untuk cara menjalankan.
const { chromium } = require('playwright');
const fs = require('fs');
const B = (process.env.RACIKIN_URL || 'http://localhost:8766/'), OUT = process.argv[2];
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, acceptDownloads: true });
  const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text())); p.on('dialog', d => d.dismiss());
  await p.goto(B); await p.click('[data-action=sample]'); await p.waitForSelector('.journey');
  // resep supaya menu & harga ada
  await p.goto(B + '#/resep?id=new');
  await p.fill('[data-f=nama][data-change=field]', 'Tahu Guyur Original'); await p.press('[data-f=nama][data-change=field]', 'Tab');
  await p.fill('[data-f=harga][data-change=field]', '12000'); await p.press('[data-f=harga][data-change=field]', 'Tab');
  await p.click('[data-action=aiFill]'); await p.waitForSelector('.resep-row .new-price'); await p.click('[data-action=save]'); await p.waitForTimeout(300);
  // studio tanpa brand -> ajakan
  await p.goto(B + '#/studio'); await p.waitForSelector('.empty');
  console.log('tanpa brand:', (await p.textContent('.empty h3')).trim());
  // brand kit
  await p.goto(B + '#/brand'); await p.click('[data-action=gen]'); await p.waitForSelector('.studio-cta');
  await p.click('.studio-cta'); await p.waitForSelector('.asset');
  console.log('aset:', await p.$$eval('.asset h3', h => h.map(x => x.textContent).join(' | ')));
  // AI copy (demo)
  await p.click('[data-action=aiCopy]'); await p.waitForFunction(() => document.querySelector('#toast').textContent.includes('AI'));
  const st = await p.evaluate(() => JSON.parse(localStorage.getItem('racikin:v1')).studio);
  console.log('teks AI:', JSON.stringify(st));
  // kontak manual
  await p.evaluate(() => { const d = document.querySelector('details:has(form[data-form=copy])'); d.open = true; });
  await p.fill('form[data-form=copy] input[name=wa]', '0812-3456-7890'); await p.fill('form[data-form=copy] input[name=ig]', 'tahguy.id'); await p.fill('form[data-form=copy] input[name=jam]', '14.00–22.00');
  await p.click('form[data-form=copy] button.primary'); await p.waitForTimeout(400);
  // fonts
  await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(1500);
  console.log('font brand:', await p.evaluate(() => JSON.parse(localStorage.getItem('racikin:v1')).brand.font), '| loaded:', await p.evaluate(() => [...document.fonts].filter(f => f.status === 'loaded').map(f => f.family).filter((v, i, a) => a.indexOf(v) === i).join(',')));
  await p.screenshot({ path: OUT + '/studio-top.png' });
  // ganti logo
  for (const id of ['wordmark', 'stamp', 'monogram', 'badge']) { await p.click(`[data-action=logo][data-id=${id}]`); }
  // screenshot tiap aset (elemen)
  const ids = await p.$$eval('[data-action=png]', bs => bs.map(x => x.dataset.id));
  for (const id of ids) {
    const el = await p.$(`.asset:has([data-id="${id}"]) .asset-art`);
    await el.screenshot({ path: `${OUT}/asset-${id}.png` });
  }
  // unduh PNG & SVG beberapa aset
  for (const id of ['logo', 'spanduk', 'poster', 'stiker']) {
    const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 60000 }), p.click(`[data-action=png][data-id=${id}]`)]);
    const f = `${OUT}/dl-${dl.suggestedFilename()}`; await dl.saveAs(f);
    console.log('PNG', dl.suggestedFilename(), Math.round(fs.statSync(f).size / 1024) + 'KB');
  }
  const [dls] = await Promise.all([p.waitForEvent('download'), p.click('[data-action=svg][data-id=booth]')]);
  const fs2 = `${OUT}/dl-${dls.suggestedFilename()}`; await dls.saveAs(fs2);
  const svgText = fs.readFileSync(fs2, 'utf8');
  console.log('SVG', dls.suggestedFilename(), Math.round(svgText.length / 1024) + 'KB', '| font embedded:', /@font-face/.test(svgText) && /data:font|data:application/.test(svgText));
  console.log('errors:', errs);
  await b.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
