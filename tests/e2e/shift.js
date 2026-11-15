// E2E Racikin (shift.js). Lihat tests/README.md untuk cara menjalankan.
const { chromium } = require('playwright');
const B = (process.env.RACIKIN_URL || 'http://localhost:8766/'), OUT = process.argv[2];
const txt = async (p, sel) => (await p.textContent(sel)).replace(/\s+/g, ' ').trim();
const st = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('racikin:v1')));
const num = (t) => Number(String(t).replace(/[^\d]/g, ''));
(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })).newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
  p.on('dialog', d => { if (d.message().startsWith('Tutup shift')) console.log('dialog:', d.message().replace(/\n+/g, ' | ')); d.accept(); });
  await p.goto(B); await p.click('[data-action=dummy]'); await p.waitForSelector('.journey');
  let s = await st(p);
  console.log('dummy: shift', s.shifts.length, '| terbuka', s.shifts.filter(x => !x.tutup).length, '| order ber-shift', s.orders.filter(o => o.shiftId).length, '/', s.orders.length, '| tx laci', s.transactions.filter(t => t.ref === 'laci').length);
  await p.goto(B + '#/kasir'); await p.waitForSelector('.shift-bar');
  console.log('bar:', await txt(p, '.shift-bar'));
  await p.screenshot({ path: OUT + '/1-kasir-bar.png' });
  // Halaman shift
  await p.click('.shift-bar'); await p.waitForSelector('.shift-card, [data-form=buka]');
  if (await p.$('[data-form=buka]')) { console.log('buka shift dulu (belum ada hari ini)'); await p.click('[data-form=buka] button'); await p.waitForSelector('.shift-card'); }
  const seharusnya0 = num(await txt(p, '.shift-card .pos-total b'));
  console.log('shift aktif:', (await txt(p, '.shift-card')).slice(0, 200));
  // Catat pengeluaran laci
  await p.fill('form[data-form=laci] input[name=nominal]', '15000');
  await p.selectOption('form[data-form=laci] select[name=kategori]', 'Bahan Baku');
  await p.fill('form[data-form=laci] input[name=catatan]', 'beli es batu');
  await p.click('form[data-form=laci] button');
  await p.waitForTimeout(300);
  const seharusnya1 = num(await txt(p, '.shift-card .pos-total b'));
  console.log('seharusnya:', seharusnya0, '->', seharusnya1, '(selisih', seharusnya0 - seharusnya1, ')');
  s = await st(p);
  console.log('kas laci:', s.transactions.filter(t => t.ref === 'laci').slice(-1).map(t => `${t.tanggal} ${t.kategori} ${t.nominal} ${t.catatan}`));
  // Jual 1 order tunai
  await p.goto(B + '#/kasir'); await p.click('label:has(input[value=jual])'); await p.waitForSelector('.pos-grid');
  await p.click('.pos-item >> nth=0'); await p.click('[data-action=checkout]'); await p.click('[data-action=uang] >> nth=0'); await p.click('[data-action=selesai]'); await p.waitForSelector('.struk');
  s = await st(p);
  const last = s.orders[s.orders.length - 1];
  console.log('order baru shiftId cocok:', last.shiftId === s.shifts.find(x => !x.tutup && !x.kasir).id, '| shift Rina terbuka:', s.shifts.some(x => !x.tutup && x.kasir?.nama === 'Rina'), '| total', last.total);
  await p.goto(B + '#/shift'); await p.waitForSelector('.shift-card');
  const seharusnya2 = num(await txt(p, '.shift-card .pos-total b'));
  console.log('seharusnya setelah jual:', seharusnya2, '(+', seharusnya2 - seharusnya1, ')');
  // Kalkulator pecahan: hitung = seharusnya - 2000 (pakai 100rb, 50rb, ... sisanya manual)
  await p.click('details.pecahan summary');
  let sisa = seharusnya2 - 2000;
  for (const pc of [100000, 50000, 20000, 10000, 5000, 2000, 1000, 500]) {
    const n = Math.floor(sisa / pc); sisa -= n * pc;
    if (n) { await p.fill(`input[data-p="${pc}"]`, String(n)); await p.press(`input[data-p="${pc}"]`, 'Tab'); }
  }
  console.log('selisih live:', await txt(p, 'form[data-form=tutup] .pos-total'));
  await p.screenshot({ path: OUT + '/2-shift-aktif.png', fullPage: true });
  await p.fill('form[data-form=tutup] input[name=catatan]', 'kurang 2rb');
  await p.click('form[data-form=tutup] button.primary');
  await p.waitForSelector('[data-form=buka]');
  s = await st(p);
  const tutup = s.shifts.filter(x => x.tutup).sort((a, b) => a.tutup.localeCompare(b.tutup)).pop();
  console.log('hasil tutup:', JSON.stringify({ seharusnya: tutup.hasil.seharusnya, setor: tutup.hasil.setor, selisih: tutup.hasil.selisih, catatan: tutup.catatan }));
  console.log('riwayat teratas:', await txt(p, '.pos-order-head >> nth=0'));
  console.log('selisih 30 hari:', (await txt(p, 'section.card:has(h2:text("Selisih 30 hari"))')).slice(0, 160));
  await p.screenshot({ path: OUT + '/3-riwayat.png', fullPage: true });
  // Wajib shift
  await p.check('input[data-change=wajib]');
  await p.goto(B + '#/kasir'); if (await p.$('[data-action=baru]')) await p.click('[data-action=baru]'); await p.waitForSelector('.shift-bar');
  console.log('kasir wajib shift:', await txt(p, '.empty h3'), '| grid ada:', !!(await p.$('.pos-grid')));
  await p.screenshot({ path: OUT + '/4-wajib.png' });
  await p.click('.empty a.btn'); await p.waitForSelector('[data-form=buka]');
  await p.fill('[data-form=buka] input[name=modal]', '150000'); await p.click('[data-form=buka] button');
  await p.goto(B + '#/kasir'); await p.waitForSelector('.pos-grid');
  console.log('setelah buka shift:', await txt(p, '.shift-bar'));
  await p.goto(B + '#/kas'); await p.waitForSelector('.tx');
  console.log('tag laci di kas:', await p.$$eval('a.tag', a => a.filter(x => x.textContent === 'Laci').length));
  console.log('errors:', errs);
  await b.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
