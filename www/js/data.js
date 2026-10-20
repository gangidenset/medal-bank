// Service 層：データ構造・入力チェック・追加/更新/削除・バックアップ（JSON / CSV）。
// 画面はこの層だけを通してデータを触る。保存先は storage.js のアダプタを差し替えて変えられる。
//
// クラウド同期に備えて、すべてのレコードに id（UUID）・createdAt・updatedAt を持たせ、
// 削除は deletedAt を入れる「論理削除」にしている（同期時に削除を相手に伝えられるように）。

import { MACHINE_TYPES, guessMachineType, machineTypeLabel } from './analysis.js';
import { normalizeSpec } from './machines.js';
import { TX_TYPES, applySign, isValidDate, medalsToYen, perHour, roundYen, storeBalance, txProfit, typeLabel } from './calculation.js';

export const APP_ID = 'medal-bank';
export const SCHEMA_VERSION = 1;
export const DEFAULT_SETTINGS = {
  theme: 'system', // system | light | dark
  targetMedals: 0,
  roundingMethod: 'floor', // floor（切り捨て）| round（四捨五入）| ceil（切り上げ）
  lastStoreId: null,
  recordDetailOpen: false, // 記録画面の「詳しく入力」を開いた状態で始める
  dailyLossLimit: 0, // ヤメ判断：1日の負けの上限（枚、0 = 決めていない）
  closingTime: '22:45', // ヤメ判断：閉店時刻
  judgePrior: 'normal', // ヤメ判断：店の状況（normal | event | flat）
  customMachines: [], // 利用者が編集・追加した機種スペック（machines.js の形）
  recordInputMode: 'diff', // 記録の入力方法：diff（増減）| balance（保存後の残高）
  monthlyLossLimit: 0, // 遊びすぎ防止：月の負けの上限（円、0 = 決めていない）
  weeklyHoursLimit: 0, // 遊びすぎ防止：1週間の稼働時間の目安（時間、0 = 決めていない）
};

export class ValidationError extends Error {}

export function newId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  // http（非セキュア）で開いたときは randomUUID が使えない
  const b = new Uint8Array(16);
  if (globalThis.crypto?.getRandomValues) crypto.getRandomValues(b);
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

const nowISO = () => new Date().toISOString();
const text = (v, max) => String(v ?? '').trim().slice(0, max);
const int = (v) => {
  if (v === '' || v == null) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : NaN;
};
const optInt = (v) => (v === '' || v == null ? null : int(v));
const MAX_MEDALS = 10_000_000;
const MAX_YEN = 100_000_000;

export function normalizeStore(input, prev = null) {
  const pick = (k, d) => (input[k] !== undefined ? input[k] : prev ? prev[k] : d);
  const name = text(pick('name', ''), 40);
  if (!name) throw new ValidationError('店舗名を入力してください');
  const lendingRate = Math.round(Number(pick('lendingRate', 50)) * 10) / 10;
  if (!(lendingRate > 0 && lendingRate <= 1000)) throw new ValidationError('貸出枚数は 1〜1000 の数で入力してください');
  const exchangeRate = Math.round(Number(pick('exchangeRate', 50)) * 10) / 10;
  if (!(exchangeRate > 0 && exchangeRate <= 1000)) throw new ValidationError('交換枚数は 1〜1000 の数で入力してください');
  const initialMedals = int(pick('initialMedals', 0));
  if (!Number.isFinite(initialMedals) || Math.abs(initialMedals) > MAX_MEDALS) throw new ValidationError('貯メダルの枚数を正しく入力してください');
  return {
    id: prev?.id ?? (typeof input.id === 'string' && input.id ? input.id : newId()),
    name,
    lendingRate,
    exchangeRate,
    initialMedals,
    favorite: Boolean(pick('favorite', false)),
    replayLimit: (() => {
      const n = int(pick('replayLimit', 0));
      if (!Number.isFinite(n) || n < 0 || n > 1_000_000) throw new ValidationError('再プレイの上限を正しく入力してください');
      return n;
    })(),
    replayFee: (() => {
      const n = Math.round(Number(pick('replayFee', 0) || 0) * 10) / 10;
      if (!Number.isFinite(n) || n < 0 || n > 50) throw new ValidationError('再プレイ手数料は 0〜50% で入力してください');
      return n;
    })(),
    memo: text(pick('memo', ''), 500),
    createdAt: prev?.createdAt ?? (typeof input.createdAt === 'string' ? input.createdAt : nowISO()),
    updatedAt: nowISO(),
    deletedAt: null,
  };
}

export function normalizeTransaction(input, prev = null, storeIds = null) {
  const pick = (k, d) => (input[k] !== undefined ? input[k] : prev ? prev[k] : d);
  const date = String(pick('date', ''));
  if (!isValidDate(date)) throw new ValidationError('日付を正しく入力してください');
  let time = String(pick('time', '') ?? '');
  if (!/^\d{2}:\d{2}$/.test(time)) time = '';
  const storeId = String(pick('storeId', ''));
  if (!storeId || (storeIds && !storeIds.has(storeId))) throw new ValidationError('店舗を選んでください');
  const type = TX_TYPES.some((t) => t.id === pick('type')) ? pick('type') : 'play';
  const medals = applySign(type, int(pick('medals', 0)));
  const cash = int(pick('cash', 0));
  if (!Number.isFinite(medals) || Math.abs(medals) > MAX_MEDALS) throw new ValidationError('枚数を正しく入力してください');
  if (!Number.isFinite(cash) || Math.abs(cash) > MAX_YEN) throw new ValidationError('金額を正しく入力してください');
  if (medals === 0 && cash === 0) throw new ValidationError('増減枚数を入力してください');
  const d = pick('detail', null);
  let detail = null;
  if (d && typeof d === 'object') {
    detail = {
      startMedals: optInt(d.startMedals),
      endMedals: optInt(d.endMedals),
      investment: optInt(d.investment),
      payout: optInt(d.payout),
      expectedValue: optInt(d.expectedValue),
      minutes: optInt(d.minutes),
      games: optInt(d.games),
      high: optInt(d.high),
    };
    if (Object.values(detail).some((v) => v !== null && !Number.isFinite(v))) throw new ValidationError('遊技記録の数を正しく入力してください');
    if (detail.games !== null && !(detail.games >= 0 && detail.games <= 100000)) throw new ValidationError('ゲーム数を正しく入力してください');
    if (detail.high !== null && !(detail.high >= 0 && detail.high <= 100)) detail.high = null;
    if (detail.expectedValue !== null && Math.abs(detail.expectedValue) > MAX_YEN) throw new ValidationError('期待値を正しく入力してください');
    if (detail.minutes !== null && !(detail.minutes > 0 && detail.minutes <= 1440)) detail.minutes = null;
    detail.startTime = /^\d{2}:\d{2}$/.test(d.startTime ?? '') ? d.startTime : null;
    if (Object.values(detail).every((v) => v === null)) detail = null;
  }
  return {
    id: prev?.id ?? (typeof input.id === 'string' && input.id ? input.id : newId()),
    date,
    time,
    storeId,
    type,
    medals,
    cash,
    machine: text(pick('machine', ''), 60),
    machineNumber: text(pick('machineNumber', ''), 20),
    machineType: MACHINE_TYPES.some((m) => m.id === pick('machineType')) ? pick('machineType') : '',
    memo: text(pick('memo', ''), 500),
    detail,
    createdAt: prev?.createdAt ?? (typeof input.createdAt === 'string' ? input.createdAt : nowISO()),
    updatedAt: nowISO(),
    deletedAt: null,
  };
}

function normalizeSettings(input = {}) {
  const s = { ...DEFAULT_SETTINGS };
  if (['system', 'light', 'dark'].includes(input.theme)) s.theme = input.theme;
  const target = int(input.targetMedals);
  if (Number.isFinite(target) && target >= 0 && target <= MAX_MEDALS) s.targetMedals = target;
  if (['floor', 'round', 'ceil'].includes(input.roundingMethod)) s.roundingMethod = input.roundingMethod;
  if (typeof input.lastStoreId === 'string') s.lastStoreId = input.lastStoreId;
  s.recordDetailOpen = input.recordDetailOpen === true;
  const loss = int(input.dailyLossLimit);
  if (Number.isFinite(loss) && loss >= 0 && loss <= MAX_MEDALS) s.dailyLossLimit = loss;
  if (/^\d{2}:\d{2}$/.test(input.closingTime ?? '')) s.closingTime = input.closingTime;
  if (['normal', 'event', 'flat'].includes(input.judgePrior)) s.judgePrior = input.judgePrior;
  if (['diff', 'balance'].includes(input.recordInputMode)) s.recordInputMode = input.recordInputMode;
  const mLoss = int(input.monthlyLossLimit);
  if (Number.isFinite(mLoss) && mLoss >= 0 && mLoss <= MAX_YEN) s.monthlyLossLimit = mLoss;
  const wHours = Number(input.weeklyHoursLimit);
  if (Number.isFinite(wHours) && wHours >= 0 && wHours <= 168) s.weeklyHoursLimit = Math.round(wHours * 10) / 10;
  if (Array.isArray(input.customMachines)) {
    s.customMachines = input.customMachines.flatMap((m) => {
      try {
        const spec = normalizeSpec(m ?? {});
        return spec.id ? [spec] : [];
      } catch {
        return [];
      }
    });
  }
  return s;
}

const byStore = (a, b) => (b.favorite - a.favorite) || (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0);
const byNewest = (a, b) =>
  (a.date !== b.date ? (a.date < b.date ? 1 : -1) : 0)
  || (a.time !== b.time ? (a.time < b.time ? 1 : -1) : 0)
  || (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0);

export function createDataService(adapter) {
  let stores = [];
  let transactions = [];
  let settings = { ...DEFAULT_SETTINGS };
  const listeners = new Set();
  const emit = () => listeners.forEach((fn) => fn());
  const sortAll = () => {
    stores.sort(byStore);
    transactions.sort(byNewest);
  };

  const service = {
    get storageKind() { return adapter.kind; },
    async load() {
      const [s, t, meta] = await Promise.all(['stores', 'transactions', 'meta'].map((c) => adapter.getAll(c)));
      stores = s.filter((r) => !r.deletedAt);
      const ids = new Set(stores.map((r) => r.id));
      transactions = t.filter((r) => !r.deletedAt && ids.has(r.storeId));
      settings = normalizeSettings(meta.find((r) => r.id === 'settings') ?? {});
      sortAll();
    },
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },

    /** 店舗（お気に入り → 登録順） */
    get stores() { return stores; },
    /** 記録（新しい順） */
    get transactions() { return transactions; },
    get settings() { return settings; },
    store: (id) => stores.find((s) => s.id === id) ?? null,
    transaction: (id) => transactions.find((t) => t.id === id) ?? null,
    balance: (id) => {
      const s = stores.find((x) => x.id === id);
      return s ? storeBalance(s, transactions) : 0;
    },

    async addStore(input) {
      const rec = normalizeStore(input);
      await adapter.putMany('stores', [rec]);
      stores.push(rec);
      sortAll();
      emit();
      return rec;
    },
    async updateStore(id, patch) {
      const prev = service.store(id);
      if (!prev) throw new ValidationError('店舗が見つかりません');
      const rec = normalizeStore(patch, prev);
      await adapter.putMany('stores', [rec]);
      stores[stores.indexOf(prev)] = rec;
      sortAll();
      emit();
      return rec;
    },
    /** 店舗と、その店舗の記録をまとめて削除する */
    async deleteStore(id) {
      const prev = service.store(id);
      if (!prev) return;
      const at = nowISO();
      const related = transactions.filter((t) => t.storeId === id).map((t) => ({ ...t, deletedAt: at, updatedAt: at }));
      await adapter.putMany('transactions', related);
      await adapter.putMany('stores', [{ ...prev, deletedAt: at, updatedAt: at }]);
      stores = stores.filter((s) => s.id !== id);
      transactions = transactions.filter((t) => t.storeId !== id);
      emit();
    },

    async addTransaction(input) {
      const rec = normalizeTransaction(input, null, new Set(stores.map((s) => s.id)));
      await adapter.putMany('transactions', [rec]);
      transactions.push(rec);
      sortAll();
      if (settings.lastStoreId !== rec.storeId) await service.updateSettings({ lastStoreId: rec.storeId }, { silent: true });
      emit();
      return rec;
    },
    async updateTransaction(id, patch) {
      const prev = service.transaction(id);
      if (!prev) throw new ValidationError('記録が見つかりません');
      const rec = normalizeTransaction(patch, prev, new Set(stores.map((s) => s.id)));
      await adapter.putMany('transactions', [rec]);
      transactions[transactions.indexOf(prev)] = rec;
      sortAll();
      emit();
      return rec;
    },
    async deleteTransaction(id) {
      const prev = service.transaction(id);
      if (!prev) return;
      const at = nowISO();
      await adapter.putMany('transactions', [{ ...prev, deletedAt: at, updatedAt: at }]);
      transactions = transactions.filter((t) => t.id !== id);
      emit();
    },

    async updateSettings(patch, { silent = false } = {}) {
      settings = normalizeSettings({ ...settings, ...patch });
      await adapter.putMany('meta', [{ id: 'settings', ...settings, updatedAt: nowISO() }]);
      if (!silent) emit();
    },

    exportJSON() {
      return {
        app: APP_ID,
        schemaVersion: SCHEMA_VERSION,
        exportedAt: nowISO(),
        stores: stores.map((s) => ({ ...s, currentMedals: storeBalance(s, transactions) })),
        transactions: [...transactions],
        settings: { ...settings },
      };
    },

    /** バックアップから復元する（今のデータは置き換わる）。不正なデータなら何も変えずにエラー */
    async importJSON(obj) {
      const parsed = parseBackup(obj);
      await adapter.replaceAll({
        stores: parsed.stores,
        transactions: parsed.transactions,
        meta: [{ id: 'settings', ...parsed.settings, updatedAt: nowISO() }],
      });
      stores = parsed.stores;
      transactions = parsed.transactions;
      settings = parsed.settings;
      sortAll();
      emit();
      return { stores: stores.length, transactions: transactions.length };
    },

    async reset() {
      await adapter.replaceAll({ stores: [], transactions: [], meta: [] });
      stores = [];
      transactions = [];
      settings = { ...DEFAULT_SETTINGS };
      emit();
    },

    exportCSV() { return toCSV(stores, transactions, settings.roundingMethod); },
  };
  return service;
}

export function parseBackup(obj) {
  if (!obj || typeof obj !== 'object' || !Array.isArray(obj.stores) || !Array.isArray(obj.transactions)) {
    throw new ValidationError('このアプリのバックアップファイルではありません');
  }
  if (obj.app && obj.app !== APP_ID) throw new ValidationError('このアプリのバックアップファイルではありません');
  if ((obj.schemaVersion ?? 1) > SCHEMA_VERSION) throw new ValidationError('新しいバージョンのアプリで作られたファイルです。アプリを更新してください');
  const fail = (what, i, e) => {
    throw new ValidationError(`${what}の ${i + 1} 件目が読み込めません（${e.message}）`);
  };
  const rawStores = obj.stores.filter((s) => s && !s.deletedAt);
  const stores = rawStores.map((s, i) => {
    try { return normalizeStore({ ...s, initialMedals: s.initialMedals ?? 0 }); } catch (e) { return fail('店舗', i, e); }
  });
  const ids = new Set(stores.map((s) => s.id));
  if (ids.size !== stores.length) throw new ValidationError('店舗の ID が重複しています');
  const transactions = obj.transactions.filter((t) => t && !t.deletedAt).map((t, i) => {
    try { return normalizeTransaction(t, null, ids); } catch (e) { return fail('記録', i, e); }
  });
  // 「現在貯メダル」だけが書かれたデータ（初期枚数なし）にも対応する
  rawStores.forEach((raw, i) => {
    if (raw.initialMedals == null && Number.isFinite(Number(raw.currentMedals))) {
      const sum = transactions.filter((t) => t.storeId === stores[i].id).reduce((a, t) => a + t.medals, 0);
      stores[i].initialMedals = Math.trunc(Number(raw.currentMedals)) - sum;
    }
  });
  return { stores, transactions, settings: normalizeSettings(obj.settings ?? {}) };
}

const csvCell = (v) => {
  const s = String(v ?? '');
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** 履歴の CSV（Excel で文字化けしないよう先頭に BOM を付ける） */
export function toCSV(stores, transactions, method = 'floor') {
  const map = new Map(stores.map((s) => [s.id, s]));
  const head = ['日付', '時刻', '店舗', '理由', '増減枚数', '円換算', '現金収支', '機種', '台番号', '開始時貯メダル', '終了時貯メダル', '現金投資', '換金額',
    '開始時刻', '稼働時間（分）', '期待値（円）', '時給換算（円）', '機種タイプ', 'ゲーム数', '推定 設定4以上（%）', 'メモ'];
  const rows = [...transactions].reverse().map((t) => {
    const s = map.get(t.storeId);
    const hourly = perHour(txProfit(t, s?.exchangeRate), t.detail?.minutes);
    return [
      t.date, t.time, s?.name ?? '', typeLabel(t.type), t.medals,
      roundYen(medalsToYen(t.medals, s?.exchangeRate), method), t.cash,
      t.machine, t.machineNumber,
      t.detail?.startMedals ?? '', t.detail?.endMedals ?? '', t.detail?.investment ?? '', t.detail?.payout ?? '',
      t.detail?.startTime ?? '', t.detail?.minutes ?? '', t.detail?.expectedValue ?? '', hourly == null ? '' : roundYen(hourly, method),
      machineTypeLabel(t.machineType || guessMachineType(t.machine)), t.detail?.games ?? '', t.detail?.high ?? '',
      t.memo,
    ];
  });
  return '﻿' + [head, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
