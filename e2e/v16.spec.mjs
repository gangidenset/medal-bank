// v1.6：残高で入力・小役カウンターから記録への引き継ぎ・再プレイの上限/手数料・遊びすぎ防止
import { test, expect } from '@playwright/test';
import { nav, openApp, store, stored, totalMedals, tx } from './helpers.mjs';

const A = store('a', '店舗A', 50, 3000);

test('残高で入力：保存後の残高を入れると増減が自動で計算され、入力方法は次回も続く', async ({ page }) => {
  await openApp(page, { data: { stores: [A] }, hash: '#/record' });
  await page.getByRole('button', { name: '残高で入力' }).click();
  await page.getByLabel('保存後の貯メダル残高（レシート・台の表示）').fill('4200');
  await expect(page.getByTestId('preview-diff')).toHaveText('+1,200枚');
  await expect(page.getByTestId('preview-after')).toHaveText('4,200枚');
  await page.getByTestId('save').click();
  await expect(totalMedals(page)).toHaveText('4,200枚');
  const [t] = await stored(page, 'transactions');
  expect(t.medals).toBe(1200);

  // 次の記録も「残高で入力」で始まる。減ったときはマイナスになる
  await nav(page, '記録');
  await expect(page.getByRole('button', { name: '残高で入力' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByLabel('保存後の貯メダル残高（レシート・台の表示）').fill('3900');
  await expect(page.getByTestId('preview-diff')).toHaveText('-300枚');
  await page.getByTestId('save').click();
  await expect(totalMedals(page)).toHaveText('3,900枚');
});

test('残高が空のままでは保存できない', async ({ page }) => {
  await openApp(page, { data: { stores: [A] }, hash: '#/record' });
  await page.getByRole('button', { name: '残高で入力' }).click();
  await page.getByTestId('save').click();
  await expect(page.locator('#toast')).toContainText('保存後の貯メダル残高を入力してください');
});

test('小役カウンター → 記録：数え始めた時刻・G数・機種・推定した設定が入り、診断に推定別の成績が出る', async ({ page }) => {
  await openApp(page, { data: { stores: [A], settings: { lastStoreId: 'a' } }, hash: '#/counter', now: new Date('2026-10-20T15:00:00+09:00') });
  await page.getByLabel('現在G数').fill('3000');
  for (let i = 0; i < 16; i++) await page.getByRole('button', { name: 'BIGを数える' }).click();
  for (let i = 0; i < 18; i++) await page.getByRole('button', { name: 'REGを数える' }).click();
  const high = (await page.getByTestId('jd-high-mini').textContent()).replace('%', '');

  // 3時間半後に打ち終わって記録する
  await page.clock.setFixedTime(new Date('2026-10-20T18:30:00+09:00'));
  await page.getByTestId('to-judge').click();
  await page.getByRole('button', { name: 'この台の結果を記録する' }).click();
  await expect(page.getByLabel('開始時刻')).toHaveValue('15:00');
  await expect(page.getByLabel('終了時刻')).toHaveValue('18:30');
  await expect(page.getByLabel('ゲーム数')).toHaveValue('3000');
  await expect(page.getByTestId('carry-high')).toContainText(`${high}%`);
  await page.locator('#rec-medals').fill('800');
  await page.getByTestId('save').click();
  const [t] = await stored(page, 'transactions');
  expect(t.detail).toMatchObject({ startTime: '15:00', minutes: 210, games: 3000, high: Number(high) });
  expect(t.machine).toBe('SアイムジャグラーEX');

  await page.evaluate(() => { location.hash = '#/history/diagnosis'; });
  await expect(page.getByTestId('diag-high')).toBeVisible();
});

test('再プレイの上限・手数料：店舗に登録すると、店舗カードとヤメ判断に出る', async ({ page }) => {
  await openApp(page, { data: { stores: [A], settings: { lastStoreId: 'a' } }, hash: '#/store/a', now: new Date('2026-10-20T15:00:00+09:00') });
  await page.getByLabel('再プレイ上限（任意）').fill('2500');
  await page.getByLabel('再プレイ手数料（任意）').fill('10');
  await page.getByTestId('save-store').click();
  await expect(page.getByTestId('store-replay')).toHaveText('再プレイ 上限 2,500枚/日・手数料 10%');

  await page.evaluate(() => { location.hash = '#/judge'; });
  await page.getByLabel('現在G数（データカウンターの総G数）').fill('2000');
  await page.getByLabel('今日の収支（枚・負けはマイナス）').fill('-1000');
  await expect(page.getByTestId('replay-left')).toHaveText('今日あと 1,500枚まで');
  await expect(page.getByTestId('max-add')).toHaveText('1,500枚');
});

test('遊びすぎ防止：月の負けの上限に達するとホームでお知らせし、ヤメ判断もヤメ推奨', async ({ page }) => {
  await openApp(page, {
    data: { stores: [A], transactions: [tx('t1', '2026-10-10', 'a', -700)], settings: { lastStoreId: 'a' } },
    hash: '#/settings',
    now: new Date('2026-10-20T15:00:00+09:00'),
  });
  await page.getByLabel('月の負けの上限').fill('10000');
  await page.getByLabel('月の負けの上限').blur();
  await expect(page.locator('#toast')).toContainText('月の負けの上限を 10,000円 にしました');
  await nav(page, 'ホーム');
  await expect(page.getByTestId('notice-monthLimit')).toContainText('今月の負けが上限（10,000円）に達しました');

  await page.evaluate(() => { location.hash = '#/judge'; });
  await page.getByLabel('現在G数（データカウンターの総G数）').fill('3000');
  for (let i = 0; i < 16; i++) await page.getByRole('button', { name: 'BIGを数える' }).click();
  await expect(page.getByTestId('verdict-label')).toHaveText('ヤメ推奨');
  await expect(page.getByTestId('verdict')).toContainText('月の上限');
});
