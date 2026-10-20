// 計算のテスト（指示書の「データ整合性」の例を含む）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addMonths, applySign, dailySeries, forecast, goalProgress, medalsToYen, monthStats,
  monthlySeries, perHour, playMinutes, portfolio, roundYen, storeBalance, summarize, workStats,
} from '../www/js/calculation.js';

const A = { id: 'a', name: '店舗A', lendingRate: 50, exchangeRate: 55, initialMedals: 3000, createdAt: '2026-09-01T00:00:00Z' };
const B = { id: 'b', name: '店舗B', lendingRate: 50, exchangeRate: 50, initialMedals: 1000, createdAt: '2026-09-01T00:00:00Z' };
const tx = (date, storeId, medals, extra = {}) => ({ id: `${date}-${medals}`, date, time: '', storeId, type: 'play', medals, cash: 0, ...extra });

test('初期3,000枚 +1,000 -500 +1,500 → 現在5,000枚、55枚交換で約90,909円', () => {
  const txs = [tx('2026-10-01', 'a', 1000), tx('2026-10-02', 'a', -500), tx('2026-10-03', 'a', 1500)];
  assert.equal(storeBalance(A, txs), 5000);
  assert.equal(roundYen(medalsToYen(5000, 55)), 90909);
  const pf = portfolio([A], txs);
  assert.equal(pf.totalMedals, 5000);
  assert.equal(pf.totalYen, 90909);
});

test('円換算：3,000枚・55枚交換 → 約54,545円', () => {
  assert.equal(roundYen(medalsToYen(3000, 55)), 54545);
  assert.equal(roundYen(medalsToYen(13650, 55)), 248181); // 完成イメージの例（切り捨て）
});

test('端数処理：切り捨て・四捨五入・切り上げ。マイナスは左右対称', () => {
  assert.equal(roundYen(248181.8, 'floor'), 248181);
  assert.equal(roundYen(248181.8, 'round'), 248182);
  assert.equal(roundYen(248181.2, 'ceil'), 248182);
  assert.equal(roundYen(-14545.45, 'floor'), -14545);
  assert.equal(roundYen(-0.4, 'floor'), 0);
  assert.equal(roundYen(medalsToYen(1100, 55)), 20000); // 浮動小数の誤差で 19999 にならない
});

test('理由に合わせて符号をそろえる', () => {
  assert.equal(applySign('exchange', 1100), -1100);
  assert.equal(applySign('withdraw', 500), -500);
  assert.equal(applySign('deposit', -300), 300);
  assert.equal(applySign('play', -800), -800);
});

test('店舗別資産と合計（合計は丸める前に足す）', () => {
  const pf = portfolio([A, B], [tx('2026-10-01', 'b', 500)]);
  assert.deepEqual(pf.rows.map((r) => [r.medals, r.yen]), [[3000, 54545], [1500, 30000]]);
  assert.equal(pf.totalMedals, 4500);
  assert.equal(pf.totalYen, 84545);
});

test('収支：換金（-1,100枚・+20,000円）は収支 0、現金投資はマイナス', () => {
  const s = summarize([A], [
    tx('2026-10-01', 'a', -1100, { type: 'exchange', cash: 20000 }),
    tx('2026-10-02', 'a', 1100, { cash: -10000 }),
  ]);
  assert.equal(s.medals, 0);
  assert.equal(s.cash, 10000);
  assert.equal(roundYen(s.profit), 10000);
});

test('月の集計は指定した月だけ', () => {
  const txs = [tx('2026-09-30', 'a', 100), tx('2026-10-01', 'a', 1200), tx('2026-10-20', 'a', -800)];
  assert.equal(monthStats([A], txs, '2026-10').medals, 400);
  const series = monthlySeries([A], txs, '2026-10', 3);
  assert.deepEqual(series.map((m) => [m.month, m.medals]), [['2026-08', 0], ['2026-09', 100], ['2026-10', 400]]);
});

test('日ごとの推移：開始日より前の記録は開始時点の残高に含める', () => {
  const txs = [tx('2026-10-01', 'a', 1000), tx('2026-10-03', 'a', -500)];
  const s = dailySeries([A], txs, { from: '2026-10-02', to: '2026-10-04' });
  assert.deepEqual(s.map((p) => p.medals), [4000, 3500, 3500]);
  assert.equal(s[0].yen, 72727);
});

test('月の計算：年をまたぐ', () => {
  assert.equal(addMonths('2026-11', 3), '2027-02');
  assert.equal(addMonths('2026-01', -1), '2025-12');
});

test('目標：12,450 / 20,000 → 62.3%・残り7,550枚', () => {
  const g = goalProgress(12450, 20000);
  assert.equal(g.rate, 62.3);
  assert.equal(g.remaining, 7550);
  assert.equal(g.achieved, false);
  assert.equal(goalProgress(100, 0), null);
  assert.equal(goalProgress(19999, 20000).rate, 99.9); // 未達成なのに 100% と表示しない
  assert.equal(goalProgress(25000, 20000).achieved, true);
});

test('将来予測：12,450枚・月平均+1,500枚 → 3/6/12ヶ月後', () => {
  const S = { ...A, exchangeRate: 50, initialMedals: 12450 - 4500 };
  const txs = [tx('2026-08-10', 'a', 1500), tx('2026-09-10', 'a', 1500), tx('2026-10-10', 'a', 1500)];
  const fc = forecast([S], txs, '2026-10-20');
  assert.equal(fc.current, 12450);
  assert.equal(fc.monthlyAvg, 1500);
  assert.equal(fc.basisMonths, 3);
  assert.deepEqual(fc.points.map((p) => p.medals), [16950, 21450, 30450]);
  assert.equal(fc.points[0].yen, 339000);
  assert.equal(fc.goalMonths(20000), 6);
});

test('将来予測：マイナスのペースでは 0枚で止め、なくなるまでの月数を出す', () => {
  const S = { ...A, initialMedals: 3000 };
  const fc = forecast([S], [tx('2026-10-01', 'a', -1000)], '2026-10-20');
  assert.equal(fc.points[2].medals, 0);
  assert.equal(fc.depleteMonths, 2);
  assert.equal(fc.lowData, true);
  assert.equal(forecast([S], [], '2026-10-20'), null);
});

test('稼働時間：開始・終了時刻から分、日付をまたいでもよい', () => {
  assert.equal(playMinutes('10:00', '13:30'), 210);
  assert.equal(playMinutes('22:00', '01:00'), 180);
  assert.equal(playMinutes('10:00', '10:00'), null);
  assert.equal(playMinutes('', '13:00'), null);
  assert.equal(perHour(10000, 150), 4000);
  assert.equal(perHour(10000, 0), null);
});

test('稼働の成績：時給換算・期待値の合計と時給・上振れ/下振れ', () => {
  const txs = [
    // 3時間・+1,100枚（55枚交換 = +20,000円）・現金投資 5,000円 → 収支 +15,000円・期待値 +6,000円
    tx('2026-10-01', 'a', 1100, { cash: -5000, detail: { minutes: 180, expectedValue: 6000 } }),
    // 2時間・-550枚（-10,000円）・期待値 +2,000円
    tx('2026-10-02', 'a', -550, { detail: { minutes: 120, expectedValue: 2000 } }),
    // 期待値だけ（時間なし）：+55枚（+1,000円）・期待値 +1,000円
    tx('2026-10-03', 'a', 55, { detail: { expectedValue: 1000 } }),
    // 時間も期待値もない記録は含めない
    tx('2026-10-04', 'a', 5500),
  ];
  const w = workStats([A], txs);
  assert.equal(w.minutes, 300);
  assert.equal(w.timedCount, 2);
  assert.equal(roundYen(w.hourly), 1000); // (15,000 - 10,000) / 5時間
  assert.equal(w.ev, 9000);
  assert.equal(w.evCount, 3);
  assert.equal(w.evHourly, 1600); // (6,000 + 2,000) / 5時間
  assert.equal(roundYen(w.diff), -3000); // 実収支 6,000 - 期待値 9,000
});
