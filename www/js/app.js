// 起動・画面の切り替え・入力とボタン操作の振り分け。
// 画面遷移は URL の #（ハッシュ）で行うので、GitHub Pages でも Capacitor（ネイティブアプリ）でもそのまま動く。

import {
  addDays, addMonths, applySign, dailySeries, dateStr, firstDate, forecast, goalProgress,
  monthOf, monthStats, monthlySeries, playMinutes, portfolio, roundYen, summarize, timeStr, typeLabel, workStats, yenPerMedal,
} from './calculation.js';
import { diagnose, guessMachineType } from './analysis.js';
import { PRIORS, judge } from './judge.js';
import { SPEC_FIELDS, allMachines, normalizeSpec } from './machines.js';
import { ValidationError, createDataService, newId } from './data.js';
import { createDefaultStorage } from './storage.js';
import { barChart, lineChart } from './chart.js';
import { pendingNotices } from './notify.js';
import { limit } from './plan.js';
import * as ui from './ui.js';

const VERSION = '1.4.0';
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
const diagState = { range: 'month' };
let pendingDraft = null;

// 実戦カウンターの状態。打っている途中で画面が閉じても消えないよう、端末内に残す
const JUDGE_KEY = 'medalbank:judge';
const COUNT_KEYS = ['bb', 'bbSolo', 'bbCherry', 'rb', 'rbSolo', 'rbCherry', 'grape', 'cherry'];
let judgeState = loadJudgeState();

function loadJudgeState() {
  const base = { machineId: 'im-ex', storeId: null, games: '', today: '', splitBb: false, splitRb: false, countSmall: true, optsOpen: false, history: [], minusMode: false, result: null };
  for (const k of COUNT_KEYS) base[k] = 0;
  try {
    const saved = JSON.parse(localStorage.getItem(JUDGE_KEY) ?? 'null');
    if (saved && typeof saved === 'object') {
      for (const k of Object.keys(base)) if (k !== 'result' && k !== 'minusMode' && saved[k] !== undefined) base[k] = saved[k];
      if (!Array.isArray(base.history)) base.history = [];
    }
  } catch { /* 保存できない環境ではメモリだけで動かす */ }
  return base;
}

function saveJudgeState() {
  try {
    localStorage.setItem(JUDGE_KEY, JSON.stringify({ ...judgeState, result: undefined, minusMode: undefined, history: judgeState.history.slice(-100) }));
  } catch { /* 同上 */ }
}

const machineList = () => allMachines(data.settings.customMachines);

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
    diagnosis: (range) => {
      const from = range === 'month' ? `${thisMonth}-01` : range === '3m' ? `${addMonths(thisMonth, -2)}-01` : undefined;
      return diagnose(data.stores, data.transactions, { from, to: today });
    },
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
  });
}

function newDraft() {
  const now = new Date();
  const ids = data.stores.map((s) => s.id);
  // 前回使った店舗 → お気に入り（先頭に並んでいる）→ 最初の店舗
  const storeId = [preferStoreId, data.settings.lastStoreId].find((id) => id && ids.includes(id)) ?? ids[0] ?? null;
  preferStoreId = null;
  const d = {
    editId: null, storeId, medals: '', type: 'play', payout: '', investment: '',
    date: dateStr(now), time: timeStr(now), startTime: '', expectedValue: '', machine: '', machineNumber: '', memo: '',
    machineType: '', games: '',
    detailOpen: data.settings.recordDetailOpen, playMode: false, startMedals: '', endMedals: '',
  };
  // 実戦カウンターの「この台の結果を記録する」から来たときは、機種・G数などを引き継ぐ
  if (pendingDraft) {
    Object.assign(d, pendingDraft);
    if (!ids.includes(d.storeId)) d.storeId = storeId;
    pendingDraft = null;
  }
  return d;
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
    machineType: t.machineType ?? '', games: s(d.games),
    detailOpen: t.type !== 'exchange' && Boolean(t.machine || t.machineNumber || t.memo || t.cash || d.startMedals != null || d.startTime || d.expectedValue != null || d.games != null),
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
      else if (r.id === 'diagnosis') html = ui.diagnosisView(vm, diagState);
      else html = ui.historyView(vm, historyState);
      break;
    case 'judge': {
      if (!data.store(judgeState.storeId)) judgeState.storeId = data.settings.lastStoreId && data.store(data.settings.lastStoreId) ? data.settings.lastStoreId : data.stores[0]?.id ?? null;
      if (judgeState.machineId && !machineList().some((m) => m.id === judgeState.machineId)) judgeState.machineId = '';
      computeJudge();
      html = ui.judgeView(vm, judgeState, { machines: machineList(), priors: PRIORS });
      tab = 'home';
      break;
    }
    case 'spec': {
      const machine = r.id && r.id !== 'new' ? machineList().find((m) => m.id === r.id) : null;
      if (r.id !== 'new' && !machine) return go('#/judge');
      html = ui.specView(vm, machine, SPEC_FIELDS);
      tab = 'home';
      break;
    }
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
  document.body.dataset.route = r.name;
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

// ---- 実戦カウンター ----

function computeJudge() {
  const js = judgeState;
  const games = Number(js.games) || 0;
  if (games <= 0) {
    js.result = null;
    return;
  }
  const s = data.settings;
  const store = data.store(js.storeId);
  const counts = { games, splitBb: js.splitBb, splitRb: js.splitRb, countSmall: js.countSmall };
  for (const k of COUNT_KEYS) counts[k] = Number(js[k]) || 0;
  js.result = judge({
    machine: machineList().find((m) => m.id === js.machineId) ?? null,
    counts,
    priorId: s.judgePrior,
    todayMedals: Number(js.today) || 0,
    lossLimit: s.dailyLossLimit,
    stock: store ? data.balance(store.id) : null,
    now: timeStr(new Date()),
    closingTime: s.closingTime,
    yenPerMedal: store ? yenPerMedal(store.exchangeRate) : 20,
  });
}

/** 入力中はフォーカスを保つため、結果と数字の部分だけ書き換える */
function refreshJudge() {
  computeJudge();
  saveJudgeState();
  const vm = buildVM();
  const games = Number(judgeState.games) || 0;
  for (const k of COUNT_KEYS) {
    const n = main.querySelector(`[data-testid="count-${k}"]`);
    if (n) n.textContent = judgeState[k] || 0;
    const p = main.querySelector(`[data-prob="${k}"]`);
    if (p) p.textContent = ui.prob(games, judgeState[k]);
  }
  const stats = document.getElementById('jd-stats');
  if (stats) stats.innerHTML = ui.counterStats(judgeState);
  const undo = main.querySelector('[data-action="count-undo"]');
  if (undo) undo.disabled = !judgeState.history.length;
  const res = document.getElementById('judge-result');
  if (res) res.innerHTML = ui.judgeResult(vm, judgeState);
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
  'pick-mtype': (el) => {
    // 同じものをもう一度タップすると自動判定に戻す
    draft.machineType = draft.machineType === el.dataset.id ? '' : el.dataset.id;
    updateTypeChips();
  },
  'diag-range': (el) => { diagState.range = el.dataset.id; render(); },
  count: (el) => {
    const k = el.dataset.key;
    const before = Number(judgeState[k]) || 0;
    const d = judgeState.minusMode ? -1 : 1;
    if (before + d < 0) return;
    judgeState[k] = before + d;
    judgeState.history.push([k, d]);
    navigator.vibrate?.(judgeState.minusMode ? [8, 40, 8] : 10);
    // 押した感触：数字を一瞬はずませる
    el.classList.remove('bump');
    void el.offsetWidth;
    el.classList.add('bump');
    refreshJudge();
  },
  'count-undo': () => {
    const last = judgeState.history.pop();
    if (!last) return;
    const [k, d] = last;
    judgeState[k] = Math.max(0, (Number(judgeState[k]) || 0) - d);
    navigator.vibrate?.(8);
    refreshJudge();
  },
  // 横向き：Android は全画面にして横に固定できる。iPhone はウェブから向きを変えられないので案内を出す
  landscape: async () => {
    if (document.fullscreenElement) {
      screen.orientation?.unlock?.();
      await document.exitFullscreen().catch(() => {});
      render();
      return;
    }
    try {
      if (!document.documentElement.requestFullscreen || !screen.orientation?.lock) throw new Error('unsupported');
      await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
      await screen.orientation.lock('landscape');
      render();
    } catch {
      if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});
      toast(/iPhone|iPad|iPod/.test(navigator.userAgent)
        ? 'iPhone では、コントロールセンターで「画面縦向きのロック」を解除して、スマホを横にしてください'
        : '画面の自動回転をオンにして、スマホを横にしてください');
    }
  },
  'minus-mode': () => {
    judgeState.minusMode = !judgeState.minusMode;
    render();
  },
  'count-reset': () => {
    if (!confirm('G数とカウントをリセットしますか？')) return;
    for (const k of COUNT_KEYS) judgeState[k] = 0;
    judgeState.history = [];
    judgeState.minusMode = false;
    judgeState.games = '';
    judgeState.today = '';
    saveJudgeState();
    render();
  },
  'judge-record': () => {
    const machine = machineList().find((m) => m.id === judgeState.machineId);
    const js = judgeState;
    const bb = js.splitBb ? `BIG ${js.bbSolo + js.bbCherry}（単独${js.bbSolo}・チェリー${js.bbCherry}）` : `BIG ${js.bb}`;
    const rb = js.splitRb ? `REG ${js.rbSolo + js.rbCherry}（単独${js.rbSolo}・チェリー${js.rbCherry}）` : `REG ${js.rb}`;
    pendingDraft = {
      storeId: judgeState.storeId,
      machine: machine?.name ?? '',
      machineType: machine ? 'a' : '',
      games: judgeState.games,
      memo: `${bb}・${rb}${judgeState.countSmall && (judgeState.grape || judgeState.cherry) ? `・ブドウ ${judgeState.grape}・チェリー ${judgeState.cherry}` : ''}`,
      detailOpen: true,
    };
    go('#/record');
  },
  'spec-reset': async () => {
    const { id } = parseRoute();
    if (!confirm('組み込みの値に戻しますか？')) return;
    await data.updateSettings({ customMachines: data.settings.customMachines.filter((m) => m.id !== id) }, { silent: true });
    toast('組み込みの値に戻しました');
    go('#/judge');
  },
  'spec-delete': async () => {
    const { id } = parseRoute();
    if (!confirm('この機種を削除しますか？')) return;
    await data.updateSettings({ customMachines: data.settings.customMachines.filter((m) => m.id !== id) }, { silent: true });
    if (judgeState.machineId === id) judgeState.machineId = 'im-ex';
    toast('機種を削除しました');
    go('#/judge');
  },
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

const DRAFT_FIELDS = new Set(['medals', 'payout', 'investment', 'date', 'time', 'startTime', 'expectedValue', 'machine', 'machineNumber', 'memo', 'startMedals', 'endMedals', 'games']);

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
    if (t.name === 'machine') updateTypeChips();
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
  } else if (t.form?.id === 'judge-form' && (t.name === 'games' || t.name === 'today')) {
    judgeState[t.name] = t.value;
    refreshJudge();
  }
}

/** 機種名を打つと、機種タイプの選択を自動判定に合わせて更新する */
function updateTypeChips() {
  const sel = draft.machineType || guessMachineType(draft.machine);
  for (const b of main.querySelectorAll('#rec-types .chip')) {
    const on = b.dataset.id === sel;
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', String(on));
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
    } else if (t.form?.id === 'judge-form') {
      if (['dailyLossLimit', 'closingTime', 'judgePrior'].includes(t.name)) {
        const v = t.name === 'dailyLossLimit' ? (t.value === '' ? 0 : Number(t.value)) : t.value;
        await data.updateSettings({ [t.name]: v }, { silent: true });
        refreshJudge();
      } else if (t.name === 'splitRb' || t.name === 'splitBb') {
        // 切り替えても数えたボーナスが消えないようにする
        const js = judgeState;
        const b = t.name === 'splitBb' ? 'bb' : 'rb';
        const label = b === 'bb' ? 'BIG' : 'REG';
        const solo = `${b}Solo`;
        const cherry = `${b}Cherry`;
        if (t.checked && js[b] > 0 && !js[solo] && !js[cherry]) {
          if (!confirm(`これまでの ${label} ${js[b]}回は内訳が分からないため、単独${label} に入れて数え始めます。よろしいですか？`)) {
            t.checked = false;
            return;
          }
          js[solo] = js[b];
          js[b] = 0;
        } else if (!t.checked && (js[solo] || js[cherry])) {
          js[b] = (js[solo] || 0) + (js[cherry] || 0);
          js[solo] = 0;
          js[cherry] = 0;
        }
        js[t.name] = t.checked;
        js.history = [];
        saveJudgeState();
        render();
      } else if (['machineId', 'storeId', 'countSmall'].includes(t.name)) {
        judgeState[t.name] = t.type === 'checkbox' ? t.checked : t.value;
        saveJudgeState();
        render();
      }
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
    games: n('games'),
  };
  const input = {
    storeId: draft.storeId, type: draft.type, medals, cash, date: draft.date, time: draft.time,
    machine: draft.machine, machineNumber: draft.machineNumber, memo: draft.memo, detail,
    machineType: draft.machineType || guessMachineType(draft.machine),
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
    else if (form.id === 'spec-form') {
      const { id } = parseRoute();
      let spec;
      try {
        spec = normalizeSpec({ ...Object.fromEntries(new FormData(form)), id: id === 'new' ? `c-${newId().slice(0, 8)}` : id });
      } catch (err) {
        throw new ValidationError(err.message);
      }
      const others = data.settings.customMachines.filter((m) => m.id !== spec.id);
      await data.updateSettings({ customMachines: [...others, spec] }, { silent: true });
      judgeState.machineId = spec.id;
      saveJudgeState();
      toast(`「${spec.name}」のスペックを保存しました`);
      go('#/judge');
    } else if (form.id === 'goal-form') {
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
    if (e.target.matches?.('details.counter-opts')) {
      judgeState.optsOpen = e.target.open;
      saveJudgeState();
      return;
    }
    if (!e.target.matches?.('details.more') || !draft) return;
    draft.detailOpen = e.target.open;
    // 次回も同じ状態で開く（時給・期待値を毎回入れる人向け）
    if (data.settings.recordDetailOpen !== draft.detailOpen) data.updateSettings({ recordDetailOpen: draft.detailOpen }, { silent: true }).catch(fail);
  }, true);
  window.addEventListener('hashchange', render);
  // 戻るジェスチャーなどで全画面（横向き固定）が終わったら、ボタンの表示を戻す
  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement) screen.orientation?.unlock?.();
    if (parseRoute().name === 'judge') render();
  });
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
