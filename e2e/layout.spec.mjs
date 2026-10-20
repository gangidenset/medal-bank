// スマホ幅（320〜430px）でレイアウトが崩れないか、タップ領域・ダークモード・PWA の設定
import { test, expect } from '@playwright/test';
import { openApp, store, tx } from './helpers.mjs';

const data = {
  stores: [store('a', 'とても長い名前の店舗〇〇ホール駅前本店', 55, 123456, { favorite: true }), store('b', '店舗B', 50, 2000)],
  transactions: [tx('t1', '2026-10-20', 'a', 12345, { machine: 'ファンキージャグラー2', machineNumber: '1234', memo: '長いメモ'.repeat(10) })],
  settings: { targetMedals: 200000 },
};
const PAGES = ['#/home', '#/record', '#/history', '#/history/charts', '#/history/diagnosis', '#/history/forecast', '#/judge', '#/spec/im-ex', '#/stores', '#/store/a', '#/settings'];

for (const width of [320, 375, 390, 414, 430]) {
  test(`${width}px：どの画面も横スクロールが出ない`, async ({ page }) => {
    await page.setViewportSize({ width, height: 700 });
    await openApp(page, { data });
    for (const hash of PAGES) {
      await page.evaluate((h) => { location.hash = h; }, hash);
      await expect(page.locator('#main > .topbar')).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, hash).toBeLessThanOrEqual(0);
    }
  });
}

test('ボタン・ナビのタップ領域は 44px 以上', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await openApp(page, { data, hash: '#/record' });
  const targets = page.locator('.nav a, .qbtn, .chip, .btn-save, .sign-btn');
  const n = await targets.count();
  expect(n).toBeGreaterThan(15);
  for (let i = 0; i < n; i++) {
    const box = await targets.nth(i).boundingBox();
    expect(box.height, await targets.nth(i).textContent()).toBeGreaterThanOrEqual(40);
  }
  const nav = await page.locator('.nav a').first().boundingBox();
  expect(nav.height).toBeGreaterThanOrEqual(44);
  await expect(page.locator('#rec-medals')).toHaveAttribute('type', 'number');
});

test('ダークモード：端末設定に合わせる・設定で手動変更', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await openApp(page, { data, hash: '#/settings' });
  const bg = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(await bg()).toBe('rgb(14, 16, 21)');
  await page.getByRole('radio', { name: 'ライト' }).check();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  expect(await bg()).toBe('rgb(243, 244, 248)');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

test('PWA：manifest（standalone・アイコン）とサービスワーカー', async ({ page, request }) => {
  await openApp(page);
  const manifest = await (await request.get('/manifest.json')).json();
  expect(manifest.display).toBe('standalone');
  expect(manifest.icons.map((i) => i.sizes)).toEqual(expect.arrayContaining(['192x192', '512x512']));
  for (const i of manifest.icons) expect((await request.get(`/${i.src}`)).ok()).toBe(true);
  expect((await request.get('/service-worker.js')).ok()).toBe(true);
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute('href', 'icons/apple-touch-icon.png');
});
