// E2E Racikin (meja.js). Lihat tests/README.md untuk cara menjalankan.
const { chromium } = require('playwright');
const B = (process.env.RACIKIN_URL || 'http://localhost:8766/'), OUT = process.argv[2];
const txt = async (p, sel) => (await p.textContent(sel)).replace(/\s+/g, ' ').trim();
const st = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('racikin:v1')));
const log = (...a) => console.log(...a);
async function mk(b, name, w, h) {
  const p = await (await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 })).newPage();
  p.errs = [];
  p.on('pageerror', (e) => p.errs.push(name + ': ' + e.message));
  p.on('console', (m) => m.type() === 'error' && p.errs.push(name + ': ' + m.text()));
  p.on('dialog', (d) => d.accept());
  return p;
}
async function pesanSebagai(c, token, nama, metode, n = [0, 0, 11]) {
  await c.goto(B + '#/m/' + token); await c.waitForSelector('.pm-item, [data-action=lagi], [data-action=bayarDemo]', { timeout: 20000 });
  if (await c.$('[data-action=lagi]')) { await c.click('[data-action=lagi]'); await c.waitForSelector('.pm-item'); }
  for (const i of n) await c.click(`.pm-item:not(.habis) >> nth=${i} >> [data-action=tambah]`);
  await c.click('[data-action=checkout]'); await c.waitForSelector('form[data-form=pesan]');
  await c.fill('form[data-form=pesan] input[name=nama]', nama);
  await c.fill('form[data-form=pesan] input[name=catatan]', 'pedas level 2');
  await c.check(`form[data-form=pesan] input[value=${metode}]`);
  await c.click('form[data-form=pesan] button.primary');
  try { await c.waitForSelector(metode === 'digital' ? '.pm-qris' : '.pm-status', { timeout: 20000 }); } catch (e) { console.log('TOAST:', await c.textContent('#toast'), c.errs); throw e; }
}
(async () => {
  const b = await chromium.launch();
  const kasir = await mk(b, 'kasir', 1180, 820);
  const tamu = await mk(b, 'tamu', 390, 844);

  await kasir.goto(B); await kasir.click('[data-action=dummy]'); await kasir.waitForSelector('.journey');
  await kasir.goto(B + '#/akun'); await kasir.fill('input[name=email]', 'racikin-tim-owner@racikin.test'); await kasir.fill('input[name=password]', process.env.RACIKIN_TEST_PASSWORD);
  await kasir.click('form[data-form=auth] button.primary'); await kasir.waitForTimeout(2500);
  log('login...', new Date().toISOString().slice(11,19)); await kasir.goto(B + '#/akun'); await kasir.waitForSelector('.sync-box', { timeout: 30000 }); log('status sync:', await txt(kasir, '.sync-box')); await kasir.waitForSelector('.sync-box.synced', { timeout: 60000 }); log('synced', new Date().toISOString().slice(11,19));

  // Aktifkan pesan lewat meja
  await kasir.goto(B + '#/meja'); await kasir.waitForSelector('input[data-change=aktif]');
  await kasir.check('input[data-change=aktif]'); await kasir.waitForTimeout(2500);
  let s = await st(kasir);
  log('meja:', s.meja.length, '| aktif', s.posSetting.pesanMeja, '| status publik:', await txt(kasir, 'section.card >> nth=0'));
  await kasir.click('[data-action=buka] >> nth=0'); await kasir.waitForSelector('.meja-qr-big svg', { timeout: 10000 });
  await kasir.screenshot({ path: OUT + '/1-kelola-meja.png', fullPage: true });
  const token = s.meja[0].token;

  // 1) Pelanggan: bayar di kasir
  await tamu.goto(B + '#/m/' + token); await tamu.waitForSelector('.pm-item', { timeout: 20000 });
  log('tamu menu:', await txt(tamu, '.pm-head'), '| item', await tamu.$$eval('.pm-item', (a) => a.length), '| habis', await tamu.$$eval('.pm-item.habis', (a) => a.length), '| tabbar', await tamu.isVisible('.tabbar'));
  await tamu.screenshot({ path: OUT + '/2-tamu-menu.png', fullPage: true });
  await pesanSebagai(tamu, token, 'Budi', 'kasir');
  log('tamu status:', (await txt(tamu, '.pm-status')).slice(0, 160));
  await tamu.screenshot({ path: OUT + '/3-tamu-status.png', fullPage: true });

  // Kasir menerima (realtime)
  await kasir.goto(B + '#/kasir'); await kasir.waitForSelector('.pos-grid');
  await kasir.waitForSelector('.meja-inbox .mi-row', { timeout: 20000 });
  log('kasir inbox:', await txt(kasir, '.meja-inbox'));
  await kasir.screenshot({ path: OUT + '/4-kasir-inbox.png' });
  await kasir.click('.meja-inbox [data-action=terimaMeja]');
  await kasir.waitForSelector('.meja-bayar');
  log('kasir bayar:', await txt(kasir, '.meja-bayar'), '| total', await txt(kasir, '.pos-total b'));
  await kasir.click('[data-action=uang] >> nth=0'); await kasir.click('[data-action=selesai]'); await kasir.waitForSelector('.struk');
  s = await st(kasir);
  const ord = s.orders[s.orders.length - 1];
  log('order POS:', ord.total, ord.metode, ord.atasNama, JSON.stringify(ord.meja));
  await tamu.waitForFunction(() => /sedang disiapkan/.test(document.querySelector('.pm-status h2')?.textContent || ''), null, { timeout: 15000 });
  log('tamu setelah diterima:', (await txt(tamu, '.pm-status h2')), '|', await txt(tamu, '.pm-paid'));

  // 2) Pelanggan: bayar digital (simulasi)
  await pesanSebagai(tamu, token, 'Sinta', 'digital', [1]);
  log('tamu QRIS demo:', (await txt(tamu, '.pm-qris')).slice(0, 120), '| qr svg', !!(await tamu.$('.pm-qr svg')));
  await tamu.screenshot({ path: OUT + '/5-tamu-qris.png', fullPage: true });
  await kasir.click('[data-action=baru]').catch(() => {});
  await kasir.waitForFunction(() => /Sinta/.test(document.querySelector('.meja-inbox')?.textContent || ''), null, { timeout: 20000 });
  log('inbox sebelum bayar:', (await txt(kasir, '.meja-inbox')).match(/Sinta.*?(menunggu bayar digital|lunas digital)/)?.[1]);
  await tamu.click('[data-action=bayarDemo]'); await tamu.waitForSelector('.pm-status');
  await kasir.waitForFunction(() => /lunas digital/.test(document.querySelector('.meja-inbox')?.textContent || ''), null, { timeout: 20000 });
  log('inbox setelah bayar demo: lunas digital');
  await kasir.click('.meja-inbox [data-action=terimaMeja]'); await kasir.waitForSelector('.meja-bayar.lunas');
  log('metode terpilih:', await kasir.$eval('input[name=metode]:checked', (i) => i.value));
  await kasir.click('[data-action=selesai]'); await kasir.waitForSelector('.struk');
  s = await st(kasir);
  log('order digital:', s.orders[s.orders.length - 1].metode, s.orders[s.orders.length - 1].total);

  // 3) Ditolak
  await pesanSebagai(tamu, token, 'Andi', 'kasir', [2]);
  await kasir.click('[data-action=baru]').catch(() => {});
  await kasir.waitForFunction(() => /Andi/.test(document.querySelector('.meja-inbox')?.textContent || ''), null, { timeout: 20000 });
  await kasir.click('.meja-inbox [data-action=tolakMeja]');
  await tamu.waitForFunction(() => /tidak bisa diproses/.test(document.querySelector('.pm-status')?.textContent || ''), null, { timeout: 15000 });
  log('tamu ditolak:', (await txt(tamu, '.pm-status')).slice(0, 140));

  // 4) Mode dapur: pesanan meja -> dapur -> status dimasak di HP pelanggan
  await kasir.goto(B + '#/dapur'); await kasir.click('[data-action=aktifkan]'); await kasir.waitForSelector('.kds');
  const dapur = await kasir.context().newPage(); dapur.on('dialog', (d) => d.accept());
  await dapur.goto(B + '#/dapur'); await dapur.waitForSelector('.kds');
  await pesanSebagai(tamu, token, 'Rina', 'kasir', [0]);
  await kasir.goto(B + '#/kasir'); await kasir.waitForFunction(() => /Rina/.test(document.querySelector('.meja-inbox')?.textContent || ''), null, { timeout: 20000 });
  await kasir.click('.meja-inbox [data-action=terimaMeja]'); await kasir.waitForSelector('.dapur-form');
  log('form dapur terisi:', await kasir.inputValue('input[data-change=atasNama]'), '|', await kasir.inputValue('input[data-change=catatanDapur]'));
  await kasir.click('[data-action=uang] >> nth=0'); await kasir.click('[data-action=selesai]'); await kasir.waitForSelector('.struk');
  await dapur.waitForSelector('.kds-col.baru .kt', { timeout: 20000 });
  log('tiket dapur:', (await txt(dapur, '.kds-col.baru .kt')).slice(0, 90));
  await dapur.click('.kds-col.baru .kt [data-action=maju]');
  await tamu.waitForFunction(() => /Sedang dimasak/.test(document.querySelector('.pm-status h2')?.textContent || ''), null, { timeout: 20000 });
  await dapur.click('.kds-col.dimasak .kt [data-action=maju]');
  await tamu.waitForFunction(() => /siap/i.test(document.querySelector('.pm-status h2')?.textContent || ''), null, { timeout: 20000 });
  log('tamu (dapur):', await txt(tamu, '.pm-status h2'), '|', await txt(tamu, '.pm-steps'));
  await tamu.screenshot({ path: OUT + '/6-tamu-siap.png', fullPage: true });

  // 5) Cetak QR
  await kasir.goto(B + '#/meja'); await kasir.click('[data-action=cetakSemua]'); await kasir.waitForSelector('.meja-print-card svg');
  await kasir.emulateMedia({ media: 'print' }); await kasir.screenshot({ path: OUT + '/7-cetak.png', fullPage: true }); await kasir.emulateMedia({ media: 'screen' });
  await kasir.click('[data-action=tutupCetak]');
  log('kartu cetak:', 'ok');

  // 6) Matikan fitur
  await kasir.uncheck('input[data-change=aktif]'); await kasir.waitForTimeout(2000);
  log('tamu lama (pesanan aktif) masih lihat status:', !!(await tamu.reload().then(() => tamu.waitForSelector('.pm-status, .empty h3', { timeout: 15000 })).then(() => tamu.$('.pm-status'))));
  await tamu.evaluate(() => localStorage.clear()); await tamu.reload(); await tamu.waitForSelector('.empty h3', { timeout: 15000 });
  log('tamu setelah dimatikan:', await txt(tamu, '.empty h3'));
  // token palsu
  await tamu.goto(B + '#/m/tokenpalsu1234567890'); await tamu.reload(); await tamu.waitForSelector('.pm-err');
  log('token palsu:', await txt(tamu, '.pm-err p'));
  log('errors:', [...kasir.errs, ...tamu.errs, ...dapur.errs ?? []]);
  await b.close();
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
