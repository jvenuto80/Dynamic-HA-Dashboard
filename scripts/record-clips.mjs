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
const VIEWPORT = { width: 1920, height: 1080 };
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
 *
 * `tail` (seconds) keeps only the final N seconds of the recording. Each
 * Playwright context records from creation, which on this app includes a slow
 * one-off wait while the headless browser adopts the server-shared HA
 * connection before tiles render. For flyout clips the meaningful interaction
 * happens at the end, so trimming to the tail drops that dead lead-in and keeps
 * the GIFs small without changing what's shown.
 */
async function clip(browser, name, fn, { startPath = '/', tail } = {}) {
  const ctx = await browser.newContext({
    viewport: VIEWPORT,
    recordVideo: { dir: RAW, size: VIEWPORT },
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE}${startPath}`, { waitUntil: 'domcontentloaded' });
  await waitReady(page);
  await fn(page);
  await sleep(600);
  const video = page.video();
  await ctx.close(); // finalizes the webm
  const webm = await video.path();

  const mp4 = `${OUT}${name}.mp4`;
  await run('ffmpeg', [
    '-y',
    // -sseof seeks from the end, keeping only the last `tail` seconds.
    ...(tail ? ['-sseof', `-${tail}`] : []),
    '-i', webm,
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
  const vf = 'fps=15,scale=900:-1:flags=lanczos';
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
  }, { tail: 8 });

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
        if (!/hall\s*lamp|hallway/i.test(label)) continue;
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
  }, { tail: 13 });

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

  // 6. Thunderstorm — rain plus lightning flashes (night tint for contrast).
  // The flash fires ~early and ~mid in a 9s loop, so record long enough to
  // catch a couple of strikes.
  await clip(
    browser,
    '06-ambient-storm',
    async (page) => {
      await sleep(10000);
    },
    { startPath: '/?precip=storm&tod=night' },
  );

  // 7. Vacuum control center — open the app-like flyout (live map + controls).
  await clip(browser, '07-vacuum', async (page) => {
    const vac = page.locator('.sidebar-btn[title="Vacuum"]').first();
    if (!(await vac.count())) return;
    await vac.click();
    await sleep(1800);
    const tile = page.locator('.vacuum-tile').first();
    if (!(await tile.count())) return;
    await tile.click();
    await page
      .waitForSelector('.detail-panel.open .vacuum-panel', { timeout: 8000 })
      .catch(() => {});
    // Hold on the open control center (the clip ends here, so the GIF loops on
    // the fully-revealed panel rather than closing it).
    await sleep(3200);
  }, { tail: 7 });

  // 8. Music Assistant — open the flyout and reveal the active-player dropdown.
  await clip(browser, '08-music-assistant', async (page) => {
    const media = page.locator('.sidebar-btn[title="Media"]').first();
    if (!(await media.count())) return;
    await media.click();
    await sleep(1200);
    const maTile = page.locator('.ma-tile').first();
    if (!(await maTile.count())) return;
    await maTile.click();
    await page.waitForSelector('.ma-flyout.open', { timeout: 6000 }).catch(() => {});
    await sleep(1200);
    await page.locator('.ma-flyout .ma-dd-button').first().click().catch(() => {});
    // Hold on the open dropdown (the active-player list) for the loop.
    await sleep(2600);
  }, { tail: 7 });

  // 9. Assist — open the mic flyout, ask a harmless question, receive the reply.
  //    "What time is it?" is read-only; no device is toggled.
  await clip(browser, '09-assist', async (page) => {
    const fab = page.locator('.assist-fab').first();
    if (!(await fab.count())) return;
    await fab.click();
    await page.waitForSelector('.assist-panel', { timeout: 5000 }).catch(() => {});
    await sleep(700);
    // Type the query at a human-ish pace so the clip reads naturally.
    await page.locator('.assist-input').pressSequentially('What time is it?', { delay: 55 }).catch(() => {});
    await sleep(300);
    await page.locator('.assist-send').click().catch(() => {});
    await page.waitForSelector('.assist-msg.assist', { timeout: 8000 }).catch(() => {});
    await sleep(1800);
  }, { tail: 9 });

  // 10. Scene color wash — driven from the Settings live-preview so no real
  //     scene is activated (zero device side effects). Cycling the dropdown
  //     replays the wash in the accent color; we show all three styles.
  await clip(browser, '10-scene-wash', async (page) => {
    await page.locator('.sidebar-settings').click().catch(() => {});
    await page.waitForSelector('.settings-modal, .ts-modal', { timeout: 8000 }).catch(() => {});
    const wash = page
      .locator('.ts-field select', { has: page.locator('option[value="burst"]') })
      .first();
    if (!(await wash.count())) return;
    await wash.scrollIntoViewIfNeeded().catch(() => {});
    await sleep(600);
    for (const style of ['burst', 'curtain', 'glow']) {
      await wash.selectOption(style).catch(() => {});
      await sleep(1600); // let each wash play out
    }
  }, { tail: 6 });

  // 11. Pull-to-refresh — synthetic touch drag on the scroll container to stretch
  //     the elastic indicator past the threshold (accent glow), then release into
  //     the refresh spinner. Playwright can't drag with touch, so dispatch the
  //     TouchEvents by hand, animating the pull over ~1s.
  await clip(browser, '11-pull-refresh', async (page) => {
    await sleep(600);
    await page.evaluate(async () => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const main = document.querySelector('.main-content');
      if (!main) return;
      const touch = (y) => new Touch({ identifier: 1, target: main, clientX: 480, clientY: y });
      const fire = (type, y) =>
        main.dispatchEvent(
          new TouchEvent(type, {
            bubbles: true,
            cancelable: true,
            touches: type === 'touchend' ? [] : [touch(y)],
            changedTouches: [touch(y)],
          }),
        );
      const startY = 90;
      fire('touchstart', startY);
      // Ease the finger down to ~420px over ~1s so the rubber-band stretches.
      for (let i = 1; i <= 24; i++) {
        fire('touchmove', startY + (330 * i) / 24);
        await sleep(42);
      }
      await sleep(500); // hold at the armed position
      fire('touchend', startY + 330); // release → refresh spinner + reload
    });
    // Let the spinner show and the reload begin before the clip ends.
    await sleep(1400);
  }, { tail: 5 });

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
