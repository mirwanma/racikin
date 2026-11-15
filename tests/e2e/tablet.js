// E2E Racikin (tablet.js). Lihat tests/README.md untuk cara menjalankan.
const { chromium } = require('playwright');
const B = (process.env.RACIKIN_URL || 'http://localhost:8766/'), OUT = process.argv[2];
// Klik menu di Kasir; menu dengan varian membuka sheet -> langsung Tambah pakai pilihan default.
const pos = async (p, n) => { await p.click(`.pos-item >> nth=${n}`); if (await p.$('.sheet')) await p.click('.sheet [data-action=pilihTambah]'); };
const W = Number(process.argv[3] || 1180), H = Number(process.argv[4] || 820);
const ROUTES = (process.argv[5] || 'home,kasir,kasir-cart,kasir-rekap,kas,laporan,bisnis,stok,belanja,pelanggan,konten,rab,ide,brand,aktivasi,studio,mentor,shift,setelan,online,resep').split(',');
(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 })).newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
  p.on('dialog', d => d.accept());
  await p.goto(B); await p.waitForSelector('[data-action=dummy]');
  await p.screenshot({ path: `${OUT}/00-onboarding.png` });
  await p.click('[data-action=dummy]'); await p.waitForSelector('.journey');
  for (const r of ROUTES) {
    let hash = r;
    if (r === 'kasir-cart' || r === 'kasir-rekap') hash = 'kasir';
    if (r === 'resep') hash = 'resep?id=' + (await p.evaluate(() => JSON.parse(localStorage.getItem('racikin:v1')).resep[0].id));
    await p.goto(B + '#/' + (hash === 'home' ? '' : hash)); await p.waitForTimeout(500);
    if (r === 'kasir') { const j = await p.$('label:has(input[value=jual])'); if (j) await j.click(); await p.waitForTimeout(200); }
    if (r === 'kasir-cart') {
      const j = await p.$('label:has(input[value=jual])'); if (j) await j.click();
      for (const n of [0, 1, 2]) await pos(p, n);
      await pos(p, 0); await p.waitForTimeout(200);
    }
    if (r === 'kasir-rekap') { await p.click('label:has(input[value=rekap])'); await p.waitForTimeout(200); }
    const over = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    await p.screenshot({ path: `${OUT}/${r}.png`, fullPage: true });
    console.log(r, over ? 'OVERFLOW-X' : 'ok', 'tinggi', await p.evaluate(() => document.documentElement.scrollHeight));
  }
  console.log('errors:', errs);
  await b.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
