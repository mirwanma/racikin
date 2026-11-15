// E2E Racikin (notif.js). Lihat tests/README.md untuk cara menjalankan.
const { chromium } = require('playwright');
const B = (process.env.RACIKIN_URL || 'http://localhost:8766/'), OUT = process.argv[2];
const txt = async (p, sel) => (await p.textContent(sel)).replace(/\s+/g, ' ').trim();
(async () => {
  const dir = require('fs').mkdtempSync(require('path').join(process.cwd(), 'chprof-'));
  const ctx = await chromium.launchPersistentContext(dir, { channel: 'chromium', viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const b = ctx;
  await ctx.grantPermissions(['notifications'], { origin: new URL(process.env.RACIKIN_URL || 'http://localhost:8766/').origin });
  const p = ctx.pages()[0] || await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
  p.on('dialog', d => d.accept());
  await p.goto(B + '#/notif'); await p.waitForSelector('.card');
  console.log('belum login:', await txt(p, '.empty h3'));
  await p.goto(B); await p.click('[data-action=sample]'); await p.waitForSelector('.journey');
  await p.goto(B + '#/akun'); await p.fill('input[name=email]', 'racikin-tim-owner@racikin.test'); await p.fill('input[name=password]', process.env.RACIKIN_TEST_PASSWORD);
  await p.click('form[data-form=auth] button.primary'); await p.waitForTimeout(5000);
  await p.goto(B + '#/setelan'); await p.click('a[href="#/notif"]');
  await p.waitForTimeout(4000); console.log('VIEW:', (await txt(p, '#view')).slice(0, 300), errs);
  await p.waitForSelector('[data-action=enable]');
  await p.screenshot({ path: OUT + '/1-notif-off.png', fullPage: true });
  await p.click('[data-action=enable]');
  await p.waitForFunction(() => document.querySelector('[data-action=test]') || /gagal|ditolak|Registration|failed|error/i.test(document.querySelector('#toast')?.textContent || ''), null, { timeout: 45000 }).catch(() => console.log('timeout tunggu enable'));
  await p.waitForTimeout(1500);
  console.log('toast:', await p.textContent('#toast'));
  const aktif = await p.$('[data-action=test]');
  console.log('aktif:', !!aktif, 'endpoint:', await p.evaluate(async () => (await (await navigator.serviceWorker.ready).pushManager.getSubscription())?.endpoint?.slice(0, 60)));
  if (aktif) {
    // Pantau notifikasi yang ditampilkan service worker
    await p.uncheck('input[data-k=ajak]'); await p.waitForTimeout(800);
    await p.selectOption('select[data-k=malam]', '22'); await p.waitForTimeout(800);
    await p.screenshot({ path: OUT + '/2-notif-on.png', fullPage: true });
    await p.waitForTimeout(31000); await p.click('[data-action=test]'); for (let i = 0; i < 12; i++) { await p.waitForTimeout(2500); if ((await p.evaluate(async () => (await (await navigator.serviceWorker.ready).getNotifications()).length))) break; }
    console.log('toast tes:', await p.textContent('#toast'));
    const shown = await p.evaluate(async () => (await (await navigator.serviceWorker.ready).getNotifications()).map(n => `${n.title} | ${n.body} | ${JSON.stringify(n.data)}`));
    console.log('notifikasi tampil:', shown);
    const ep = await p.evaluate(async () => (await (await navigator.serviceWorker.ready).pushManager.getSubscription())?.endpoint);
    console.log('endpoint host:', new URL(ep).host);
  }
  console.log('errors:', errs);
  await b.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
