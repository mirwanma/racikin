// E2E Racikin (mvp.js). Lihat tests/README.md untuk cara menjalankan.
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  p.on('pageerror', e => errors.push('pageerror: ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  p.on('dialog', d => d.accept());
  const S = process.argv[2];
  await p.goto((process.env.RACIKIN_URL || 'http://localhost:8766/'));
  await p.waitForSelector('.hero');
  await p.screenshot({ path: S + '/01-onboarding.png', fullPage: true });
  await p.click('[data-action=sample]');
  await p.waitForSelector('.journey');
  await p.screenshot({ path: S + '/02-home.png', fullPage: true });
  const steps = [['ide','[data-action=run]','.score'],['rab','[data-action=gen]','.budget'],['brand','[data-action=gen]','.brand-preview'],['aktivasi','[data-action=gen]','.channel']];
  for (const [r, btn, done] of steps) {
    await p.goto('http://localhost:8766/#/' + r);
    await p.click(btn);
    await p.waitForSelector(done, { timeout: 5000 });
    await p.screenshot({ path: `${S}/03-${r}.png`, fullPage: true });
  }
  // RAB realisasi
  await p.goto('http://localhost:8766/#/rab');
  await p.fill('[data-change=real][data-idx="0"]', '750000'); await p.press('[data-change=real][data-idx="0"]', 'Tab');
  // Aktivasi check
  await p.goto('http://localhost:8766/#/aktivasi');
  await p.check('.channel[open] input[type=checkbox] >> nth=0');
  console.log('act count', await p.textContent('#act-count'));
  // Kas
  await p.goto('http://localhost:8766/#/kas');
  await p.fill('textarea[name=text]', 'jual 25 porsi @12rb, beli tahu 50rb, gas 22rb, beli cup 300 pcs 90rb');
  await p.click('form[data-form=parse] button');
  await p.waitForSelector('.draft');
  console.log('draft', (await p.$$eval('.draft .tx', els => els.map(e => e.innerText.replace(/\n/g,' | ')))));
  await p.click('[data-action=saveDraft]');
  await p.click('[data-action=insight]');
  await p.waitForSelector('.card h3');
  await p.screenshot({ path: S + '/04-kas.png', fullPage: true });
  // Konten
  await p.goto('http://localhost:8766/#/konten');
  await p.click('form[data-form=gen] button');
  await p.waitForSelector('.post', { timeout: 5000 });
  await p.click('.post.today .check').catch(()=>{});
  await p.screenshot({ path: S + '/05-konten.png', fullPage: true });
  // Mentor
  await p.goto('http://localhost:8766/#/mentor');
  await p.click('.chip-btn >> nth=0');
  await p.waitForSelector('.bubble.ai >> nth=1', { timeout: 5000 });
  await p.screenshot({ path: S + '/06-mentor.png' });
  await p.goto('http://localhost:8766/#/');
  await p.waitForSelector('.journey');
  console.log('journey', await p.textContent('.journey .pill'));
  await p.screenshot({ path: S + '/07-home-after.png', fullPage: true });
  await p.goto('http://localhost:8766/#/setelan');
  await p.screenshot({ path: S + '/08-setelan.png', fullPage: true });
  // SW registered?
  const sw = await p.evaluate(async () => !!(await navigator.serviceWorker.getRegistration()));
  console.log('sw', sw, 'errors', errors);
  await b.close();
})();
