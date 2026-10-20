// データ層のテスト（保存先はメモリ）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDataService, parseBackup, ValidationError } from '../www/js/data.js';
import { createMemoryAdapter } from '../www/js/storage.js';

async function setup() {
  const adapter = createMemoryAdapter();
  const data = createDataService(adapter);
  await data.load();
  return { adapter, data };
}

test('店舗の登録・記録・現在枚数の自動計算、読み込み直しても同じ', async () => {
  const { adapter, data } = await setup();
  const s = await data.addStore({ name: '店舗A', lendingRate: 50, exchangeRate: 55, initialMedals: 3000 });
  for (const m of [1000, -500, 1500]) await data.addTransaction({ storeId: s.id, date: '2026-10-20', medals: m });
  assert.equal(data.balance(s.id), 5000);
  assert.equal(data.settings.lastStoreId, s.id);
  const again = createDataService(adapter);
  await again.load();
  assert.equal(again.balance(s.id), 5000);
  assert.equal(again.transactions.length, 3);
});

test('入力チェック', async () => {
  const { data } = await setup();
  await assert.rejects(data.addStore({ name: '  ' }), ValidationError);
  await assert.rejects(data.addStore({ name: 'A', exchangeRate: 0 }), ValidationError);
  const s = await data.addStore({ name: 'A' });
  await assert.rejects(data.addTransaction({ storeId: s.id, date: '2026-02-30', medals: 1 }), /日付/);
  await assert.rejects(data.addTransaction({ storeId: 'x', date: '2026-10-01', medals: 1 }), /店舗/);
  await assert.rejects(data.addTransaction({ storeId: s.id, date: '2026-10-01', medals: 0 }), /枚数/);
  const t = await data.addTransaction({ storeId: s.id, date: '2026-10-01', type: 'exchange', medals: 1100, cash: 20000 });
  assert.equal(t.medals, -1100);
});

test('記録は新しい順、お気に入りの店舗が先頭', async () => {
  const { data } = await setup();
  const a = await data.addStore({ name: 'A' });
  const b = await data.addStore({ name: 'B', favorite: true });
  assert.deepEqual(data.stores.map((s) => s.name), ['B', 'A']);
  await data.addTransaction({ storeId: a.id, date: '2026-10-01', time: '20:00', medals: 1 });
  await data.addTransaction({ storeId: b.id, date: '2026-10-03', time: '10:00', medals: 2 });
  await data.addTransaction({ storeId: a.id, date: '2026-10-01', time: '22:00', medals: 3 });
  assert.deepEqual(data.transactions.map((t) => t.medals), [2, 3, 1]);
});

test('店舗を削除すると記録も消える（論理削除で保存先には削除日時が残る）', async () => {
  const { adapter, data } = await setup();
  const a = await data.addStore({ name: 'A' });
  const b = await data.addStore({ name: 'B' });
  await data.addTransaction({ storeId: a.id, date: '2026-10-01', medals: 100 });
  await data.addTransaction({ storeId: b.id, date: '2026-10-01', medals: 200 });
  await data.deleteStore(a.id);
  assert.deepEqual(data.stores.map((s) => s.name), ['B']);
  assert.equal(data.transactions.length, 1);
  const raw = await adapter.getAll('transactions');
  assert.ok(raw.find((t) => t.storeId === a.id).deletedAt);
  const again = createDataService(adapter);
  await again.load();
  assert.equal(again.stores.length, 1);
  assert.equal(again.transactions.length, 1);
});

test('記録の更新・削除', async () => {
  const { data } = await setup();
  const s = await data.addStore({ name: 'A', initialMedals: 1000 });
  const t = await data.addTransaction({ storeId: s.id, date: '2026-10-01', medals: 500, machine: 'アイムジャグラー' });
  await data.updateTransaction(t.id, { medals: -200 });
  assert.equal(data.balance(s.id), 800);
  assert.equal(data.transaction(t.id).machine, 'アイムジャグラー');
  await data.deleteTransaction(t.id);
  assert.equal(data.balance(s.id), 1000);
});

test('JSON バックアップ → 復元で同じデータに戻る', async () => {
  const { data } = await setup();
  const s = await data.addStore({ name: '店舗A', exchangeRate: 55, initialMedals: 3000, memo: 'メモ' });
  await data.addTransaction({ storeId: s.id, date: '2026-10-20', time: '21:30', medals: 1200, machine: 'アイムジャグラー', machineNumber: '290' });
  await data.updateSettings({ targetMedals: 20000, theme: 'dark' });
  const json = JSON.parse(JSON.stringify(data.exportJSON()));
  assert.equal(json.stores[0].currentMedals, 4200);

  const other = (await setup()).data;
  await other.addStore({ name: '消える店舗' });
  const res = await other.importJSON(json);
  assert.deepEqual(res, { stores: 1, transactions: 1 });
  assert.equal(other.balance(s.id), 4200);
  assert.equal(other.settings.targetMedals, 20000);
  assert.equal(other.settings.theme, 'dark');
  assert.equal(other.transactions[0].machineNumber, '290');
});

test('壊れたバックアップは読み込まず、今のデータを残す', async () => {
  const { data } = await setup();
  await data.addStore({ name: '残る店舗' });
  await assert.rejects(data.importJSON({ foo: 1 }), ValidationError);
  await assert.rejects(data.importJSON({ app: 'other', stores: [], transactions: [] }), ValidationError);
  await assert.rejects(data.importJSON({ stores: [{ id: 's', name: 'A' }], transactions: [{ storeId: 'zzz', date: '2026-10-01', medals: 1 }] }), /記録の 1 件目/);
  assert.equal(data.stores[0].name, '残る店舗');
});

test('「現在貯メダル」だけのデータ（指示書のデータ構造）も読み込める', () => {
  const parsed = parseBackup({
    stores: [{ id: 's1', name: 'A', lendingRate: 50, exchangeRate: 55, currentMedals: 4900, favorite: true }],
    transactions: [{ id: 't1', date: '2026-10-01', storeId: 's1', type: 'play', medals: 1900, cash: 0 }],
  });
  assert.equal(parsed.stores[0].initialMedals, 3000);
});

test('CSV：BOM 付き、カンマや改行を含む値はクォート', async () => {
  const { data } = await setup();
  const s = await data.addStore({ name: '店舗A', exchangeRate: 55 });
  await data.addTransaction({ storeId: s.id, date: '2026-10-19', medals: -800, memo: 'a,b\n"c"' });
  await data.addTransaction({ storeId: s.id, date: '2026-10-20', medals: 1200, machine: 'アイムジャグラー', machineNumber: '290' });
  const csv = data.exportCSV();
  assert.ok(csv.startsWith('﻿日付,時刻,店舗,理由,増減枚数,円換算'));
  const rows = csv.slice(1).split('\r\n');
  assert.equal(rows[1], '2026-10-19,,店舗A,遊技結果,-800,-14545,0,,,,,,,"a,b\n""c"""');
  assert.match(rows[2], /^2026-10-20,,店舗A,遊技結果,1200,21818,0,アイムジャグラー,290,/);
});
