// 最重要の流れ：「＋記録」→ 店舗 → 枚数 → 保存 で、ホームの枚数と換金価値が更新される
import { test, expect } from '@playwright/test';
import { nav, openApp, store, stored, totalMedals, totalYen, tx } from './helpers.mjs';

const A = store('a', '店舗A', 55, 3000, { favorite: true });
const B = store('b', '店舗B', 50, 1000);

test('初期3,000枚 → +1,000 → -500 → +1,500 で 5,000枚・約90,909円（55枚交換）', async ({ page }) => {
  await openApp(page, { data: { stores: [A] } });
  await expect(totalMedals(page)).toHaveText('3,000枚');
  await expect(totalYen(page)).toHaveText('約54,545円');

  const record = async (taps) => {
    await page.getByTestId('record-button').click();
    await expect(page.getByRole('button', { name: '店舗A' })).toHaveAttribute('aria-pressed', 'true');
    for (const t of taps) await page.getByRole('button', { name: t, exact: true }).click();
    await page.getByTestId('save').click();
    await expect(page).toHaveURL(/#\/home$/);
  };
  await record(['+1,000']);
  await expect(totalMedals(page)).toHaveText('4,000枚');
  await record(['-500']);
  await expect(totalMedals(page)).toHaveText('3,500枚');
  await record(['+1,000', '+500']); // クイックボタンは足し算
  await expect(totalMedals(page)).toHaveText('5,000枚');
  await expect(totalYen(page)).toHaveText('約90,909円');
  await expect(page.getByTestId('month-medals')).toHaveText('+2,000枚');
  expect((await stored(page, 'transactions')).map((t) => t.medals).sort()).toEqual([-500, 1000, 1500]);
});

test('枚数を直接入力・±で符号を切り替え、保存前に円換算と保存後の枚数を表示', async ({ page }) => {
  await openApp(page, { data: { stores: [A] }, hash: '#/record' });
  const input = page.locator('#rec-medals');
  await input.fill('1200');
  await expect(page.getByTestId('preview-yen')).toHaveText('約+21,818円相当');
  await expect(page.getByTestId('preview-after')).toHaveText('4,200枚');
  await page.getByRole('button', { name: 'プラスとマイナスを切り替え' }).click();
  await expect(input).toHaveValue('-1200');
  await expect(page.getByTestId('preview-after')).toHaveText('1,800枚');
  await input.press('Enter'); // テンキーの「完了」でも保存できる
  await expect(totalMedals(page)).toHaveText('1,800枚');
});

test('前回使った店舗が最初から選ばれている', async ({ page }) => {
  await openApp(page, {
    data: { stores: [A, B], transactions: [tx('t1', '2026-10-19', 'b', 300)], settings: { lastStoreId: 'b' } },
    hash: '#/record',
  });
  await expect(page.getByRole('button', { name: '店舗B' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: '店舗A' }).click();
  await page.getByRole('button', { name: '+2,000' }).click();
  await page.getByTestId('save').click();
  await nav(page, '記録');
  await expect(page.getByRole('button', { name: '店舗A' })).toHaveAttribute('aria-pressed', 'true');
});

test('保存直後の「元に戻す」で取り消せる', async ({ page }) => {
  await openApp(page, { data: { stores: [A] }, hash: '#/record' });
  await page.getByRole('button', { name: '+1,500' }).click();
  await page.getByTestId('save').click();
  await expect(totalMedals(page)).toHaveText('4,500枚');
  await page.getByRole('button', { name: '元に戻す' }).click();
  await expect(totalMedals(page)).toHaveText('3,000枚');
  expect(await stored(page, 'transactions')).toHaveLength(0);
});

test('換金：枚数はマイナス・受け取った金額は現金として記録し、収支には影響しない', async ({ page }) => {
  await openApp(page, { data: { stores: [A] }, hash: '#/record' });
  await page.getByRole('button', { name: '換金', exact: true }).click();
  await page.locator('#rec-medals').fill('1100');
  await page.getByLabel('受け取った金額（円）').fill('20000');
  await expect(page.getByTestId('preview-after')).toHaveText('1,900枚');
  await page.getByTestId('save').click();
  await expect(totalMedals(page)).toHaveText('1,900枚');
  await expect(page.getByTestId('month-profit')).toHaveText('±0円');
  const [t] = await stored(page, 'transactions');
  expect([t.type, t.medals, t.cash]).toEqual(['exchange', -1100, 20000]);
});

test('詳しく入力：日付・機種・台番号・現金投資、開始/終了の貯メダルから差枚を計算', async ({ page }) => {
  await openApp(page, { data: { stores: [A] }, hash: '#/record' });
  await page.getByText('詳しく入力').click();
  await page.getByLabel('日付').fill('2026-10-18');
  await page.getByLabel('機種名').fill('アイムジャグラー');
  await page.getByLabel('台番号').fill('290');
  await page.getByLabel('現金投資（円）').fill('5000');
  await page.getByText('開始時・終了時の貯メダルから差枚を計算する').click();
  await page.getByLabel('開始時貯メダル').fill('3000');
  await page.getByLabel('終了時貯メダル').fill('4200');
  await expect(page.locator('#rec-medals')).toHaveValue('1200');
  await page.getByTestId('save').click();
  const [t] = await stored(page, 'transactions');
  expect(t).toMatchObject({
    date: '2026-10-18', machine: 'アイムジャグラー', machineNumber: '290', medals: 1200, cash: -5000,
    detail: { startMedals: 3000, endMedals: 4200, investment: 5000, payout: null },
  });
  await expect(page.getByTestId('month-profit')).toHaveText('+16,818円');
});

test('枚数が空のままでは保存できない', async ({ page }) => {
  await openApp(page, { data: { stores: [A] }, hash: '#/record' });
  await page.getByTestId('save').click();
  await expect(page.locator('#toast')).toContainText('増減枚数を入力してください');
  await expect(page).toHaveURL(/#\/record$/);
});

test('時給換算と期待値：入力中に時給を表示し、履歴に稼働の成績を出す', async ({ page }) => {
  await openApp(page, { data: { stores: [A] }, hash: '#/record' });
  await page.getByText('詳しく入力').click();
  await page.locator('#rec-medals').fill('1200');
  await page.getByLabel('開始時刻').fill('10:00');
  await page.getByLabel('終了時刻').fill('13:30');
  await page.getByLabel('期待値（円）').fill('3500');
  await expect(page.getByTestId('work-duration')).toHaveText('3時間30分');
  await expect(page.getByTestId('work-preview-hourly')).toHaveText('約+6,233円'); // 21,818円 ÷ 3.5時間
  await expect(page.locator('#rec-work')).toContainText('期待値の時給 約+1,000円');
  await page.getByTestId('save').click();

  const [t] = await stored(page, 'transactions');
  expect(t.time).toBe('13:30');
  expect(t.detail).toMatchObject({ startTime: '10:00', minutes: 210, expectedValue: 3500 });

  await nav(page, '履歴');
  await expect(page.getByTestId('tx-work')).toHaveText('3時間30分・時給 約+6,233円　期待値 +3,500円');
  await expect(page.getByTestId('work-hourly')).toHaveText('約+6,233円/時');
  await expect(page.getByTestId('work-ev')).toHaveText('約+3,500円（1件）');
  await expect(page.getByTestId('work-diff')).toHaveText('約+18,318円（上振れ）');

  // 「詳しく入力」を開いた状態は次の記録でも続く
  await nav(page, '記録');
  await expect(page.locator('details.more')).toHaveAttribute('open', '');
  await expect(page.getByLabel('開始時刻')).toHaveValue('');
});
