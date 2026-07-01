/**
 * Playwright i18n smoke test — verifies all 6 languages render correctly
 * on the onboarding screen (visible without HA connection).
 *
 * Run: node scripts/test-i18n.mjs
 * Requires: vite preview running on port 4173  AND  chromium installed
 */
import { chromium } from 'playwright';
import { mkdir } from 'fs/promises';
import { existsSync } from 'fs';

const BASE_URL = 'http://localhost:4173';
const SHOTS_DIR = 'test-screenshots';

const LANGS = [
  {
    code: 'en',
    label: 'English',
    expected: {
      heading: 'Welcome to Glance',
      subtitle: "Let's connect to your Home Assistant",
      token: 'Long-lived access token',
      connect: 'Connect',
    },
  },
  {
    code: 'ru',
    label: 'Русский',
    expected: {
      heading: 'Добро пожаловать в Glance',
      subtitle: 'Подключимся к вашему Home Assistant',
      token: 'Долгосрочный токен доступа',
      connect: 'Подключить',
    },
  },
  {
    code: 'de',
    label: 'Deutsch',
    expected: {
      heading: 'Willkommen bei Glance',
      subtitle: 'Verbinden wir uns mit Ihrem Home Assistant',
      token: 'Langfristiges Zugriffstoken',
      connect: 'Verbinden',
    },
  },
  {
    code: 'fr',
    label: 'Français',
    expected: {
      heading: 'Bienvenue dans Glance',
      subtitle: 'Connectons-nous à votre Home Assistant',
      token: "Jeton d'accès de longue durée",
      connect: 'Connecter',
    },
  },
  {
    code: 'pl',
    label: 'Polski',
    expected: {
      heading: 'Witaj w Glance',
      subtitle: 'Połączmy się z Twoim Home Assistant',
      token: 'Długoterminowy token dostępu',
      connect: 'Połącz',
    },
  },
  {
    code: 'nl',
    label: 'Nederlands',
    expected: {
      heading: 'Welkom bij Glance',
      subtitle: 'Laten we verbinding maken met uw Home Assistant',
      token: 'Langetermijntoegangstoken',
      connect: 'Verbinden',
    },
  },
];

async function testLang(page, lang) {
  // Set language in localStorage before navigation so i18n picks it up on init.
  await page.goto(BASE_URL);
  await page.evaluate((code) => localStorage.setItem('ha-dashboard-lang', code), lang.code);
  // Reload so i18n initialises with the new language.
  await page.reload({ waitUntil: 'networkidle' });

  const results = { lang: lang.code, label: lang.label, checks: [] };

  for (const [key, text] of Object.entries(lang.expected)) {
    const found = await page.locator(`text=${text}`).first().isVisible().catch(() => false);
    results.checks.push({ key, text, pass: found });
  }

  await page.screenshot({
    path: `${SHOTS_DIR}/${lang.code}.png`,
    fullPage: true,
  });

  return results;
}

(async () => {
  if (!existsSync(SHOTS_DIR)) await mkdir(SHOTS_DIR, { recursive: true });

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  const allResults = [];
  for (const lang of LANGS) {
    const result = await testLang(page, lang);
    allResults.push(result);
  }

  await browser.close();

  // ── Print results ──────────────────────────────────────────────────────────
  let anyFail = false;
  console.log('\n══════════════════════════════════════════════');
  console.log('  i18n Playwright results');
  console.log('══════════════════════════════════════════════');
  for (const r of allResults) {
    const allPass = r.checks.every((c) => c.pass);
    const status = allPass ? '✅ PASS' : '❌ FAIL';
    console.log(`\n${status}  ${r.label} (${r.lang})`);
    for (const c of r.checks) {
      const icon = c.pass ? '  ✓' : '  ✗';
      console.log(`${icon} ${c.key}: "${c.text}"`);
      if (!c.pass) anyFail = true;
    }
  }
  console.log('\n══════════════════════════════════════════════');
  console.log(`Screenshots saved to: ${SHOTS_DIR}/`);
  console.log('══════════════════════════════════════════════\n');

  process.exit(anyFail ? 1 : 0);
})();
