// 立ち回り診断（純粋関数）：勝率・平均収支・時給を、機種タイプ・機種・曜日・打ち始めの時間帯・店舗ごとに集計し、
// 「どこで勝って、どこで負けているか」を文章にする。

import { medalsToYen, perHour } from './calculation.js';

export const MACHINE_TYPES = [
  { id: 'a', label: 'Aタイプ（ジャグラー等）', short: 'Aタイプ' },
  { id: 'smart', label: 'スマスロ', short: 'スマスロ' },
  { id: 'at', label: 'AT・ART機', short: 'AT・ART機' },
  { id: 'other', label: 'その他', short: 'その他' },
];
export const machineTypeLabel = (id) => MACHINE_TYPES.find((m) => m.id === id)?.short ?? '';

const A_TYPE = /ジャグラー|ハナハナ|ハナビ|花火|バーサス|ディスクアップ|アクロス|パルサー|クランキー|ネオプラネット|サンダーV/;

/** 機種名から機種タイプを推測する（分からなければ ''） */
export function guessMachineType(name) {
  const s = String(name ?? '').trim();
  if (!s) return '';
  if (/スマスロ/.test(s) || /^[LＬ]\s?[^a-zA-Zａ-ｚＡ-Ｚ]/.test(s)) return 'smart';
  if (A_TYPE.test(s)) return 'a';
  return '';
}
export const machineTypeOf = (t) => t.machineType || guessMachineType(t.machine) || 'other';

const WEEK = ['日', '月', '火', '水', '木', '金', '土'];
const weekdayOf = (date) => new Date(`${date}T00:00:00Z`).getUTCDay();

export const BANDS = [
  { id: 'morning', label: '〜12時', phrase: '12時より前' },
  { id: 'day', label: '12〜18時', phrase: '12〜18時' },
  { id: 'night', label: '18時〜', phrase: '18時以降' },
];
const bandOf = (startTime) => {
  const h = Number(startTime.slice(0, 2));
  return h >= 18 ? 'night' : h >= 12 ? 'day' : 'morning';
};

/** 遊技の記録（＝1回の稼働）だけを対象にする */
export const isSession = (t) => t.type === 'play';

function aggregate(items) {
  const a = { count: 0, wins: 0, losses: 0, profit: 0, minutes: 0, timedProfit: 0, games: 0, gamesCount: 0 };
  for (const i of items) {
    a.count++;
    if (i.profit > 0.5) a.wins++;
    else if (i.profit < -0.5) a.losses++;
    a.profit += i.profit;
    if (i.minutes > 0) {
      a.minutes += i.minutes;
      a.timedProfit += i.profit;
    }
    if (i.games > 0) {
      a.games += i.games;
      a.gamesCount++;
    }
  }
  a.winRate = a.count ? (a.wins / a.count) * 100 : 0;
  a.avgProfit = a.count ? a.profit / a.count : 0;
  a.hourly = perHour(a.timedProfit, a.minutes);
  return a;
}

function groupBy(items, keyFn, labelFn) {
  const map = new Map();
  for (const i of items) {
    const k = keyFn(i);
    if (k == null) continue;
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(i);
  }
  return [...map].map(([key, list]) => ({ key, label: labelFn(key), ...aggregate(list) }));
}

export const MIN_SAMPLES = 3;

/**
 * @param {{ from?: string, to?: string }} range 期間（'YYYY-MM-DD'、どちらも含む）
 */
export function diagnose(stores, transactions, { from = '0000-00-00', to = '9999-99-99' } = {}) {
  const storeMap = new Map(stores.map((s) => [s.id, s]));
  const items = transactions
    .filter((t) => isSession(t) && storeMap.has(t.storeId) && t.date >= from && t.date <= to)
    .map((t) => ({
      t,
      profit: medalsToYen(t.medals, storeMap.get(t.storeId).exchangeRate) + (t.cash || 0),
      minutes: t.detail?.minutes ?? 0,
      games: t.detail?.games ?? 0,
    }));
  const byProfit = (a, b) => b.profit - a.profit;
  const overall = aggregate(items);
  const byType = groupBy(items, (i) => machineTypeOf(i.t), machineTypeLabel).sort(byProfit);
  const byMachine = groupBy(items, (i) => i.t.machine || null, (k) => k).sort((a, b) => b.count - a.count || b.profit - a.profit);
  const byWeekday = groupBy(items, (i) => weekdayOf(i.t.date), (k) => `${WEEK[k]}曜`).sort((a, b) => ((a.key + 6) % 7) - ((b.key + 6) % 7));
  const byBand = groupBy(items, (i) => (i.t.detail?.startTime ? bandOf(i.t.detail.startTime) : null), (k) => BANDS.find((b) => b.id === k).label)
    .sort((a, b) => BANDS.findIndex((x) => x.id === a.key) - BANDS.findIndex((x) => x.id === b.key));
  const byStore = groupBy(items, (i) => i.t.storeId, (k) => storeMap.get(k).name).sort(byProfit);
  const ev = items.filter((i) => i.t.detail?.expectedValue != null);
  const evSum = ev.reduce((a, i) => a + i.t.detail.expectedValue, 0);
  const evActual = ev.reduce((a, i) => a + i.profit, 0);
  const result = { overall, byType, byMachine, byWeekday, byBand, byStore, sessions: items.map((i) => i.t), ev: { count: ev.length, sum: evSum, actual: evActual } };
  result.insights = buildInsights(result);
  return result;
}

const yenText = (v) => `${v > 0 ? '+' : v < 0 ? '−' : '±'}${Math.abs(Math.round(v)).toLocaleString('ja-JP')}円`;
const hourText = (g) => (g.hourly == null ? '' : `・時給 ${yenText(g.hourly)}`);
const rateText = (r) => `${(Math.round(r * 10) / 10).toFixed(1)}%`;

/** 診断のコメント。tone: good（得意）/ bad（苦手・注意）/ info */
export function buildInsights({ overall, byType, byMachine, byWeekday, byBand, ev }) {
  const out = [];
  if (overall.count < MIN_SAMPLES) return out;
  const enough = (list) => list.filter((g) => g.count >= MIN_SAMPLES);

  const types = enough(byType);
  if (types.length >= 2) {
    const best = types[0];
    const worst = types[types.length - 1];
    if (best.profit > 0 && worst.profit < 0) {
      out.push({
        tone: 'info',
        text: `あなたは${worst.label}より${best.label}の方が明らかに成績が良いです。`,
        detail: `◎ ${best.label}：${yenText(best.profit)}（${best.count}回${hourText(best)}）／❌ ${worst.label}：${yenText(worst.profit)}（${worst.count}回${hourText(worst)}）`,
      });
    }
  }

  const machines = enough(byMachine).sort((a, b) => b.profit - a.profit);
  if (machines.length) {
    const best = machines[0];
    const worst = machines[machines.length - 1];
    if (best.profit > 0) out.push({ tone: 'good', text: `◎ 一番相性がいい機種は「${best.label}」です。`, detail: `${best.count}回・勝率 ${rateText(best.winRate)}・${yenText(best.profit)}${hourText(best)}` });
    if (worst.profit < 0) out.push({ tone: 'bad', text: `❌ 「${worst.label}」で ${yenText(worst.profit)} 負けています。`, detail: `${worst.count}回・勝率 ${rateText(worst.winRate)}${hourText(worst)}` });
  }

  const days = byWeekday.filter((g) => g.count >= 2).sort((a, b) => a.profit - b.profit);
  if (days.length && days[0].profit < 0) {
    out.push({ tone: 'bad', text: `${days[0].label}日の収支が ${yenText(days[0].profit)} です。`, detail: `${days[0].count}回・勝率 ${rateText(days[0].winRate)}` });
  }

  for (const b of enough(byBand)) {
    if (b.winRate <= overall.winRate - 15) {
      const phrase = BANDS.find((x) => x.id === b.key).phrase;
      out.push({ tone: 'bad', text: `${phrase}から打ち始めた場合の勝率が ${rateText(b.winRate)} です。`, detail: `全体の勝率は ${rateText(overall.winRate)}（${phrase}：${b.count}回・${yenText(b.profit)}）` });
    }
  }

  if (ev.count >= MIN_SAMPLES) {
    const avg = ev.sum / ev.count;
    if (avg < 0) {
      out.push({ tone: 'bad', text: '期待値がマイナスの台を打つことが多いです。', detail: `期待値の平均 ${yenText(avg)}/回（${ev.count}回）。打つ台選びを見直すと成績が上がります。` });
    } else {
      const diff = ev.actual - ev.sum;
      out.push({
        tone: diff >= 0 ? 'good' : 'info',
        text: diff >= 0 ? `期待値より ${yenText(diff)} 上振れています。` : `期待値より ${yenText(diff)} 下振れていますが、台選びはできています。`,
        detail: `期待値の合計 ${yenText(ev.sum)} → 実際 ${yenText(ev.actual)}（${ev.count}回）${diff < 0 ? '。期待値プラスの台を打ち続ければ収束していきます。' : ''}`,
      });
    }
  }

  if (overall.hourly != null && overall.minutes >= 600 && overall.hourly < 0) {
    out.push({ tone: 'bad', text: `時給換算が ${yenText(overall.hourly)} です。打つほど負けている状態です。`, detail: '打つ時間を減らすか、時給がプラスの機種・時間帯に絞ると負けが減ります。' });
  }
  return out;
}
