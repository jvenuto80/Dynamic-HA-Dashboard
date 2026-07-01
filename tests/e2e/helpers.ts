import type { Page } from 'playwright/test';

export type LangCode = 'en' | 'ru' | 'de' | 'fr' | 'pl' | 'nl';

/**
 * Switch the UI language by setting localStorage and reloading the page.
 * i18next reads the stored value on init, so a reload is required.
 */
export async function setLanguage(page: Page, lang: LangCode): Promise<void> {
  await page.evaluate((code) => localStorage.setItem('ha-dashboard-lang', code), lang);
  await page.reload({ waitUntil: 'networkidle' });
}

/**
 * Clear all localStorage so the app starts as if it's the first visit.
 */
export async function resetStorage(page: Page): Promise<void> {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
}

/**
 * Dismiss the onboarding overlay by clicking the skip button.
 * Safe to call when onboarding is not shown — the click is skipped silently.
 */
export async function skipOnboarding(page: Page): Promise<void> {
  try {
    await page.locator('.onboarding-skip').click({ timeout: 2_000 });
  } catch {
    // onboarding not visible — nothing to do
  }
}

// ── Per-language fixtures ─────────────────────────────────────────────────────

export interface LangFixture {
  code: LangCode;
  /** Native name shown in the language picker. */
  label: string;
  /** All possible greeting strings (time-of-day variants). */
  greetings: string[];
  /** "Everything quiet" subtitle variant. */
  quiet: string;
  /** Onboarding dialog title. */
  onboarding_title: string;
  /** "Long-lived access token" label. */
  token_label: string;
  /** Primary connect button text. */
  connect_btn: string;
  /** "TODAY" label in the weather forecast strip. */
  today: string;
  /** Settings modal title. */
  settings_title: string;
  /** Language picker label in settings. */
  settings_language: string;
}

export const LANGUAGES: LangFixture[] = [
  {
    code: 'en',
    label: 'English',
    greetings: ['Good night', 'Good morning', 'Good afternoon', 'Good evening'],
    quiet: 'Everything quiet',
    onboarding_title: 'Welcome to Glance',
    token_label: 'Long-lived access token',
    connect_btn: 'Connect',
    today: 'TODAY',
    settings_title: 'Settings',
    settings_language: 'Interface language',
  },
  {
    code: 'ru',
    label: 'Русский',
    greetings: ['Доброй ночи', 'Доброе утро', 'Добрый день', 'Добрый вечер'],
    quiet: 'Всё тихо',
    onboarding_title: 'Добро пожаловать в Glance',
    token_label: 'Долгосрочный токен доступа',
    connect_btn: 'Подключить',
    today: 'СЕГОДНЯ',
    settings_title: 'Настройки',
    settings_language: 'Язык интерфейса',
  },
  {
    code: 'de',
    label: 'Deutsch',
    greetings: ['Gute Nacht', 'Guten Morgen', 'Guten Tag', 'Guten Abend'],
    quiet: 'Alles ruhig',
    onboarding_title: 'Willkommen bei Glance',
    token_label: 'Langfristiges Zugriffstoken',
    connect_btn: 'Verbinden',
    today: 'HEUTE',
    settings_title: 'Einstellungen',
    settings_language: 'Sprache',
  },
  {
    code: 'fr',
    label: 'Français',
    greetings: ['Bonne nuit', 'Bonjour', 'Bon après-midi', 'Bonsoir'],
    quiet: 'Tout est calme',
    onboarding_title: 'Bienvenue dans Glance',
    token_label: "Jeton d'accès de longue durée",
    connect_btn: 'Connecter',
    today: "AUJOURD'HUI",
    settings_title: 'Paramètres',
    settings_language: "Langue de l'interface",
  },
  {
    code: 'pl',
    label: 'Polski',
    greetings: ['Dobranoc', 'Dzień dobry', 'Dobry wieczór'],
    quiet: 'Wszystko spokojne',
    onboarding_title: 'Witaj w Glance',
    token_label: 'Długoterminowy token dostępu',
    connect_btn: 'Połącz',
    today: 'DZISIAJ',
    settings_title: 'Ustawienia',
    settings_language: 'Język interfejsu',
  },
  {
    code: 'nl',
    label: 'Nederlands',
    greetings: ['Goedenacht', 'Goedemorgen', 'Goedemiddag', 'Goedenavond'],
    quiet: 'Alles rustig',
    onboarding_title: 'Welkom bij Glance',
    token_label: 'Langetermijntoegangstoken',
    connect_btn: 'Verbinden',
    today: 'VANDAAG',
    settings_title: 'Instellingen',
    settings_language: 'Interfacetaal',
  },
];

/** All language codes supported by the app. */
export const ALL_LANG_CODES: LangCode[] = LANGUAGES.map((l) => l.code);
