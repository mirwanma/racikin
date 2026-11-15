// E2E Racikin (dapur.js). Lihat tests/README.md untuk cara menjalankan.
const { chromium } = require('playwright');
const B = (process.env.RACIKIN_URL || 'http://localhost:8766/'), OUT = process.argv[2];
const PW = process.env.RACIKIN_TEST_PASSWORD;
const txt = async (p, sel) => (await p.textContent(sel)).replace(/\s+/g, ' ').trim();
const st = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('racikin:v1')));
const log = (...a) => console.log(...a);
async function mk(b, name, w = 390, h = 844) {
  const p = await (await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 })).newPage();
  p.errs = [];
  p.on('pageerror', (e) => p.errs.push(name + ': ' + e.message));
  p.on('console', (m) => m.type() === 'error' && !/403|Forbidden/.test(m.text()) && p.errs.push(name + ': ' + m.text()));
  p.on('dialog', (d) => d.accept());
  return p;
}
async function login(p, email) {
  await p.goto(B + '#/akun'); await p.waitForSelector('form[data-form=auth]');
  await p.fill('form[data-form=auth] input[name=email]', email);
  await p.fill('form[data-form=auth] input[name=password]', PW);
  await p.click('form[data-form=auth] button.primary');
}
async function synced(p) {
  await p.goto(B + '#/akun'); await p.waitForSelector('.sync-box.synced', { timeout: 30000 });
}
(async () => {
  const b = await chromium.launch();
  const kasir = await mk(b, 'kasir');
  const dapur = await mk(b, 'dapur', 1180, 820);

  // Pemilik: data contoh + login
  await kasir.goto(B); await kasir.click('[data-action=dummy]'); await kasir.waitForSelector('.journey');
  await login(kasir, 'racikin-tim-owner@racikin.test'); await kasir.waitForTimeout(2000); await synced(kasir);
  // Aktifkan mode dapur
  await kasir.goto(B + '#/dapur'); await kasir.waitForSelector('[data-action=aktifkan]');
  await kasir.screenshot({ path: OUT + '/1-aktifkan.png', fullPage: true });
  await kasir.click('[data-action=aktifkan]'); await kasir.waitForSelector('.kds');
  log('mode dapur aktif:', (await st(kasir)).posSetting);
  // Undang akun dapur
  await kasir.goto(B + '#/tim'); await kasir.waitForSelector('form[data-form=undang]');
  await kasir.fill('form[data-form=undang] input[name=nama]', 'Sari Dapur');
  await kasir.check('form[data-form=undang] input[value=dapur]');
  await kasir.click('form[data-form=undang] button.primary'); await kasir.waitForSelector('.invite-code');
  const code = (await kasir.textContent('.invite-code')).trim();
  await synced(kasir); await kasir.click('[data-action=sync]'); await kasir.waitForTimeout(1500);

  // Akun dapur bergabung
  await dapur.goto(B + '#/gabung?kode=' + code); await dapur.waitForSelector('.empty h3');
  await login(dapur, 'racikin-tim-kasir@racikin.test');
  await dapur.waitForSelector('form[data-form=gabung]', { timeout: 20000 });
  await dapur.click('form[data-form=gabung] button.primary');
  await dapur.waitForSelector('.kds', { timeout: 25000 });
  log('dapur: role', await dapur.getAttribute('body', 'data-role'), '| tab:', await dapur.$$eval('.tabbar a', (as) => as.filter((a) => getComputedStyle(a).display !== 'none').map((a) => a.textContent.trim()).join(' | ')));
  const ds = await st(dapur);
  log('dapur data: profile', ds.profile?.nama, '| transaksi', ds.transactions.length, '| order', ds.orders.length, '| resep', ds.resep.length, '| pelanggan', ds.pelanggan.length);
  await dapur.goto(B + '#/kas'); await dapur.waitForTimeout(400);
  log('dapur buka #/kas ->', await dapur.evaluate(() => location.hash));
  await dapur.waitForSelector('.kds');

  // Kasir: pesanan dengan nama & catatan
  await kasir.goto(B + '#/kasir'); await kasir.waitForSelector('.pos-grid');
  await kasir.click('.pos-item >> nth=0'); await kasir.click('.pos-item >> nth=0'); await kasir.click('.pos-item >> nth=11');
  await kasir.click('[data-action=checkout]'); await kasir.waitForSelector('.dapur-form');
  await kasir.fill('input[data-change=atasNama]', 'Budi meja 3'); await kasir.press('input[data-change=atasNama]', 'Tab');
  await kasir.fill('input[data-change=catatanDapur]', 'pedas level 3, tanpa daun bawang'); await kasir.press('input[data-change=catatanDapur]', 'Tab');
  await kasir.screenshot({ path: OUT + '/2-kasir-bayar.png', fullPage: true });
  await kasir.click('[data-action=uang] >> nth=0');
  const t0 = Date.now();
  await kasir.click('[data-action=selesai]'); await kasir.waitForSelector('.struk');
  await kasir.waitForFunction(() => /Terkirim ke dapur/.test(document.querySelector('.struk')?.textContent || ''), null, { timeout: 15000 });
  log('struk:', (await txt(kasir, '.struk')).slice(0, 120));

  // Dapur menerima lewat realtime
  await dapur.waitForSelector('.kds-col.baru .kt', { timeout: 20000 });
  log('tiket muncul di dapur setelah', Date.now() - t0, 'ms');
  log('tiket:', await txt(dapur, '.kds-col.baru .kt'));
  await dapur.screenshot({ path: OUT + '/3-dapur-baru.png' });

  // Dapur: mulai masak -> centang item -> siap
  await dapur.click('.kds-col.baru .kt [data-action=maju]');
  await dapur.waitForSelector('.kds-col.dimasak .kt');
  await dapur.click('.kds-col.dimasak .kt [data-action=item] >> nth=0');
  await dapur.waitForTimeout(800);
  log('item dicentang:', await dapur.$$eval('.kds-col.dimasak .kt-item.ok', (a) => a.length));
  await dapur.click('.kds-col.dimasak .kt [data-action=maju]');
  await dapur.waitForSelector('.kds-col.siap .kt');
  await dapur.screenshot({ path: OUT + '/4-dapur-siap.png' });

  // Kasir dapat kabar siap
  await kasir.click('[data-action=baru]');
  await kasir.waitForSelector('.siap-strip', { timeout: 20000 });
  log('kasir strip:', await txt(kasir, '.siap-strip'));
  await kasir.screenshot({ path: OUT + '/5-kasir-siap.png' });
  await kasir.click('.siap-strip [data-action=diambil]');
  await dapur.waitForFunction(() => !document.querySelector('.kds-col.siap .kt'), null, { timeout: 20000 });
  log('setelah diambil: dapur siap kosong', true, '|', await txt(dapur, '.kds + p'));

  // Order kedua lalu dibatalkan -> hilang dari dapur
  await kasir.click('.pos-item >> nth=2'); await kasir.click('[data-action=checkout]'); await kasir.click('[data-action=uang] >> nth=0');
  await kasir.click('[data-action=selesai]'); await kasir.waitForSelector('.struk');
  await dapur.waitForSelector('.kds-col.baru .kt', { timeout: 20000 });
  await kasir.click('[data-action=baru]');
  await kasir.click('label:has(input[value=rekap])'); await kasir.waitForSelector('.pos-order');
  await kasir.click('.pos-order-head >> nth=0'); await kasir.click('[data-action=batal]');
  await dapur.waitForFunction(() => !document.querySelector('.kds-col.baru .kt'), null, { timeout: 20000 });
  log('order dibatalkan -> hilang dari dapur');

  // HP dapur (portrait) pakai tab
  await dapur.setViewportSize({ width: 390, height: 844 }); await dapur.waitForTimeout(300);
  log('HP dapur: tab tampil', await dapur.isVisible('.kds-tabs'));
  log('errors:', [...kasir.errs, ...dapur.errs]);
  await b.close();
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
