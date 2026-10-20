// 立ち回り診断・実戦カウンター（小役カウンター＋設定推測）・続行/ヤメ判断
import { test, expect } from '@playwright/test';
import { nav, openApp, store, stored, tx } from './helpers.mjs';

const A = store('a', '店舗A', 50, 2800);
const sessions = [
  tx('t1', '2026-10-05', 'a', 1000, { machine: 'アイムジャグラーEX', detail: { startTime: '10:00', minutes: 300 } }),
  tx('t2', '2026-10-06', 'a', 1200, { machine: 'アイムジャグラーEX', detail: { startTime: '11:00', minutes: 300 } }),
  tx('t3', '2026-10-07', 'a', 900, { machine: 'マイジャグラーV', detail: { startTime: '13:00', minutes: 240 } }),
  tx('t4', '2026-10-03', 'a', -1500, { machine: 'スマスロ北斗の拳', detail: { startTime: '18:30', minutes: 180 } }),
  tx('t5', '2026-10-10', 'a', -1500, { machine: 'スマスロ北斗の拳', detail: { startTime: '19:00', minutes: 180 } }),
  tx('t6', '2026-10-17', 'a', -1300, { machine: 'スマスロ北斗の拳', detail: { startTime: '20:00', minutes: 120 } }),
];

test('立ち回り診断：勝率・平均収支・時給と、得意/苦手のコメント', async ({ page }) => {
  await openApp(page, { data: { stores: [A], transactions: sessions }, hash: '#/history/diagnosis' });
  await expect(page.getByTestId('diag-winrate')).toHaveText('50.0%');
  await expect(page.getByTestId('diag-avg')).toHaveText('-4,000円');
  await expect(page.getByTestId('diag-hourly')).toHaveText('-1,090円'); // -24,000円 ÷ 22時間
  const insights = page.getByTestId('diag-insights');
  await expect(insights).toContainText('あなたはスマスロよりAタイプの方が明らかに成績が良いです。');
  await expect(insights).toContainText('土曜日の収支が −86,000円 です。');
  await expect(insights).toContainText('18時以降から打ち始めた場合の勝率が 0.0% です。');
  await expect(page.getByTestId('diag-type')).toContainText('Aタイプ');
  await expect(page.getByTestId('diag-type')).toContainText('+4,428'); // Aタイプの時給：62,000円 ÷ 14時間
});

test('機種タイプ・ゲーム数を記録でき、ジャグラーは機種名から自動でAタイプになる', async ({ page }) => {
  await openApp(page, { data: { stores: [A] }, hash: '#/record' });
  await page.getByText('詳しく入力').click();
  await page.locator('#rec-medals').fill('500');
  await page.getByLabel('機種名').fill('マイジャグラーV');
  await expect(page.locator('#rec-types').getByRole('button', { name: 'Aタイプ' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByLabel('ゲーム数').fill('3200');
  await page.getByTestId('save').click();
  const [t] = await stored(page, 'transactions');
  expect(t.machineType).toBe('a');
  expect(t.detail.games).toBe(3200);
});

test('実戦カウンター：タップで数え、設定の可能性と続行・ヤメを表示。閉じても残る', async ({ page }) => {
  await openApp(page, { data: { stores: [A], settings: { lastStoreId: 'a' } }, now: new Date('2026-10-20T15:00:00+09:00') });
  await page.getByTestId('judge-button').click();
  await expect(page.getByRole('heading', { name: '続行・ヤメ判断', exact: true })).toBeVisible();
  await expect(page.getByTestId('jd-stock')).toHaveText('2,800枚');
  await page.getByLabel('現在G数（データカウンターの総G数）').fill('3000');
  const plus = async (name, times) => {
    for (let i = 0; i < times; i++) await page.getByRole('button', { name: `${name}を数える` }).click();
  };
  await plus('BIG', 16);
  await plus('REG', 19);
  await page.getByRole('button', { name: '1つ戻す' }).click(); // 押しすぎた REG を戻す
  await expect(page.getByTestId('count-bb')).toHaveText('16');
  await expect(page.getByTestId('count-rb')).toHaveText('18');
  // −モード：タップで減る
  await page.getByRole('button', { name: '−モード' }).click();
  await page.getByRole('button', { name: 'BIGを1回減らす' }).click();
  await expect(page.getByTestId('count-bb')).toHaveText('15');
  await page.getByRole('button', { name: '−モード' }).click();
  await page.getByRole('button', { name: 'BIGを数える' }).click();
  await expect(page.getByTestId('count-bb')).toHaveText('16');
  // ブドウは数えていない（0回）ので推測には使わないが、ボタンは出ている
  await expect(page.getByTestId('count-grape')).toHaveText('0');
  await expect(page.getByTestId('jd-high-mini')).toHaveText(/\d+%/);
  await expect(page.getByTestId('jd-combined')).toHaveText('1/88.2');
  await expect(page.getByTestId('high-chance')).toHaveText(/\d+%/);
  const bars = page.getByTestId('posterior').locator('.bar-row');
  await expect(bars).toHaveCount(6);
  await expect(page.getByTestId('verdict-label')).toHaveText('続行推奨');
  await expect(page.getByTestId('ev-rest')).toContainText('円');

  // 負けの上限に達したらヤメ推奨
  await page.getByLabel('今日の収支（枚・負けはマイナス）').fill('-1500');
  await page.getByLabel('1日の負けの上限（枚）').fill('1500');
  await page.getByLabel('1日の負けの上限（枚）').blur();
  await expect(page.getByTestId('verdict-label')).toHaveText('ヤメ推奨');
  await expect(page.getByTestId('quit-line')).toHaveText('今すぐヤメ');

  // 再読み込みしてもカウントは残る
  await page.reload();
  await expect(page.getByTestId('count-bb')).toHaveText('16');
  await expect(page.getByLabel('1日の負けの上限（枚）')).toHaveValue('1500');

  // この台の結果を記録する → 記録画面に機種・G数・回数を引き継ぐ
  await page.getByRole('button', { name: 'この台の結果を記録する' }).click();
  await expect(page).toHaveURL(/#\/record$/);
  await expect(page.getByLabel('機種名')).toHaveValue('SアイムジャグラーEX');
  await expect(page.getByLabel('ゲーム数')).toHaveValue('3000');
  await expect(page.getByLabel('メモ')).toHaveValue('BIG 16・REG 18');
});

test('機種スペックを追加すると、その機種で設定推測できる', async ({ page }) => {
  await openApp(page, { data: { stores: [A] }, hash: '#/judge' });
  await page.getByLabel('機種', { exact: true }).selectOption('');
  await page.getByRole('link', { name: '機種を追加' }).click();
  await page.getByLabel('機種名').fill('テストジャグラー');
  await page.getByLabel('BIG', { exact: true }).fill('280, 275, 270, 260, 250, 240');
  await page.getByLabel('REG', { exact: true }).fill('420, 400, 350, 320, 280, 250');
  await page.getByLabel('ブドウ（任意）').fill('6.1, 6.05, 6.0, 5.95, 5.9, 5.8');
  await page.getByLabel('機械割（%）').fill('97, 98, 99.5, 101.5, 104, 107');
  await page.getByTestId('save-spec').click();
  await expect(page).toHaveURL(/#\/judge$/);
  await expect(page.getByLabel('機種', { exact: true }).locator('option:checked')).toHaveText('テストジャグラー');
  await page.getByLabel('現在G数（データカウンターの総G数）').fill('1000');
  await expect(page.getByTestId('posterior')).toBeVisible();
  const [settings] = (await stored(page, 'meta')).filter((m) => m.id === 'settings');
  expect(settings.customMachines[0]).toMatchObject({ name: 'テストジャグラー', grape: [6.1, 6.05, 6, 5.95, 5.9, 5.8] });
  await nav(page, 'ホーム');
});

test('REG の内訳を数え始めても、それまでの REG は消えない', async ({ page }) => {
  await openApp(page, { data: { stores: [A] }, hash: '#/judge' });
  await page.getByLabel('現在G数（データカウンターの総G数）').fill('1000');
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'REGを数える' }).click();
  await page.getByText('数える項目（BIG・REGの内訳・ブドウ・チェリー）').click();
  page.once('dialog', (d) => d.accept());
  await page.getByText('REG を単独・チェリー重複に分けて数える').click();
  await expect(page.getByTestId('count-rbSolo')).toHaveText('3');
  await page.getByRole('button', { name: 'チェリーREGを数える' }).click();
  await page.getByText('REG を単独・チェリー重複に分けて数える').click();
  await expect(page.getByTestId('count-rb')).toHaveText('4');
});

test('チェリーBIG：BIG を単独・チェリー重複に分けて数えられる', async ({ page }) => {
  await openApp(page, { data: { stores: [A] }, hash: '#/judge' });
  await page.getByLabel('機種', { exact: true }).selectOption('my5');
  await page.getByLabel('現在G数（データカウンターの総G数）').fill('2000');
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'BIGを数える' }).click();
  await page.getByText('数える項目（BIG・REGの内訳・ブドウ・チェリー）').click();
  page.once('dialog', (d) => d.accept());
  await page.getByText('BIG を単独・チェリー重複に分けて数える').click();
  await expect(page.getByTestId('count-bbSolo')).toHaveText('4');
  await page.getByRole('button', { name: 'チェリーBIGを数える' }).click();
  await expect(page.getByTestId('count-bbCherry')).toHaveText('1');
  await expect(page.getByTestId('jd-combined')).toHaveText('1/400.0');
  await page.getByRole('button', { name: 'この台の結果を記録する' }).click();
  await expect(page.getByLabel('メモ')).toHaveValue('BIG 5（単独4・チェリー1）・REG 0');
});
