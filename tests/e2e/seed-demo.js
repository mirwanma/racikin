// E2E Racikin (seed-demo.js). Lihat tests/README.md untuk cara menjalankan.
const { chromium } = require('playwright');
const B = (process.env.RACIKIN_URL || 'http://localhost:8766/'), PW = process.env.RACIKIN_DEMO_PASSWORD;
const txt = async (p, sel) => (await p.textContent(sel)).replace(/\s+/g, ' ').trim();
const st = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('racikin:v1')));
const log = (...a) => console.log(...a);
async function masuk(b, email, w = 390, h = 844) {
  const p = await (await b.newContext({ viewport: { width: w, height: h } })).newPage();
  p.errs = [];
  p.on('pageerror', (e) => p.errs.push(email + ': ' + e.message));
  p.on('dialog', (d) => d.accept());
  await p.goto(B + '#/akun'); await p.waitForSelector('form[data-form=auth]');
  await p.fill('input[name=email]', email); await p.fill('input[name=password]', PW);
  await p.click('form[data-form=auth] button.primary'); await p.waitForTimeout(3000);
  return p;
}
async function synced(p) {
  await p.goto(B + '#/akun'); await p.waitForSelector('.sync-box.synced', { timeout: 90000 });
}
(async () => {
  const b = await chromium.launch();
  // 1) Pemilik: muat data contoh (order & shift atas nama anggota tim), aktifkan dapur & meja
  const own = await masuk(b, 'pemilik.tahguy@racikin.test', 1180, 820);
  await synced(own);
  await own.goto(B + '#/setelan'); await own.waitForSelector('[data-action=dummy]');
  await own.click('[data-action=dummy]'); await own.waitForSelector('.journey', { timeout: 30000 });
  await own.waitForTimeout(2500); await synced(own);
  let s = await st(own);
  const per = {};
  for (const o of s.orders) per[o.kasir?.nama || '-'] = (per[o.kasir?.nama || '-'] || 0) + 1;
  log('pemilik: menu', s.resep.length, '| order 30 hari per kasir', JSON.stringify(per), '| shift', s.shifts.length);
  await own.goto(B + '#/dapur'); await own.click('[data-action=aktifkan]'); await own.waitForSelector('.kds');
  await own.goto(B + '#/meja'); await own.waitForSelector('input[data-change=aktif]');
  await own.check('input[data-change=aktif]'); await own.waitForTimeout(3000);
  await synced(own); await own.click('[data-action=sync]'); await own.waitForTimeout(2000);
  s = await st(own);
  log('mode dapur', s.posSetting.dapur, '| pesan meja', s.posSetting.pesanMeja, '| meja', s.meja.length, '| QR Meja 1:', B.replace((process.env.RACIKIN_URL || 'http://localhost:8766/'), 'https://racikin.vercel.app/') + '#/m/' + s.meja[0].token);

  // 2) Kasir Rina
  const kas = await masuk(b, 'kasir.tahguy@racikin.test');
  await kas.waitForSelector('.pos-grid', { timeout: 30000 });
  const ks = await st(kas);
  log('kasir: role', await kas.getAttribute('body', 'data-role'), '| order', ks.orders.length, '| order milik Rina', ks.orders.filter((o) => o.kasir?.nama === 'Rina').length, '| transaksi', ks.transactions.length);
  // 3) Manajer Dodi
  const mgr = await masuk(b, 'manajer.tahguy@racikin.test');
  await mgr.waitForSelector('.journey', { timeout: 30000 });
  log('manajer: role', await mgr.getAttribute('body', 'data-role'), '| transaksi', (await st(mgr)).transactions.length);
  // 4) Dapur Sari
  const dap = await masuk(b, 'dapur.tahguy@racikin.test', 1180, 820);
  await dap.waitForSelector('.kds', { timeout: 30000 });
  log('dapur: role', await dap.getAttribute('body', 'data-role'), '|', (await txt(dap, '.page-head h1')));
  log('errors:', [...own.errs, ...kas.errs, ...mgr.errs, ...dap.errs]);
  await b.close();
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
