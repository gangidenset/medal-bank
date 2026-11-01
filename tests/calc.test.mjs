// 記録画面の電卓の計算
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, evaluateMedals, formatExpr, fromValue, press } from '../www/js/calc.js';

test('足し算・引き算・掛け算・割り算（× ÷ が先）', () => {
  assert.equal(evaluate('2350+1840−500'), 3690);
  assert.equal(evaluate('1,200+300×2'), 1800);
  assert.equal(evaluate('1000−600÷3'), 800);
  assert.equal(evaluate('−500+200'), -300);
  assert.equal(evaluate('2350+1840-500'), 3690); // 半角のマイナスも使える
});

test('計算できない式は null、末尾の演算子は無視、枚数は四捨五入', () => {
  assert.equal(evaluate(''), null);
  assert.equal(evaluate('−'), null);
  assert.equal(evaluate('100÷0'), null);
  assert.equal(evaluate('5+'), 5);
  assert.equal(evaluateMedals('10÷4'), 3);
  assert.equal(evaluateMedals('7÷4'), 2);
});

test('ボタン操作：演算子の続けて押し・先頭の 0・= ・1文字消す', () => {
  const keys = (list) => list.reduce((s, k) => press(s, k), '');
  assert.equal(keys(['0', '0', '5', '00']), '500');
  assert.equal(keys(['5', '+', '−', '3']), '5−3');
  assert.equal(keys(['+']), '');
  assert.equal(keys(['−', '5']), '−5');
  assert.equal(keys(['2', '0', '−', '5', '0', '=']), '−30');
  assert.equal(keys(['1', '2', 'back']), '1');
  assert.equal(keys(['1', '2', 'C']), '');
  assert.equal(keys(['5', '÷', '0', '=']), '5÷0'); // 0 で割ったときはそのまま
});

test('入力欄の値との変換・表示', () => {
  assert.equal(fromValue('-1200'), '−1200');
  assert.equal(fromValue(''), '');
  assert.equal(fromValue('abc'), '');
  assert.equal(formatExpr('12000+3500'), '12,000+3,500');
});
