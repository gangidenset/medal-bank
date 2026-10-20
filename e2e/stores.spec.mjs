import { test, expect } from '@playwright/test';
import { nav, openApp, store, stored, totalMedals, tx } from './helpers.mjs';

test('はじめての店舗登録 → そのまま記録画面へ', async ({ page }) => {
  await openApp(page);
  await page.getByRole('link', { name: '＋ 店舗を登録' }).click();
  await page.getByLabel('店舗名').fill('店舗A');
  await page.getByRole('button', { name: '55枚交換' }).click();
  await page.getByLabel('今の貯メダル（初期枚数）').fill('3000');
  await expect(page.getByTestId('store-preview')).toHaveText('約54,545円相当');
  await page.getByTestId('save-store').click();
  await expect(page).toHaveURL(/#\/record$/);
  await expect(page.getByRole('button', { name: '店舗A' })).toHaveAttribute('aria-pressed', 'true');
  const [s] = await stored(page, 'stores');
  expect(s).toMatchObject({ name: '店舗A', lendingRate: 50, exchangeRate: 55, initialMedals: 3000, favorite: true });
});

test('店舗別の資産を表示し、合計は店舗ごとの交換率で円換算する', async ({ page }) => {
  await openApp(page, {
    data: { stores: [store('a', '店舗A', 55, 5000), store('b', '店舗B', 55, 4500), store('c', '店舗C', 55, 2950)] },
    hash: '#/stores',
  });
  const cards = page.getByTestId('store-card');
  await expect(cards).toHaveCount(3);
  await expect(cards.nth(0)).toContainText('5,000枚');
  await expect(cards.nth(0)).toContainText('約90,909円相当');
  await expect(cards.nth(1)).toContainText('約81,818円相当');
  await expect(cards.nth(2)).toContainText('約53,636円相当');
  await expect(page.locator('.hero')).toContainText('12,450枚');
  await expect(page.locator('.hero')).toContainText('約226,363円');
});

test('店舗の編集：現在の貯メダルを変えると差分を「残高を修正」として記録', async ({ page }) => {
  await openApp(page, { data: { stores: [store('a', '店舗A', 55, 3000)] }, hash: '#/store/a' });
  await expect(page.getByLabel('現在の貯メダル')).toHaveValue('3000');
  await page.getByLabel('現在の貯メダル').fill('3200');
  await page.getByLabel('お気に入りの店舗（記録画面で先頭に表示）').check();
  await page.getByTestId('save-store').click();
  await expect(page).toHaveURL(/#\/stores$/);
  const [t] = await stored(page, 'transactions');
  expect([t.type, t.medals, t.memo]).toEqual(['other', 200, '残高を修正']);
  await nav(page, 'ホーム');
  await expect(totalMedals(page)).toHaveText('3,200枚');
  await expect(page.getByTestId('month-medals')).toHaveText('+200枚');
});

test('店舗の削除：確認のうえ、その店舗の記録も削除', async ({ page }) => {
  await openApp(page, {
    data: {
      stores: [store('a', '店舗A', 55, 3000), store('b', '店舗B', 50, 1000)],
      transactions: [tx('t1', '2026-10-19', 'a', 500), tx('t2', '2026-10-19', 'b', 100)],
    },
    hash: '#/store/a',
  });
  let message = '';
  page.once('dialog', (d) => { message = d.message(); d.accept(); });
  await page.getByRole('button', { name: 'この店舗を削除' }).click();
  await expect(page).toHaveURL(/#\/stores$/);
  expect(message).toContain('記録 1件も削除');
  await expect(page.getByTestId('store-card')).toHaveCount(1);
  expect((await stored(page, 'transactions')).map((t) => t.id)).toEqual(['t2']);
});

test('店舗名が空なら登録できない', async ({ page }) => {
  await openApp(page, { hash: '#/store/new' });
  await page.getByTestId('save-store').click();
  await expect(page.locator('#toast')).toContainText('店舗名を入力してください');
  expect(await stored(page, 'stores')).toHaveLength(0);
});
