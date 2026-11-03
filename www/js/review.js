// 月ごとのふり返り：その月の収支・時給・一番勝った機種などをまとめる（純粋関数）。

import { addDays, addMonths, medalsToYen, storeBalance, summarize } from './calculation.js';
import { diagnose } from './analysis.js';

const lastDayOf = (month) => {
  const [y, m] = month.split('-').map(Number);
  return `${month}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`;
};

/** 月末時点の総貯メダル（月末までの記録の合計 + 初期枚数） */
function medalsAt(stores, transactions, date) {
  const upTo = transactions.filter((t) => t.date <= date);
  return stores.reduce((sum, s) => sum + storeBalance(s, upTo), 0);
}

/**
 * @param {string} month 'YYYY-MM'
 * @returns ふり返りの内容。記録がない月は has: false
 */
export function monthlyReview(stores, transactions, month) {
  const from = `${month}-01`;
  const to = lastDayOf(month);
  const inMonth = transactions.filter((t) => t.date >= from && t.date <= to);
  const sum = summarize(stores, inMonth);
  const prevMonth = addMonths(month, -1);
  const prevList = transactions.filter((t) => t.date.startsWith(prevMonth));
  const prev = prevList.length ? summarize(stores, prevList) : null;

  const d = diagnose(stores, transactions, { from, to });
  const o = d.overall;
  const machines = d.byMachine.filter((g) => g.key);
  const byProfit = [...machines].sort((a, b) => b.profit - a.profit);
  const bestMachine = byProfit[0]?.profit > 0 ? byProfit[0] : null;
  const worstMachine = byProfit.at(-1)?.profit < 0 && byProfit.at(-1) !== bestMachine ? byProfit.at(-1) : null;

  // 日ごとの遊技の収支（同じ日に何台打っても1日として見る）
  const rate = new Map(stores.map((s) => [s.id, s.exchangeRate]));
  const days = new Map();
  for (const t of d.sessions) days.set(t.date, (days.get(t.date) ?? 0) + medalsToYen(t.medals, rate.get(t.storeId)) + (t.cash || 0));
  const dayList = [...days].map(([date, profit]) => ({ date, profit })).sort((a, b) => b.profit - a.profit || (a.date < b.date ? -1 : 1));
  const bestDay = dayList[0]?.profit > 0 ? dayList[0] : null;
  const worstDay = dayList.at(-1)?.profit < 0 ? dayList.at(-1) : null;

  const startMedals = medalsAt(stores, transactions, addDays(from, -1));
  const endMedals = medalsAt(stores, transactions, to);

  const review = {
    month,
    has: inMonth.length > 0,
    count: inMonth.length,
    profit: sum.profit,
    medals: sum.medals,
    cash: sum.cash,
    prevProfit: prev ? prev.profit : null,
    sessions: o.count,
    wins: o.wins,
    losses: o.losses,
    winRate: o.winRate,
    playDays: days.size,
    minutes: o.minutes,
    hourly: o.hourly,
    games: o.games,
    bestMachine,
    worstMachine,
    bestDay,
    worstDay,
    startMedals,
    endMedals,
    ev: d.ev.count ? { count: d.ev.count, sum: d.ev.sum, diff: d.ev.actual - d.ev.sum } : null,
  };
  review.comments = reviewComments(review);
  return review;
}

const yenText = (v) => `${v > 0 ? '+' : v < 0 ? '−' : '±'}${Math.abs(Math.round(v)).toLocaleString('ja-JP')}円`;

/** ひとことコメント（tone: good / bad / info） */
export function reviewComments(r) {
  const out = [];
  if (!r.has) return out;
  if (r.prevProfit != null) {
    const diff = r.profit - r.prevProfit;
    if (Math.abs(diff) >= 1) out.push({ tone: diff > 0 ? 'good' : 'bad', text: `先月より ${yenText(diff)}${diff > 0 ? ' よくなりました' : ' 悪くなりました'}。` });
  }
  if (r.sessions >= 3) {
    if (r.winRate >= 60) out.push({ tone: 'good', text: `勝率 ${Math.round(r.winRate)}%。よく勝てた月です。` });
    else if (r.winRate < 35) out.push({ tone: 'bad', text: `勝率 ${Math.round(r.winRate)}%。台選びや続行・ヤメの判断を見直してみましょう。` });
  }
  if (r.hourly != null) out.push({ tone: r.hourly >= 0 ? 'good' : 'bad', text: `時給は ${yenText(r.hourly)} でした。` });
  if (r.ev && r.ev.count >= 3) {
    out.push({ tone: 'info', text: r.ev.diff >= 0
      ? `期待値より ${yenText(r.ev.diff)} 上振れました。`
      : `期待値より ${yenText(r.ev.diff)} 下振れました。期待値の積み上げは続けましょう。` });
  }
  if (r.sessions === 0) out.push({ tone: 'info', text: '遊技の記録はありません（貯メダルの追加・換金などだけ）。' });
  return out;
}

/** ホームで知らせる月（先月に記録があり、まだ見ていなければ先月） */
export function reviewToNotify(transactions, thisMonth, seenMonth) {
  const prev = addMonths(thisMonth, -1);
  if (seenMonth >= prev) return null;
  return transactions.some((t) => t.date.startsWith(prev)) ? prev : null;
}
