// 設定推測・続行/ヤメ判断のテスト
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PRIORS, breakEvenGames, expectedRate, highChance, judge, settingPosterior } from '../www/js/judge.js';
import { BUILTIN_MACHINES, allMachines, machineByName, normalizeSpec } from '../www/js/machines.js';

const IM = BUILTIN_MACHINES.find((m) => m.id === 'im-ex');
const sum = (a) => a.reduce((x, y) => x + y, 0);

test('設定の可能性は合計 100%。設定6並みのボーナスなら高設定、設定1並みなら低設定が有力', () => {
  const high = settingPosterior(IM, { games: 6000, bb: 24, rb: 24 });
  assert.ok(Math.abs(sum(high) - 1) < 1e-9);
  assert.ok(highChance(high) > 0.7, String(highChance(high)));
  const low = settingPosterior(IM, { games: 6000, bb: 22, rb: 13 });
  assert.ok(low[0] + low[1] > 0.6, low.join());
  // 0G では事前の見込みのまま
  assert.deepEqual(settingPosterior(IM, { games: 0, bb: 0, rb: 0 }, PRIORS.normal.p).map((p) => +p.toFixed(6)), PRIORS.normal.p);
});

test('小役は「数える」をオンにし、スペックに数値があるときだけ使う', () => {
  const spec = { ...IM, grape: [6.0, 6.0, 6.0, 6.0, 5.9, 5.8] };
  const base = { games: 3000, bb: 12, rb: 10, grape: 520 };
  const off = settingPosterior(spec, base);
  const on = settingPosterior(spec, { ...base, countSmall: true });
  assert.deepEqual(settingPosterior(IM, { ...base, countSmall: true }), off); // スペックにブドウがなければ変わらない
  assert.ok(on[5] > off[5]); // ブドウがよく出ている（1/5.77）→ 設定6寄り
});

test('REG を単独・チェリーに分けると、スペックの値を使う', () => {
  const spec = { ...IM, rbSolo: [600, 560, 480, 450, 380, 380], rbCherry: [1000, 950, 900, 850, 780, 780] };
  const split = settingPosterior(spec, { games: 4000, bb: 15, rbSolo: 11, rbCherry: 4, splitRb: true });
  const total = settingPosterior(spec, { games: 4000, bb: 15, rb: 15 });
  assert.notDeepEqual(split, total);
  assert.ok(Math.abs(sum(split) - 1) < 1e-9);
});

test('期待値（推定機械割）とボーナスなしでのヤメライン', () => {
  const post = settingPosterior(IM, { games: 2000, bb: 10, rb: 10 }, PRIORS.normal.p);
  const rate = expectedRate(IM, post);
  assert.ok(rate > 97 && rate < 105.5);
  const be = breakEvenGames(IM, { games: 2000, bb: 10, rb: 10 }, PRIORS.normal.p);
  assert.ok(be > 2000 && be % 10 === 0, String(be));
  assert.ok(expectedRate(IM, settingPosterior(IM, { games: be, bb: 10, rb: 10 }, PRIORS.normal.p)) < 100);
});

const base = { machine: IM, priorId: 'normal', now: '15:00', closingTime: '22:45', yenPerMedal: 20 };

test('判定：好調なら続行、不調ならヤメ、データ不足は様子見', () => {
  const go = judge({ ...base, counts: { games: 3000, bb: 16, rb: 18 } });
  assert.equal(go.verdict, 'go');
  assert.ok(go.evRest > 0);
  assert.ok(go.quitLine > 3000);
  const stop = judge({ ...base, counts: { games: 3000, bb: 8, rb: 4 } });
  assert.equal(stop.verdict, 'stop');
  assert.equal(stop.quitLine, 3000);
  assert.equal(stop.quitBy, 'now');
  assert.equal(judge({ ...base, counts: { games: 300, bb: 2, rb: 1 } }).verdict, 'wait');
});

test('負けの上限：達したらヤメ、残りが少なければヤメラインが早まる', () => {
  const over = judge({ ...base, counts: { games: 3000, bb: 14, rb: 14 }, todayMedals: -1500, lossLimit: 1500 });
  assert.equal(over.verdict, 'stop');
  assert.equal(over.maxAdd, 0);
  const near = judge({ ...base, counts: { games: 3000, bb: 14, rb: 14 }, todayMedals: -1200, lossLimit: 1500, stock: 2800 });
  assert.equal(near.maxAdd, 300);
  assert.equal(near.quitBy, 'limit');
  assert.equal(near.quitLine, 3200); // 300枚 ÷ 1.5枚/G = 200G
  assert.equal(near.medalsToQuit, 300);
});

test('閉店時刻を過ぎたらヤメ、スペックのない機種は推測しない', () => {
  assert.equal(judge({ ...base, now: '22:50', counts: { games: 3000, bb: 14, rb: 14 } }).verdict, 'stop');
  const none = judge({ ...base, machine: null, counts: { games: 3000, bb: 14, rb: 14 } });
  assert.equal(none.verdict, 'wait');
  assert.equal(none.posterior, undefined);
});

test('スペックの入力チェックと、利用者の値の優先', () => {
  const spec = normalizeSpec({ id: 'c1', name: 'テスト機', bb: '270, 265, 260, 255, 250, 240', rb: [400, 380, 350, 320, 290, 260], rate: '97,98,99,101,103,106', grape: '' });
  assert.deepEqual(spec.bb, [270, 265, 260, 255, 250, 240]);
  assert.equal(spec.grape, undefined);
  assert.throws(() => normalizeSpec({ name: 'x', bb: '1,2,3', rb: '1,2,3,4,5,6', rate: '97,98,99,101,103,106' }), /BIG/);
  assert.throws(() => normalizeSpec({ name: '', bb: [], rb: [], rate: [] }), /機種名/);
  const list = allMachines([{ ...IM, rate: [96, 97, 98, 100, 102, 104] }]);
  assert.deepEqual(list.find((m) => m.id === 'im-ex').rate, [96, 97, 98, 100, 102, 104]);
  assert.equal(list.find((m) => m.id === 'im-ex').edited, true);
  assert.equal(machineByName('アイムジャグラー').id, 'im-ex');
});
