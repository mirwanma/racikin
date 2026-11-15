// E2E Racikin (tracked.js). Lihat tests/README.md untuk cara menjalankan.
const { chromium } = require('playwright');
const B = (process.env.RACIKIN_URL || 'http://localhost:8766/');
const st = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('racikin:v1')));
const txt = async (p, sel) => (await p.textContent(sel)).replace(/\s+/g, ' ').trim();
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
  p.on('dialog', d => { console.log('  dialog:', d.message().slice(0, 70)); d.accept(); });
  await p.goto(B); await p.click('[data-action=sample]'); await p.waitForSelector('.journey');
  // 1. Resep baru -> tawaran isi stok -> form massal
  await p.goto(B + '#/resep?id=new');
  await p.fill('[data-f=nama][data-change=field]', 'Tahu Guyur Original'); await p.press('[data-f=nama][data-change=field]', 'Tab');
  await p.fill('[data-f=harga][data-change=field]', '12000'); await p.press('[data-f=harga][data-change=field]', 'Tab');
  await p.click('[data-action=aiFill]'); await p.waitForSelector('.resep-row .new-price');
  await p.click('[data-action=save]'); await p.waitForSelector('form[data-form=bulk]');
  console.log('1. form massal muncul, baris:', await p.$$eval('.bulk-row', r => r.length));
  await p.screenshot({ path: process.argv[2] + '/bulk.png', fullPage: true });
  let s = await st(p);
  const id = (n) => s.bahan.find(x => x.nama === n).id;
  await p.fill(`input[name="${id('Tahu putih')}"]`, '40'); await p.fill(`input[name="${id('Paper bowl')}"]`, '100'); await p.fill(`input[name="${id('Kaldu / kuah')}"]`, '0');
  await p.click('form[data-form=bulk] button.primary');
  console.log('   toast:', await p.textContent('#toast'));
  console.log('   kartu info:', await txt(p, '.info-card p'));
  // 2. kartu menu
  await p.click('label:has(input[value=menu])');
  console.log('2. kartu menu:', await txt(p, '.resep-card p.small'));
  // 3. jual 2 porsi (kaldu 0 tracked -> boleh minus; untracked tidak dikurangi)
  await p.click('[data-action=open][data-type=jual]'); await p.fill('form[data-form=jual] input[name=porsi]', '2'); await p.click('form[data-form=jual] button.primary');
  console.log('3. toast jual:', await p.textContent('#toast'));
  s = await st(p);
  console.log('   stok:', s.bahan.map(x => `${x.nama}=${x.tracked ? x.stok : 'belum'}`).join(', '));
  // 4. Beranda
  await p.goto(B + '#/'); await p.waitForSelector('.journey');
  console.log('4. beranda:', await txt(p, '.card:has(h2:text("Stok"))'));
  // 5. Isi stok satu bahan dari baris
  await p.goto(B + '#/stok?tab=bahan'); await p.waitForSelector('.bahan');
  await p.click(`[data-action=open][data-type=opname][data-id="${id('Cabai rawit')}"]`);
  await p.fill('form[data-form=opname] input[name=stok]', '250'); await p.click('form[data-form=opname] button.primary');
  console.log('5. isi satuan:', await p.textContent('#toast'));
  await p.screenshot({ path: process.argv[2] + '/bahan-tracked.png', fullPage: true });
  // 6. Migrasi data lama: buang flag tracked, bahan "lama" minus tanpa log beli/opname
  await p.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('racikin:v1'));
    d.bahan = d.bahan.map(({ tracked, ...x }) => x);
    d.bahan.push({ id: 'legacy1', nama: 'Bakso (data lama)', satuan: 'pcs', harga: 1000, stok: -4, min: 0 });
    d.stokLog.push({ id: 'l1', tanggal: '2026-11-10', bahanId: 'legacy1', delta: -4, alasan: 'jual', catatan: '' });
    localStorage.setItem('racikin:v1', JSON.stringify(d));
  });
  await p.reload(); await p.waitForSelector('.bahan');
  s = await st(p);
  const tr = Object.fromEntries(s.bahan.map(x => [x.nama, x.tracked ?? 'undefined']));
  console.log('6. migrasi:', JSON.stringify(tr));
  // 7. beli bahan lama yg minus -> stok = jumlah beli
  await p.click('[data-action=open][data-type=beli][data-id="legacy1"]');
  await p.fill('form[data-form=beli] input[name=qty]', '30'); await p.click('form[data-form=beli] button.primary');
  s = await st(p);
  console.log('7. bakso setelah beli 30:', s.bahan.find(x => x.id === 'legacy1').stok, 'tracked', s.bahan.find(x => x.id === 'legacy1').tracked);
  console.log('errors:', errs);
  await b.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
