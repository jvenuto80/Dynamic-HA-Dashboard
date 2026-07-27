import { test, expect } from 'playwright/test';
import { resetStorage, skipOnboarding, setLanguage } from './helpers';

/**
 * Room Summary tile UI (issue #48).
 * Seeds a layout with a glance.room.* tile via the /layout API (no HA needed
 * for face/flyout chrome). Live climate values need a connected HA instance.
 */

const ROOM_LAYOUT = [
  {
    id: 'main',
    name: 'Home',
    icon: 'mdi-home',
    rows: [
      {
        title: 'Rooms',
        columns: [
          {
            title: 'Summary',
            entities: [
              {
                entity_id: 'glance.room.gostinaia',
                areaId: 'gostinaia',
                name: 'Living Room',
                size: '2x1',
                type: 'room',
              },
            ],
          },
        ],
      },
    ],
  },
];

async function seedRoomLayout(page: import('playwright/test').Page) {
  const res = await page.request.put('/layout', { data: ROOM_LAYOUT });
  expect(res.ok()).toBeTruthy();
}

test.describe('Room Summary tile', () => {
  test.beforeEach(async ({ page }) => {
    await resetStorage(page);
    await seedRoomLayout(page);
    await page.reload({ waitUntil: 'networkidle' });
    await skipOnboarding(page);
  });

  test('renders room tile face from layout', async ({ page }) => {
    const tile = page.locator('.room-summary-tile').first();
    await expect(tile).toBeVisible({ timeout: 15_000 });
    await expect(tile.locator('.tile-name')).toHaveText('Living Room');
  });

  test('opens room flyout with sections', async ({ page }) => {
    const tile = page.locator('.room-summary-tile').first();
    await expect(tile).toBeVisible({ timeout: 15_000 });
    await tile.click();

    const flyout = page.locator('.room-flyout');
    await expect(flyout).toBeVisible();
    await expect(flyout.getByRole('heading', { name: 'Climate' })).toBeVisible();
    await expect(flyout.getByRole('heading', { name: 'Problems' })).toBeVisible();
    await expect(flyout.getByRole('heading', { name: 'Devices' })).toBeVisible();
    await expect(flyout.getByText('No problems')).toBeVisible();

    await page.locator('.room-flyout .detail-close').click();
    await expect(flyout).toHaveCount(0);
  });

  test('RU locale labels on flyout', async ({ page }) => {
    await setLanguage(page, 'ru');
    await skipOnboarding(page);
    const tile = page.locator('.room-summary-tile').first();
    await expect(tile).toBeVisible({ timeout: 15_000 });
    await tile.click();
    const flyout = page.locator('.room-flyout');
    await expect(flyout.getByRole('heading', { name: 'Климат' })).toBeVisible();
    await expect(flyout.getByRole('heading', { name: 'Проблемы' })).toBeVisible();
    await expect(flyout.getByRole('heading', { name: 'Устройства' })).toBeVisible();
  });

  test('Room card appears in entity picker', async ({ page }) => {
    await page.locator('button:has(.mdi-pencil)').first().click();
    const addTile = page.locator('.add-tile-btn:not(.scene-add-btn)').first();
    await expect(addTile).toBeVisible({ timeout: 10_000 });
    await addTile.click();
    await expect(page.locator('.picker-modal')).toBeVisible();
    await expect(page.locator('.picker-modal .picker-special').filter({ hasText: 'Room' })).toBeVisible();
  });
});
