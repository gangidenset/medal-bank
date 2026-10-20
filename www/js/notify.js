// お知らせの判定（純粋関数）。今はホーム画面に表示するだけだが、
// 将来はこの結果をプッシュ通知（Web Push / Capacitor Local Notifications）に渡せば通知にできる。

import { addMonths, daysBetween, monthOf } from './calculation.js';

/**
 * @returns {{ id: string, tone: 'good'|'info', text: string }[]}
 */
export function pendingNotices({ stores, transactions, totalMedals, targetMedals, today }) {
  const out = [];
  if (!stores.length) return out;
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
