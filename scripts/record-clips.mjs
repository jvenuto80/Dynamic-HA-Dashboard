// Records short screen-capture clips of the dashboard's signature animations
// and converts them to web-friendly MP4s for the README.
//
// Each clip runs in its own Playwright browser context with recordVideo on, so
// it yields one .webm; ffmpeg then transcodes to an H.264 .mp4 (faststart) and
// pulls a poster frame. Drives the running dev server (default :3000).
//
//   node scripts/record-clips.mjs
//
// Requires: a running dev server and ffmpeg on PATH.
import { chromium } from 'playwright';
import { mkdir, rm, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const VIEWPORT = { width: 1024, height: 768 };
const OUT = fileURLToPath(new URL('../media/', import.meta.url));
const RAW = fileURLToPath(new URL('../media/.raw/', import.meta.url));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: 'ignore' });
    p.on('error', reject);
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`))));
  });
}

async function waitReady(page) {
  await page.waitForSelector('.tile, .ts-modal, .camera-grid', { timeout: 30000 });
  await sleep(1200);
}

async function closeFlyout(page) {
  for (let i = 0; i < 5; i++) {
    const overlay = page.locator('.detail-overlay.open, .ts-overlay').first();
    if (!(await overlay.count())) return;
    const closeBtn = page.locator('.detail-panel.open .detail-close').first();
    if (await closeBtn.count()) await closeBtn.click().catch(() => {});
    await overlay.click({ position: { x: 4, y: 4 } }).catch(() => {});
    await page.keyboard.press('Escape').catch(() => {});
    await sleep(400);
  }
}

/**
 * Record one clip. `fn(page)` performs the interaction; the surrounding context
 * captures it to a .webm which we then transcode to `<name>.mp4`.
 */
async function clip(browser, name, fn, { startPath = '/' } = {}) {
  const ctx = await browser.newContext({
    viewport: VIEWPORT,
    recordVideo: { dir: RAW, size: VIEWPORT },
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE}${startPath}`, { waitUntil: 'networkidle' });
  await waitReady(page);
  await fn(page);
  await sleep(600);
  const video = page.video();
  await ctx.close(); // finalizes the webm
  const webm = await video.path();

  const mp4 = `${OUT}${name}.mp4`;
  await run('ffmpeg', [
    '-y', '-i', webm,
    '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2,fps=30',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '24',
    '-movflags', '+faststart',
    mp4,
  ]);
  // Poster frame (~0.4s in) for reference.
  await run('ffmpeg', ['-y', '-ss', '0.4', '-i', mp4, '-frames:v', '1', `${OUT}${name}.jpg`]);
  // GitHub READMEs force-download committed MP4s, so also emit an animated GIF
  // (palette-optimized) — that renders inline as an image. The GIF is what the
  // README references; the MP4 is kept as a higher-quality download.
  const pal = `${OUT}${name}.pal.png`;
  const vf = 'fps=15,scale=640:-1:flags=lanczos';
  await run('ffmpeg', ['-y', '-i', mp4, '-vf', `${vf},palettegen=stats_mode=diff`, pal]);
  await run('ffmpeg', [
    '-y', '-i', mp4, '-i', pal,
    '-lavfi', `${vf}[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=3`,
    `${OUT}${name}.gif`,
  ]);
  await rm(pal, { force: true }).catch(() => {});
  console.log('clip →', name);
}

async function main() {
  await mkdir(OUT, { recursive: true });
  await rm(RAW, { recursive: true, force: true });
  await mkdir(RAW, { recursive: true });

  const browser = await chromium.launch();

  // 1. View switching — the staggered tile-entrance cascade.
  await clip(browser, '01-view-switching', async (page) => {
    const nav = page.locator('.sidebar-btn:not(.sidebar-settings)');
    const n = Math.min(await nav.count(), 5);
    for (let i = 1; i < n; i++) {
      await nav.nth(i).click();
      await sleep(1300);
    }
    await nav.first().click();
    await sleep(1300);
  });

  // 2. Media flyout — spring open + shared-element artwork morph.
  await clip(browser, '02-media-flyout', async (page) => {
    const nav = page.locator('.sidebar-btn:not(.sidebar-settings)');
    const count = await nav.count();
    for (let i = 0; i < count; i++) {
      await nav.nth(i).click();
      await sleep(900);
      const media = page.locator('.tile:has(.tile-eq), .tile.has-artwork').first();
      if (await media.count()) {
        await media.scrollIntoViewIfNeeded().catch(() => {});
        await media.click();
        await page.waitForSelector('.detail-panel.open', { timeout: 6000 }).catch(() => {});
        await sleep(2200);
        await closeFlyout(page);
        await sleep(800);
        return;
      }
    }
  });

  // 3. Ambient weather — the rain particle layer.
  await clip(
    browser,
    '03-ambient-rain',
    async (page) => {
      await sleep(3500); // let particles fill and drift
    },
    { startPath: '/?precip=rain' },
  );

  // 4. Light flyout — open, drag brightness, flip to warmth.
  await clip(browser, '04-light-flyout', async (page) => {
    const nav = page.locator('.sidebar-btn:not(.sidebar-settings)');
    const count = await nav.count();
    for (let i = 0; i < count; i++) {
      await nav.nth(i).click();
      await sleep(900);
      const named = page.locator('.tile', { has: page.locator('.tile-name') });
      const total = await named.count();
      for (let j = 0; j < total; j++) {
        const tile = named.nth(j);
        const label = (await tile.locator('.tile-name').first().textContent().catch(() => '')) || '';
        if (!/lamp|light/i.test(label)) continue;
        await tile.scrollIntoViewIfNeeded().catch(() => {});
        const cls = (await tile.getAttribute('class')) || '';
        if (!/\bon\b|live-light/.test(cls)) {
          await tile.click().catch(() => {});
          await sleep(1400);
        }
        const more = tile.locator('.tile-more');
        if (!(await more.count())) continue;
        await more.click().catch(() => {});
        const ok = await page
          .waitForSelector('.detail-panel.open .light-slider', { timeout: 3000 })
          .then(() => true)
          .catch(() => false);
        const isMedia = (await page.locator('.detail-panel.open .media-progress').count()) > 0;
        if (!ok || isMedia) {
          await closeFlyout(page);
          continue;
        }
        await sleep(900);
        // Drag the brightness slider.
        const slider = page.locator('.detail-panel.open .light-slider').first();
        const box = await slider.boundingBox();
        if (box) {
          const y = box.y + box.height / 2;
          await page.mouse.move(box.x + box.width * 0.8, y);
          await page.mouse.down();
          await page.mouse.move(box.x + box.width * 0.3, y, { steps: 20 });
          await page.mouse.move(box.x + box.width * 0.65, y, { steps: 20 });
          await page.mouse.up();
        }
        await sleep(700);
        // Flip to the Warmth tab if present.
        const warmth = page.locator('.detail-panel.open .mode-btn', { hasText: 'Warmth' }).first();
        if (await warmth.count()) {
          await warmth.click().catch(() => {});
          await sleep(1400);
        }
        await closeFlyout(page);
        return;
      }
    }
  });

  // 5. Edit mode — enter, lift & move a tile, exit.
  await clip(browser, '05-edit-mode', async (page) => {
    const editBtn = page.locator('.toolbar-btn', { hasText: 'Edit' }).first();
    await editBtn.waitFor({ timeout: 5000 }).catch(() => {});
    if (!(await editBtn.count())) return;
    await editBtn.click().catch(() => {});
    await page.waitForSelector('.view-rows.editing', { timeout: 5000 }).catch(() => {});
    await sleep(1200);
    const tiles = page.locator('.edit-tile-wrap');
    if ((await tiles.count()) >= 2) {
      const a = await tiles.nth(0).boundingBox();
      const b = await tiles.nth(1).boundingBox();
      if (a && b) {
        await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
        await page.mouse.down();
        await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2 + 6, { steps: 4 });
        await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 25 });
        await sleep(500);
        await page.mouse.up();
        await sleep(900);
      }
    }
    const doneBtn = page.locator('.toolbar-btn', { hasText: 'Done' }).first();
    if (await doneBtn.count()) await doneBtn.click().catch(() => {});
    await sleep(800);
  });

  await browser.close();

  // Tidy: drop the raw webm scratch dir.
  await rm(RAW, { recursive: true, force: true }).catch(() => {});
  const files = (await readdir(OUT)).filter((f) => f.endsWith('.mp4')).sort();
  console.log('done →', OUT);
  console.log('clips:', files.join(', '));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
