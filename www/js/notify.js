// お知らせの判定（純粋関数）。今はホーム画面に表示するだけだが、
// 将来はこの結果をプッシュ通知（Web Push / Capacitor Local Notifications）に渡せば通知にできる。

import { addDays, addMonths, daysBetween, monthOf } from './calculation.js';

/** 直近7日間（今日を含む）の稼働時間（分）。開始・終了時刻を入れた記録だけ */
export function weekMinutes(transactions, today) {
  const from = addDays(today, -6);
  return transactions.reduce((a, t) => a + (t.date >= from && t.date <= today ? t.detail?.minutes ?? 0 : 0), 0);
}

/**
 * @returns {{ id: string, tone: 'good'|'info'|'warn'|'bad', text: string }[]}
 */
export function pendingNotices({ stores, transactions, totalMedals, targetMedals, today, monthProfit = 0, monthlyLossLimit = 0, weeklyHoursLimit = 0 }) {
  const out = [];
  if (!stores.length) return out;
  // 遊びすぎ防止：月の負けの上限
  if (monthlyLossLimit > 0 && monthProfit < 0) {
    const loss = Math.round(-monthProfit);
    const yen = (n) => `${n.toLocaleString('ja-JP')}円`;
    if (loss >= monthlyLossLimit) {
      out.push({ id: 'monthLimit', tone: 'bad', text: `今月の負けが上限（${yen(monthlyLossLimit)}）に達しました（−${yen(loss)}）。今月はここまでにしましょう。` });
    } else if (loss >= monthlyLossLimit * 0.8) {
      out.push({ id: 'monthLimit', tone: 'warn', text: `今月の負けが上限の ${Math.floor((loss / monthlyLossLimit) * 100)}% です（−${yen(loss)} / ${yen(monthlyLossLimit)}）。` });
    }
  }
  // 遊びすぎ防止：1週間の稼働時間
  if (weeklyHoursLimit > 0) {
    const h = weekMinutes(transactions, today) / 60;
    if (h >= weeklyHoursLimit) {
      out.push({ id: 'weekHours', tone: 'warn', text: `この1週間で ${Math.round(h * 10) / 10}時間打っています（目安 ${weeklyHoursLimit}時間）。少し休みましょう。` });
    }
  }
  if (targetMedals > 0 && totalMedals >= targetMedals) {
    out.push({ id: 'goal', tone: 'good', text: `目標の ${targetMedals.toLocaleString('ja-JP')}枚を達成しています。` });
  }
  const last = transactions[0]?.date;
  if (last && daysBetween(last, today) >= 7) {
    out.push({ id: 'inactive', tone: 'info', text: `最後の記録から ${daysBetween(last, today)}日たっています。打った日は忘れずに記録しましょう。` });
  }
  // 月末の3日間は今月のふり返りを促す
  const nextMonthFirst = `${addMonths(monthOf(today), 1)}-01`;
  if (daysBetween(today, nextMonthFirst) <= 3) {
    out.push({ id: 'monthEnd', tone: 'info', text: 'もうすぐ月末です。「履歴」で今月の収支を確認しましょう。' });
  }
  return out;
}
