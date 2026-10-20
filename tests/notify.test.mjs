// お知らせ（遊びすぎ防止）のテスト
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pendingNotices, weekMinutes } from '../www/js/notify.js';

const stores = [{ id: 'a' }];
const tx = (date, minutes) => ({ date, storeId: 'a', detail: minutes ? { minutes } : null });
const base = { stores, transactions: [tx('2026-10-20', 0)], totalMedals: 0, targetMedals: 0, today: '2026-10-20' };

test('月の負け：上限の8割で注意、上限で警告', () => {
  assert.equal(pendingNotices({ ...base, monthProfit: -30000, monthlyLossLimit: 50000 }).length, 0);
  const warn = pendingNotices({ ...base, monthProfit: -41000, monthlyLossLimit: 50000 });
  assert.deepEqual(warn.map((n) => [n.id, n.tone]), [['monthLimit', 'warn']]);
  const bad = pendingNotices({ ...base, monthProfit: -52000, monthlyLossLimit: 50000 });
  assert.equal(bad[0].tone, 'bad');
  assert.match(bad[0].text, /今月はここまで/);
  assert.equal(pendingNotices({ ...base, monthProfit: -52000, monthlyLossLimit: 0 }).length, 0); // 上限を決めていなければ出さない
});

test('1週間の稼働時間：直近7日（今日を含む）の合計が目安をこえたら注意', () => {
  const transactions = [tx('2026-10-20', 300), tx('2026-10-16', 300), tx('2026-10-14', 300), tx('2026-10-13', 600)];
  assert.equal(weekMinutes(transactions, '2026-10-20'), 900); // 10/13 は8日前なので含めない
  assert.equal(pendingNotices({ ...base, transactions, weeklyHoursLimit: 20 }).length, 0);
  const n = pendingNotices({ ...base, transactions, weeklyHoursLimit: 15 });
  assert.deepEqual(n.map((x) => x.id), ['weekHours']);
  assert.match(n[0].text, /15時間打っています/);
});
