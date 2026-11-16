// E2E Racikin (varian-resep.js): varian yang mengubah resep dasar. Jumbo = 1,5× porsi (cup tidak ikut dikali),
// ganti bahan / tanpa bahan, editor (tebakan kemasan, HPP per menu), stok di Kasir, rekap per menu, laporan.
const { chromium } = require('playwright');
const B = (process.env.RACIKIN_URL || 'http://localhost:8766/'), OUT = process.argv[2];
const st = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('racikin:v1')));
const txt = async (p, sel) => (await p.textContent(sel)).replace(/\s+/g, ' ').trim();
const ok = (cond, label) => { console.log((cond ? 'OK   ' : 'GAGAL') + ' ' + label); if (!cond) process.exitCode = 1; };
const near = (a, b) => Math.abs(a - b) < 0.01;

(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
  p.on('dialog', d => d.accept());
  await p.goto(B); await p.click('[data-action=dummy]'); await p.waitForSelector('.journey', { timeout: 20000 });
  await p.evaluate(() => { const x = JSON.parse(localStorage.getItem('racikin:v1')); x.promo = x.promo.map((q) => ({ ...q, aktif: false })); localStorage.setItem('racikin:v1', JSON.stringify(x)); });

  // Tab varian: keterangan porsi & ganti bahan
  await p.goto(B + '#/stok?tab=varian'); await p.waitForSelector('a[href^="#/varian?id="]');
  const tab = await txt(p, '.view');
  ok(tab.includes('1,5× porsi') && tab.includes('ganti bahan'), 'tab varian: Jumbo 1,5× porsi, Tanpa gula ganti bahan');

  // Editor grup Ukuran: porsi 1.5, cup dicentang
  let s = await st(p);
  const uk = s.opsi.find(g => g.nama === 'Ukuran');
  await p.goto(B + '#/varian?id=' + uk.id); await p.waitForSelector('.opsi-ubah');
  ok(await p.$eval('.opsi-edit[data-i="1"] details.opsi-ubah', d => d.open), 'Jumbo: bagian ubah resep terbuka');
  ok((await p.inputValue('[data-change=pilihan][data-f=porsi][data-i="1"]')) === '1.5', 'porsi 1.5');
  ok(await p.isChecked('.opsi-edit[data-i="1"] label.chip:has-text("Cup plastik") input'), 'cup nggak ikut dikali');
  const hppTxt = await txt(p, '.opsi-edit[data-i="1"] .row-between.small span');
  console.log('jumbo:', hppTxt);
  ok(/HPP \+Rp [\d.]+ di Es Teh Manis/.test(hppTxt), 'HPP tambahan per menu tampil');
  await p.screenshot({ path: OUT + '/vr1-ukuran.png', fullPage: true });

  // Grup baru dari preset Ukuran untuk Es Jeruk: Jumbo otomatis 1.5× + tebakan kemasan; tambah ganti bahan
  await p.goto(B + '#/varian?id=new&preset=ukuran'); await p.waitForSelector('[data-f=nama][data-change=field]');
  await p.fill('[data-f=nama][data-change=field]', 'Ukuran jeruk'); await p.press('[data-f=nama][data-change=field]', 'Tab');
  await p.click('label.chip:has-text("Es Jeruk Peras")');
  ok((await p.inputValue('[data-change=pilihan][data-f=porsi][data-i="1"]')) === '1.5', 'preset Jumbo: porsi 1.5');
  ok(await p.isChecked('.opsi-edit[data-i="1"] label.chip:has-text("Cup plastik") input'), 'preset: cup ditebak sebagai kemasan');
  // Pilihan baru "Pakai gula aren": gula pasir -> gula aren
  await p.click('[data-action=addPilihan]');
  await p.fill('[data-change=pilihan][data-f=nama][data-i="2"]', 'Pakai gula aren'); await p.press('[data-change=pilihan][data-f=nama][data-i="2"]', 'Tab');
  await p.click('.opsi-edit[data-i="2"] details.opsi-ubah summary');
  await p.click('[data-action=addGanti][data-i="2"]');
  await p.selectOption('select[data-change=pganti][data-f=dari][data-i="2"]', { label: 'Gula pasir' });
  await p.selectOption('select[data-change=pganti][data-f=ke][data-i="2"]', { label: 'Gula aren cair (ml)' });
  const aren = await txt(p, '.opsi-edit[data-i="2"] .row-between.small span');
  console.log('aren:', aren);
  ok(/HPP \+Rp 580 di Es Jeruk Peras/.test(aren), 'ganti gula pasir 20 g (16) ke aren 20 ml (45): +580');
  await p.screenshot({ path: OUT + '/vr2-ganti.png', fullPage: true });
  ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'HP: tidak ada scroll ke samping');
  await p.click('[data-action=save]'); await p.waitForSelector('.seg.seg3');
  s = await st(p);
  const g = s.opsi.find(x => x.nama === 'Ukuran jeruk');
  const gulaId = s.bahan.find(x => x.nama === 'Gula pasir').id, arenId = s.bahan.find(x => x.nama === 'Gula aren cair').id;
  ok(g && g.pilihan[1].porsi === 1.5 && g.pilihan[1].tetap.length >= 1 && g.pilihan[0].porsi === undefined, 'tersimpan: porsi hanya di Jumbo');
  ok(JSON.stringify(g.pilihan[2].ganti) === JSON.stringify([{ dari: gulaId, ke: arenId }]), 'tersimpan: ganti bahan');

  // Kasir: Es Teh Manis Jumbo ×1 + Es Jeruk pakai gula aren ×1 -> cek stok
  const stok0 = Object.fromEntries(s.bahan.map(x => [x.nama, x.stok]));
  const nOrder0 = s.orders.length;
  await p.goto(B + '#/kasir'); await p.waitForSelector('.pos-grid');
  await p.click('.pos-item:has-text("Es Teh Manis")'); await p.click('.sheet .opsi-btn:has-text("Jumbo")'); await p.click('.sheet [data-action=pilihTambah]');
  await p.click('.pos-item:has-text("Es Jeruk Peras")'); await p.waitForSelector('.sheet');
  await p.click('.sheet .opsi-btn:has-text("Pakai gula aren")'); await p.click('.sheet [data-action=pilihTambah]');
  await p.click('[data-action=checkout]'); await p.waitForSelector('.pos-line');
  await p.click('[data-action=uang] >> nth=0'); await p.click('[data-action=selesai]'); await p.waitForSelector('.struk');
  s = await st(p);
  ok(s.orders.length === nOrder0 + 1, 'order tersimpan');
  const tehR = s.resep.find(r => r.nama === 'Es Teh Manis');
  const per = (nama) => { const id = s.bahan.find(x => x.nama === nama).id; const it = tehR.items.find(i => i.bahanId === id); return it ? it.qty / Math.max(1, tehR.hasil || 1) : 0; };
  const d = (nama) => stok0[nama] - s.bahan.find(x => x.nama === nama).stok;
  console.log('pakai teh/gula/cup/jeruk/aren:', d('Teh celup'), d('Gula pasir'), d('Cup plastik + tutup'), d('Jeruk peras'), d('Gula aren cair'));
  ok(near(d('Teh celup'), per('Teh celup') * 1.5), 'Es Teh Jumbo: teh 1,5×');
  ok(near(d('Gula pasir'), per('Gula pasir') * 1.5), 'gula: Es Teh 1,5×, Es Jeruk pakai aren (gula pasir 0)');
  ok(near(d('Cup plastik + tutup'), 2), 'cup tetap 1 per minuman');
  ok(near(d('Gula aren cair'), 20) && near(d('Jeruk peras'), 2), 'Es Jeruk: aren 20 ml, jeruk 2');
  const tgl = s.orders[s.orders.length - 1].tanggal;
  const rek = s.posHarian[tgl].opsiMenu;
  const jmbId = s.opsi.find(x => x.nama === 'Ukuran').pilihan.find(x => x.nama === 'Jumbo').id;
  ok(rek && rek[jmbId] && rek[jmbId]['Es Teh Manis'] >= 1, 'rekap harian per menu (opsiMenu)');
  const totalLog = (nama) => { const id = s.bahan.find(x => x.nama === nama).id; return s.stokLog.filter(l => l.bahanId === id).reduce((a, l) => a + l.delta, 0); };
  ok(['Teh celup', 'Gula pasir', 'Gula aren cair', 'Cup plastik + tutup'].every(n => Math.abs(totalLog(n) - s.bahan.find(x => x.nama === n).stok) < 0.05), 'stok = total stokLog');

  // Laporan: baris varian Jumbo dengan HPP
  await p.goto(B + '#/laporan'); await p.waitForSelector('.lr-table'); await p.waitForTimeout(300);
  const lap = await txt(p, '.view');
  console.log('laporan:', (lap.match(/Varian & topping terlaris.*?(?=Perkiraan|$)/) || [''])[0].slice(0, 220));
  const jmb = await p.evaluate(async () => {
    const { labaRugi } = await import('/js/laporan.js');
    const s = JSON.parse(localStorage.getItem('racikin:v1'));
    return labaRugi(s, new Date().toISOString().slice(0, 7), 'resep').opsi.find((o) => o.nama === 'Jumbo');
  });
  console.log('laporan jumbo:', JSON.stringify(jmb));
  ok(lap.includes('Varian & topping terlaris') && jmb && jmb.hpp > 0 && jmb.untung < jmb.omzet, 'laporan: Jumbo punya HPP dari porsi 1,5×');

  console.log('errors:', errs);
  ok(errs.length === 0, 'tanpa error');
  await b.close();
})();
