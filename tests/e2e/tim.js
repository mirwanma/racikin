// E2E Racikin (tim.js). Lihat tests/README.md untuk cara menjalankan.
const { chromium } = require('playwright');
const B = (process.env.RACIKIN_URL || 'http://localhost:8766/'), OUT = process.argv[2];
// Klik menu di Kasir; menu dengan varian membuka sheet -> langsung Tambah pakai pilihan default.
const pos = async (p, n) => { await p.click(`.pos-item >> nth=${n}`); if (await p.$('.sheet')) await p.click('.sheet [data-action=pilihTambah]'); };
const PW = process.env.RACIKIN_TEST_PASSWORD;
const st = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('racikin:v1')));
const txt = async (p, sel) => (await p.textContent(sel)).replace(/\s+/g, ' ').trim();
const log = (...a) => console.log(...a);

async function mk(b, name) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  p.errs = [];
  p.on('pageerror', (e) => p.errs.push(name + ': ' + e.message));
  p.on('console', (m) => m.type() === 'error' && p.errs.push(name + ': ' + m.text()));
  p.on('dialog', (d) => d.accept());
  return p;
}
async function login(p, email) {
  await p.goto(B + '#/akun');
  await p.waitForSelector('form[data-form=auth]');
  await p.fill('form[data-form=auth] input[name=email]', email);
  await p.fill('form[data-form=auth] input[name=password]', PW);
  await p.click('form[data-form=auth] button.primary');
}
async function sync(p) {
  await p.goto(B + '#/akun');
  await p.waitForSelector('[data-action=sync]');
  await p.waitForSelector('.sync-box.synced', { timeout: 20000 });
  await p.click('[data-action=sync]');
  await p.waitForTimeout(300);
  await p.waitForSelector('.sync-box.synced', { timeout: 20000 });
}
async function jual(p, qty) {
  await p.goto(B + '#/kasir');
  await p.waitForSelector('.pos-grid');
  for (let i = 0; i < qty; i++) await pos(p, 0);
  await p.click('[data-action=checkout]');
  await p.click('[data-action=uang] >> nth=0');
  await p.click('[data-action=selesai]');
  await p.waitForSelector('.struk');
}

(async () => {
  const b = await chromium.launch();
  const owner = await mk(b, 'owner');
  const kasir = await mk(b, 'kasir');

  // --- Pemilik: data contoh + menu + stok, lalu login ---
  await owner.goto(B); await owner.click('[data-action=sample]'); await owner.waitForSelector('.journey');
  await owner.goto(B + '#/resep?id=new');
  await owner.fill('[data-f=nama][data-change=field]', 'Tahu Guyur'); await owner.press('[data-f=nama][data-change=field]', 'Tab');
  await owner.fill('[data-f=harga][data-change=field]', '12000'); await owner.press('[data-f=harga][data-change=field]', 'Tab');
  await owner.click('[data-action=aiFill]'); await owner.waitForSelector('.resep-row .new-price'); await owner.click('[data-action=save]');
  await owner.waitForSelector('form[data-form=bulk]'); for (const i of await owner.$$('form[data-form=bulk] input')) await i.fill('1000'); await owner.click('form[data-form=bulk] button.primary');
  await login(owner, 'racikin-tim-owner@racikin.test');
  await owner.waitForTimeout(1500);
  await sync(owner);
  log('owner synced, bisnis:', (await st(owner)).profile.nama);

  // --- Pemilik: undang kasir ---
  await owner.goto(B + '#/tim'); await owner.waitForSelector('form[data-form=undang]');
  await owner.fill('form[data-form=undang] input[name=nama]', 'Rina');
  await owner.click('form[data-form=undang] button.primary');
  await owner.waitForSelector('.invite-code');
  const code = (await owner.textContent('.invite-code')).trim();
  log('kode undangan:', code, '| undangan aktif:', await owner.$$eval('.team-row', (r) => r.length));
  await owner.screenshot({ path: OUT + '/1-tim-owner.png', fullPage: true });

  // --- Kasir: buka link undangan, login, gabung ---
  await kasir.goto(B + '#/gabung?kode=' + code);
  await kasir.waitForSelector('.empty h3');
  log('gabung belum login:', await txt(kasir, '.empty h3'));
  await login(kasir, 'racikin-tim-kasir@racikin.test');
  await kasir.waitForSelector('form[data-form=gabung]', { timeout: 20000 });
  log('kode terisi:', await kasir.inputValue('form[data-form=gabung] input[name=kode]'));
  await kasir.screenshot({ path: OUT + '/2-gabung.png', fullPage: true });
  await kasir.click('form[data-form=gabung] button.primary');
  await kasir.waitForSelector('.pos-grid', { timeout: 20000 });
  log('role body:', await kasir.getAttribute('body', 'data-role'));
  log('tab kasir:', await kasir.$$eval('.tabbar a', (as) => as.filter((a) => getComputedStyle(a).display !== 'none').map((a) => a.textContent.trim()).join(' | ')));
  let ks = await st(kasir);
  log('kasir data: profile', ks.profile?.nama, '| resep', ks.resep.length, '| idea', !!ks.idea, '| rab', !!ks.rab, '| transaksi', ks.transactions.length);
  await kasir.goto(B + '#/kas'); await kasir.waitForTimeout(300);
  log('kasir buka #/kas ->', await kasir.evaluate(() => location.hash));
  await kasir.goto(B + '#/bisnis'); await kasir.waitForTimeout(300);
  log('kasir buka #/bisnis ->', await kasir.evaluate(() => location.hash));

  // --- Jualan bersamaan (belum sinkron) ---
  const stokAwal = (await st(owner)).bahan.filter((x) => x.tracked).map((x) => x.stok);
  await jual(kasir, 2);
  await jual(owner, 1);
  await kasir.screenshot({ path: OUT + '/3-struk-kasir.png', fullPage: true });
  log('struk kasir note:', await txt(kasir, '.struk-note.small'));
  await sync(kasir);
  await sync(owner);
  await sync(kasir);
  const os = await st(owner);
  ks = await st(kasir);
  const tgl = os.orders[0].tanggal;
  log('orders owner:', os.orders.map((o) => `#${o.no} ${o.kasir?.nama} ${o.total}`).join(', '));
  log('orders kasir:', ks.orders.map((o) => `#${o.no} ${o.kasir?.nama} ${o.total}`).join(', '));
  const pakai = os.bahan.filter((x) => x.tracked).map((x, i) => +(stokAwal[i] - x.stok).toFixed(3));
  const pakaiK = ks.bahan.filter((x) => x.tracked).map((x, i) => +(stokAwal[i] - x.stok).toFixed(3));
  log('stok terpakai owner:', pakai.slice(0, 4).join(','), '| kasir:', pakaiK.slice(0, 4).join(','));
  log('kas pos owner:', os.transactions.filter((t) => t.ref === 'pos').map((t) => `${t.kategori} ${t.nominal} (${t.catatan})`).join(' | '));
  log('posHarian owner:', JSON.stringify(os.posHarian[tgl]));
  log('kasir punya transaksi non-pos:', ks.transactions.filter((t) => t.ref !== 'pos').length);

  // --- Rekap per kasir di HP pemilik ---
  await owner.goto(B + '#/kasir?tab=rekap'); await owner.waitForSelector('.pos-order');
  log('rekap owner:', await txt(owner, '.stats3 >> nth=0'));
  log('per kasir:', await owner.$$eval('h4', (hs) => { const h = hs.find((x) => x.textContent === 'Per kasir'); let out = []; let n = h?.nextElementSibling; while (n && n.tagName !== 'H4') { out.push(n.textContent.replace(/\s+/g, ' ').trim()); n = n.nextElementSibling; } return out.join(' / '); }));
  await owner.screenshot({ path: OUT + '/4-rekap-owner.png', fullPage: true });

  // --- Kasir tidak boleh batalkan order pemilik ---
  await kasir.goto(B + '#/kasir?tab=rekap'); await kasir.waitForSelector('.pos-order');
  const n = (await kasir.$$('.pos-order-head')).length;
  for (let i = 0; i < n; i++) {
    await kasir.click(`.pos-order-head >> nth=${i}`);
    const t = await txt(kasir, '.pos-order .inline-form');
    log('kasir lihat order:', t.slice(-70));
    if (i === 0) await kasir.screenshot({ path: OUT + '/5-rekap-kasir.png', fullPage: true });
    await kasir.click(`.pos-order-head >> nth=${i}`);
  }

  // --- Pemilik lihat anggota, lalu keluarkan ---
  await owner.goto(B + '#/tim'); await owner.waitForTimeout(3000);
  log('DEBUG tim owner:', (await txt(owner, '#view')).slice(700, 1300));
  await owner.waitForSelector('.team-row .avatar');
  log('anggota:', await txt(owner, '.team-row'));
  await owner.click('[data-action=keluarkan]');
  await owner.waitForFunction(() => document.querySelectorAll('.team-row .avatar').length === 0, null, { timeout: 15000 }).catch(() => {});
  log('anggota setelah dikeluarkan:', await owner.$$eval('.team-row .avatar', (r) => r.length));
  // Kasir buka lagi -> data usaha pemilik hilang
  await kasir.goto(B + '#/akun'); await kasir.waitForSelector('[data-action=sync]');
  await kasir.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await kasir.waitForTimeout(3500);
  ks = await st(kasir);
  log('kasir setelah dikeluarkan: role', await kasir.getAttribute('body', 'data-role'), '| profile', ks.profile?.nama || null, '| orders', ks.orders.length);

  // --- Manajer ---
  const mgr = await mk(b, 'mgr');
  await owner.goto(B + '#/tim'); await owner.waitForSelector('form[data-form=undang]');
  await owner.fill('form[data-form=undang] input[name=nama]', 'Dodi');
  await owner.check('form[data-form=undang] input[value=manajer]');
  await owner.click('form[data-form=undang] button.primary');
  await owner.waitForSelector('.invite-code');
  await owner.waitForFunction((c) => document.querySelector('.invite-code')?.textContent.trim() !== c, code, { timeout: 15000 });
  const code2 = (await owner.textContent('.invite-code')).trim();
  await login(mgr, 'racikin-tim-mgr@racikin.test');
  await mgr.waitForTimeout(2500);
  await mgr.goto(B + '#/gabung?kode=' + code2);
  await mgr.waitForSelector('form[data-form=gabung]');
  await mgr.click('form[data-form=gabung] button.primary');
  try { await mgr.waitForSelector('.journey', { timeout: 20000 }); } catch (e) { log('MGR VIEW:', await mgr.evaluate(() => location.hash), (await txt(mgr, '#view')).slice(0, 300), mgr.errs); throw e; }
  const ms = await st(mgr);
  log('manajer: role', await mgr.getAttribute('body', 'data-role'), '| transaksi', ms.transactions.length, '| idea', !!ms.idea);
  await mgr.goto(B + '#/kas'); await mgr.waitForSelector('.tx');
  log('manajer buka kas:', await mgr.evaluate(() => location.hash), (await txt(mgr, '.stats3')).slice(0, 60));
  await mgr.goto(B + '#/tim'); await mgr.waitForSelector('.card.accent');
  log('manajer tim:', await txt(mgr, '.card.accent'), '| form undang ada:', !!(await mgr.$('form[data-form=undang]')));
  await mgr.screenshot({ path: OUT + '/6-tim-manajer.png', fullPage: true });
  await owner.goto(B + '#/tim'); await owner.waitForSelector('.team-row .avatar');
  await owner.screenshot({ path: OUT + '/7-tim-owner-anggota.png', fullPage: true });
  log('errors:', [...owner.errs, ...kasir.errs, ...mgr.errs]);
  await b.close();
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
