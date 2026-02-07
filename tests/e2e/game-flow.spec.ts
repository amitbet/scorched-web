import { expect, test } from '@playwright/test';

test('title -> players -> shop -> battle flow with snapshots', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Scorched Earth' })).toBeVisible();
  await page.screenshot({ path: 'test-results/01-title.png', fullPage: true });

  await page.getByRole('button', { name: 'Start Match' }).click();
  await expect(page.getByRole('heading', { name: 'Players' })).toBeVisible();
  await page.screenshot({ path: 'test-results/02-players.png', fullPage: true });

  await page.getByRole('button', { name: 'Proceed To Shop' }).click();
  await expect(page.getByRole('heading', { name: 'Armory' })).toBeVisible();
  await page.screenshot({ path: 'test-results/03-shop-weapons.png', fullPage: true });
  await expect(page.getByText('Funkey Bomb')).toBeVisible();

  await page.getByRole('button', { name: 'Misc' }).click();
  await expect(page.getByText('Battery')).toBeVisible();
  await page.screenshot({ path: 'test-results/04-shop-misc.png', fullPage: true });

  await page.getByRole('button', { name: 'Next Player' }).click();
  await page.getByRole('button', { name: 'Start Battle' }).click();
  await expect(page.locator('canvas.battle-canvas')).toBeVisible();
  await page.screenshot({ path: 'test-results/05-battle-start.png', fullPage: true });

  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Space');
  await page.waitForTimeout(1200);
  await page.screenshot({ path: 'test-results/06-battle-fired.png', fullPage: true });
  await expect(page.locator('.battle-note-overlay')).toBeVisible();
});
