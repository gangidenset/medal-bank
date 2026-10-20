// オフライン対応のサービスワーカー。
// 方針：キャッシュをすぐ返して起動を速くし（電波の弱い店内でも待たない）、裏でネットワークから最新を取ってキャッシュを更新する。
// 更新は次回の起動から反映される。アプリのファイルを追加・削除したら SHELL を更新し、CACHE の番号を上げる。

const CACHE = 'medal-bank-v7';
const SHELL = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './js/analysis.js',
  './js/app.js',
  './js/calculation.js',
  './js/chart.js',
  './js/data.js',
  './js/guides.js',
  './js/judge.js',
  './js/machines.js',
  './js/notify.js',
  './js/plan.js',
  './js/storage.js',
  './js/ui.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('medal-bank-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  // 外部への通信や GET 以外には関与しない（このアプリは外部にデータを送らない）
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(request, { ignoreSearch: true })
      ?? (request.mode === 'navigate' ? await cache.match('./index.html') : undefined);
    const update = fetch(request).then((res) => {
      if (res.ok) cache.put(request, res.clone());
      return res;
    });
    if (cached) {
      event.waitUntil(update.catch(() => {}));
      return cached;
    }
    try {
      return await update;
    } catch {
      return Response.error();
    }
  })());
});
