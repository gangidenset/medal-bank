// 起動・画面の切り替え・入力とボタン操作の振り分け。
// 画面遷移は URL の #（ハッシュ）で行うので、GitHub Pages でも Capacitor（ネイティブアプリ）でもそのまま動く。

import {
  addDays, addMonths, applySign, dailySeries, dateStr, firstDate, forecast, goalProgress,
  monthOf, monthStats, monthlySeries, playMinutes, portfolio, roundYen, summarize, timeStr, typeLabel, workStats,
} from './calculation.js';
import { ValidationError, createDataService } from './data.js';
import { createDefaultStorage } from './storage.js';
import { barChart, lineChart } from './chart.js';
import { pendingNotices } from './notify.js';
import { limit } from './plan.js';
import * as ui from './ui.js';

const VERSION = '1.1.0';
const STORAGE_LABELS = {
  indexeddb: 'この端末（IndexedDB）',
  localstorage: 'この端末（localStorage）',
  memory: '一時保存（閉じると消えます。プライベートブラウズを解除してください）',
};

const main = document.getElementById('main');
let data;
let draft = null;
let draftKey = '';
let preferStoreId = null;
let lastRoute = '';
let installPrompt = null;
const historyState = { month: monthOf(dateStr(new Date())), store: 'all' };
const chartState = { range: '3m' };

// ---- 画面 ----

function parseRoute() {
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  return { name: parts[0] || 'home', id: parts[1] ?? null, from: parts[2] ?? null, key: parts.join('/') };
}

function go(hash) {
  if (location.hash === hash) render();
  else location.hash = hash;
}

function buildVM() {
  const today = dateStr(new Date());
  const method = data.settings.roundingMethod;
  const pf = portfolio(data.stores, data.transactions, method);
  const thisMonth = monthOf(today);
  const vm = {
    data, today, method, pf, thisMonth,
    month: monthStats(data.stores, data.transactions, thisMonth),
    goal: goalProgress(pf.totalMedals, data.settings.targetMedals),
    summarize: (txs) => summarize(data.stores, txs),
    work: (txs) => workStats(data.stores, txs),
  };
  return Object.defineProperties(vm, {
    fc: { get: () => forecast(data.stores, data.transactions, today, { method }) },
    notices: {
      get: () => pendingNotices({
        stores: data.stores, transactions: data.transactions, totalMedals: pf.totalMedals,
        targetMedals: data.settings.targetMedals, today,
      }),
    },
    machines: { get: () => [...new Set(data.transactions.map((t) => t.machine).filter(Boolean))].slice(0, 30) },
    machineStats: {
      get: () => {
        const map = new Map();
        for (const t of data.transactions) {
          if (!t.machine || t.type !== 'play') continue;
          if (!map.has(t.machine)) map.set(t.machine, []);
          map.get(t.machine).push(t);
        }
        return [...map].map(([machine, txs]) => ({ machine, count: txs.length, profit: summarize(data.stores, txs).profit }))
          .sort((a, b) => b.count - a.count).slice(0, 8);
      },
    },
  });
}

function newDraft() {
  const now = new Date();
  const ids = data.stores.map((s) => s.id);
  // 前回使った店舗 → お気に入り（先頭に並んでいる）→ 最初の店舗
  const storeId = [preferStoreId, data.settings.lastStoreId].find((id) => id && ids.includes(id)) ?? ids[0] ?? null;
  preferStoreId = null;
  return {
    editId: null, storeId, medals: '', type: 'play', payout: '', investment: '',
    date: dateStr(now), time: timeStr(now), startTime: '', expectedValue: '', machine: '', machineNumber: '', memo: '',
    detailOpen: data.settings.recordDetailOpen, playMode: false, startMedals: '', endMedals: '',
  };
}

function draftFromTx(t) {
  const d = t.detail ?? {};
  const s = (v) => (v == null ? '' : String(v));
  const payout = d.payout ?? (t.cash > 0 ? t.cash : null);
  const investment = d.investment ?? (t.cash < 0 ? -t.cash : null);
  return {
    editId: t.id, storeId: t.storeId, medals: String(t.medals), type: t.type,
    payout: s(payout), investment: s(investment), date: t.date, time: t.time,
    startTime: d.startTime ?? '', expectedValue: s(d.expectedValue),
    machine: t.machine, machineNumber: t.machineNumber, memo: t.memo,
    detailOpen: t.type !== 'exchange' && Boolean(t.machine || t.machineNumber || t.memo || t.cash || d.startMedals != null || d.startTime || d.expectedValue != null),
    playMode: d.startMedals != null || d.endMedals != null,
    startMedals: s(d.startMedals), endMedals: s(d.endMedals),
  };
}

function render() {
  const r = parseRoute();
  const vm = buildVM();
  let html;
  let tab = r.name;
  switch (r.name) {
    case 'record': {
      if (draftKey !== r.key || !draft) {
        const tx = r.id ? data.transaction(r.id) : null;
        if (r.id && !tx) return go('#/history');
        draft = tx ? draftFromTx(tx) : newDraft();
        draftKey = r.key;
      }
      if (draft.storeId && !data.store(draft.storeId)) draft.storeId = data.stores[0]?.id ?? null;
      html = ui.recordView(vm, draft);
      if (draft.editId) tab = 'history';
      break;
    }
    case 'history':
      if (r.id === 'charts') html = ui.chartsView(vm, chartState);
      else if (r.id === 'forecast') html = ui.forecastView(vm);
      else html = ui.historyView(vm, historyState);
      break;
    case 'stores':
      html = ui.storesView(vm);
      break;
    case 'store': {
      const store = r.id && r.id !== 'new' ? data.store(r.id) : null;
      if (r.id !== 'new' && !store) return go('#/stores');
      html = ui.storeFormView(vm, store);
      tab = 'stores';
      break;
    }
    case 'settings':
      html = ui.settingsView(vm, {
        version: VERSION,
        storageLabel: STORAGE_LABELS[data.storageKind],
        standalone: matchMedia('(display-mode: standalone)').matches || navigator.standalone === true,
        canInstall: Boolean(installPrompt),
        ios: /iPhone|iPad|iPod/.test(navigator.userAgent),
      });
      break;
    default:
      html = ui.homeView(vm);
      tab = 'home';
  }
  if (r.name !== 'record') draftKey = '';
  main.innerHTML = html;
  for (const a of document.querySelectorAll('.nav a')) {
    if (a.dataset.tab === tab) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
  if (lastRoute !== r.key) {
    window.scrollTo(0, 0);
    lastRoute = r.key;
  }
  mountCharts(vm);
}

function rerenderRecord() {
  main.innerHTML = ui.recordView(buildVM(), draft);
}

function mountCharts(vm) {
  const hosts = Object.fromEntries([...main.querySelectorAll('[data-chart]')].map((h) => [h.dataset.chart, h]));
  if (!Object.keys(hosts).length) return;
  const range = ui.RANGES.find((x) => x.id === chartState.range);
  const to = vm.today;
  const first = firstDate(data.stores, data.transactions) ?? to;
  let from = range.days ? addDays(to, -(range.days - 1)) : first;
  if (from < first) from = first;
  if (from > to) from = to;
  const series = dailySeries(data.stores, data.transactions, { from, to, method: vm.method });
  const label = (d) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;
  if (hosts.medals) {
    lineChart(hosts.medals, {
      points: series.map((p) => ({ label: label(p.date), value: p.medals })),
      format: (v) => `${ui.num(v)}枚`, ariaLabel: '貯メダル枚数の推移',
    });
  }
  if (hosts.yen) {
    lineChart(hosts.yen, {
      points: series.map((p) => ({ label: label(p.date), value: p.yen })),
      format: (v) => ui.yen(v), ariaLabel: '円換算資産の推移',
    });
  }
  if (hosts.monthly) {
    barChart(hosts.monthly, {
      items: monthlySeries(data.stores, data.transactions, vm.thisMonth, 12).map((m) => ({
        label: ui.monthLabel(m.month), short: `${Number(m.month.slice(5))}月`, value: roundYen(m.profit, vm.method),
      })),
      format: (v) => `${ui.signed(v)}円`, ariaLabel: '月別収支',
    });
  }
}

// ---- 通知（トースト） ----

let toastTimer;
let toastAction = null;
function toast(message, { actionLabel, onAction, error = false } = {}) {
  const el = document.getElementById('toast');
  el.className = `toast show${error ? ' error' : ''}`;
  el.querySelector('.toast-msg').textContent = message;
  const btn = el.querySelector('.toast-action');
  btn.hidden = !actionLabel;
  btn.textContent = actionLabel ?? '';
  toastAction = onAction ?? null;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = 'toast'; toastAction = null; }, actionLabel ? 5000 : 3000);
}

function fail(e) {
  if (e instanceof ValidationError) toast(e.message, { error: true });
  else {
    console.error(e);
    toast('保存できませんでした。もう一度お試しください。', { error: true });
  }
}

// ---- テーマ ----

function applyTheme() {
  const root = document.documentElement;
  const t = data.settings.theme;
  if (t === 'light' || t === 'dark') root.dataset.theme = t;
  else delete root.dataset.theme;
  const dark = t === 'dark' || (t === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelector('meta[name="theme-color"]:not([media])')?.setAttribute('content', dark ? '#14161c' : '#f3f4f8');
}

// ---- 保存・読み込み ----

async function download(filename, content, type) {
  const blob = new Blob([content], { type });
  const file = typeof File === 'function' ? new File([blob], filename, { type }) : null;
  // iPhone のホーム画面アプリではダウンロードが使えないことがあるので、共有シート（「ファイルに保存」）を使う
  if (file && /iPhone|iPad|iPod/.test(navigator.userAgent) && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename });
      return;
    } catch (e) {
      if (e.name === 'AbortError') return;
    }
  }
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

async function importFile(file) {
  try {
    const obj = JSON.parse(await file.text());
    const n = { stores: obj?.stores?.length ?? 0, transactions: obj?.transactions?.length ?? 0 };
    if (!confirm(`今のデータを、バックアップの内容（店舗 ${n.stores}件・記録 ${n.transactions}件）に置き換えます。よろしいですか？`)) return;
    const res = await data.importJSON(obj);
    applyTheme();
    toast(`復元しました（店舗 ${res.stores}件・記録 ${res.transactions}件）`);
    render();
  } catch (e) {
    if (e instanceof SyntaxError) toast('JSON ファイルを読み込めませんでした', { error: true });
    else fail(e);
  }
}

// ---- 操作 ----

const actions = {
  'pick-store': (el) => { draft.storeId = el.dataset.id; rerenderRecord(); },
  'pick-type': (el) => {
    draft.type = el.dataset.id;
    if (draft.medals !== '') draft.medals = String(applySign(draft.type, draft.medals));
    rerenderRecord();
  },
  'toggle-sign': () => {
    const n = Number(draft.medals) || 0;
    if (n) draft.medals = String(-n);
    rerenderRecord();
    document.getElementById('rec-medals')?.focus();
  },
  quick: (el) => {
    const n = (Number(draft.medals) || 0) + Number(el.dataset.v);
    draft.medals = String(applySign(draft.type, n));
    draft.playMode = false;
    rerenderRecord();
  },
  'quick-clear': () => { draft.medals = ''; rerenderRecord(); },
  'delete-tx': async () => {
    if (!confirm('この記録を削除しますか？')) return;
    await data.deleteTransaction(draft.editId);
    toast('記録を削除しました');
    go('#/history');
  },
  month: (el) => {
    const next = addMonths(historyState.month, Number(el.dataset.d));
    historyState.month = next > monthOf(dateStr(new Date())) ? historyState.month : next;
    render();
  },
  range: (el) => { chartState.range = el.dataset.id; render(); },
  'exchange-preset': (el) => {
    const input = document.getElementById('st-exchange');
    input.value = el.dataset.v;
    updateStorePreview();
  },
  'delete-store': async () => {
    const { id } = parseRoute();
    const store = data.store(id);
    const count = data.transactions.filter((t) => t.storeId === id).length;
    if (!confirm(`「${store.name}」を削除しますか？\nこの店舗の記録 ${count}件も削除されます。`)) return;
    await data.deleteStore(id);
    toast('店舗を削除しました');
    go('#/stores');
  },
  'export-json': () => download(`medal-bank-backup-${dateStr(new Date())}.json`, JSON.stringify(data.exportJSON(), null, 2), 'application/json'),
  'export-csv': () => download(`medal-bank-history-${dateStr(new Date())}.csv`, data.exportCSV(), 'text/csv'),
  'import-json': () => document.getElementById('import-file').click(),
  install: async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    await installPrompt.userChoice.catch(() => {});
    installPrompt = null;
    render();
  },
  reset: async () => {
    if (!confirm('すべての店舗と記録を削除します。元に戻せません。よろしいですか？')) return;
    if (!confirm('本当に削除しますか？（先に JSON で保存しておくことをおすすめします）')) return;
    await data.reset();
    applyTheme();
    toast('すべてのデータを削除しました');
    go('#/home');
  },
};

function updateStorePreview() {
  const el = document.getElementById('store-preview');
  if (!el) return;
  el.innerHTML = ui.storePreview(document.getElementById('st-medals').value, document.getElementById('st-exchange').value, data.settings.roundingMethod);
}

const DRAFT_FIELDS = new Set(['medals', 'payout', 'investment', 'date', 'time', 'startTime', 'expectedValue', 'machine', 'machineNumber', 'memo', 'startMedals', 'endMedals']);

function onInput(e) {
  const t = e.target;
  if (t.form?.id === 'record-form' && draft) {
    if (t.name === 'playMode') {
      draft.playMode = t.checked;
      rerenderRecord();
      return;
    }
    if (!DRAFT_FIELDS.has(t.name)) return;
    draft[t.name] = t.value;
    if ((t.name === 'startMedals' || t.name === 'endMedals') && draft.startMedals !== '' && draft.endMedals !== '') {
      draft.medals = String(Number(draft.endMedals) - Number(draft.startMedals));
      document.getElementById('rec-medals').value = draft.medals;
    }
    const vm = buildVM();
    document.getElementById('rec-preview').innerHTML = ui.recordPreview(vm, draft);
    const work = document.getElementById('rec-work');
    if (work) work.innerHTML = ui.workPreview(vm, draft);
  } else if (t.form?.id === 'store-form') {
    updateStorePreview();
  }
}

async function onChange(e) {
  const t = e.target;
  try {
    if (t.name === 'theme') {
      await data.updateSettings({ theme: t.value });
      applyTheme();
    } else if (t.name === 'roundingMethod') {
      await data.updateSettings({ roundingMethod: t.value });
      toast('円換算の端数処理を変更しました');
    } else if (t.name === 'historyStore') {
      historyState.store = t.value;
      render();
    } else if (t.id === 'import-file' && t.files[0]) {
      await importFile(t.files[0]);
      t.value = '';
    }
  } catch (err) {
    fail(err);
  }
}

async function saveRecord() {
  const { medals, cash } = ui.draftValues(draft);
  const n = (k) => (draft[k] === '' || draft[k] == null ? null : Number(draft[k]));
  const minutes = playMinutes(draft.startTime, draft.time);
  const detail = {
    startMedals: draft.playMode ? n('startMedals') : null,
    endMedals: draft.playMode ? n('endMedals') : null,
    investment: n('investment'),
    payout: n('payout'),
    expectedValue: n('expectedValue'),
    startTime: minutes ? draft.startTime : null,
    minutes,
  };
  const input = {
    storeId: draft.storeId, type: draft.type, medals, cash, date: draft.date, time: draft.time,
    machine: draft.machine, machineNumber: draft.machineNumber, memo: draft.memo, detail,
  };
  if (draft.editId) {
    await data.updateTransaction(draft.editId, input);
    toast('記録を更新しました');
    go('#/history');
    return;
  }
  const rec = await data.addTransaction(input);
  const store = data.store(rec.storeId);
  const what = rec.medals ? `${ui.signed(rec.medals)}枚` : `${ui.signed(rec.cash)}円`;
  toast(`保存しました：${store.name} ${what}${rec.type !== 'play' ? `（${typeLabel(rec.type)}）` : ''}`, {
    actionLabel: '元に戻す',
    onAction: async () => {
      await data.deleteTransaction(rec.id);
      toast('記録を取り消しました');
      render();
    },
  });
  draft = null;
  go('#/home');
}

async function saveStore(form) {
  const f = new FormData(form);
  const { id, from } = parseRoute();
  const input = {
    name: f.get('name'), lendingRate: f.get('lendingRate'), exchangeRate: f.get('exchangeRate'),
    favorite: f.get('favorite') === 'on', memo: f.get('memo'),
  };
  const medals = f.get('medals') === '' ? 0 : Number(f.get('medals'));
  if (!Number.isInteger(medals) || medals < 0) throw new ValidationError('貯メダルは 0 以上の整数で入力してください');
  if (id === 'new') {
    if (data.stores.length >= limit('maxStores')) throw new ValidationError(`登録できる店舗は${limit('maxStores')}店舗までです`);
    const rec = await data.addStore({ ...input, initialMedals: medals });
    toast(`「${rec.name}」を登録しました`);
    if (from === 'record' || data.stores.length === 1) {
      preferStoreId = rec.id;
      go('#/record');
    } else go('#/stores');
    return;
  }
  const rec = await data.updateStore(id, input);
  const diff = medals - data.balance(id);
  if (diff) {
    const now = new Date();
    await data.addTransaction({ storeId: id, type: 'other', medals: diff, cash: 0, date: dateStr(now), time: timeStr(now), memo: '残高を修正' });
  }
  toast(`「${rec.name}」を保存しました`);
  go('#/stores');
}

async function onSubmit(e) {
  e.preventDefault();
  const form = e.target;
  try {
    if (form.id === 'record-form') await saveRecord();
    else if (form.id === 'store-form') await saveStore(form);
    else if (form.id === 'goal-form') {
      const v = form.targetMedals.value;
      const n = v === '' ? 0 : Number(v);
      if (!Number.isInteger(n) || n < 0) throw new ValidationError('目標は 0 以上の整数で入力してください');
      await data.updateSettings({ targetMedals: n });
      toast(n ? `目標を ${ui.num(n)}枚 にしました` : '目標を解除しました');
      render();
    }
  } catch (err) {
    fail(err);
  }
}

// ---- 起動 ----

async function init() {
  data = createDataService(await createDefaultStorage());
  try {
    await data.load();
  } catch (e) {
    console.error(e);
    toast('データを読み込めませんでした', { error: true });
  }
  applyTheme();
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', applyTheme);

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const fn = actions[el.dataset.action];
    if (!fn) return;
    e.preventDefault();
    Promise.resolve(fn(el)).catch(fail);
  });
  document.querySelector('.toast-action').addEventListener('click', () => {
    const fn = toastAction;
    document.getElementById('toast').className = 'toast';
    toastAction = null;
    fn?.()?.catch?.(fail);
  });
  main.addEventListener('input', onInput);
  main.addEventListener('change', onChange);
  main.addEventListener('submit', onSubmit);
  main.addEventListener('toggle', (e) => {
    if (!e.target.matches?.('details.more') || !draft) return;
    draft.detailOpen = e.target.open;
    // 次回も同じ状態で開く（時給・期待値を毎回入れる人向け）
    if (data.settings.recordDetailOpen !== draft.detailOpen) data.updateSettings({ recordDetailOpen: draft.detailOpen }, { silent: true }).catch(fail);
  }, true);
  window.addEventListener('hashchange', render);
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { if (main.querySelector('[data-chart]')) mountCharts(buildVM()); }, 150);
  });
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    installPrompt = e;
    if (parseRoute().name === 'settings') render();
  });

  render();
  const splash = document.getElementById('splash');
  splash?.classList.add('hide');
  setTimeout(() => splash?.remove(), 400);

  // オフライン対応（ネイティブアプリ版では不要なので登録しない）
  if ('serviceWorker' in navigator && location.protocol.startsWith('http') && !window.Capacitor) {
    navigator.serviceWorker.register('./service-worker.js').catch(() => {});
  }
}

init();
