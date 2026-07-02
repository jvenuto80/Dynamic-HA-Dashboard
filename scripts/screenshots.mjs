// One-off screenshot capture of the dashboard's features using Playwright.
// Drives the running dev server (default http://localhost:3000) at a tablet
// viewport and writes PNGs to ./screenshots. Run: node scripts/screenshots.mjs
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const OUT = fileURLToPath(new URL('../screenshots/', import.meta.url));
const VIEWPORT = { width: 1920, height: 1080 };

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

/** Close any open detail flyout / modal and wait for the overlay to clear. */
async function closeFlyout(page) {
  for (let i = 0; i < 5; i++) {
    const overlay = page.locator('.detail-overlay.open, .ts-overlay').first();
    if (!(await overlay.count())) return;
    // The close button INSIDE the open panel (there are stray .detail-close
    // buttons in other, closed panels — target only the open one).
    const closeBtn = page.locator('.detail-panel.open .detail-close').first();
    if (await closeBtn.count()) await closeBtn.click().catch(() => {});
    // The overlay's own click handler also closes the panel; click a corner
    // well away from the flyout body as a fallback.
    await overlay.click({ position: { x: 4, y: 4 } }).catch(() => {});
    await page.keyboard.press('Escape').catch(() => {});
    await sleep(450);
  }
  // Last resort: wait for it to detach.
  await page.waitForSelector('.detail-overlay.open, .ts-overlay', { state: 'detached', timeout: 3000 }).catch(() => {});
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
      // A media flyout shows the now-playing scrubber.
      const ok = await page
        .waitForSelector('.detail-panel.open .media-progress, .detail-panel.open', { timeout: 8000 })
        .then(() => true)
        .catch(() => false);
      if (ok) {
        await sleep(1400);
        const title = await page.locator('.detail-panel.open .detail-header h2').textContent().catch(() => '');
        console.log('  media flyout →', title?.trim());
        await shot(page, '20-flyout-media');
        mediaShot = true;
      }
      await closeFlyout(page);
    }
  }
  if (!mediaShot) console.log('no playing media tile found — skipped media flyout');

  // Light flyout — capture a real light's controls. A light needs to be ON for
  // its brightness/color controls to render, but automations may switch it back
  // off, so we turn one on ourselves (tap the tile body) right before opening.
  // We can't read an entity's domain from the DOM, so we match tiles by name
  // (lamp/light) and confirm by the presence of .light-slider (and absence of a
  // media .media-progress) in the opened panel.
  let lightShot = false;
  for (let i = 0; i < count && !lightShot; i++) {
    await navButtons.nth(i).click();
    await sleep(900);
    const named = page.locator('.tile', { has: page.locator('.tile-name') });
    const total = await named.count();
    for (let j = 0; j < total && !lightShot; j++) {
      const tile = named.nth(j);
      const label = (await tile.locator('.tile-name').first().textContent().catch(() => '')) || '';
      if (!/lamp|light/i.test(label)) continue;
      await tile.scrollIntoViewIfNeeded().catch(() => {});
      // Ensure it's on: a light tile that's on carries .on / .live-light.
      const cls = (await tile.getAttribute('class')) || '';
      if (!/\bon\b|live-light/.test(cls)) {
        await tile.click().catch(() => {}); // toggle on
        await sleep(1400);
      }
      // Open its detail via the "more" dots (tapping the body would toggle off).
      const more = tile.locator('.tile-more');
      if (!(await more.count())) continue;
      await more.click().catch(() => {});
      const isLight = await page
        .waitForSelector('.detail-panel.open .light-slider', { timeout: 3000 })
        .then(() => true)
        .catch(() => false);
      const isMedia = (await page.locator('.detail-panel.open .media-progress').count()) > 0;
      if (isLight && !isMedia) {
        await sleep(1000);
        const title = await page.locator('.detail-panel.open .detail-header h2').textContent().catch(() => '');
        console.log('  light flyout →', title?.trim());
        await shot(page, '21-flyout-light');
        lightShot = true;
      }
      await closeFlyout(page);
    }
  }
  if (!lightShot) console.log('no light tile with brightness found — skipped light flyout');

  // 2.5 Vacuum — the app-like tile (live map) + control-center flyout.
  const vacBtn = page.locator('.sidebar-btn[title="Vacuum"]').first();
  if (await vacBtn.count()) {
    await vacBtn.click();
    await sleep(1800); // let the map image load
    await shot(page, '25-vacuum');
    const vacTile = page.locator('.vacuum-tile').first();
    if (await vacTile.count()) {
      await vacTile.click();
      const ok = await page
        .waitForSelector('.detail-panel.open .vacuum-panel', { timeout: 8000 })
        .then(() => true)
        .catch(() => false);
      if (ok) {
        await sleep(1800);
        await shot(page, '26-vacuum-flyout');
      } else {
        console.log('vacuum flyout did not open — skipped');
      }
      await closeFlyout(page);
    }
  } else {
    console.log('no Vacuum view — skipped vacuum shots');
  }

  // 2.6 Music Assistant — search & play flyout with the active-player dropdown open.
  const mediaBtn = page.locator('.sidebar-btn[title="Media"]').first();
  if (await mediaBtn.count()) {
    await mediaBtn.click();
    await sleep(1200);
    const maTile = page.locator('.ma-tile').first();
    if (await maTile.count()) {
      await maTile.click();
      const ok = await page
        .waitForSelector('.ma-flyout.open', { timeout: 6000 })
        .then(() => true)
        .catch(() => false);
      if (ok) {
        await sleep(900);
        // Open the player dropdown so the (active-only) speaker list shows.
        await page.locator('.ma-flyout .ma-dd-button').first().click().catch(() => {});
        await sleep(700);
        await shot(page, '27-music-assistant');
        await page.keyboard.press('Escape').catch(() => {});
      } else {
        console.log('MA flyout did not open — skipped');
      }
      await closeFlyout(page);
    } else {
      console.log('no Music Assistant tile on Media view — skipped MA shot');
    }
  } else {
    console.log('no Media view — skipped MA shot');
  }

  // 3. Edit mode — capture on the home view.
  await navButtons.first().click();
  await sleep(900);
  const editBtn = page.locator('.toolbar-btn', { hasText: 'Edit' }).first();
  await editBtn.waitFor({ timeout: 5000 }).catch(() => {});
  if (await editBtn.count()) {
    await editBtn.click().catch(() => {});
    const inEdit = await page
      .waitForSelector('.view-rows.editing', { timeout: 5000 })
      .then(() => true)
      .catch(() => false);
    await sleep(1200);
    if (inEdit) await shot(page, '30-edit-mode');
    else console.log('edit mode did not engage — skipped');
    const doneBtn = page.locator('.toolbar-btn', { hasText: 'Done' }).first();
    if (await doneBtn.count()) await doneBtn.click().catch(() => {});
    await sleep(800);
  } else {
    console.log('edit button not found — skipped edit mode');
  }

  // 4. Settings modal.
  await page.locator('.sidebar-settings').click().catch(() => {});
  await page.waitForSelector('.settings-modal, .ts-modal', { timeout: 8000 }).catch(() => {});
  await sleep(900);
  await shot(page, '40-settings');
  await closeFlyout(page);

  // 4.5 Assist flyout — open the mic button, ask a harmless question, capture
  // the chat exchange. "What time is it?" is a read-only query (no device is
  // toggled), and Assist answers from whatever conversation agent HA uses.
  const assistFab = page.locator('.assist-fab').first();
  if (await assistFab.count()) {
    await assistFab.click().catch(() => {});
    const ok = await page
      .waitForSelector('.assist-panel', { timeout: 5000 })
      .then(() => true)
      .catch(() => false);
    if (ok) {
      await sleep(400);
      await page.locator('.assist-input').fill('What time is it?').catch(() => {});
      await page.locator('.assist-send').click().catch(() => {});
      // Wait for Assist's reply bubble (real round-trip), then let it settle.
      await page.waitForSelector('.assist-msg.assist', { timeout: 8000 }).catch(() => {});
      await sleep(1000);
      await shot(page, '70-assist');
      await page.keyboard.press('Escape').catch(() => {});
      await sleep(400);
    } else {
      console.log('assist panel did not open — skipped');
    }
  } else {
    console.log('no assist button (disabled?) — skipped assist shot');
  }

  // 4.6 Settings → Appearance, scrolled to the scene-wash picker so the new
  // Scene color wash / Assist / Pull-to-refresh controls are visible.
  await page.locator('.sidebar-settings').click().catch(() => {});
  await page.waitForSelector('.settings-modal, .ts-modal', { timeout: 8000 }).catch(() => {});
  await sleep(700);
  const washField = page.locator('.ts-field', { has: page.locator('select option[value="burst"]') }).first();
  if (await washField.count()) {
    await washField.scrollIntoViewIfNeeded().catch(() => {});
    await sleep(500);
    await shot(page, '41-settings-appearance');
  } else {
    console.log('scene-wash setting not found — skipped appearance shot');
  }
  await closeFlyout(page);

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

  // 6. Phone-width shot — shows the responsive layout shrunk to a cell phone.
  const phone = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  });
  const phonePage = await phone.newPage();
  await phonePage.goto(BASE, { waitUntil: 'networkidle' });
  await waitReady(phonePage);
  await sleep(800);
  await phonePage.screenshot({ path: `${OUT}60-mobile.png` });
  console.log('captured 60-mobile');
  await phone.close();

  await browser.close();
  console.log('done →', OUT);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
