// E2E Racikin (split-bill.js): open bill tahap 2 di Kasir. Batal sebagian jumlah, bayar sebagian (split per orang),
// pindah ke meja, gabung bill, lunasi sisa. Kas = rekap & stok = stokLog tetap konsisten. Data contoh, tanpa akun.
const { chromium } = require('playwright');
const B = (process.env.RACIKIN_URL || 'http://localhost:8766/'), OUT = process.argv[2];
const st = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('racikin:v1')));
const txt = async (p, sel) => (await p.textContent(sel)).replace(/\s+/g, ' ').trim();
const ok = (cond, label) => { console.log((cond ? 'OK   ' : 'GAGAL') + ' ' + label); if (!cond) process.exitCode = 1; };
const pos = async (p, nama) => { await p.click(`.pos-item:has-text("${nama}")`); if (await p.$('.sheet .opsi-btn')) await p.click('.sheet [data-action=pilihTambah]'); };
const total = (b) => b.ronde.flatMap((r) => r.items).reduce((a, i) => a + i.harga * i.qty, 0);

(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
  const jawab = [];
  p.on('dialog', (d) => { const j = jawab.shift(); if (j === false) d.dismiss(); else d.accept(typeof j === 'string' ? j : undefined); });
  await p.goto(B); await p.click('[data-action=dummy]'); await p.waitForSelector('.journey', { timeout: 20000 });
  await p.evaluate(() => { const x = JSON.parse(localStorage.getItem('racikin:v1')); x.promo = x.promo.map((q) => ({ ...q, aktif: false })); x.posSetting = { ...(x.posSetting || {}), openBill: true }; localStorage.setItem('racikin:v1', JSON.stringify(x)); });
  await p.reload(); await p.waitForSelector('.journey');

  // Bill "Rombongan": 3 es teh + 2 tahu guyur original
  await p.goto(B + '#/kasir'); await p.waitForSelector('.pos-grid');
  await p.click('input[data-change=tab][value=bill]'); await p.waitForSelector('form[data-form=billBaru]');
  await p.fill('form[data-form=billBaru] input[name=nama]', 'Rombongan'); await p.click('form[data-form=billBaru] button');
  await p.waitForSelector('.bill-banner');
  for (let i = 0; i < 3; i++) await pos(p, 'Es Teh Manis');
  for (let i = 0; i < 2; i++) await pos(p, 'Tahu Guyur Original');
  await p.click('[data-action=checkout]'); await p.click('[data-action=billKirim]'); await p.waitForSelector('.bill-detail');
  let s = await st(p);
  let bill = s.bills.find((x) => x.nama === 'Rombongan');
  const total0 = total(bill);

  // --- Batal sebagian: 1 dari 3 es teh
  jawab.push('1', 'Kebanyakan', true);
  await p.click('.bill-ronde .pos-sum:has-text("Es Teh") [data-action=billHapusItem]'); await p.waitForTimeout(300);
  s = await st(p); bill = s.bills.find((x) => x.id === bill.id);
  const teh = bill.ronde[0].items.find((i) => i.nama === 'Es Teh Manis');
  ok(teh.qty === 2 && bill.hapus[0].item.qty === 1 && total(bill) === total0 - teh.harga, 'batal 1 dari 3 es teh');

  // --- Bayar sebagian: 1 es teh + 1 tahu guyur
  await p.click(`[data-action=billSplitBuka][data-id="${bill.id}"]`); await p.waitForSelector('.split-line');
  ok(await p.isDisabled('[data-action=billSplitBayar]'), 'belum pilih: tombol bayar mati');
  await p.click('.split-line:has-text("Es Teh") [data-action=splitPlus]');
  await p.click('.split-line:has-text("Tahu Guyur") [data-action=splitPlus]');
  const sebagian = await txt(p, '.sheet .pos-total');
  console.log('dibayar sekarang:', sebagian);
  await p.screenshot({ path: OUT + '/sb1-pilih.png', fullPage: true });
  await p.click('[data-action=billSplitBayar]'); await p.waitForSelector('.bill-bayar');
  ok((await txt(p, '.bill-bayar')).includes('Bayar sebagian') && (await p.$$eval('.pos-line', (a) => a.length)) === 2, 'layar bayar: 2 item dipilih + info sisa');
  await p.click('[data-action=uang] >> nth=0'); await p.click('[data-action=selesai]'); await p.waitForSelector('.struk');
  s = await st(p); bill = s.bills.find((x) => x.id === bill.id);
  const o1 = s.orders[s.orders.length - 1];
  ok(o1.bill?.sebagian === true && o1.items.reduce((a, i) => a + i.qty, 0) === 2, 'order pertama: 2 item, ditandai bayar sebagian');
  ok(bill && total(bill) === total0 - teh.harga - o1.total && bill.dibayar.length === 1, 'sisa tetap di bill + riwayat bayar');

  // --- Pindah ke Meja 1, lalu gabung bill lain ke situ
  await p.click('[data-action=baru]');
  await p.click('input[data-change=tab][value=bill]'); await p.waitForSelector('.bill-card');
  await p.click(`[data-action=billPindahBuka][data-id="${bill.id}"]`); await p.waitForSelector('[data-action=billPindahMeja]');
  const meja1 = s.meja[0];
  await p.click(`[data-action=billPindahMeja][data-meja="${meja1.id}"]`); await p.waitForTimeout(200);
  s = await st(p); bill = s.bills.find((x) => x.id === bill.id);
  ok(bill.meja?.id === meja1.id, `pindah ke ${meja1.nama}`);
  await p.fill('form[data-form=billBaru] input[name=nama]', 'Teman telat'); await p.click('form[data-form=billBaru] button');
  await p.waitForSelector('.bill-banner'); await pos(p, 'Es Teh Manis');
  await p.click('[data-action=checkout]'); await p.click('[data-action=billKirim]'); await p.waitForSelector('.bill-card');
  s = await st(p);
  const telat = s.bills.find((x) => x.nama === 'Teman telat');
  const sebelumGabung = total(bill);
  await p.click(`[data-action=billPindahBuka][data-id="${telat.id}"]`); await p.waitForSelector('[data-action=billGabung]');
  jawab.push(true);
  await p.click(`[data-action=billGabung][data-ke="${bill.id}"]`); await p.waitForTimeout(300);
  s = await st(p); bill = s.bills.find((x) => x.id === bill.id);
  ok(!s.bills.some((x) => x.id === telat.id) && total(bill) === sebelumGabung + total(telat), 'bill "Teman telat" digabung ke bill meja');
  await p.screenshot({ path: OUT + '/sb2-gabung.png', fullPage: true });

  // --- Lunasi sisa
  await p.click(`[data-action=billBayar][data-id="${bill.id}"]`); await p.waitForSelector('.bill-bayar');
  await p.click('[data-action=uang] >> nth=0'); await p.click('[data-action=selesai]'); await p.waitForSelector('.struk');
  s = await st(p);
  ok(!s.bills.some((x) => x.id === bill.id), 'bill lunas & ditutup');
  const t = s.orders[s.orders.length - 1].tanggal;
  const kas = s.transactions.filter((x) => x.ref === 'pos' && x.tanggal === t && x.jenis === 'masuk').reduce((a, x) => a + x.nominal, 0);
  ok(kas === s.posHarian[t].omzet, 'Kas = rekap kasir');
  const logOk = s.bahan.filter((x) => x.tracked).every((x) => Math.abs(s.stokLog.filter((l) => l.bahanId === x.id).reduce((a, l) => a + l.delta, 0) - x.stok) < 0.05);
  ok(logOk, 'stok = total stokLog');

  ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'HP: tidak ada scroll ke samping');
  console.log('errors:', errs);
  ok(!errs.length, 'tanpa error');
  await b.close();
})();
