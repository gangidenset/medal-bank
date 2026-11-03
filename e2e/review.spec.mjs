// 月ごとのふり返り
import { test, expect } from '@playwright/test';
import { nav, openApp, store, stored, tx } from './helpers.mjs';

const A = store('a', '店舗A', 50, 3000); // 1枚 = 20円
const data = {
  stores: [A],
  transactions: [
    tx('s1', '2026-08-10', 'a', 200),
    tx('t1', '2026-09-05', 'a', 1000, { machine: 'アイムジャグラーEX', detail: { startTime: '10:00', minutes: 240 } }),
    tx('t2', '2026-09-12', 'a', -600, { machine: 'スマスロ北斗の拳' }),
    tx('t3', '2026-09-20', 'a', 300, { machine: 'アイムジャグラーEX' }),
  ],
};

test('月が変わるとホームに先月のふり返りが出て、開くと収支・機種・日がわかる。見たら出ない', async ({ page }) => {
  await openApp(page, { data, now: new Date('2026-10-02T12:00:00+09:00') });
  await expect(page.getByTestId('review-card')).toContainText('9月のふり返り');
  await page.getByTestId('review-open').click();
  await expect(page).toHaveURL(/#\/review\/2026-09$/);
  await expect(page.getByTestId('review-month')).toHaveText('2026年9月のふり返り');
  await expect(page.getByTestId('review-profit')).toHaveText('+14,000円');
  await expect(page.getByTestId('review-comments')).toContainText('先月より +10,000円 よくなりました');
  await expect(page.getByTestId('review-sessions')).toHaveText('3回');
  await expect(page.getByTestId('review-winrate')).toHaveText('67%');
  await expect(page.getByTestId('review-hourly')).toHaveText('+5,000円');
  await expect(page.getByTestId('review-best-machine')).toContainText('アイムジャグラーEX');
  await expect(page.getByTestId('review-best-machine')).toContainText('+26,000円（2回）');
  await expect(page.getByTestId('review-worst-machine')).toContainText('スマスロ北斗の拳');
  await expect(page.getByTestId('review-best-day')).toContainText('9/5');
  await expect(page.getByTestId('review-worst-day')).toContainText('-12,000円');
  await expect(page.getByTestId('review-medals')).toContainText('3,200 → 3,900枚');

  // 前の月へ。記録がある最初の月より前には戻れない
  await page.getByRole('link', { name: '前の月' }).click();
  await expect(page.getByTestId('review-profit')).toHaveText('+4,000円');

  await nav(page, 'ホーム');
  await expect(page.getByTestId('review-card')).toHaveCount(0);
  const [settings] = (await stored(page, 'meta')).filter((m) => m.id === 'settings');
  expect(settings.reviewSeenMonth).toBe('2026-09');
});

test('✕ で閉じると出ない。履歴からはいつでも開ける', async ({ page }) => {
  await openApp(page, { data, now: new Date('2026-10-02T12:00:00+09:00') });
  await page.getByRole('button', { name: 'ふり返りのお知らせを閉じる' }).click();
  await expect(page.getByTestId('review-card')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('#main > *').first()).toBeVisible();
  await expect(page.getByTestId('review-card')).toHaveCount(0);

  await nav(page, '履歴');
  await page.getByRole('button', { name: '前の月' }).click();
  await page.getByTestId('review-link').click();
  await expect(page.getByTestId('review-month')).toHaveText('2026年9月のふり返り');
  await page.getByRole('button', { name: '9月の記録の一覧を見る' }).click();
  await expect(page.getByTestId('history-month')).toHaveText('2026年9月');
});
