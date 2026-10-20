// service-worker.js をブラウザなしで動かし、キャッシュとオフライン時の挙動を確認する
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import vm from 'node:vm';

const ORIGIN = 'http://localhost:8080';
const source = await readFile(new URL('../www/service-worker.js', import.meta.url), 'utf8');

function createWorker({ online }) {
  const stores = new Map();
  const reloads = [];
  const cacheFor = (name) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const store = stores.get(name);
    const key = (req) => new URL(typeof req === 'string' ? req : req.url, ORIGIN + '/').href.split('?')[0];
    return {
      async addAll(urls) {
        for (const u of urls) {
          if (typeof u !== 'string') reloads.push(u.cache);
          const label = typeof u === 'string' ? u : `.${new URL(u.url).pathname}`;
          store.set(key(u), new Response(`cached:${label}`));
        }
      },
      async put(req, res) { store.set(key(req), res); },
      async match(req) { return store.get(key(req))?.clone(); },
    };
  };
  const listeners = {};
  const net = { online, calls: [] };
  const self = {
    location: new URL(ORIGIN + '/service-worker.js'),
    clients: { claim: async () => {} },
    skipWaiting: async () => {},
    addEventListener: (type, fn) => { listeners[type] = fn; },
  };
  const context = {
    self,
    caches: {
      open: async (name) => cacheFor(name),
      keys: async () => [...stores.keys()],
      delete: async (name) => stores.delete(name),
    },
    fetch: async (req) => {
      net.calls.push(req.url);
      if (!net.online) throw new TypeError('Failed to fetch');
      return new Response(`network:${new URL(req.url).pathname}`);
    },
    URL, Request, Response, Promise, setTimeout, clearTimeout, Error,
  };
  vm.runInNewContext(source, context);

  const run = async (type, extra = {}) => {
    let done;
    const event = { ...extra, waitUntil: (p) => { done = p; }, respondWith: (p) => { done = p; } };
    listeners[type](event);
    return done;
  };
  const request = (path, mode = 'cors') => ({ url: ORIGIN + path, method: 'GET', mode });
  return { run, request, net, stores, reloads };
}


test('インストール時にアプリ本体をキャッシュし、古いキャッシュだけ消す', async () => {
  const sw = createWorker({ online: true });
  sw.stores.set('medal-bank-v0', new Map());
  sw.stores.set('other-app', new Map());
  await sw.run('install');
  await sw.run('activate');
  const names = [...sw.stores.keys()];
  assert.ok(!names.includes('medal-bank-v0'));
  assert.ok(names.includes('other-app'));
  const shell = sw.stores.get(names.find((n) => n.startsWith('medal-bank-')));
  for (const p of ['/index.html', '/js/app.js', '/css/style.css', '/manifest.json']) assert.ok(shell.has(`${ORIGIN}${p}`), p);
});

test('キャッシュがあればすぐ返し、裏でネットワークから更新する', async () => {
  const sw = createWorker({ online: true });
  await sw.run('install');
  const res = await sw.run('fetch', { request: sw.request('/js/app.js') });
  assert.equal(await res.text(), 'cached:./js/app.js');
  await new Promise((r) => setTimeout(r, 0));
  assert.ok(sw.net.calls.includes(`${ORIGIN}/js/app.js`));
  const res2 = await sw.run('fetch', { request: sw.request('/js/app.js') });
  assert.equal(await res2.text(), 'network:/js/app.js');
});

test('オフライン：キャッシュから起動でき、画面遷移は index.html を返す', async () => {
  const sw = createWorker({ online: true });
  await sw.run('install');
  sw.net.online = false;
  const res = await sw.run('fetch', { request: sw.request('/js/data.js') });
  assert.equal(await res.text(), 'cached:./js/data.js');
  const nav = await sw.run('fetch', { request: sw.request('/somewhere', 'navigate') });
  assert.equal(await nav.text(), 'cached:./index.html');
});

test('SHELL に書いたファイルがすべて存在する', async () => {
  const list = [...source.matchAll(/'\.\/([^']*)'/g)].map((m) => m[1]).filter(Boolean);
  assert.ok(list.length > 10);
  for (const p of list) await access(new URL(`../www/${p}`, import.meta.url));
});

test('インストール時は HTTP キャッシュを使わず、必ず最新のファイルを取ってくる', async () => {
  const sw = createWorker({ online: true });
  await sw.run('install');
  assert.ok(sw.reloads.length > 10);
  assert.ok(sw.reloads.every((c) => c === 'reload'));
});
