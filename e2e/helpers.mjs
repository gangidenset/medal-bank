import { expect } from '@playwright/test';

/** テストは「2026年10月20日（火）21時」に固定して動かす */
export const NOW = new Date('2026-10-20T21:00:00+09:00');

export const store = (id, name, exchangeRate, initialMedals, extra = {}) => ({
  id, name, lendingRate: 50, exchangeRate, initialMedals, favorite: false, memo: '',
  createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z', deletedAt: null, ...extra,
});

export const tx = (id, date, storeId, medals, extra = {}) => ({
  id, date, time: '21:00', storeId, type: 'play', medals, cash: 0, machine: '', machineNumber: '', memo: '', detail: null,
  createdAt: `${date}T12:00:00.000Z`, updatedAt: `${date}T12:00:00.000Z`, deletedAt: null, ...extra,
});

/**
 * アプリを開く。data（{ stores, transactions, settings }）を渡すと端末内（IndexedDB）に入れてから読み込み直す。
 */
export async function openApp(page, { data = null, hash = '#/home', now = NOW } = {}) {
  await page.clock.setFixedTime(now);
  // データを入れる場合は、存在しない店舗などへのリダイレクトを避けるため、いったんホームで開く
  await page.goto(data ? '/#/home' : `/${hash}`);
  await expect(page.locator('#main > *').first()).toBeVisible();
  if (data) {
    await page.evaluate(async ({ stores = [], transactions = [], settings = null }) => {
      const db = await new Promise((resolve, reject) => {
        const req = indexedDB.open('medal-bank', 1);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      const t = db.transaction(['stores', 'transactions', 'meta'], 'readwrite');
      stores.forEach((s) => t.objectStore('stores').put(s));
      transactions.forEach((x) => t.objectStore('transactions').put(x));
      if (settings) t.objectStore('meta').put({ id: 'settings', ...settings });
      await new Promise((resolve) => { t.oncomplete = resolve; });
      db.close();
    }, data);
    await page.evaluate((h) => history.replaceState(null, '', h), hash);
    await page.reload();
    await expect(page.locator('#main > *').first()).toBeVisible();
  }
}

/** 端末内に保存されているデータ（削除済みを除く） */
export const stored = (page, collection) => page.evaluate(async (c) => {
  const db = await new Promise((resolve) => {
    const req = indexedDB.open('medal-bank', 1);
    req.onsuccess = () => resolve(req.result);
  });
  const rows = await new Promise((resolve) => {
    const req = db.transaction(c).objectStore(c).getAll();
    req.onsuccess = () => resolve(req.result);
  });
  db.close();
  return rows.filter((r) => !r.deletedAt);
}, collection);

export const nav = (page, name) => page.locator('.nav').getByRole('link', { name }).click();
export const totalMedals = (page) => page.getByTestId('total-medals');
export const totalYen = (page) => page.getByTestId('total-yen');
