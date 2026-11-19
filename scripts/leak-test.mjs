/**
 * Bellek sızıntısı testi: 4 oyuncuyla Çizme / 15 Kelime / Karışık turlarını art arda açıp kapatır;
 * her döngüden sonra (1) açık disposer sayısı, (2) sayfadaki <canvas> sayısı, (3) GC sonrası JS heap
 * ölçülür. Kullanım:  DEV_TOOLS=1 gerekir (.dev.vars) →  npm run dev  →  npm run test:leak
 * Çıkış kodu 0 = sızıntı yok.
 */
import { chromium } from 'playwright';

const URL = process.env.TABU_URL ?? 'http://localhost:5173';
const CYCLES = Number(process.env.CYCLES ?? 12);
const HEAP_BUDGET_MB = Number(process.env.HEAP_BUDGET_MB ?? 6);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({ args: ['--js-flags=--expose-gc'] });
const names = ['Ali', 'Burcu', 'Can', 'Defne'];
const pages = [];
const cdps = [];
const errors = [];
for (const n of names) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(String(e)));
  pages.push(p);
  cdps.push(await ctx.newCDPSession(p));
}

const p0 = pages[0];
await p0.goto(URL);
await p0.fill('input', names[0]);
await p0.getByRole('button', { name: 'Devam' }).click();
await p0.getByRole('button', { name: 'Oda Kur' }).click();
await p0.waitForURL(/\/r\//);
const code = p0.url().split('/r/')[1];
for (let i = 1; i < 4; i++) {
  const p = pages[i];
  await p.goto(URL);
  await p.fill('input', names[i]);
  await p.getByRole('button', { name: 'Devam' }).click();
  await p.getByRole('button', { name: 'Kod ile Gir' }).click();
  await p.fill('input', code);
  await p.getByRole('button', { name: 'Odaya Gir' }).click();
  await p.waitForSelector('text=Bağlı');
}
await p0.waitForSelector('text=Defne');
for (let i = 0; i < 4; i++) {
  const team = i < 2 ? 'A' : 'B';
  await pages[i].locator('.card', { hasText: `Takım ${team} ·` }).getByRole('button', { name: 'Bu takıma geç' }).click();
}
await p0.waitForSelector('text=Takım A · Kırmızı (2)');
for (let i = 0; i < 4; i++) await pages[i].getByRole('button', { name: 'Hazırım' }).click();
await p0.waitForSelector('text=Rolün');

const setBoard = async (a) => {
  await p0.evaluate((a) => window.__tabuSend({ t: 'dev:setBoard', a, b: 0 }), a);
  await sleep(500);
};
const roles = async () =>
  Promise.all(pages.map(async (p) => (await p.locator('.card__title', { hasText: 'Rolün' }).textContent()).replace('Rolün: ', '')));

async function playRound(position, waitSel) {
  await setBoard(position);
  const obs = (await roles()).indexOf('Gözlemci');
  await pages[obs].getByRole('button', { name: 'Tur Başlat' }).click();
  await pages[obs].waitForSelector(waitSel, { timeout: 8000 });
  await sleep(400);
}

async function snapshot() {
  const out = [];
  for (let i = 0; i < pages.length; i++) {
    await cdps[i].send('HeapProfiler.collectGarbage');
    const m = await cdps[i].send('Performance.getMetrics');
    const heap = m.metrics.find((x) => x.name === 'JSHeapUsedSize').value;
    const live = await pages[i].evaluate(() => window.__tabuLive ?? 0);
    const canvases = await pages[i].locator('canvas').count();
    out.push({ heapMB: heap / 1048576, live, canvases });
  }
  return out;
}
for (const c of cdps) await c.send('Performance.enable');

// Düz bir anlatma turuna dön (sahneler kapanır) ve ölç.
async function idle() {
  await setBoard(0);
  await sleep(600);
  return snapshot();
}

const baseline = await idle();
const series = [];
for (let c = 1; c <= CYCLES; c++) {
  await playRound(7, '[role=timer]'); // Çizme
  await playRound(4, '[role=timer]'); // 15 Kelime
  await setBoard(22); // Karışık: çark
  await sleep(1500);
  const snap = await idle();
  series.push(snap);
  console.log(`döngü ${c}: heap(MB)=${snap.map((s) => s.heapMB.toFixed(1)).join(' ')} live=${snap.map((s) => s.live).join(',')} canvas=${snap.map((s) => s.canvases).join(',')}`);
}

let failed = false;
const last = series[series.length - 1];
const warm = series[Math.min(2, series.length - 1)];
for (let i = 0; i < pages.length; i++) {
  const growth = last[i].heapMB - warm[i].heapMB;
  const liveDelta = last[i].live - baseline[i].live;
  if (last[i].canvases !== baseline[i].canvases) { failed = true; console.error(`✗ ${names[i]}: canvas ${baseline[i].canvases} → ${last[i].canvases}`); }
  if (liveDelta !== 0) { failed = true; console.error(`✗ ${names[i]}: açık disposer farkı ${liveDelta}`); }
  if (growth > HEAP_BUDGET_MB) { failed = true; console.error(`✗ ${names[i]}: heap +${growth.toFixed(1)} MB (bütçe ${HEAP_BUDGET_MB})`); }
}
if (errors.length) { failed = true; console.error('sayfa hataları:', errors); }
console.log(failed ? 'SIZINTI VAR' : 'Sızıntı yok ✓');
await browser.close();
process.exit(failed ? 1 : 0);
