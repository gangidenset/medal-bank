// 設定推測と続行・ヤメ判断（純粋関数）。
// カウントした回数（BIG・REG・ブドウ・チェリーなど）とゲーム数から、設定ごとの可能性をベイズ推定し、
// その重みで機械割の期待値を出す。「負けを取り返したい」気持ちではなく、数字と事前に決めた上限で判断するための道具。

export const PRIORS = {
  normal: { label: '通常営業（低設定が多い）', p: [0.55, 0.2, 0.12, 0.07, 0.04, 0.02] },
  event: { label: 'イベント日（高設定に期待）', p: [0.25, 0.15, 0.15, 0.15, 0.15, 0.15] },
  flat: { label: 'わからない（全設定が同じ確率）', p: [1 / 6, 1 / 6, 1 / 6, 1 / 6, 1 / 6, 1 / 6] },
};

/** Aタイプの目安：1時間に回せるゲーム数と、ボーナスなしで 1G あたり使う枚数（50枚で約33G） */
export const GAMES_PER_HOUR = 750;
export const BASE_COST = 1.5;
const MIN_GAMES = 500;
const STEP = 10;

/**
 * 推測に使う項目。スペックに数値があり、かつ数えている項目だけを使う。
 * - REG は「単独・チェリーに分けて数える」かつスペックに両方あるときは分けて使う
 * - ブドウ・チェリーは「小役も数える」がオンのときだけ（数えていない 0 回を「出ていない」と誤解しないため）
 */
export function usedCategories(machine, c) {
  const cats = [];
  for (const [b, split, total] of [['bb', c.splitBb, totalBb(c)], ['rb', c.splitRb, totalRb(c)]]) {
    const solo = machine[`${b}Solo`];
    const cherry = solo && cherryDenoms(machine[b], solo, machine[`${b}Cherry`]);
    if (split && cherry) {
      cats.push({ key: `${b}Solo`, n: c[`${b}Solo`], denoms: solo }, { key: `${b}Cherry`, n: c[`${b}Cherry`], denoms: cherry });
    } else {
      cats.push({ key: b, n: total, denoms: machine[b] });
    }
  }
  if (counting(c, 'grape') && machine.grape) cats.push({ key: 'grape', n: c.grape, denoms: machine.grape });
  if (counting(c, 'cherry') && machine.cherry) cats.push({ key: 'cherry', n: c.cherry, denoms: machine.cherry });
  return cats;
}

/**
 * 小役を「数えている」とみなすか。0回のまま（数えていない）や、ありえない少なさ（途中から数え始めた等）は使わない。
 * 目安：ブドウは 1/10 より多く、チェリーは 1/100 より多く出ているとき。
 */
function counting(c, key) {
  if (!c.countSmall || !(c[key] > 0) || !(c.games > 0)) return false;
  return c.games / c[key] <= (key === 'grape' ? 10 : 100);
}

export const totalRb = (c) => (c.splitRb ? (c.rbSolo || 0) + (c.rbCherry || 0) : c.rb || 0);
export const totalBb = (c) => (c.splitBb ? (c.bbSolo || 0) + (c.bbCherry || 0) : c.bb || 0);

/**
 * チェリー重複ボーナスの確率。スペックにあればそれを使い、なければ「全体 − 単独」で求める
 * （チェリーが止まったボーナスを「チェリー重複」と数える、ふつうの数え方に合わせる）。
 */
export function cherryDenoms(total, solo, explicit) {
  if (explicit) return explicit;
  const d = total.map((t, i) => 1 / (1 / t - 1 / solo[i]));
  return d.every((x) => Number.isFinite(x) && x > 1) ? d : null;
}

/** 設定1〜6それぞれの可能性（合計 1）。counts: { games, bb, rb, rbSolo, rbCherry, grape, cherry, splitRb, countSmall } */
export function settingPosterior(machine, counts, prior = PRIORS.flat.p) {
  const cats = usedCategories(machine, counts);
  const hits = cats.reduce((a, x) => a + (x.n || 0), 0);
  const none = Math.max(0, (counts.games || 0) - hits);
  const logs = prior.map((pr, i) => {
    let l = Math.log(pr);
    let sumP = 0;
    for (const x of cats) {
      const p = 1 / x.denoms[i];
      sumP += p;
      l += (x.n || 0) * Math.log(p);
    }
    return l + none * Math.log(Math.max(1e-9, 1 - sumP));
  });
  const max = Math.max(...logs);
  const w = logs.map((l) => Math.exp(l - max));
  const sum = w.reduce((a, b) => a + b, 0);
  return w.map((x) => x / sum);
}

export const expectedRate = (machine, post) => post.reduce((a, p, i) => a + p * machine.rate[i], 0);
export const highChance = (post) => post[3] + post[4] + post[5];

/**
 * ボーナスを引けないまま回した場合に、期待値がマイナス（機械割 100% 未満）になるゲーム数。
 * 小役は今の出現率のまま続くものとして回数を増やす。
 */
export function breakEvenGames(machine, counts, prior, limit = 6000) {
  const g0 = counts.games;
  for (let g = g0; g <= g0 + limit; g += STEP) {
    const k = g0 > 0 ? g / g0 : 1;
    const c = { ...counts, games: g, grape: Math.round((counts.grape || 0) * k), cherry: Math.round((counts.cherry || 0) * k) };
    if (expectedRate(machine, settingPosterior(machine, c, prior)) < 100) return g;
  }
  return null;
}

const toMin = (s) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));

/**
 * @param {object} p
 * @param {object|null} p.machine   機種スペック（null なら設定推測なし）
 * @param {object} p.counts         カウント（games, bb, rb, ...）
 * @param {string} p.priorId        店の状況
 * @param {number} p.todayMedals    今日の収支（枚、マイナス = 負け）
 * @param {number} p.lossLimit      1日の負けの上限（枚、0 = 決めていない）
 * @param {number|null} p.stock     今の店舗の貯メダル
 * @param {string} p.now, p.closingTime  'HH:MM'
 * @param {number} p.yenPerMedal
 */
export function judge({ machine, counts, priorId = 'normal', todayMedals = 0, lossLimit = 0, stock = null, now, closingTime = '22:45', yenPerMedal = 20 }) {
  const games = counts.games || 0;
  const bonus = totalBb(counts) + totalRb(counts);
  const todayLoss = Math.max(0, -todayMedals);
  const limitLeft = lossLimit > 0 ? Math.max(0, lossLimit - todayLoss) : null;
  const caps = [limitLeft, stock == null ? null : Math.max(0, stock)].filter((v) => v != null);
  const maxAdd = caps.length ? Math.min(...caps) : null;
  const remainingMinutes = Math.max(0, toMin(closingTime) - toMin(now));
  const remainingGames = Math.round((remainingMinutes * GAMES_PER_HOUR) / 60);
  const r = { games, todayLoss, maxAdd, remainingGames, reasons: [], combined: bonus > 0 ? games / bonus : null };
  const valid = usedCategoriesTotal(machine, counts) <= games;

  if (machine && valid) {
    const prior = (PRIORS[priorId] ?? PRIORS.normal).p;
    r.posterior = settingPosterior(machine, counts, prior);
    r.rate = expectedRate(machine, r.posterior);
    r.high = highChance(r.posterior);
    r.evPerGame = (r.rate / 100 - 1) * 3 * yenPerMedal;
    r.evRest = r.evPerGame * remainingGames;
    r.breakEven = breakEvenGames(machine, counts, prior);
  }

  if (lossLimit > 0 && todayLoss >= lossLimit) {
    r.verdict = 'stop';
    r.reasons.push(`今日の負けが、決めておいた上限（${lossLimit.toLocaleString('ja-JP')}枚）に達しています。`);
  } else if (remainingGames <= 0) {
    r.verdict = 'stop';
    r.reasons.push('閉店時刻になりました。');
  } else if (!r.posterior) {
    r.verdict = 'wait';
    r.reasons.push(machine ? '数えた回数がゲーム数より多くなっています。G数を確認してください。' : 'この機種はスペックが登録されていないため、設定の推測はできません。負けの上限を目安にしてください。');
  } else if (games < MIN_GAMES) {
    r.verdict = 'wait';
    r.reasons.push(`まだ${games.toLocaleString('ja-JP')}Gで、設定を判断するには少なすぎます（${MIN_GAMES}G以上が目安）。`);
  } else if (r.rate >= 101 && r.high >= 0.5) {
    r.verdict = 'go';
    r.reasons.push(`設定4以上の可能性が ${Math.round(r.high * 100)}% あり、期待値はプラスです。`);
  } else if (r.rate < 100) {
    r.verdict = 'stop';
    r.reasons.push(`期待値がマイナスです（推定の機械割 ${r.rate.toFixed(1)}%）。取り返そうとせず、ここでヤメるのが得です。`);
  } else {
    r.verdict = 'wait';
    r.reasons.push(`期待値はわずかにプラスですが、高設定とは言い切れません（設定4以上の可能性 ${Math.round(r.high * 100)}%）。`);
  }

  // 推奨ヤメライン：「ボーナスを引けないままここまで来たらヤメ」
  if (r.verdict === 'stop') {
    r.quitLine = games;
    r.quitBy = 'now';
  } else {
    const lines = [];
    if (r.breakEven != null) lines.push({ g: r.breakEven, by: 'ev' });
    if (maxAdd != null) lines.push({ g: games + Math.floor(maxAdd / BASE_COST / STEP) * STEP, by: 'limit' });
    lines.push({ g: games + Math.floor(remainingGames / STEP) * STEP, by: 'closing' });
    const first = lines.sort((a, b) => a.g - b.g)[0];
    r.quitLine = Math.max(games, first.g);
    r.quitBy = first.by;
  }
  r.medalsToQuit = Math.round((r.quitLine - games) * BASE_COST);
  return r;
}

function usedCategoriesTotal(machine, counts) {
  if (!machine) return 0;
  return usedCategories(machine, counts).reduce((a, x) => a + (x.n || 0), 0);
}
