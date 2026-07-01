/**
 * i18n e2e test suite
 *
 * Tests that every supported language renders correctly on the pages that are
 * visible WITHOUT a Home Assistant connection:
 *   - Dashboard shell (header greeting, date, quiet message)
 *   - Onboarding dialog (all field labels, buttons)
 *   - Settings modal (title, language picker options)
 *
 * When HA integration tests are added in the future, they should live in a
 * separate spec file and require a running HA mock or real instance.
 *
 * Run:
 *   npm run build          # one-time
 *   npm run test:e2e       # runs all specs below
 *   npm run test:e2e:ui    # opens Playwright UI mode for interactive debugging
 */

import { test, expect } from 'playwright/test';
import { setLanguage, resetStorage, skipOnboarding, LANGUAGES, ALL_LANG_CODES } from './helpers';

// Показывает оверлей «кликни для следующего теста» после каждого теста.
// Активен только когда установлена переменная PWTEST_STEP_BY_STEP=1.
// Использует waitForFunction(timeout:0) — ждёт бесконечно, без таймаута.
test.afterEach(async ({ page }, testInfo) => {
  if (!process.env.PWTEST_STEP_BY_STEP) return;
  testInfo.setTimeout(0); // снимаем таймаут для afterEach — ждём сколько нужно

  const passed = testInfo.status === 'passed';

  // Шаг 1: синхронно инжектируем оверлей и флаг __pwDone (без Promise внутри evaluate)
  await page.evaluate(({ title, ok }: { title: string; ok: boolean }) => {
    (window as any).__pwDone = false;
    const ov = document.createElement('div');
    ov.id = '__pw-step';
    ov.style.cssText =
      'position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;' +
      'justify-content:center;background:rgba(0,0,0,0.7);z-index:99999;cursor:pointer;' +
      'font-family:system-ui,sans-serif;user-select:none;';
    ov.innerHTML =
      `<div style="background:#1a1a2e;color:#fff;padding:36px 56px;border-radius:18px;` +
      `text-align:center;max-width:540px;box-shadow:0 12px 48px rgba(0,0,0,.6);">` +
      `<div style="font-size:52px;margin-bottom:10px">${ok ? '✅' : '❌'}</div>` +
      `<div style="font-size:20px;font-weight:700;margin-bottom:8px;` +
      `color:${ok ? '#4ade80' : '#f87171'}">${ok ? 'PASSED' : 'FAILED'}</div>` +
      `<div style="font-size:13px;color:#94a3b8;margin-bottom:28px;` +
      `word-break:break-word;max-width:420px">${title}</div>` +
      `<div style="font-size:16px;color:#38bdf8;font-weight:600;letter-spacing:.5px">` +
      `▶ КЛИКНИ ЧТОБЫ ПРОДОЛЖИТЬ</div></div>`;
    ov.addEventListener('click', () => {
      ov.remove();
      (window as any).__pwDone = true;
    });
    document.body.appendChild(ov);
  }, { title: testInfo.title, ok: passed });

  // Шаг 2: ждём клика бесконечно (timeout:0 = без ограничений)
  // Если пользователь закрыл браузер — игнорируем ошибку
  try {
    await page.waitForFunction(() => (window as any).__pwDone === true, { timeout: 0 });
  } catch {
    // browser was closed before click — not a test failure
  }
});

// ── 1. Default language ───────────────────────────────────────────────────────

test.describe('Default language', () => {
  test('app starts in English when no language is stored', async ({ page }) => {
    await resetStorage(page);
    await expect(page.locator('.greeting h1')).toContainText(/Good (morning|afternoon|evening|night)/);
    await expect(page.locator('.onboarding-card').getByText('Welcome to Glance', { exact: true })).toBeVisible();
    // Use role+name to avoid matching inline "connect" text in other paragraphs
    await expect(page.locator('.onboarding-card').getByRole('button', { name: 'Connect' })).toBeVisible();
  });
});

// ── 2. Per-language rendering ────────────────────────────────────────────────

for (const lang of LANGUAGES) {
  test.describe(`Language: ${lang.label} (${lang.code})`, () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/');
      await setLanguage(page, lang.code);
    });

    test('header shows correct greeting', async ({ page }) => {
      // Use .greeting h1 to avoid matching the onboarding <h1 class="onboarding-title">
      const h1 = page.locator('.greeting h1');
      const greetingPattern = new RegExp(lang.greetings.map((g) => g.replace(/[()]/g, '\\$&')).join('|'));
      await expect(h1).toHaveText(greetingPattern, { timeout: 5_000 });
    });

    test('header shows "everything quiet" subtitle', async ({ page }) => {
      await expect(page.getByText(lang.quiet)).toBeVisible();
    });

    test('onboarding dialog — title', async ({ page }) => {
      await expect(page.locator('.onboarding-card h1')).toContainText(lang.onboarding_title);
    });

    test('onboarding dialog — token label', async ({ page }) => {
      // exact:true avoids matching the step-2 instruction text that also contains
      // the token label string as a substring (e.g. "...create a Long-lived access token")
      await expect(page.locator('.onboarding-card').getByText(lang.token_label, { exact: true })).toBeVisible();
    });

    test('onboarding dialog — connect button', async ({ page }) => {
      await expect(
        page.locator('.onboarding-card').getByRole('button', { name: lang.connect_btn }),
      ).toBeVisible();
    });

    test('localStorage retains language after reload', async ({ page }) => {
      await page.reload({ waitUntil: 'networkidle' });
      const stored = await page.evaluate(() => localStorage.getItem('ha-dashboard-lang'));
      expect(stored).toBe(lang.code);
      // Greeting should still be in the chosen language.
      const h1 = page.locator('.greeting h1');
      const greetingPattern = new RegExp(lang.greetings.map((g) => g.replace(/[()]/g, '\\$&')).join('|'));
      await expect(h1).toHaveText(greetingPattern);
    });
  });
}

// ── 3. Settings modal ────────────────────────────────────────────────────────

test.describe('Settings modal', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    // The onboarding overlay blocks the gear icon — dismiss it first.
    await skipOnboarding(page);
  });

  test('settings gear opens the modal', async ({ page }) => {
    await page.locator('.mdi-cog').last().click();
    await expect(page.locator('.settings-modal')).toBeVisible();
  });

  test('language picker contains all 6 language options', async ({ page }) => {
    await page.locator('.mdi-cog').last().click();
    await expect(page.locator('.settings-modal')).toBeVisible();

    const select = page.locator('select').filter({ has: page.locator('option[value="en"]') });
    await expect(select).toBeVisible();

    for (const code of ALL_LANG_CODES) {
      await expect(select.locator(`option[value="${code}"]`)).toHaveCount(1);
    }
  });

  test('selecting a language in settings changes the UI immediately', async ({ page }) => {
    await page.locator('.mdi-cog').last().click();
    await expect(page.locator('.settings-modal')).toBeVisible();

    const select = page.locator('select').filter({ has: page.locator('option[value="en"]') });
    await select.selectOption('de');

    // Settings title h3 should switch to German without a page reload.
    await expect(page.locator('.settings-modal h3')).toContainText('Einstellungen', { timeout: 3_000 });
  });

  for (const lang of LANGUAGES) {
    test(`settings modal title is correct in ${lang.label}`, async ({ page }) => {
      // setLanguage reloads the page — onboarding reappears, so skip again
      await setLanguage(page, lang.code);
      await skipOnboarding(page);
      await page.locator('.mdi-cog').last().click();
      await expect(page.locator('.settings-modal h3')).toContainText(lang.settings_title);
    });

    test(`language picker label is correct in ${lang.label}`, async ({ page }) => {
      await setLanguage(page, lang.code);
      await skipOnboarding(page);
      await page.locator('.mdi-cog').last().click();
      await expect(page.getByText(lang.settings_language)).toBeVisible();
    });
  }
});

// ── 4. Language switching round-trip ─────────────────────────────────────────

test.describe('Language switching round-trip', () => {
  test('can cycle through all languages without errors', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    for (const lang of LANGUAGES) {
      await setLanguage(page, lang.code);
      // Each language must show its own onboarding title — no fallback to English.
      await expect(page.locator('.onboarding-card h1')).toContainText(lang.onboarding_title, { timeout: 5_000 });
    }
  });

  test('switching back to English restores English strings', async ({ page }) => {
    await page.goto('/');
    await setLanguage(page, 'de');
    await expect(page.locator('.onboarding-card h1')).toContainText('Willkommen bei Glance');

    await setLanguage(page, 'en');
    await expect(page.locator('.onboarding-card h1')).toContainText('Welcome to Glance');
    await expect(page.locator('.onboarding-card h1')).not.toContainText('Willkommen bei Glance');
  });
});

// ── 5. Regression guard: no fallback leakage ─────────────────────────────────

test.describe('No English fallback leakage', () => {
  /**
   * Verify that none of the non-English locales silently fall back to the
   * English string for the onboarding title.  If a key is missing from a
   * locale object the TypeScript `const X: typeof ru` constraint prevents
   * compilation, but this test catches runtime regressions (e.g. a typo in
   * the key name inside the resources object).
   */
  for (const lang of LANGUAGES.filter((l) => l.code !== 'en')) {
    test(`${lang.label} onboarding title is NOT the English string`, async ({ page }) => {
      await page.goto('/');
      await setLanguage(page, lang.code);
      await expect(page.locator('.onboarding-card h1')).not.toContainText('Welcome to Glance', { timeout: 3_000 });
      await expect(page.locator('.onboarding-card h1')).toContainText(lang.onboarding_title);
    });
  }
});
