// 使い方ガイド（右上の「？」）と、初めて行く店舗（現金スタート）の記録
import { test, expect } from '@playwright/test';
import { nav, openApp, store, stored, totalMedals } from './helpers.mjs';

const data = { stores: [store('a', '店舗A', 50, 0)] };

test('どの画面にも右上に「？」があり、その画面のガイドが開く', async ({ page }) => {
  await openApp(page, { data });
  const cases = [
    ['#/home', 'ホームの使い方'], ['#/record', '記録の使い方'], ['#/history', '履歴の使い方'],
    ['#/history/charts', 'グラフの使い方'], ['#/history/diagnosis', '立ち回り診断の使い方'], ['#/history/forecast', '予測・目標の使い方'],
    ['#/stores', '店舗の使い方'], ['#/store/a', '店舗の使い方'], ['#/settings', '設定の使い方'],
    ['#/judge', '続行・ヤメ判断の使い方'], ['#/counter', '小役カウンターの使い方'], ['#/spec/im-ex', 'スペックの入力のしかた'],
  ];
  for (const [hash, title] of cases) {
    await page.evaluate((h) => { location.hash = h; }, hash);
    await page.getByTestId('help').click();
    await expect(page.getByTestId('guide').getByRole('heading', { level: 2 })).toHaveText(title);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('guide')).toHaveCount(0);
  }
});

test('ガイドに「初めて行く店舗（現金からスタート）」の手順があり、閉じるボタンで閉じる', async ({ page }) => {
  await openApp(page, { data, hash: '#/record' });
  await page.getByTestId('help').click();
  const guide = page.getByTestId('guide');
  await expect(guide).toContainText('初めて行く店舗（現金からスタート）');
  await expect(guide).toContainText('「現金投資（円）」に使った現金を入れます');
  await guide.getByRole('button', { name: '閉じる' }).click();
  await expect(page.getByTestId('guide')).toHaveCount(0);
  // 設定画面の一覧からも開ける
  await nav(page, '設定');
  await page.getByTestId('guide-list').getByRole('button', { name: '小役カウンターの使い方' }).click();
  await expect(page.getByTestId('guide')).toContainText('1つ戻す');
});

test('初めての店舗：貯メダル 0枚で登録 → 現金投資と貯メダルにした枚数を記録', async ({ page }) => {
  await openApp(page, { data, hash: '#/record' });
  await page.locator('#rec-medals').fill('1200');
  await page.getByText('詳しく入力').click();
  await page.getByLabel('現金投資（円）').fill('10000');
  await page.getByTestId('save').click();
  await expect(totalMedals(page)).toHaveText('1,200枚');
  await expect(page.getByTestId('month-profit')).toHaveText('+14,000円'); // 1,200枚 × 20円 − 10,000円
});

test('負けて貯メダルにできなかった日：現金投資だけで保存できる', async ({ page }) => {
  await openApp(page, { data, hash: '#/record' });
  await page.getByText('詳しく入力').click();
  await page.getByLabel('現金投資（円）').fill('15000');
  await page.getByTestId('save').click();
  await expect(totalMedals(page)).toHaveText('0枚');
  await expect(page.getByTestId('month-profit')).toHaveText('-15,000円');
  const [t] = await stored(page, 'transactions');
  expect([t.medals, t.cash]).toEqual([0, -15000]);
});
