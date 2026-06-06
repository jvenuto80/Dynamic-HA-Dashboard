// Capture NOC-specific screenshots: the servers overview (with switch port
// strips) and a node flyout with a port selected (showing the linked-node jump
// + the named entity button). Run against the dev server:
//   BASE_URL=http://localhost:3000 node scripts/noc-shots.mjs
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const OUT = fileURLToPath(new URL('../screenshots/', import.meta.url));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function run() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('.tile, .noc-view, .camera-grid', { timeout: 30000 });
  await sleep(1200);

  // Find the sidebar page that renders a NOC view (has .noc-node tiles).
  const navButtons = page.locator('.sidebar-btn:not(.sidebar-settings)');
  const count = await navButtons.count();
  let nocFound = false;
  for (let i = 0; i < count; i++) {
    await navButtons.nth(i).click();
    await sleep(1400);
    if (await page.locator('.noc-node').count()) {
      nocFound = true;
      break;
    }
  }
  if (!nocFound) {
    console.error('No NOC page found — make a page with board-type NOC (servers) first.');
    await browser.close();
    process.exit(1);
  }

  await sleep(800);
  await page.screenshot({ path: `${OUT}10-noc.png` });
  console.log('captured 10-noc');

  // Open the switch node that has a port strip.
  const switchNode = page.locator('.noc-node:has(.noc-ports)').first();
  const target = (await switchNode.count()) ? switchNode : page.locator('.noc-node').first();
  await target.scrollIntoViewIfNeeded().catch(() => {});
  await target.click();
  const ok = await page
    .waitForSelector('.noc-fly.open', { timeout: 8000 })
    .then(() => true)
    .catch(() => false);
  if (!ok) {
    console.error('Node flyout did not open.');
    await browser.close();
    process.exit(1);
  }
  await sleep(900);

  // Select a port to reveal the detail card. Prefer an SFP/uplink cell (last
  // one), which shows the linked-node jump button.
  const flyPorts = page.locator('.noc-fly .noc-ports-lg .noc-port');
  const pCount = await flyPorts.count();
  if (pCount) {
    await flyPorts.nth(pCount - 1).click().catch(() => {});
    await sleep(700);
    // If that port has no detail actions, fall back to the first PoE port.
    if (!(await page.locator('.noc-port-actions').count())) {
      await flyPorts.first().click().catch(() => {});
      await sleep(700);
    }
  }
  await page.screenshot({ path: `${OUT}11-noc-port-flyout.png` });
  console.log('captured 11-noc-port-flyout');

  await browser.close();
  console.log('done →', OUT);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
