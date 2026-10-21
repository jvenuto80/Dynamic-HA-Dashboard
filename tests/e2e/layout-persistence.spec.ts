import { test, expect } from 'playwright/test';
import { resetStorage, skipOnboarding } from './helpers';

const INITIAL_LAYOUT = [{
  id: 'main', name: 'Home', icon: 'mdi-home',
  sections: [{ title: 'Devices', entities: [] }],
  rows: [{ title: 'Original row', columns: [{ title: 'Devices', entities: [] }] }],
}];

test.beforeEach(async ({ page }) => {
  await page.route('**/*', (route) => {
    const hostname = new URL(route.request().url()).hostname;
    return hostname === 'localhost' || hostname === '127.0.0.1' ? route.fallback() : route.abort();
  });
});

for (const width of [1280, 390]) {
  test(`failed save stays visible and can be retried at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    let saved = structuredClone(INITIAL_LAYOUT);
    let rejectSave = true;
    await page.route('**/connection', (route) => route.fulfill({ status: 204 }));
    await page.route('**/settings', (route) => route.fulfill({ status: 204 }));
    await page.route('**/layout', (route) => {
      if (route.request().method() === 'GET') return route.fulfill({ json: saved });
      if (rejectSave) return route.fulfill({ status: 503 });
      saved = route.request().postDataJSON();
      return route.fulfill({ json: { ok: true } });
    });
    await resetStorage(page);
    await skipOnboarding(page);
    await page.locator('.edit-toolbar button:has(.mdi-pencil)').click();
    await page.locator('.row-title-input').fill('Updated row');
    await expect(page.getByRole('alert')).toContainText('Layout not saved');
    await expect(page.locator('.edit-status')).not.toContainText('Saved');
    await page.locator('.edit-toolbar button:has(.mdi-check)').click();
    const retry = page.getByRole('button', { name: /Retry save$/ });
    await expect(retry).toBeVisible();
    const bounds = await retry.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    await page.screenshot({ path: `/tmp/glance-save-error-${width}.png`, fullPage: true });
    rejectSave = false;
    await retry.click();
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect.poll(() => saved[0].rows[0].title).toBe('Updated row');
    await page.reload({ waitUntil: 'networkidle' });
    await skipOnboarding(page);
    await page.locator('.edit-toolbar button:has(.mdi-pencil)').click();
    await expect(page.locator('.row-title-input')).toHaveValue('Updated row');
  });
}

test('deleting the final row survives a reload', async ({ page }) => {
  let saved = structuredClone(INITIAL_LAYOUT);
  await page.route('**/connection', (route) => route.fulfill({ status: 204 }));
  await page.route('**/settings', (route) => route.fulfill({ status: 204 }));
  await page.route('**/layout', (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ json: saved });
    saved = route.request().postDataJSON();
    return route.fulfill({ json: { ok: true } });
  });
  await resetStorage(page);
  await skipOnboarding(page);
  await page.locator('.edit-toolbar button:has(.mdi-pencil)').click();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByTitle('Delete row', { exact: true }).click();
  await expect(page.locator('.edit-row')).toHaveCount(0);
  await expect.poll(() => saved[0].rows.length).toBe(0);
  expect(saved[0].sections).toEqual([]);
  await page.reload({ waitUntil: 'networkidle' });
  await skipOnboarding(page);
  await page.locator('.edit-toolbar button:has(.mdi-pencil)').click();
  await expect(page.locator('.edit-row')).toHaveCount(0);
});