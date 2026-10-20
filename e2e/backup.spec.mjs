import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { openApp, store, stored, totalMedals, tx } from './helpers.mjs';

const data = {
  stores: [store('a', '店舗A', 55, 3000, { memo: 'メモ' })],
  transactions: [tx('t1', '2026-10-20', 'a', 1200, { machine: 'アイムジャグラー', machineNumber: '290' })],
  settings: { targetMedals: 20000 },
};

test('JSON で保存 → 全削除 → JSON から復元で元どおり', async ({ page }) => {
  await openApp(page, { data, hash: '#/settings' });
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'JSON で保存（すべてのデータ）' }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('medal-bank-backup-2026-10-20.json');
  const file = await download.path();
  const json = JSON.parse(await readFile(file, 'utf8'));
  expect(json).toMatchObject({ app: 'medal-bank', schemaVersion: 1 });
  expect(json.stores[0]).toMatchObject({ name: '店舗A', currentMedals: 4200 });

  page.on('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'すべてのデータを削除' }).click();
  await expect(page).toHaveURL(/#\/home$/);
  await expect(page.getByText('はじめに店舗を登録しましょう')).toBeVisible();

  await page.locator('.nav').getByRole('link', { name: '設定' }).click();
  await page.locator('#import-file').setInputFiles(file);
  await expect(page.locator('#toast')).toContainText('復元しました（店舗 1件・記録 1件）');
  await page.locator('.nav').getByRole('link', { name: 'ホーム' }).click();
  await expect(totalMedals(page)).toHaveText('4,200枚');
  expect(await stored(page, 'transactions')).toHaveLength(1);
});

test('JSON 以外のファイルは読み込まず、データはそのまま', async ({ page }) => {
  await openApp(page, { data, hash: '#/settings' });
  await page.locator('#import-file').setInputFiles({ name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('not json') });
  await expect(page.locator('#toast')).toContainText('JSON ファイルを読み込めませんでした');
  expect(await stored(page, 'stores')).toHaveLength(1);
});

test('履歴を CSV で保存', async ({ page }) => {
  await openApp(page, { data, hash: '#/settings' });
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: '履歴を CSV で保存' }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('medal-bank-history-2026-10-20.csv');
  const csv = await readFile(await download.path(), 'utf8');
  expect(csv).toContain('2026-10-20,21:00,店舗A,遊技結果,1200,21818,0,アイムジャグラー,290');
});
