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
  const MR = BUILTIN_MACHINES.find((m) => m.id === 'mr'); // ブドウの値がない機種
  const spec = { ...MR, grape: [6.0, 6.0, 6.0, 6.0, 5.9, 5.8] };
  const base = { games: 3000, bb: 12, rb: 10, grape: 520 };
  const off = settingPosterior(spec, base);
  const on = settingPosterior(spec, { ...base, countSmall: true });
  assert.deepEqual(settingPosterior(MR, { ...base, countSmall: true }), settingPosterior(MR, base)); // スペックにブドウがなければ変わらない
  assert.ok(on[5] > off[5]); // ブドウがよく出ている（1/5.77）→ 設定6寄り
});

test('REG を単独・チェリーに分けると、スペックの値を使う', () => {
  const split = settingPosterior(IM, { games: 4000, bb: 15, rbSolo: 11, rbCherry: 4, splitRb: true });
  const total = settingPosterior(IM, { games: 4000, bb: 15, rb: 15 });
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
  assert.equal(machineByName('ミスタージャグラー').id, 'mr');
  assert.equal(machineByName('ハッピージャグラーVⅢ').id, 'happy3');
  assert.equal(machineByName('ゴーゴージャグラー3').id, 'gogo3');
  assert.equal(machineByName('ウルトラミラクルジャグラー').id, 'ultra');
  assert.equal(machineByName('ジャグラーガールズSS').id, 'girls-ss');
});

test('組み込み機種：8機種。合算確率は掲載値どおり、確率は設定が上がるほど軽い', () => {
  assert.deepEqual(BUILTIN_MACHINES.map((m) => m.name), [
    'SアイムジャグラーEX', 'マイジャグラーV', 'ファンキージャグラー2', 'ハッピージャグラーVⅢ',
    'ミスタージャグラー', 'ゴーゴージャグラー3', 'ウルトラミラクルジャグラー', 'ジャグラーガールズSS',
  ]);
  // 掲載されている設定1・設定6の合算（BIG と REG から計算した値と一致するか）
  const combined = { 'im-ex': [168.5, 127.5], my5: [163.8, 114.6], funky2: [165.9, 119.6], happy3: [161.8, 120.0], mr: [156.4, 118.7], gogo3: [149.6, 117.4], ultra: [164.3, 121.6], 'girls-ss': [159.1, 119.2] };
  for (const m of BUILTIN_MACHINES) {
    for (const [i, s] of [[0, 0], [5, 1]]) {
      const c = 1 / (1 / m.bb[i] + 1 / m.rb[i]);
      assert.ok(Math.abs(c - combined[m.id][s]) < 0.25, `${m.name} 設定${i + 1}: ${c}`);
    }
    for (const k of ['bb', 'rb']) for (let i = 1; i < 6; i++) assert.ok(m[k][i] <= m[k][i - 1], `${m.name} ${k}`);
    for (let i = 1; i < 6; i++) assert.ok(m.rate[i] > m.rate[i - 1], `${m.name} rate`);
    assert.equal(m.cherry, undefined); // チェリーは組み込まない
  }
});

test('ブドウは数えた回数が 1/10 より多いときだけ使う（0回や途中から数えた少なすぎる回数は無視）', () => {
  const base = { games: 3000, bb: 12, rb: 12, countSmall: true };
  const none = settingPosterior(IM, { ...base, grape: 0 });
  assert.deepEqual(none, settingPosterior(IM, { ...base, countSmall: false }));
  assert.deepEqual(settingPosterior(IM, { ...base, grape: 120 }), none); // 1/25 → 数え始めが遅いとみなす
  const good = settingPosterior(IM, { ...base, grape: 520 }); // 1/5.77 → 設定6並み
  assert.ok(good[5] > none[5]);
});

test('BIG も単独・チェリー重複に分けられる。チェリーBIG の確率がなければ「全体 − 単独」で求める', async () => {
  const { cherryDenoms } = await import('../www/js/judge.js');
  const MY = BUILTIN_MACHINES.find((m) => m.id === 'my5');
  const d = cherryDenoms(MY.bb, MY.bbSolo, MY.bbCherry);
  assert.equal(Math.round(d[0]), 817); // 1 / (1/273.1 − 1/410.28)
  assert.deepEqual(cherryDenoms(IM.bb, IM.bbSolo, IM.bbCherry), IM.bbCherry); // スペックにあればそのまま
  assert.equal(cherryDenoms([300], [200]), null); // 単独の方が多い＝おかしな値は使わない
  const split = settingPosterior(MY, { games: 4000, bbSolo: 10, bbCherry: 6, rb: 15, splitBb: true });
  const total = settingPosterior(MY, { games: 4000, bb: 16, rb: 15 });
  assert.notDeepEqual(split, total);
  assert.ok(Math.abs(sum(split) - 1) < 1e-9);
  // 判定の合算は内訳の合計で計算する
  assert.equal(judge({ ...base, machine: MY, counts: { games: 3200, bbSolo: 10, bbCherry: 6, rb: 16, splitBb: true } }).combined, 100);
});
