// 立ち回り診断のテスト
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diagnose, guessMachineType } from '../www/js/analysis.js';

const A = { id: 'a', name: '店舗A', exchangeRate: 50, initialMedals: 0 };
let n = 0;
const play = (date, medals, extra = {}) => ({ id: `t${n++}`, date, time: '', storeId: 'a', type: 'play', medals, cash: 0, machine: '', machineType: '', detail: null, ...extra });

test('機種名から機種タイプを推測する', () => {
  assert.equal(guessMachineType('アイムジャグラーEX'), 'a');
  assert.equal(guessMachineType('ハナハナ鳳凰'), 'a');
  assert.equal(guessMachineType('スマスロ北斗の拳'), 'smart');
  assert.equal(guessMachineType('L北斗の拳'), 'smart');
  assert.equal(guessMachineType('バジリスク絆2'), '');
  assert.equal(guessMachineType(''), '');
});

test('勝率・平均収支・平均時給、遊技結果以外の記録は含めない', () => {
  const txs = [
    play('2026-10-01', 1000, { detail: { minutes: 120 } }), // +20,000円・2時間
    play('2026-10-02', -500, { detail: { minutes: 60 } }), // -10,000円・1時間
    play('2026-10-03', 250), // +5,000円（時間なし）
    { ...play('2026-10-04', -3000), type: 'exchange', cash: 60000 }, // 換金は対象外
  ];
  const d = diagnose([A], txs, { from: '2026-10-01', to: '2026-10-31' });
  assert.equal(d.overall.count, 3);
  assert.equal(d.overall.wins, 2);
  assert.equal(Math.round(d.overall.winRate * 10) / 10, 66.7);
  assert.equal(d.overall.avgProfit, 5000);
  assert.equal(d.overall.hourly, 10000 / 3); // (20,000 - 10,000) / 3時間
  assert.equal(diagnose([A], txs, { from: '2026-10-02', to: '2026-10-02' }).overall.count, 1);
});

test('診断：Aタイプとスマスロの比較・曜日・打ち始めの時間帯・期待値', () => {
  const txs = [
    // Aタイプ（ジャグラー）：3勝 → +62,000円
    play('2026-10-05', 1000, { machine: 'アイムジャグラーEX', detail: { startTime: '10:00', minutes: 300 } }),
    play('2026-10-06', 1200, { machine: 'アイムジャグラーEX', detail: { startTime: '11:00', minutes: 300 } }),
    play('2026-10-07', 900, { machine: 'マイジャグラーV', detail: { startTime: '13:00', minutes: 240 } }),
    // スマスロ：土曜・18時以降に3敗 → -86,000円
    play('2026-10-03', -1500, { machine: 'スマスロ北斗の拳', detail: { startTime: '18:30', minutes: 180 } }),
    play('2026-10-10', -1500, { machine: 'スマスロ北斗の拳', detail: { startTime: '19:00', minutes: 180 } }),
    play('2026-10-17', -1300, { machine: 'スマスロ北斗の拳', detail: { startTime: '20:00', minutes: 120 } }),
  ];
  const d = diagnose([A], txs);
  assert.deepEqual(d.byType.map((g) => [g.label, Math.round(g.profit)]), [['Aタイプ', 62000], ['スマスロ', -86000]]);
  const texts = d.insights.map((i) => i.text);
  assert.ok(texts.includes('あなたはスマスロよりAタイプの方が明らかに成績が良いです。'), texts.join('\n'));
  assert.ok(texts.includes('土曜日の収支が −86,000円 です。'), texts.join('\n'));
  assert.ok(texts.includes('18時以降から打ち始めた場合の勝率が 0.0% です。'), texts.join('\n'));
  assert.ok(texts.some((t) => t.startsWith('❌ 「スマスロ北斗の拳」で −86,000円')), texts.join('\n'));
  assert.deepEqual(d.byWeekday.map((g) => g.label), ['月曜', '火曜', '水曜', '土曜']); // 月曜はじまり
  assert.equal(d.byBand.find((b) => b.key === 'night').count, 3);
});

test('記録が少ないうちはコメントを出さない', () => {
  const d = diagnose([A], [play('2026-10-01', 100), play('2026-10-02', -100)]);
  assert.equal(d.insights.length, 0);
});

test('実戦カウンターの推定（設定4以上の%）別の成績と、低い台で負けているときのコメント', () => {
  const txs = [
    play('2026-10-01', 1500, { detail: { high: 75 } }),
    play('2026-10-02', 800, { detail: { high: 65 } }),
    play('2026-10-03', -1200, { detail: { high: 20 } }),
    play('2026-10-04', -900, { detail: { high: 10 } }),
    play('2026-10-05', 300, { detail: { high: 45 } }),
  ];
  const d = diagnose([A], txs);
  assert.deepEqual(d.byHigh.map((g) => [g.key, g.count]), [['high', 2], ['mid', 1], ['low', 2]]);
  assert.ok(d.insights.some((i) => i.text === '設定4以上の可能性が低い台で −42,000円 負けています。'), d.insights.map((i) => i.text).join('\n'));
});
