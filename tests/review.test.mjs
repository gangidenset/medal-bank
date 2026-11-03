// 月ごとのふり返り
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { monthlyReview, reviewToNotify } from '../www/js/review.js';

const store = (id, rate, initial) => ({ id, name: id, exchangeRate: rate, initialMedals: initial, lendingRate: 50 });
const tx = (id, date, medals, extra = {}) => ({ id, date, time: '21:00', storeId: 'a', type: 'play', medals, cash: 0, machine: '', detail: null, ...extra });
const stores = [store('a', 50, 1000)]; // 1枚 = 20円
const list = [
  tx('p1', '2026-09-20', 500),
  tx('t1', '2026-10-03', 1000, { machine: 'アイム', detail: { minutes: 240, games: 3000 } }),
  tx('t2', '2026-10-03', -200, { machine: 'マイジャグ', detail: { minutes: 60 } }),
  tx('t3', '2026-10-10', -500, { machine: '北斗' }),
  tx('t4', '2026-10-18', 300, { machine: 'アイム', cash: -2000 }),
  tx('x1', '2026-10-25', -100, { type: 'exchange', cash: 2000 }),
  tx('n1', '2026-11-01', 999),
];

test('収支・先月との差・勝率・時給', () => {
  const r = monthlyReview(stores, list, '2026-10');
  assert.equal(r.has, true);
  assert.equal(r.medals, 500);
  assert.equal(r.profit, 500 * 20); // 貯メダル +500枚 = 10,000円、現金は ±0
  assert.equal(r.prevProfit, 10000);
  assert.equal(r.sessions, 4);
  assert.equal(r.wins, 2);
  assert.equal(r.playDays, 3);
  assert.equal(r.minutes, 300);
  assert.equal(r.hourly, ((20000 - 4000) * 60) / 300);
});

test('一番勝った/負けた機種と日、貯メダルの月初→月末', () => {
  const r = monthlyReview(stores, list, '2026-10');
  assert.equal(r.bestMachine.label, 'アイム');
  assert.equal(r.bestMachine.profit, 20000 + 6000 - 2000);
  assert.equal(r.worstMachine.label, '北斗');
  assert.deepEqual(r.bestDay, { date: '2026-10-03', profit: 16000 });
  assert.deepEqual(r.worstDay, { date: '2026-10-10', profit: -10000 });
  assert.equal(r.startMedals, 1500);
  assert.equal(r.endMedals, 2000);
  assert.ok(r.comments.some((c) => c.text.includes('時給')));
});

test('記録がない月・勝ちだけの月は「負けた機種/日」なし', () => {
  assert.equal(monthlyReview(stores, list, '2026-08').has, false);
  const r = monthlyReview(stores, [tx('a1', '2026-07-01', 100, { machine: 'アイム' })], '2026-07');
  assert.equal(r.worstMachine, null);
  assert.equal(r.worstDay, null);
  assert.equal(r.prevProfit, null);
});

test('ホームで知らせる月：先月に記録があり、まだ見ていないとき', () => {
  assert.equal(reviewToNotify(list, '2026-11', ''), '2026-10');
  assert.equal(reviewToNotify(list, '2026-11', '2026-10'), null);
  const noNov = list.filter((t) => !t.date.startsWith('2026-11'));
  assert.equal(reviewToNotify(noNov, '2026-12', '2026-10'), null); // 11月は記録がない
  assert.equal(reviewToNotify(list, '2026-12', '2026-10'), '2026-11');
});
