// E2E Racikin (loyal.js). Lihat tests/README.md untuk cara menjalankan.
const { chromium } = require('playwright');
const B = process.argv[3] || (process.env.RACIKIN_URL || 'http://localhost:8766/'), OUT = process.argv[2];
const st = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('racikin:v1')));
const txt = async (p, sel) => (await p.textContent(sel)).replace(/\s+/g, ' ').trim();
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
  let first = true; p.on('dialog', d => { if (first && d.message().includes('cloud')) { first = false; console.log('dialog cloud vs perangkat -> perangkat'); return d.dismiss(); } d.accept(); });
  await p.goto(B); await p.click('[data-action=sample]'); await p.waitForSelector('.journey');
  // login (supaya kartu ter-upload)
  await p.goto(B + '#/akun'); await p.fill('input[name=email]', 'racikin-test-k@racikin.test'); await p.fill('input[name=password]', process.env.RACIKIN_TEST_K_PASSWORD);
  await p.click('form[data-form=auth] button.primary'); await p.waitForFunction(() => location.hash !== '#/akun', null, { timeout: 20000 });
  await p.waitForTimeout(4000); // tunggu sinkron pertama (dialog cloud vs perangkat) selesai
  // 1. Program
  await p.goto(B + '#/bisnis'); await p.click('a[href="#/pelanggan"]'); await p.waitForSelector('form[data-form=program]');
  await p.fill('form[data-form=program] input[name=target]', '5');
  await p.fill('form[data-form=program] input[name=hadiah]', '1 porsi Tahu Guyur gratis');
  await p.fill('form[data-form=program] input[name=minBelanja]', '10000');
  await p.click('form[data-form=program] button.primary');
  console.log('1. program:', await txt(p, '.program-card h2'));
  // 2. Tambah pelanggan
  const add = async (nama, wa) => { await p.fill('form[data-form=add] input[name=nama]', nama); await p.fill('form[data-form=add] input[name=wa]', wa); await p.click('form[data-form=add] button.primary'); await p.waitForTimeout(150); };
  if (!(await p.isVisible('form[data-form=add]'))) await p.click('details:has(form[data-form=add]) summary');
  await add('Dimas Pratama', '0812-3456-7890');
  if (!(await p.isVisible('form[data-form=add]'))) await p.click('details:has(form[data-form=add]) summary');
  await add('Sinta', '81299998888');
  let s = await st(p);
  console.log('2. pelanggan:', s.pelanggan.map(x => `${x.nama} wa=${x.wa} stempel=${x.stempel}`).join(' | '));
  const dimas = s.pelanggan.find(x => x.nama.startsWith('Dimas'));
  // 3. +stempel sampai siap tukar
  for (let i = 0; i < 4; i++) await p.click(`[data-action=stempel][data-id="${dimas.id}"]`);
  console.log('3. toast:', await p.textContent('#toast'), '| tag:', await p.isVisible('.cust.ready .tag.ready'));
  await p.screenshot({ path: OUT + '/pelanggan.png', fullPage: true });
  // 4. Kartu link + WA
  await p.click(`[data-action=open][data-type=kartu][data-id="${dimas.id}"]`);
  const wa = await p.getAttribute('a[data-action=sendCard]', 'href');
  console.log('4. WA link:', decodeURIComponent(wa).slice(0, 150));
  await p.waitForTimeout(2500); // tunggu upload kartu
  const link = B + '#/kartu/' + dimas.token;
  // 5. Pelanggan buka kartu (browser lain, tanpa login, tanpa data)
  const cust = await (await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })).newPage();
  await cust.goto(link); await cust.waitForSelector('.loyal-card', { timeout: 20000 });
  console.log('5. kartu publik:', await txt(cust, '.loyal-card'), '| tabbar tampil:', await cust.isVisible('.tabbar'));
  await cust.screenshot({ path: OUT + '/kartu-siap.png' });
  // 6. Tukar hadiah -> kartu publik terupdate
  await p.click(`[data-action=tukar][data-id="${dimas.id}"]`);
  await p.waitForTimeout(2500);
  await cust.click('[data-action=reload]'); await cust.waitForSelector('.loyal-card');
  console.log('6. setelah tukar:', await txt(cust, '.lc-reward'), '|', await txt(cust, 'p.center'));
  await cust.screenshot({ path: OUT + '/kartu-0.png' });
  // 7. Jual via Stok dengan pelanggan (perlu resep): buat resep demo cepat
  await p.goto(B + '#/resep?id=new');
  await p.fill('[data-f=nama][data-change=field]', 'Tahu Guyur Original'); await p.press('[data-f=nama][data-change=field]', 'Tab');
  await p.fill('[data-f=harga][data-change=field]', '12000'); await p.press('[data-f=harga][data-change=field]', 'Tab');
  await p.click('[data-action=aiFill]'); await p.waitForSelector('.resep-row .new-price');
  p.removeAllListeners('dialog'); p.on('dialog', d => d.dismiss()); // jangan isi stok sekarang
  await p.click('[data-action=save]'); await p.waitForSelector('.resep-card');
  p.removeAllListeners('dialog'); p.on('dialog', d => d.accept());
  const sinta = s.pelanggan.find(x => x.nama === 'Sinta');
  await p.click('[data-action=open][data-type=jual]'); await p.fill('form[data-form=jual] input[name=porsi]', '2');
  await p.selectOption('form[data-form=jual] select[name=pelanggan]', sinta.id); await p.click('form[data-form=jual] button.primary');
  console.log('7a. jual 2 porsi (24rb ≥ min 10rb):', await p.textContent('#toast'));
  await p.click('[data-action=open][data-type=jual]'); await p.fill('form[data-form=jual] input[name=porsi]', '1'); await p.fill('form[data-form=jual] input[name=harga]', '8000');
  await p.selectOption('form[data-form=jual] select[name=pelanggan]', sinta.id); await p.click('form[data-form=jual] button.primary');
  console.log('7b. jual 1 porsi 8rb (< min):', await p.textContent('#toast'));
  // 8. Ajak balik: buat Sinta terakhir 30 hari lalu
  await p.evaluate(() => { const d = JSON.parse(localStorage.getItem('racikin:v1')); d.pelanggan = d.pelanggan.map(x => x.nama === 'Sinta' ? { ...x, terakhir: '2026-10-10' } : x); localStorage.setItem('racikin:v1', JSON.stringify(d)); });
  await p.goto(B + '#/'); await p.reload(); await p.waitForSelector('.journey');
  console.log('8a. beranda:', await txt(p, '.card:has(h2:text("Pelanggan setia"))'));
  await p.goto(B + '#/pelanggan'); await p.waitForSelector('.warn-card');
  console.log('8b. ajak balik WA:', decodeURIComponent(await p.getAttribute('.warn-card a.btn', 'href')).slice(0, 200));
  await p.click('details.tpl summary'); await p.click('[data-action=aiTpl]'); await p.waitForFunction(() => document.querySelector('#toast').textContent.includes('AI'));
  console.log('8c. template AI(demo):', (await st(p)).loyalty.pesanAjak.slice(0, 120));
  await p.screenshot({ path: OUT + '/ajak.png', fullPage: true });
  // 9. token tidak valid & tidak ditemukan
  await cust.goto(B + '#/kartu/00000000-0000-4000-8000-000000000000'); await cust.waitForSelector('.empty');
  console.log('9. kartu salah:', await txt(cust, '.empty h3'));
  console.log('errors:', errs);
  await b.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
