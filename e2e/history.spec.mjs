import { test, expect } from '@playwright/test';
import { openApp, store, stored, totalMedals, tx } from './helpers.mjs';

const data = {
  stores: [store('a', '店舗A', 55, 3000)],
  transactions: [
    tx('t1', '2026-10-20', 'a', 1200, { machine: 'アイムジャグラー', machineNumber: '290' }),
    tx('t2', '2026-10-19', 'a', -800),
    tx('t3', '2026-10-19', 'a', 300, { time: '22:00' }),
    tx('t4', '2026-09-10', 'a', 1500),
    tx('t5', '2026-08-10', 'a', 1500),
  ],
  settings: { targetMedals: 20000 },
};

test('履歴：日付ごとにまとめたカード、月の合計', async ({ page }) => {
  await openApp(page, { data, hash: '#/history' });
  await expect(page.getByTestId('history-month')).toHaveText('2026年10月');
  await expect(page.locator('.tx-date').first()).toContainText('10/20（火）');
  const cards = page.getByTestId('tx-card');
  await expect(cards).toHaveCount(3);
  await expect(cards.nth(0)).toContainText('アイムジャグラー・290番台');
  await expect(cards.nth(0)).toContainText('+1,200枚');
  await expect(cards.nth(0)).toContainText('約+21,818円');
  await expect(cards.nth(2)).toContainText('約-14,545円');
  await expect(page.getByTestId('history-medals')).toHaveText('+700枚');

  await page.getByRole('button', { name: '前の月' }).click();
  await expect(page.getByTestId('history-month')).toHaveText('2026年9月');
  await expect(cards).toHaveCount(1);
});

test('履歴から記録を編集・削除できる', async ({ page }) => {
  await openApp(page, { data, hash: '#/history' });
  await page.getByTestId('tx-card').first().click();
  await expect(page.getByRole('heading', { name: '記録を編集' })).toBeVisible();
  await expect(page.locator('#rec-medals')).toHaveValue('1200');
  await page.locator('#rec-medals').fill('1000');
  await page.getByTestId('save').click();
  await expect(page).toHaveURL(/#\/history$/);
  await expect(page.getByTestId('tx-card').first()).toContainText('+1,000枚');

  await page.getByTestId('tx-card').first().click();
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'この記録を削除' }).click();
  await expect(page.getByTestId('tx-card')).toHaveCount(2);
  expect((await stored(page, 'transactions')).find((t) => t.id === 't1')).toBeUndefined();
});

test('グラフ：貯メダル推移・円換算資産推移・月別収支を描画', async ({ page }) => {
  await openApp(page, { data, hash: '#/history/charts' });
  for (const name of ['medals', 'yen', 'monthly']) {
    await expect(page.locator(`[data-chart="${name}"] svg`)).toBeVisible();
  }
  const box = await page.locator('[data-chart="medals"] svg').boundingBox();
  expect(box.width).toBeGreaterThan(280);
  expect(box.width).toBeLessThanOrEqual(375);
  await page.getByRole('button', { name: '全期間' }).click();
  await page.locator('[data-chart="medals"] svg').click({ position: { x: box.width - 4, y: 80 } });
  await expect(page.locator('[data-chart="medals"] .chart-tip')).toContainText('10/20  6,700枚');
});

test('予測・目標：達成率と将来予測（注意書き付き）', async ({ page }) => {
  await openApp(page, { data, hash: '#/history/forecast' });
  const goal = page.getByTestId('goal');
  await expect(goal).toContainText('33.5%');
  await expect(goal).toContainText('残り 13,300枚');
  const fc = page.getByTestId('forecast');
  await expect(fc).toContainText('月平均 +1,233枚'); // (1500 + 1500 + 700) / 3ヶ月
  await expect(page.getByTestId('fc-3')).toHaveText('10,399枚');
  await expect(fc).toContainText('予測値であり、実際の遊技結果を保証するものではありません');

  await page.locator('#goal-input').fill('10000');
  await page.getByRole('button', { name: '目標を設定' }).click();
  await expect(goal).toContainText('67.0%');
  await page.locator('.nav').getByRole('link', { name: 'ホーム' }).click();
  await expect(page.getByTestId('goal')).toContainText('目標 10,000枚');
  await expect(totalMedals(page)).toHaveText('6,700枚');
});
