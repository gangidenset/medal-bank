// 記録画面の電卓
import { test, expect } from '@playwright/test';
import { openApp, store, stored, totalMedals } from './helpers.mjs';

const A = store('a', '店舗A', 50, 3000);
const keys = async (page, list) => {
  for (const k of list) await page.getByTestId('calc').locator(`[data-k="${k}"]`).click();
};

test('増減枚数：電卓で 1840+2350−500 を計算して入れ、保存できる', async ({ page }) => {
  await openApp(page, { data: { stores: [A] }, hash: '#/record' });
  await page.getByTestId('calc-open-medals').click();
  await keys(page, ['1', '8', '4', '0', '+', '2', '3', '5', '0', '−', '5', '00']);
  await expect(page.getByTestId('calc-expr')).toHaveText('1,840+2,350−500');
  await expect(page.getByTestId('calc-result')).toHaveText('= 3,690枚');
  await page.getByRole('button', { name: 'この値を入れる' }).click();
  await expect(page.getByTestId('calc')).toHaveCount(0);
  await expect(page.locator('#rec-medals')).toHaveValue('3690');
  await page.getByTestId('save').click();
  await expect(totalMedals(page)).toHaveText('6,690枚');
  const [t] = await stored(page, 'transactions');
  expect(t.medals).toBe(3690);
});

test('残高で入力：「今の残高」から足し算して入れる。閉じると入力は変わらない', async ({ page }) => {
  await openApp(page, { data: { stores: [A] }, hash: '#/record' });
  await page.getByRole('button', { name: '残高で入力' }).click();
  await page.getByTestId('calc-open-balanceAfter').click();
  await keys(page, ['5']);
  await page.getByRole('button', { name: '閉じる' }).click();
  await expect(page.getByTestId('calc')).toHaveCount(0);
  await expect(page.locator('#rec-balance')).toHaveValue('');

  await page.getByTestId('calc-open-balanceAfter').click();
  await page.getByRole('button', { name: /今の残高 3,000枚/ }).click();
  await keys(page, ['+', '1', '2', '00']);
  await expect(page.getByTestId('calc-result')).toHaveText('= 4,200枚');
  await page.getByRole('button', { name: 'この値を入れる' }).click();
  await expect(page.locator('#rec-balance')).toHaveValue('4200');
  await expect(page.getByTestId('preview-diff')).toHaveText('+1,200枚');
});

test('残高はマイナスにできない・0 で割る式は入れられない', async ({ page }) => {
  await openApp(page, { data: { stores: [A] }, hash: '#/record' });
  await page.getByRole('button', { name: '残高で入力' }).click();
  await page.getByTestId('calc-open-balanceAfter').click();
  await keys(page, ['−', '5']);
  await expect(page.getByRole('button', { name: 'この値を入れる' })).toBeDisabled();
  await keys(page, ['C', '5', '÷', '0']);
  await expect(page.getByRole('button', { name: 'この値を入れる' })).toBeDisabled();
});
