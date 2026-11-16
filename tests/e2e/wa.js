// E2E Racikin (wa.js): halaman WhatsApp (nomor, link & QR pesan, teks menu, broadcast), Kasir "Order dari chat WA",
// kirim rekap & tutup shift ke pemilik (data contoh, Mode Demo). Link wa.me dicek tanpa benar-benar membuka WhatsApp.
const { chromium } = require('playwright');
const B = (process.env.RACIKIN_URL || 'http://localhost:8766/'), OUT = process.argv[2];
const st = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('racikin:v1')));
const txt = async (p, sel) => (await p.textContent(sel)).replace(/\s+/g, ' ').trim();
const ok = (cond, label) => { console.log((cond ? 'OK   ' : 'GAGAL') + ' ' + label); if (!cond) process.exitCode = 1; };

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await ctx.route('https://wa.me/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<p>wa</p>' })); // jangan buka WhatsApp beneran
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write']);
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
  p.on('dialog', d => d.accept());
  await p.goto(B); await p.click('[data-action=dummy]'); await p.waitForSelector('.journey', { timeout: 20000 });
  await p.evaluate(() => { const x = JSON.parse(localStorage.getItem('racikin:v1')); x.promo = x.promo.map((q) => ({ ...q, aktif: false })); localStorage.setItem('racikin:v1', JSON.stringify(x)); });

  // Halaman WhatsApp lewat modul Bisnis
  await p.goto(B + '#/bisnis'); await p.click('a[href="#/wa"]'); await p.waitForSelector('form[data-form=nomor]');
  ok(await p.isVisible('text=Isi nomor WA usaha dulu'), 'tanpa nomor: link & QR belum muncul');
  await p.fill('form[data-form=nomor] input[name=usaha]', '0812-3456-7890');
  await p.fill('form[data-form=nomor] input[name=pemilik]', '081299990000');
  await p.click('form[data-form=nomor] button'); await p.waitForSelector('.wa-qr svg', { timeout: 10000 });
  let s = await st(p);
  ok(s.wa.usaha === '0812-3456-7890' && s.wa.pemilik === '081299990000', 'nomor usaha & pemilik tersimpan');
  ok((await txt(p, '.wa-link')).startsWith('https://wa.me/6281234567890?text=Halo%20TAHGUY'), 'link Pesan via WA ke nomor usaha');
  const menu = await p.inputValue('.wa-teks');
  ok(menu.includes('*MENU*') && menu.includes('Tahu Guyur Original Rp12.000') && menu.includes('Pesan langsung: https://wa.me/6281234567890'), 'teks menu siap kirim');
  await p.click('[data-action=salinMenu]');
  ok((await p.evaluate(() => navigator.clipboard.readText())).startsWith('*TAHGUY*'), 'teks menu tersalin');

  // Broadcast: kelompok "Lama nggak balik", kirim ke 2 pelanggan
  await p.selectOption('select[data-change=segmen]', 'lama'); await p.waitForTimeout(200);
  const nLama = await p.$$eval('.wa-row', (a) => a.length);
  ok(nLama > 0, `${nLama} pelanggan lama nggak balik`);
  const href = await p.getAttribute('.wa-row >> nth=0 >> a', 'href');
  console.log('broadcast:', decodeURIComponent(href).slice(0, 160));
  ok(/^https:\/\/wa\.me\/62\d+\?text=Halo /.test(decodeURIComponent(href)) && !decodeURIComponent(href).includes('{'), 'pesan broadcast personal tanpa kode mentah');
  const [pop] = await Promise.all([p.waitForEvent('popup'), p.click('.wa-row >> nth=0 >> a')]); await pop.close();
  const [pop2] = await Promise.all([p.waitForEvent('popup'), p.click('.wa-row >> nth=1 >> a')]); await pop2.close();
  await p.waitForTimeout(500);
  ok((await txt(p, '.wa-list')).includes('Terkirim') && (await p.textContent('.progress + .wa-list, .card')).length > 0, 'tanda terkirim');
  ok((await p.textContent('body')).includes(`2/${nLama} terkirim hari ini`), 'progres 2/N terkirim');
  await p.screenshot({ path: OUT + '/w1-wa.png', fullPage: true });

  // Kasir: Order dari chat WA
  await p.goto(B + '#/kasir'); await p.waitForSelector('.pos-grid');
  await p.click('[data-action=chatBuka]'); await p.waitForSelector('textarea[data-change=chatText]');
  await p.fill('textarea[data-change=chatText]', 'kak pesen tahu guyur bakso 2, es teh 1, martabak 1\natas nama Budi, ambil jam 5 ya');
  await p.press('textarea[data-change=chatText]', 'Tab');
  await p.click('[data-action=chatBaca]'); await p.waitForSelector('.chat-row');
  const rows = await p.$$eval('.chat-row', (a) => a.map((x) => x.querySelector('select').selectedOptions[0].textContent + ' x' + x.querySelector('input').value));
  console.log('chat:', rows, '|', await txt(p, '.sheet'));
  ok(rows.join() === 'Tahu Guyur Bakso x2,Es Teh Manis x1', 'chat kebaca jadi 2 menu');
  ok((await txt(p, '.sheet')).includes('"martabak 1"'), 'yang nggak kebaca ditampilkan');
  ok((await p.inputValue('input[data-f=atasNama]')) === 'Budi', 'atas nama kebaca');
  await p.screenshot({ path: OUT + '/w2-chat.png' });
  await p.click('[data-action=chatMasuk]'); await p.waitForSelector('.pos-line');
  const lines = await p.$$eval('.pos-line', (a) => a.map((x) => x.textContent.replace(/\s+/g, ' ').trim()));
  console.log('keranjang:', lines);
  ok(lines.length === 2 && lines[0].includes('Tahu Guyur Bakso') && lines[0].includes('Tidak pedas'), 'masuk keranjang (varian wajib pakai pilihan default)');
  ok((await p.inputValue('input[data-change=atasNama]')) === 'Budi' && (await p.inputValue('input[data-change=catatanDapur]')).includes('jam 5'), 'atas nama & catatan ikut');
  await p.click('[data-action=uang] >> nth=0'); await p.click('[data-action=selesai]'); await p.waitForSelector('.struk');
  s = await st(p);
  const o = s.orders[s.orders.length - 1];
  ok(o.atasNama === 'Budi' && o.catatanDapur?.includes('jam 5') && o.items.length === 2, 'order tersimpan dengan atas nama & catatan');

  // Rekap hari ini -> kirim ke pemilik
  await p.click('label:has(input[name=tab][value=rekap])'); await p.waitForSelector('.stats3');
  const rekap = await p.getAttribute('a:has-text("Kirim rekap ke pemilik")', 'href');
  ok(rekap.startsWith('https://wa.me/6281299990000?text=') && decodeURIComponent(rekap).includes('*Rekap TAHGUY*'), 'kirim rekap ke WA pemilik');

  // Shift: riwayat -> kirim ke pemilik
  await p.goto(B + '#/shift'); await p.waitForSelector('.pos-order-head');
  await p.click('.pos-order-head >> nth=0'); await p.waitForSelector('a:has-text("Kirim ke pemilik")');
  const sh = decodeURIComponent(await p.getAttribute('a:has-text("Kirim ke pemilik")', 'href'));
  console.log('shift:', sh.slice(0, 200));
  ok(sh.includes('*Tutup shift TAHGUY*') && sh.includes('Seharusnya di laci'), 'ringkasan tutup shift ke pemilik');

  // Buka dari halaman WA -> Kasir langsung buka sheet chat
  await p.goto(B + '#/wa'); await p.click('a[href="#/kasir?wa=1"]'); await p.waitForSelector('textarea[data-change=chatText]');
  ok(true, 'link dari halaman WA membuka Order dari chat WA');

  console.log('errors:', errs);
  await b.close();
})();
