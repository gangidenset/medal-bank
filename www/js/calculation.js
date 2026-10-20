// 計算（純粋関数のみ）：残高・円換算・月別集計・推移・目標・将来予測。
// DOM や保存先に依存しないので、Node のテストやネイティブアプリ版からそのまま使える。

/** 記録の理由。sign: 1 = 必ずプラス、-1 = 必ずマイナス、0 = 入力どおり */
export const TX_TYPES = [
  { id: 'play', label: '遊技結果', sign: 0 },
  { id: 'deposit', label: '貯メダル追加', sign: 1 },
  { id: 'withdraw', label: '貯メダル引き出し', sign: -1 },
  { id: 'exchange', label: '換金', sign: -1 },
  { id: 'transfer', label: '店舗移動', sign: 0 },
  { id: 'other', label: 'その他', sign: 0 },
];

export const typeLabel = (id) => TX_TYPES.find((t) => t.id === id)?.label ?? 'その他';

/** 理由に合わせて枚数の符号をそろえる（例：換金で 1100 と入力 → -1100） */
export function applySign(type, medals) {
  const n = Math.trunc(Number(medals) || 0);
  const sign = TX_TYPES.find((t) => t.id === type)?.sign ?? 0;
  return sign === 0 ? n : sign * Math.abs(n);
}

/** 枚数 → 円（端数処理前）。交換枚数 = 1,000円分に必要な枚数 */
export function medalsToYen(medals, exchangeRate) {
  const rate = Number(exchangeRate);
  if (!(rate > 0)) return 0;
  return (medals * 1000) / rate;
}

/** 1枚あたりの円（55枚交換 → 18.18…円） */
export const yenPerMedal = (exchangeRate) => medalsToYen(1, exchangeRate);

/** 円の端数処理。マイナスも「0 に近づける＝切り捨て」として左右対称に扱う */
export function roundYen(value, method = 'floor') {
  if (!Number.isFinite(value)) return 0;
  const sign = value < 0 ? -1 : 1;
  let abs = Math.abs(value);
  // 浮動小数の誤差（54544.9999999 など）で 1円ずれないようにする
  if (Math.abs(abs - Math.round(abs)) < 1e-6) abs = Math.round(abs);
  const r = method === 'ceil' ? Math.ceil(abs) : method === 'round' ? Math.round(abs) : Math.floor(abs);
  return r === 0 ? 0 : sign * r;
}

/** 店舗ごとの現在の貯メダル = 初期枚数 + 記録の合計 */
export function storeBalance(store, transactions) {
  let n = Math.trunc(store.initialMedals || 0);
  for (const t of transactions) if (t.storeId === store.id) n += t.medals;
  return n;
}

/** 店舗別の資産と合計。合計円は端数処理前の値を足してから丸める */
export function portfolio(stores, transactions, method = 'floor') {
  const sums = new Map(stores.map((s) => [s.id, Math.trunc(s.initialMedals || 0)]));
  for (const t of transactions) if (sums.has(t.storeId)) sums.set(t.storeId, sums.get(t.storeId) + t.medals);
  let totalMedals = 0;
  let totalYenExact = 0;
  const rows = stores.map((store) => {
    const medals = sums.get(store.id);
    const yenExact = medalsToYen(medals, store.exchangeRate);
    totalMedals += medals;
    totalYenExact += yenExact;
    return { store, medals, yen: roundYen(yenExact, method) };
  });
  return { rows, totalMedals, totalYen: roundYen(totalYenExact, method) };
}

/**
 * 記録の集計。収支 = 貯メダルの増減（円換算）+ 現金の出入り。
 * 換金（-1,100枚・+20,000円）は資産の形が変わるだけなので、収支はほぼ 0 になる。
 */
export function summarize(stores, transactions) {
  const rate = new Map(stores.map((s) => [s.id, s.exchangeRate]));
  let medals = 0;
  let medalYen = 0;
  let cash = 0;
  for (const t of transactions) {
    medals += t.medals;
    medalYen += medalsToYen(t.medals, rate.get(t.storeId));
    cash += t.cash || 0;
  }
  return { medals, medalYen, cash, profit: medalYen + cash, count: transactions.length };
}

export const monthStats = (stores, transactions, month) =>
  summarize(stores, transactions.filter((t) => t.date.startsWith(month)));

// ---- 日付（'YYYY-MM-DD' の文字列で扱い、タイムゾーンの影響を受けないようにする） ----

const pad = (n) => String(n).padStart(2, '0');
export const dateStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const timeStr = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
export const monthOf = (date) => date.slice(0, 7);

const toUTC = (date) => {
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};
const fromUTC = (ms) => {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
};
export const addDays = (date, n) => fromUTC(toUTC(date) + n * 86400000);
export const daysBetween = (a, b) => Math.round((toUTC(b) - toUTC(a)) / 86400000);

export function addMonths(month, n) {
  const [y, m] = month.split('-').map(Number);
  const i = y * 12 + (m - 1) + n;
  return `${Math.floor(i / 12)}-${pad((i % 12) + 1)}`;
}
export const monthsBetween = (a, b) => {
  const [ya, ma] = a.split('-').map(Number);
  const [yb, mb] = b.split('-').map(Number);
  return (yb - ya) * 12 + (mb - ma);
};

export const isValidDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && fromUTC(toUTC(s)) === s;

/** 最初の記録日（店舗の登録日も含む） */
export function firstDate(stores, transactions) {
  let min = null;
  for (const t of transactions) if (!min || t.date < min) min = t.date;
  for (const s of stores) {
    const d = s.createdAt?.slice(0, 10);
    if (d && isValidDate(d) && (!min || d < min)) min = d;
  }
  return min;
}

/**
 * 日ごとの貯メダル・円換算資産の推移（その日の終わりの残高）。
 * from より前の記録は開始時点の残高に含める。
 */
export function dailySeries(stores, transactions, { from, to, method = 'floor' }) {
  const rate = new Map(stores.map((s) => [s.id, s.exchangeRate]));
  const active = transactions.filter((t) => rate.has(t.storeId)).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  let medals = 0;
  let yen = 0;
  for (const s of stores) {
    medals += Math.trunc(s.initialMedals || 0);
    yen += medalsToYen(Math.trunc(s.initialMedals || 0), s.exchangeRate);
  }
  let i = 0;
  const add = (t) => {
    medals += t.medals;
    yen += medalsToYen(t.medals, rate.get(t.storeId));
  };
  while (i < active.length && active[i].date < from) add(active[i++]);
  const points = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    while (i < active.length && active[i].date === d) add(active[i++]);
    points.push({ date: d, medals, yen: roundYen(yen, method) });
  }
  return points;
}

/** 月別の集計（endMonth を含めて count ヶ月分、古い順） */
export function monthlySeries(stores, transactions, endMonth, count = 12) {
  const byMonth = new Map();
  for (const t of transactions) {
    const m = monthOf(t.date);
    if (!byMonth.has(m)) byMonth.set(m, []);
    byMonth.get(m).push(t);
  }
  const out = [];
  for (let k = count - 1; k >= 0; k--) {
    const month = addMonths(endMonth, -k);
    out.push({ month, ...summarize(stores, byMonth.get(month) ?? []) });
  }
  return out;
}

/** 目標の達成状況 */
export function goalProgress(current, target) {
  if (!(target > 0)) return null;
  const achieved = current >= target;
  let rate = Math.round((Math.max(0, current) / target) * 1000) / 10;
  if (!achieved && rate >= 100) rate = 99.9;
  return {
    target,
    current,
    rate,
    remaining: Math.max(0, target - current),
    achieved,
    ratio: Math.min(1, Math.max(0, current) / target),
  };
}

/**
 * 将来予測：直近（最大12ヶ月、今月を含む）の増減の月平均で、このまま増減した場合の枚数。
 * 予測値であり、実際の遊技結果を保証するものではない。
 */
export function forecast(stores, transactions, today, { horizons = [3, 6, 12], method = 'floor' } = {}) {
  const ids = new Set(stores.map((s) => s.id));
  const txs = transactions.filter((t) => ids.has(t.storeId));
  if (!txs.length) return null;
  const nowMonth = monthOf(today);
  let first = nowMonth;
  for (const t of txs) if (monthOf(t.date) < first) first = monthOf(t.date);
  const start = monthsBetween(first, nowMonth) > 11 ? addMonths(nowMonth, -11) : first;
  const basisMonths = monthsBetween(start, nowMonth) + 1;
  let sum = 0;
  for (const t of txs) {
    const m = monthOf(t.date);
    if (m >= start && m <= nowMonth) sum += t.medals;
  }
  const monthlyAvg = Math.round(sum / basisMonths);
  const pf = portfolio(stores, transactions, method);
  const current = pf.totalMedals;
  // 円換算は「今の店舗構成での 1枚あたりの平均」で計算する
  const avgRate = current > 0
    ? pf.rows.reduce((a, r) => a + medalsToYen(r.medals, r.store.exchangeRate), 0) / current
    : stores.reduce((a, s) => a + yenPerMedal(s.exchangeRate), 0) / stores.length;
  const points = horizons.map((months) => {
    const medals = Math.max(0, current + monthlyAvg * months);
    return { months, month: addMonths(nowMonth, months), medals, yen: roundYen(medals * avgRate, method) };
  });
  const goalMonths = (target) => {
    if (!(target > current)) return 0;
    return monthlyAvg > 0 ? Math.ceil((target - current) / monthlyAvg) : null;
  };
  return {
    current,
    monthlyAvg,
    basisMonths,
    lowData: basisMonths < 3,
    points,
    depleteMonths: monthlyAvg < 0 && current > 0 ? Math.ceil(current / -monthlyAvg) : null,
    goalMonths,
  };
}
