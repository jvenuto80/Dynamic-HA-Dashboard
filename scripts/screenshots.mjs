// One-off screenshot capture of the dashboard's features using Playwright.
// Drives the running dev server (default http://localhost:3000) at a tablet
// viewport and writes PNGs to ./screenshots. Run: node scripts/screenshots.mjs
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const OUT = fileURLToPath(new URL('../screenshots/', import.meta.url));
const VIEWPORT = { width: 1024, height: 768 };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function shot(page, name) {
  await page.screenshot({ path: `${OUT}${name}.png` });
  console.log('captured', name);
}

/** Wait until the dashboard has rendered tiles (i.e. HA connected). */
async function waitReady(page) {
  await page.waitForSelector('.tile, .ts-modal, .camera-grid', { timeout: 30000 });
  await sleep(1200); // let entrance animations settle
}

async function run() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2 });
  const page = await ctx.newPage();

  // 1. Main + each sidebar view.
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await waitReady(page);
  await shot(page, '01-main');

  const navButtons = page.locator('.sidebar-btn:not(.sidebar-settings)');
  const count = await navButtons.count();
  for (let i = 0; i < count; i++) {
    await navButtons.nth(i).click();
    await sleep(1400);
    const label = (await navButtons.nth(i).getAttribute('title')) || `view-${i}`;
    const safe = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    await shot(page, `view-${String(i).padStart(2, '0')}-${safe}`);
  }

  // 2. Detail flyout — media tile (now-playing) and a light tile.
  // Hunt across views for a playing media tile (it shows a .tile-eq badge) or
  // any media tile with artwork.
  let mediaShot = false;
  for (let i = 0; i < count && !mediaShot; i++) {
    await navButtons.nth(i).click();
    await sleep(1200);
    const media = page.locator('.tile:has(.tile-eq), .tile.has-artwork').first();
    if (await media.count()) {
      await media.scrollIntoViewIfNeeded().catch(() => {});
      await media.click();
      await page.waitForSelector('.detail-panel, .ts-modal, .flyout, .media-progress', { timeout: 8000 }).catch(() => {});
      await sleep(1400);
      await shot(page, '20-flyout-media');
      await page.keyboard.press('Escape');
      await sleep(800);
      mediaShot = true;
    }
  }
  if (!mediaShot) console.log('no playing media tile found — skipped media flyout');
  const light = page.locator('.tile.live-light, .tile.on').first();
  if (await light.count()) {
    await light.click().catch(() => {});
    await sleep(1200);
    await shot(page, '21-flyout-light');
    await page.keyboard.press('Escape');
    await sleep(800);
  }

  // 3. Edit mode.
  const editBtn = page.getByRole('button', { name: /edit/i }).first();
  if (await editBtn.count()) {
    await editBtn.click().catch(() => {});
    await sleep(1400);
    await shot(page, '30-edit-mode');
    const doneBtn = page.getByRole('button', { name: /done/i }).first();
    if (await doneBtn.count()) await doneBtn.click().catch(() => {});
    await sleep(800);
  }

  // 4. Settings modal.
  await page.locator('.sidebar-settings').click().catch(() => {});
  await page.waitForSelector('.settings-modal, .ts-modal', { timeout: 8000 }).catch(() => {});
  await sleep(900);
  await shot(page, '40-settings');
  await page.keyboard.press('Escape');
  await sleep(600);

  // 5. Ambient overrides via URL params.
  const ambient = [
    ['precip=rain', '50-ambient-rain'],
    ['precip=snow', '51-ambient-snow'],
    ['tod=night', '52-ambient-night'],
    ['tod=dusk', '53-ambient-dusk'],
    ['precip=rain&tod=night', '54-ambient-rain-night'],
  ];
  for (const [q, name] of ambient) {
    await page.goto(`${BASE}/?${q}`, { waitUntil: 'networkidle' });
    await waitReady(page);
    await sleep(1500); // let particles populate
    await shot(page, name);
  }

  await browser.close();
  console.log('done →', OUT);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
