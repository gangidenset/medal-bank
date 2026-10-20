// 全画面の小役カウンター（#/counter）：スクロールせず、数えるためのものだけを表示する
import { test, expect } from '@playwright/test';
import { openApp, store } from './helpers.mjs';

const data = { stores: [store('a', '店舗A', 50, 2800)], settings: { lastStoreId: 'a' } };

for (const [w, h] of [[320, 568], [375, 667], [390, 844], [430, 932], [812, 375], [667, 375]]) {
  test(`${w}×${h}：スクロールせずに全部見え、下部ナビは出ない`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await openApp(page, { data, hash: '#/counter' });
    await expect(page.getByTestId('counter-screen')).toBeVisible();
    await expect(page.locator('.nav')).toBeHidden();
    const size = await page.evaluate(() => ({
      sh: document.documentElement.scrollHeight, ih: window.innerHeight,
      sw: document.documentElement.scrollWidth, iw: window.innerWidth,
    }));
    expect(size.sh).toBeLessThanOrEqual(size.ih);
    expect(size.sw).toBeLessThanOrEqual(size.iw);
    // ボタン・道具の行がすべて画面の中にあり、ボタンは十分な大きさ
    for (const el of await page.locator('.kachi-btn, .k-tool, .cs-head > *').all()) {
      const b = await el.boundingBox();
      expect(b.y + b.height).toBeLessThanOrEqual(h + 1);
      expect(b.height).toBeGreaterThanOrEqual(36);
    }
    expect((await page.locator('.kachi-btn').first().boundingBox()).height).toBeGreaterThanOrEqual(80);
  });
}

test('ホームから開いて数え、「判定」画面と同じ回数を使う', async ({ page }) => {
  await openApp(page, { data, now: new Date('2026-10-20T15:00:00+09:00') });
  await page.getByTestId('counter-button').click();
  await expect(page).toHaveURL(/#\/counter$/);
  await page.getByLabel('現在G数').fill('3000');
  for (let i = 0; i < 16; i++) await page.getByRole('button', { name: 'BIGを数える' }).click();
  for (let i = 0; i < 18; i++) await page.getByRole('button', { name: 'REGを数える' }).click();
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'ブドウを数える' }).click();
  await page.getByRole('button', { name: '1つ戻す' }).click();
  await expect(page.getByTestId('count-grape')).toHaveText('2');
  await expect(page.getByTestId('jd-combined')).toHaveText('1/88.2');
  await expect(page.getByTestId('jd-high-mini')).toHaveText(/\d+%/);

  await page.getByTestId('to-judge').click();
  await expect(page).toHaveURL(/#\/judge$/);
  await expect(page.getByTestId('count-bb')).toHaveText('16');
  await expect(page.getByTestId('verdict-label')).toHaveText('続行推奨');
  await page.getByTestId('open-counter').click();
  await expect(page.getByTestId('count-rb')).toHaveText('18');
});

test('アイコン長押しのショートカットから開ける', async ({ request }) => {
  const manifest = await (await request.get('/manifest.json')).json();
  expect(manifest.shortcuts[0]).toMatchObject({ name: '小役カウンター', url: './#/counter' });
});
