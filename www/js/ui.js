// 画面の描画（HTML 文字列を返すだけ）。データの変更やイベント処理は app.js が担当する。

import { TX_TYPES, applySign, medalsToYen, perHour, playMinutes, roundYen, txProfit, typeLabel, yenPerMedal } from './calculation.js';
import { can, limit, planLabel } from './plan.js';
import { MACHINE_TYPES, guessMachineType } from './analysis.js';

// ---- 表示の整形 ----

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const num = (n) => Math.abs(Math.trunc(n)) === 0 ? '0' : Math.trunc(n).toLocaleString('ja-JP');
export const signed = (n) => (n > 0 ? '+' : n < 0 ? '-' : '±') + num(Math.abs(n));
export const yen = (n) => `約${num(n)}円`;
export const signedYen = (n) => `約${signed(n)}円`;
export const tone = (n) => (n > 0 ? 'pos' : n < 0 ? 'neg' : 'zero');
/** 150 → 2時間30分 */
export const duration = (minutes) => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h}時間${m ? `${m}分` : ''}` : `${m}分`;
};
const WEEK = ['日', '月', '火', '水', '木', '金', '土'];
const weekday = (date) => WEEK[new Date(`${date}T00:00:00`).getDay()];
export const dayLabel = (date) => `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}（${weekday(date)}）`;
export const longDay = (date) => `${Number(date.slice(5, 7))}月${Number(date.slice(8, 10))}日（${weekday(date)}）`;
export const monthLabel = (m) => `${m.slice(0, 4)}年${Number(m.slice(5, 7))}月`;
export const rateLabel = (s) => `${+s.lendingRate}枚貸し・${+s.exchangeRate}枚交換`;
const perMedal = (s) => `1枚 ≒ ${yenPerMedal(s.exchangeRate).toFixed(2)}円`;

const ICONS = {
  home: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v9.5h13V10"/>',
  record: '<circle cx="12" cy="12" r="8.5"/><path d="M12 8v8M8 12h8"/>',
  history: '<path d="M4 6h16M4 12h16M4 18h10"/>',
  stores: '<path d="M4 9.5 5.5 5h13L20 9.5"/><path d="M4 9.5h16v1a3 3 0 0 1-5.33 1.9A3 3 0 0 1 12 13.5a3 3 0 0 1-2.67-1.1A3 3 0 0 1 4 10.5z"/><path d="M5.5 13v6.5h13V13"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  star: '<path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/>',
};
export const icon = (name, cls = '') => `<svg class="icon ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;

/** 右上の「？」：押すとその画面の使い方ガイドが開く */
const helpButton = (cls = 'icon-btn help-btn') => `<button type="button" class="${cls}" data-action="guide" aria-label="使い方ガイド" data-testid="help">?</button>`;

const topbar = (title, { back = null, right = '' } = {}) => `
  <header class="topbar">
    ${back ? `<a class="icon-btn" href="${back}" aria-label="戻る">${icon('back')}</a>` : ''}
    <h1>${esc(title)}</h1>
    ${right}
    ${helpButton()}
  </header>`;

/** 使い方ガイド（画面の下から出るシート） */
export function guideSheet(guide) {
  return `
    <div class="sheet-backdrop" data-action="guide-close"></div>
    <section class="sheet" role="dialog" aria-modal="true" aria-labelledby="guide-title" data-testid="guide">
      <header class="sheet-head">
        <h2 id="guide-title">${esc(guide.title)}</h2>
        <button type="button" class="icon-btn" data-action="guide-close" aria-label="閉じる">✕</button>
      </header>
      <div class="sheet-body">
        ${guide.sections.map((sec) => `
          <section class="guide-sec">
            <h3>${esc(sec.h)}</h3>
            ${sec.p ? `<p>${esc(sec.p)}</p>` : ''}
            ${sec.steps ? `<ol>${sec.steps.map((x) => `<li>${esc(x)}</li>`).join('')}</ol>` : ''}
            ${sec.items ? `<ul>${sec.items.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
          </section>`).join('')}
      </div>
    </section>`;
}

/** 記録 1件のカード（ホームと履歴で共通） */
export function txCard(t, store, method) {
  const y = roundYen(medalsToYen(t.medals, store?.exchangeRate), method);
  const sub = [t.machine, t.machineNumber && `${t.machineNumber}番台`, t.detail?.games && `${num(t.detail.games)}G`].filter(Boolean).map(esc).join('・');
  const mins = t.detail?.minutes;
  const ev = t.detail?.expectedValue;
  const work = [
    mins && `${duration(mins)}・時給 <span class="${tone(perHour(txProfit(t, store?.exchangeRate), mins))}">${signedYen(roundYen(perHour(txProfit(t, store?.exchangeRate), mins), method))}</span>`,
    ev != null && `期待値 <span class="${tone(ev)}">${signed(ev)}円</span>`,
  ].filter(Boolean).join('　');
  return `
    <a class="tx-card" href="#/record/${esc(t.id)}" data-testid="tx-card">
      <div class="tx-main">
        <div class="tx-store">${esc(store?.name ?? '（削除した店舗）')}${t.type !== 'play' ? ` <span class="badge">${esc(typeLabel(t.type))}</span>` : ''}</div>
        ${sub ? `<div class="tx-sub">${sub}</div>` : ''}
        ${work ? `<div class="tx-sub" data-testid="tx-work">${work}</div>` : ''}
        ${t.memo ? `<div class="tx-memo">${esc(t.memo)}</div>` : ''}
      </div>
      <div class="tx-nums">
        ${t.medals ? `<div class="tx-medals ${tone(t.medals)}">${signed(t.medals)}枚</div><div class="tx-yen">${signedYen(y)}</div>` : ''}
        ${t.cash ? `<div class="tx-cash ${tone(t.cash)}">現金 ${signed(t.cash)}円</div>` : ''}
      </div>
    </a>`;
}

function groupByDate(transactions) {
  const groups = [];
  for (const t of transactions) {
    const g = groups[groups.length - 1];
    if (g && g.date === t.date) g.items.push(t);
    else groups.push({ date: t.date, items: [t] });
  }
  return groups;
}

function goalCard(goal, { compact = false } = {}) {
  if (!goal) {
    return compact ? '' : `<div class="card"><h2 class="card-title">目標</h2><p class="muted">目標の貯メダルを決めると、達成率と残りの枚数が表示されます。</p>${goalForm(0)}</div>`;
  }
  return `
    <div class="card goal" data-testid="goal">
      <div class="goal-head">
        <h2 class="card-title">目標 ${num(goal.target)}枚</h2>
        <strong class="goal-rate">${goal.rate.toFixed(1)}%</strong>
      </div>
      <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${goal.rate}"><span style="width:${(goal.ratio * 100).toFixed(1)}%"></span></div>
      <div class="goal-foot">${goal.achieved ? '<strong class="pos">達成しました！</strong>' : `残り <strong>${num(goal.remaining)}枚</strong>`}<span class="muted">現在 ${num(goal.current)}枚</span></div>
      ${compact ? '' : goalForm(goal.target)}
    </div>`;
}

const goalForm = (target) => `
  <form class="inline-form" id="goal-form">
    <label class="sr-only" for="goal-input">目標の貯メダル（枚）</label>
    <input id="goal-input" name="targetMedals" type="number" inputmode="numeric" min="0" step="1" placeholder="例：20000" value="${target || ''}">
    <button class="btn" type="submit">目標を設定</button>
  </form>`;

/** 稼働の成績（時給換算・期待値）。どちらも入力した記録がなければ表示しない */
export function workCard(w, method, title = '稼働の成績') {
  if (!w.timedCount && !w.evCount) return '';
  const row = (label, value, id) => `<div><dt>${label}</dt><dd${id ? ` data-testid="${id}"` : ''}>${value}</dd></div>`;
  const y = (v) => `<span class="${tone(v)}">${signedYen(roundYen(v, method))}</span>`;
  return `
    <div class="card" data-testid="work-stats">
      <h2 class="card-title">${title}</h2>
      <dl class="kv">
        ${w.timedCount ? row('稼働時間', `${duration(w.minutes)}（${w.timedCount}件）`) + row('時給換算', `${y(w.hourly)}/時`, 'work-hourly') : ''}
        ${w.evCount ? row('期待値の合計', `${y(w.ev)}（${w.evCount}件）`, 'work-ev') : ''}
        ${w.evHourly != null ? row('期待値の時給', `${y(w.evHourly)}/時`, 'work-ev-hourly') : ''}
        ${w.evCount ? row('期待値との差', `${y(w.diff)}${w.diff > 0 ? '（上振れ）' : w.diff < 0 ? '（下振れ）' : ''}`, 'work-diff') : ''}
      </dl>
      <p class="hint">時給換算は開始・終了時刻を入れた記録だけで計算します。期待値との差は「実際の収支 − 期待値」（プラス＝上振れ）です。</p>
    </div>`;
}

const emptyStores = () => `
  <div class="card empty">
    <h2 class="card-title">はじめに店舗を登録しましょう</h2>
    <p>貯メダルがあるお店と、交換枚数（1,000円分に必要な枚数）を登録すると、今いくらの資産なのかが分かります。</p>
    <a class="btn-primary" href="#/store/new">＋ 店舗を登録</a>
    <button type="button" class="btn" data-action="guide" data-key="stores" style="margin-top:10px">使い方を見る（初めての店舗・現金スタート）</button>
  </div>`;

// ---- ホーム ----

export function homeView(vm) {
  const { pf, month, method, today, goal, notices, data } = vm;
  if (!data.stores.length) {
    return `${topbar('メダルバンク')}<div class="content">${emptyStores()}</div>`;
  }
  const monthYen = roundYen(month.medalYen, method);
  const profit = roundYen(month.profit, method);
  const recent = data.transactions.slice(0, 3);
  return `
    ${topbar('メダルバンク', { right: `<span class="topbar-date">${longDay(today)}</span>` })}
    <div class="content">
      ${notices.map((n) => `<div class="notice ${n.tone}" data-testid="notice-${n.id}">${esc(n.text)}</div>`).join('')}
      <div class="hero">
        <div class="hero-label">総貯メダル</div>
        <div class="hero-num" data-testid="total-medals">${num(pf.totalMedals)}<small>枚</small></div>
        <div class="hero-yen">換金価値 <strong data-testid="total-yen">${yen(pf.totalYen)}</strong></div>
      </div>
      <div class="tiles">
        <div class="tile">
          <div class="tile-label">今月の増減</div>
          <div class="tile-val ${tone(month.medals)}" data-testid="month-medals">${signed(month.medals)}<small>枚</small></div>
          <div class="tile-sub">${signedYen(monthYen)}相当</div>
        </div>
        <div class="tile">
          <div class="tile-label">今月の収支</div>
          <div class="tile-val ${tone(profit)}" data-testid="month-profit">${signed(profit)}<small>円</small></div>
          <div class="tile-sub">うち現金 ${signed(month.cash)}円</div>
        </div>
      </div>
      <a class="btn-record" href="#/record" data-testid="record-button">${icon('record')}今日の記録</a>
      ${can('judge') ? `
        <div class="sub-row">
          <a class="btn-sub" href="#/counter" data-testid="counter-button">🎰 小役カウンター</a>
          <a class="btn-sub" href="#/judge" data-testid="judge-button">📊 続行・ヤメ判断</a>
        </div>` : ''}
      ${goalCard(goal, { compact: true })}
      <section class="section">
        <div class="section-head"><h2>店舗別の貯メダル資産</h2><a href="#/stores">店舗</a></div>
        <div class="card list">
          ${pf.rows.map((r) => `
            <a class="asset-row" href="#/store/${esc(r.store.id)}">
              <span class="asset-name">${r.store.favorite ? icon('star', 'fav') : ''}${esc(r.store.name)}</span>
              <span class="asset-nums"><strong>${num(r.medals)}枚</strong><span>${yen(r.yen)}</span></span>
            </a>`).join('')}
        </div>
      </section>
      <section class="section">
        <div class="section-head"><h2>最近の記録</h2>${recent.length ? '<a href="#/history">すべて見る</a>' : ''}</div>
        ${recent.length
          ? recent.map((t) => `<div class="tx-date">${dayLabel(t.date)}</div>${txCard(t, data.store(t.storeId), method)}`).join('')
          : '<p class="muted pad">まだ記録がありません。打ち終わったら「今日の記録」から記録しましょう。</p>'}
      </section>
    </div>`;
}

// ---- 記録 ----

export const QUICK = [500, 1000, 1500, 2000];

/** 入力中の値から、保存される枚数・現金を計算する */
export function draftValues(draft) {
  const medals = applySign(draft.type, draft.medals);
  const payout = Math.trunc(Number(draft.payout) || 0);
  const investment = Math.trunc(Number(draft.investment) || 0);
  return { medals, cash: payout - investment };
}

export function recordPreview(vm, draft) {
  const store = vm.data.store(draft.storeId);
  if (!store) return '<span class="muted">店舗を選んでください</span>';
  const { medals, cash } = draftValues(draft);
  const editing = draft.editId ? vm.data.transaction(draft.editId) : null;
  const before = vm.data.balance(store.id) - (editing && editing.storeId === store.id ? editing.medals : 0);
  const after = before + medals;
  const y = roundYen(medalsToYen(medals, store.exchangeRate), vm.method);
  return `
    <div class="preview-yen ${tone(medals)}" data-testid="preview-yen">${signedYen(y)}相当</div>
    <div class="preview-bal">${esc(store.name)}：${num(before)}枚 → <strong data-testid="preview-after">${num(after)}枚</strong>（${yen(roundYen(medalsToYen(after, store.exchangeRate), vm.method))}）</div>
    ${cash ? `<div class="preview-bal">現金 ${signed(cash)}円</div>` : ''}
    ${after < 0 ? '<div class="warn">残高がマイナスになります。枚数を確認してください。</div>' : ''}`;
}

/** 稼働時間・時給換算・期待値の時給（入力中に更新） */
export function workPreview(vm, draft) {
  const store = vm.data.store(draft.storeId);
  const mins = playMinutes(draft.startTime, draft.time);
  const ev = draft.expectedValue === '' || draft.expectedValue == null ? null : Math.trunc(Number(draft.expectedValue));
  if (!mins) return '<span class="muted">開始・終了時刻を入れると、時給換算が表示されます。</span>';
  const { medals, cash } = draftValues(draft);
  const hourly = perHour(txProfit({ medals, cash }, store?.exchangeRate), mins);
  return `
    <div>稼働 <strong data-testid="work-duration">${duration(mins)}</strong>・時給換算 <strong class="${tone(hourly)}" data-testid="work-preview-hourly">${signedYen(roundYen(hourly, vm.method))}</strong></div>
    ${Number.isFinite(ev) ? `<div class="muted">期待値の時給 ${signedYen(roundYen(perHour(ev, mins), vm.method))}</div>` : ''}`;
}

export function recordView(vm, draft) {
  const { data } = vm;
  if (!data.stores.length) return `${topbar('記録する')}<div class="content">${emptyStores()}</div>`;
  const editing = Boolean(draft.editId);
  const forcedSign = TX_TYPES.find((t) => t.id === draft.type)?.sign ?? 0;
  const v = (k) => esc(draft[k] ?? '');
  return `
    ${topbar(editing ? '記録を編集' : '記録する', { back: editing ? '#/history' : null })}
    <form class="content record" id="record-form" novalidate autocomplete="off">
      <fieldset class="field">
        <legend class="field-label">店舗</legend>
        <div class="chips" data-testid="store-chips">
          ${data.stores.map((s) => `
            <button type="button" class="chip${s.id === draft.storeId ? ' on' : ''}" aria-pressed="${s.id === draft.storeId}" data-action="pick-store" data-id="${esc(s.id)}">
              ${s.favorite ? icon('star', 'fav') : ''}${esc(s.name)}
            </button>`).join('')}
          <a class="chip ghost" href="#/store/new">＋ 店舗</a>
        </div>
      </fieldset>

      <div class="field">
        <div class="label-row">
          <label class="field-label" for="rec-medals">増減枚数</label>
          <button type="button" class="link-btn" data-action="quick-clear">クリア</button>
        </div>
        <div class="amount-row">
          <button type="button" class="sign-btn" data-action="toggle-sign" aria-label="プラスとマイナスを切り替え" ${forcedSign ? 'disabled' : ''}>±</button>
          <input id="rec-medals" class="amount-input" name="medals" type="number" step="1" placeholder="0" value="${v('medals')}">
          <span class="unit">枚</span>
        </div>
        <div class="preview" id="rec-preview" aria-live="polite">${recordPreview(vm, draft)}</div>
      </div>

      <div class="quick" data-testid="quick">
        ${QUICK.map((q) => `<button type="button" class="qbtn pos" data-action="quick" data-v="${q}">+${num(q)}</button>`).join('')}
        ${QUICK.map((q) => `<button type="button" class="qbtn neg" data-action="quick" data-v="${-q}">-${num(q)}</button>`).join('')}
      </div>

      <fieldset class="field">
        <legend class="field-label">理由</legend>
        <div class="chips small">
          ${TX_TYPES.map((t) => `<button type="button" class="chip${t.id === draft.type ? ' on' : ''}" aria-pressed="${t.id === draft.type}" data-action="pick-type" data-id="${t.id}">${t.label}</button>`).join('')}
        </div>
      </fieldset>

      ${draft.type === 'exchange' ? `
        <div class="field">
          <label class="field-label" for="rec-payout-main">受け取った金額（円）</label>
          <input id="rec-payout-main" name="payout" type="number" inputmode="numeric" min="0" step="1" placeholder="例：20000" value="${v('payout')}">
        </div>` : ''}

      <details class="more"${draft.detailOpen ? ' open' : ''}>
        <summary>詳しく入力（日付・時給・期待値・機種・現金など）</summary>
        <div class="field"><label class="field-label" for="rec-date">日付</label><input id="rec-date" name="date" type="date" value="${v('date')}" required></div>
        <div class="grid2">
          <div class="field"><label class="field-label" for="rec-start-time">開始時刻</label><input id="rec-start-time" name="startTime" type="time" value="${v('startTime')}"></div>
          <div class="field"><label class="field-label" for="rec-time">終了時刻</label><input id="rec-time" name="time" type="time" value="${v('time')}"></div>
        </div>
        <div class="field"><label class="field-label" for="rec-ev">期待値（円）</label>
          <input id="rec-ev" name="expectedValue" type="number" step="1" placeholder="例：3000（設定推測やツールで出した値）" value="${v('expectedValue')}"></div>
        <div class="work-preview" id="rec-work" aria-live="polite">${workPreview(vm, draft)}</div>
        <div class="grid2">
          <div class="field"><label class="field-label" for="rec-machine">機種名</label><input id="rec-machine" name="machine" type="text" enterkeyhint="next" placeholder="例：アイムジャグラー" value="${v('machine')}" list="machine-list"></div>
          <div class="field"><label class="field-label" for="rec-number">台番号</label><input id="rec-number" name="machineNumber" type="text" inputmode="numeric" placeholder="例：290" value="${v('machineNumber')}"></div>
        </div>
        <datalist id="machine-list">${vm.machines.map((m) => `<option value="${esc(m)}"></option>`).join('')}</datalist>
        <fieldset class="field">
          <legend class="field-label">機種タイプ</legend>
          <div class="chips small" id="rec-types">
            ${MACHINE_TYPES.map((m) => `<button type="button" class="chip${m.id === (draft.machineType || guessMachineType(draft.machine)) ? ' on' : ''}" aria-pressed="${m.id === (draft.machineType || guessMachineType(draft.machine))}" data-action="pick-mtype" data-id="${m.id}">${m.short}</button>`).join('')}
          </div>
        </fieldset>
        <div class="field"><label class="field-label" for="rec-games">ゲーム数</label>
          <div class="unit-input"><input id="rec-games" name="games" type="number" inputmode="numeric" min="0" step="1" placeholder="例：3200" value="${v('games')}"><span>G</span></div></div>
        <div class="grid2">
          <div class="field"><label class="field-label" for="rec-investment">現金投資（円）</label><input id="rec-investment" name="investment" type="number" inputmode="numeric" min="0" step="1000" placeholder="0" value="${v('investment')}"></div>
          ${draft.type === 'exchange' ? '' : `<div class="field"><label class="field-label" for="rec-payout">換金額（円）</label><input id="rec-payout" name="payout" type="number" inputmode="numeric" min="0" step="1" placeholder="0" value="${v('payout')}"></div>`}
        </div>
        <label class="switch">
          <input type="checkbox" name="playMode" ${draft.playMode ? 'checked' : ''}>
          <span>開始時・終了時の貯メダルから差枚を計算する</span>
        </label>
        ${draft.playMode ? `
          <div class="grid2">
            <div class="field"><label class="field-label" for="rec-start">開始時貯メダル</label><input id="rec-start" name="startMedals" type="number" inputmode="numeric" min="0" step="1" value="${v('startMedals')}"></div>
            <div class="field"><label class="field-label" for="rec-end">終了時貯メダル</label><input id="rec-end" name="endMedals" type="number" inputmode="numeric" min="0" step="1" value="${v('endMedals')}"></div>
          </div>
          <p class="hint">差枚（終了 − 開始）が増減枚数に入ります。</p>` : ''}
        <div class="field"><label class="field-label" for="rec-memo">メモ</label><textarea id="rec-memo" name="memo" rows="2" placeholder="設定推測・ボーナス回数など">${v('memo')}</textarea></div>
      </details>

      <button class="btn-primary btn-save" type="submit" data-testid="save">${editing ? '更新する' : '保存'}</button>
      ${editing ? '<button class="btn-danger" type="button" data-action="delete-tx">この記録を削除</button>' : ''}
    </form>`;
}

// ---- 履歴 ----

const historyTabs = (active) => `
  <nav class="segmented" aria-label="履歴の表示">
    <a href="#/history"${active === 'list' ? ' aria-current="page"' : ''}>一覧</a>
    <a href="#/history/charts"${active === 'charts' ? ' aria-current="page"' : ''}>グラフ</a>
    <a href="#/history/diagnosis"${active === 'diagnosis' ? ' aria-current="page"' : ''}>診断</a>
    <a href="#/history/forecast"${active === 'forecast' ? ' aria-current="page"' : ''}>予測</a>
  </nav>`;

const locked = (name) => `
  <div class="card locked"><h2 class="card-title">${name}は有料版の機能です</h2><p class="muted">今後のバージョンで提供予定です。</p></div>`;

export function historyView(vm, st) {
  const { data, method } = vm;
  const list = data.transactions.filter((t) => t.date.startsWith(st.month) && (st.store === 'all' || t.storeId === st.store));
  const sum = vm.summarize(list);
  const groups = groupByDate(list);
  return `
    ${topbar('履歴')}
    <div class="content">
      ${historyTabs('list')}
      <div class="month-nav">
        <button class="icon-btn" type="button" data-action="month" data-d="-1" aria-label="前の月">${icon('back')}</button>
        <strong data-testid="history-month">${monthLabel(st.month)}</strong>
        <button class="icon-btn flip" type="button" data-action="month" data-d="1" aria-label="次の月" ${st.month >= vm.thisMonth ? 'disabled' : ''}>${icon('back')}</button>
      </div>
      ${data.stores.length > 1 ? `
        <label class="sr-only" for="history-store">店舗で絞り込み</label>
        <select id="history-store" name="historyStore" class="select">
          <option value="all">すべての店舗</option>
          ${data.stores.map((s) => `<option value="${esc(s.id)}"${st.store === s.id ? ' selected' : ''}>${esc(s.name)}</option>`).join('')}
        </select>` : ''}
      <div class="tiles">
        <div class="tile"><div class="tile-label">増減</div><div class="tile-val ${tone(sum.medals)}" data-testid="history-medals">${signed(sum.medals)}<small>枚</small></div><div class="tile-sub">${signedYen(roundYen(sum.medalYen, method))}相当</div></div>
        <div class="tile"><div class="tile-label">収支</div><div class="tile-val ${tone(roundYen(sum.profit, method))}" data-testid="history-profit">${signed(roundYen(sum.profit, method))}<small>円</small></div><div class="tile-sub">現金 ${signed(sum.cash)}円・${sum.count}件</div></div>
      </div>
      ${workCard(vm.work(list), method)}
      ${groups.length ? groups.map((g) => {
        const day = vm.summarize(g.items);
        return `
          <div class="tx-date"><span>${dayLabel(g.date)}</span><span class="${tone(day.medals)}">${signed(day.medals)}枚</span></div>
          ${g.items.map((t) => txCard(t, data.store(t.storeId), method)).join('')}`;
      }).join('') : '<p class="muted pad">この月の記録はありません。</p>'}
    </div>`;
}

export const RANGES = [
  { id: '1m', label: '1ヶ月', days: 30 },
  { id: '3m', label: '3ヶ月', days: 91 },
  { id: '1y', label: '1年', days: 365 },
  { id: 'all', label: '全期間', days: null },
];

export function chartsView(vm, st) {
  if (!can('charts')) return `${topbar('履歴')}<div class="content">${historyTabs('charts')}${locked('グラフ')}</div>`;
  return `
    ${topbar('履歴')}
    <div class="content">
      ${historyTabs('charts')}
      <div class="chips small center">
        ${RANGES.map((r) => `<button type="button" class="chip${st.range === r.id ? ' on' : ''}" aria-pressed="${st.range === r.id}" data-action="range" data-id="${r.id}">${r.label}</button>`).join('')}
      </div>
      <div class="card"><h2 class="card-title">貯メダル推移</h2><div class="chart" data-chart="medals"></div></div>
      <div class="card"><h2 class="card-title">円換算資産の推移</h2><div class="chart" data-chart="yen"></div></div>
      <div class="card"><h2 class="card-title">月別収支（直近12ヶ月）</h2><div class="chart" data-chart="monthly"></div>
        <p class="hint">収支 = 貯メダルの増減（円換算）+ 現金の出入り。グラフをタップすると金額が表示されます。</p></div>
    </div>`;
}

export function forecastView(vm) {
  const { fc, goal } = vm;
  if (!can('forecast')) return `${topbar('履歴')}<div class="content">${historyTabs('forecast')}${goalCard(goal)}${locked('将来予測')}</div>`;
  const eta = fc && goal && !goal.achieved ? fc.goalMonths(goal.target) : null;
  return `
    ${topbar('履歴')}
    <div class="content">
      ${historyTabs('forecast')}
      ${goalCard(goal)}
      ${goal && !goal.achieved && fc ? `<p class="hint pad">${eta ? `今のペースだと、目標達成まで <strong>約${eta}ヶ月</strong>です。` : '今のペースでは目標に近づいていません。'}</p>` : ''}
      <div class="card" data-testid="forecast">
        <h2 class="card-title">将来予測</h2>
        ${fc ? `
          <p class="fc-basis">現在 <strong>${num(fc.current)}枚</strong>・月平均 <strong class="${tone(fc.monthlyAvg)}">${signed(fc.monthlyAvg)}枚</strong>
            <span class="muted">（直近${fc.basisMonths}ヶ月の平均）</span></p>
          <table class="table">
            <thead><tr><th>時期</th><th>貯メダル</th><th>円換算</th></tr></thead>
            <tbody>${fc.points.map((p) => `<tr><th>${p.months}ヶ月後<small>${monthLabel(p.month)}</small></th><td data-testid="fc-${p.months}">${num(p.medals)}枚</td><td>${yen(p.yen)}</td></tr>`).join('')}</tbody>
          </table>
          ${fc.depleteMonths ? `<p class="warn">このペースだと、約${fc.depleteMonths}ヶ月で貯メダルがなくなる計算です。</p>` : ''}
          ${fc.lowData ? '<p class="hint">記録期間が短いため、予測は大きくぶれることがあります。</p>' : ''}`
          : '<p class="muted">記録がたまると、今のペースで増減した場合の枚数を表示します。</p>'}
        <p class="disclaimer">※ 予測値であり、実際の遊技結果を保証するものではありません。</p>
      </div>
    </div>`;
}

// ---- 立ち回り診断 ----

export const DIAG_RANGES = [
  { id: 'month', label: '今月' },
  { id: '3m', label: '3ヶ月' },
  { id: 'all', label: '全期間' },
];

const pct = (r) => `${(Math.round(r * 10) / 10).toFixed(1)}%`;
const hourCell = (h, method) => (h == null ? '<span class="muted">−</span>' : `<span class="${tone(h)}">${signed(roundYen(h, method))}</span>`);

/** 集計の表（機種タイプ別・機種別・曜日別など） */
function groupTable(title, rows, method, { id, hourly = true, note = '' } = {}) {
  if (!rows.length) return '';
  return `
    <div class="card" data-testid="${id}">
      <h2 class="card-title">${title}</h2>
      <div class="table-wrap"><table class="table compact">
        <thead><tr><th></th><th>回数</th><th>勝率</th><th>収支</th>${hourly ? '<th>時給</th>' : ''}</tr></thead>
        <tbody>${rows.map((r) => `
          <tr><th>${esc(r.label)}</th><td>${r.count}</td><td>${pct(r.winRate)}</td>
            <td class="${tone(r.profit)}">${signed(roundYen(r.profit, method))}</td>${hourly ? `<td>${hourCell(r.hourly, method)}</td>` : ''}</tr>`).join('')}
        </tbody>
      </table></div>
      ${note ? `<p class="hint">${note}</p>` : ''}
    </div>`;
}

export function diagnosisView(vm, st) {
  const { method } = vm;
  const head = `${topbar('履歴')}<div class="content">${historyTabs('diagnosis')}`;
  if (!can('analysis')) return `${head}${locked('立ち回り診断')}</div>`;
  const d = vm.diagnosis(st.range);
  const o = d.overall;
  const chips = `
    <div class="chips small center">
      ${DIAG_RANGES.map((r) => `<button type="button" class="chip${st.range === r.id ? ' on' : ''}" aria-pressed="${st.range === r.id}" data-action="diag-range" data-id="${r.id}">${r.label}</button>`).join('')}
    </div>`;
  if (!o.count) {
    return `${head}${chips}<div class="card"><h2 class="card-title">立ち回り診断</h2>
      <p class="muted">理由が「遊技結果」の記録から、勝率・平均収支・時給や、得意・苦手な機種や曜日を分析します。この期間の記録はまだありません。</p></div></div>`;
  }
  return `${head}${chips}
      <div class="card" data-testid="diag-summary">
        <h2 class="card-title">${DIAG_RANGES.find((r) => r.id === st.range).label}の診断（${o.count}回）</h2>
        <div class="stat-grid">
          <div><span>勝率</span><strong data-testid="diag-winrate">${pct(o.winRate)}</strong><small>${o.wins}勝${o.losses}敗</small></div>
          <div><span>平均収支</span><strong class="${tone(o.avgProfit)}" data-testid="diag-avg">${signed(roundYen(o.avgProfit, method))}円</strong><small>1回あたり</small></div>
          <div><span>平均時給</span><strong data-testid="diag-hourly">${o.hourly == null ? '−' : `<span class="${tone(o.hourly)}">${signed(roundYen(o.hourly, method))}円</span>`}</strong><small>${o.minutes ? `稼働 ${duration(o.minutes)}` : '時刻を入れると表示'}</small></div>
          <div><span>収支合計</span><strong class="${tone(o.profit)}">${signed(roundYen(o.profit, method))}円</strong><small>${o.games ? `${num(o.games)}G` : ''}</small></div>
        </div>
      </div>
      <div class="card" data-testid="diag-insights">
        <h2 class="card-title">あなたの傾向</h2>
        ${d.insights.length
          ? `<ul class="insights">${d.insights.map((i) => `<li class="${i.tone}"><strong>${esc(i.text)}</strong>${i.detail ? `<span>${esc(i.detail)}</span>` : ''}</li>`).join('')}</ul>`
          : '<p class="muted">記録が増えると、得意・苦手な傾向を表示します（同じ条件で3回以上が目安）。</p>'}
      </div>
      ${groupTable('機種タイプ別', d.byType, method, { id: 'diag-type', note: '機種タイプは記録画面で選べます（ジャグラー等は機種名から自動で判定）。' })}
      ${groupTable('機種別', d.byMachine.slice(0, 10), method, { id: 'diag-machine' })}
      ${groupTable('曜日別', d.byWeekday, method, { id: 'diag-weekday', hourly: false })}
      ${groupTable('打ち始めの時間帯別', d.byBand, method, { id: 'diag-band', note: '開始時刻を入れた記録だけで集計します。' })}
      ${vm.data.stores.length > 1 ? groupTable('店舗別', d.byStore, method, { id: 'diag-store' }) : ''}
      ${workCard(vm.work(d.sessions), method, '時給・期待値')}
      <p class="disclaimer">※ 収支は貯メダルの円換算 + 現金です。過去の記録の集計で、今後の結果を保証するものではありません。</p>
    </div>`;
}

// ---- 実戦カウンター（小役カウンター＋設定推測）・続行/ヤメ判断 ----

const VERDICTS = {
  go: { icon: '🟢', label: '続行推奨', cls: 'go' },
  wait: { icon: '🟡', label: '様子見', cls: 'wait' },
  stop: { icon: '🔴', label: 'ヤメ推奨', cls: 'stop' },
};

/** カウンターの項目（色つきの大きなボタン）。BIG・REG は「単独・チェリーに分ける」とき 2つに分かれる */
export function counterItems(js) {
  const items = js.splitBb
    ? [{ key: 'bbSolo', label: '単独BIG', color: 'big' }, { key: 'bbCherry', label: 'チェリーBIG', color: 'cbig' }]
    : [{ key: 'bb', label: 'BIG', color: 'big' }];
  if (js.splitRb) items.push({ key: 'rbSolo', label: '単独REG', color: 'reg' }, { key: 'rbCherry', label: 'チェリーREG', color: 'creg' });
  else items.push({ key: 'rb', label: 'REG', color: 'reg' });
  if (js.countSmall) items.push({ key: 'grape', label: 'ブドウ', color: 'grape' }, { key: 'cherry', label: 'チェリー', color: 'cherry' });
  return items;
}

/** 横向きに固定中か（全画面で横に固定したとき） */
const landscapeLocked = () => typeof document !== 'undefined' && Boolean(document.fullscreenElement);

/** 出現率（1/88.2、ブドウなど 1/10 未満は 1/6.02） */
export const prob = (games, n) => (n > 0 && games > 0 ? `1/${(games / n).toFixed(games / n >= 10 ? 1 : 2)}` : '−');

/** 上に固定する状態表示（合算・REG・設定4以上の可能性）。タップのたびにここだけ書き換える */
export function counterStats(js, { games = true } = {}) {
  const g = Number(js.games) || 0;
  const rb = js.splitRb ? (js.rbSolo || 0) + (js.rbCherry || 0) : js.rb || 0;
  const bb = js.splitBb ? (js.bbSolo || 0) + (js.bbCherry || 0) : js.bb || 0;
  const high = js.result?.high;
  return `
    ${games ? `<div><span>G数</span><strong>${g ? num(g) : '−'}</strong></div>` : ''}
    <div><span>合算</span><strong data-testid="jd-combined">${prob(g, bb + rb)}</strong></div>
    <div><span>REG</span><strong>${prob(g, rb)}</strong></div>
    <div class="hi"><span>設定4以上</span><strong data-testid="jd-high-mini">${high == null ? '−' : `${Math.round(high * 100)}%`}</strong></div>`;
}

/** 色つきの大きなボタン（実戦カウンター・全画面の小役カウンターで共通） */
function counterButtons(js, extraClass = '') {
  const items = counterItems(js);
  return `
        <div class="kachi-grid${items.length % 2 ? ' odd' : ''} ${extraClass}" style="--cols:${items.length}">
          ${items.map((it) => `
            <button type="button" class="kachi-btn k-${it.color}" data-action="count" data-key="${it.key}" aria-label="${it.label}を${js.minusMode ? '1回減らす' : '数える'}">
              <span class="k-label">${it.label}</span>
              <strong class="k-num" data-testid="count-${it.key}">${js[it.key] || 0}</strong>
              <span class="k-prob" data-prob="${it.key}">${prob(Number(js.games) || 0, js[it.key] || 0)}</span>
            </button>`).join('')}
        </div>`;
}

function counterTools(js) {
  return `
        <div class="kachi-tools">
          <button type="button" class="k-tool${js.minusMode ? ' on' : ''}" data-action="minus-mode" aria-pressed="${Boolean(js.minusMode)}">−モード</button>
          <button type="button" class="k-tool" data-action="count-undo" ${js.history?.length ? '' : 'disabled'}>1つ戻す</button>
          <button type="button" class="k-tool" data-action="count-reset">リセット</button>
          <button type="button" class="k-tool" data-action="landscape" data-testid="landscape">${landscapeLocked() ? '縦に戻す' : '横向き'}</button>
        </div>`;
}

/**
 * 全画面の小役カウンター（#/counter）。スクロールせず、数えるためのものだけを画面いっぱいに出す。
 * 判定・条件の設定は「判定」（#/judge）で行う。数えた回数は同じものを使う。
 */
export function counterScreen(vm, js, { machines }) {
  const machine = machines.find((m) => m.id === js.machineId);
  return `
    <form class="cscreen${js.minusMode ? ' minus' : ''}" id="judge-form" novalidate autocomplete="off" data-testid="counter-screen">
      <div class="cs-head">
        <a class="cs-btn" href="#/home" aria-label="閉じる">✕</a>
        <select name="machineId" class="cs-machine" aria-label="機種">
          ${machines.map((m) => `<option value="${esc(m.id)}"${js.machineId === m.id ? ' selected' : ''}>${esc(m.name)}</option>`).join('')}
          <option value=""${!machine ? ' selected' : ''}>その他の機種</option>
        </select>
        ${helpButton('cs-btn')}
        <a class="cs-btn wide" href="#/judge" data-testid="to-judge">判定</a>
      </div>
      <div class="cs-bar">
        <label class="cs-games"><span>G数</span><input name="games" type="number" inputmode="numeric" min="0" step="1" placeholder="0" value="${esc(js.games ?? '')}" aria-label="現在G数"></label>
        <div class="kachi-status cs-status" id="jd-stats" data-nogames="1" aria-live="polite">${counterStats(js, { games: false })}</div>
      </div>
      ${counterButtons(js, 'cs-grid')}
      ${counterTools(js)}
    </form>`;
}

export function judgeView(vm, js, { machines, priors }) {
  const { data } = vm;
  const s = data.settings;
  const v = (k) => esc(js[k] ?? '');
  const store = data.store(js.storeId);
  const machine = machines.find((m) => m.id === js.machineId);
  const missing = machine ? [
    ...(js.splitBb && !machine.bbSolo ? ['単独BIG・チェリーBIG'] : []),
    ...(js.splitRb && !machine.rbSolo ? ['単独REG・チェリーREG'] : []),
    ...(js.countSmall && !machine.grape ? ['ブドウ'] : []),
    ...(js.countSmall && !machine.cherry ? ['チェリー'] : []),
  ] : [];
  return `
    ${topbar('続行・ヤメ判断', { back: '#/home' })}
    <form class="content" id="judge-form" novalidate autocomplete="off">
      <div class="field"><label class="field-label" for="jd-machine">機種</label>
        <div class="inline-form flush">
          <select id="jd-machine" name="machineId" class="select">
            ${machines.map((m) => `<option value="${esc(m.id)}"${js.machineId === m.id ? ' selected' : ''}>${esc(m.name)}${m.edited ? '（編集済み）' : ''}</option>`).join('')}
            <option value=""${!machine ? ' selected' : ''}>その他の機種（設定推測なし）</option>
          </select>
          <a class="btn" href="#/spec/${machine ? esc(machine.id) : 'new'}">${machine ? 'スペック' : '機種を追加'}</a>
        </div></div>

      <div class="field"><label class="field-label" for="jd-games">現在G数（データカウンターの総G数）</label>
        <div class="unit-input"><input id="jd-games" name="games" type="number" inputmode="numeric" min="0" step="1" placeholder="0" value="${v('games')}"><span>G</span></div></div>

      <a class="btn-sub" href="#/counter" data-testid="open-counter">⛶ 全画面の小役カウンターで数える</a>
      <div class="kachi${js.minusMode ? ' minus' : ''}" data-testid="counter">
        <div class="kachi-status" id="jd-stats" aria-live="polite">${counterStats(js)}</div>
        ${counterButtons(js)}
        ${counterTools(js)}
        ${js.minusMode ? '<p class="k-minus-note">−モード中：タップすると1回減ります</p>' : ''}
      </div>
      <details class="more counter-opts"${js.optsOpen ? ' open' : ''}>
        <summary>数える項目（BIG・REGの内訳・ブドウ・チェリー）</summary>
        <label class="switch"><input type="checkbox" name="splitBb" ${js.splitBb ? 'checked' : ''}><span>BIG を単独・チェリー重複に分けて数える</span></label>
        <label class="switch"><input type="checkbox" name="splitRb" ${js.splitRb ? 'checked' : ''}><span>REG を単独・チェリー重複に分けて数える</span></label>
        <label class="switch"><input type="checkbox" name="countSmall" ${js.countSmall ? 'checked' : ''}><span>ブドウ・チェリーも数える</span></label>
        <p class="hint">ブドウは、数えた回数が 1/10 より多いときだけ設定推測に使います（数え忘れの 0回で推測が狂わないように）。</p>
      </details>
      ${machine && missing.length ? `<p class="hint">この機種は ${missing.join('・')} の確率がないため、推測には使っていません（数えた回数は記録できます）。「スペック」から入力できます。</p>` : ''}

      <div id="judge-result" aria-live="polite">${judgeResult(vm, js)}</div>

      <h2 class="section-title">続行・ヤメ判断の条件</h2>
      ${data.stores.length ? `
        <div class="field"><label class="field-label" for="jd-store">店舗</label>
          <select id="jd-store" name="storeId" class="select">
            ${data.stores.map((x) => `<option value="${esc(x.id)}"${x.id === js.storeId ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}
          </select>
          ${store ? `<p class="hint">貯メダル <strong data-testid="jd-stock">${num(data.balance(store.id))}枚</strong>（${rateLabel(store)}）</p>` : ''}</div>` : ''}
      <div class="field"><label class="field-label" for="jd-today">今日の収支（枚・負けはマイナス）</label>
        <input id="jd-today" name="today" type="number" step="1" placeholder="例：-1200" value="${v('today')}"></div>
      <div class="grid2">
        <div class="field"><label class="field-label" for="jd-limit">1日の負けの上限（枚）</label><input id="jd-limit" name="dailyLossLimit" type="number" inputmode="numeric" min="0" step="100" placeholder="例：1500" value="${s.dailyLossLimit || ''}"></div>
        <div class="field"><label class="field-label" for="jd-closing">閉店時刻</label><input id="jd-closing" name="closingTime" type="time" value="${esc(s.closingTime)}"></div>
      </div>
      <div class="field"><label class="field-label" for="jd-prior">店の状況（設定の入り方の見込み）</label>
        <select id="jd-prior" name="judgePrior" class="select">
          ${Object.entries(priors).map(([id, p]) => `<option value="${id}"${s.judgePrior === id ? ' selected' : ''}>${esc(p.label)}</option>`).join('')}
        </select></div>
      <p class="hint">負けの上限は、打つ前の冷静なときに決めておくのがおすすめです。「負けを取り返したい」ではなく数字で判断しましょう。</p>
    </form>`;
}

export function judgeResult(vm, js) {
  const r = js.result;
  if (!r) return '<div class="card"><p class="muted">G数を入れて、BIG・REG をタップして数えると、設定の可能性と続行・ヤメの判定が出ます。</p></div>';
  const vd = VERDICTS[r.verdict];
  const quit = r.quitBy === 'now'
    ? '<strong>今すぐヤメ</strong>'
    : `<strong>${num(r.quitLine)}G</strong><small>（あと${num(r.quitLine - r.games)}G・約${num(r.medalsToQuit)}枚）</small>`;
  const quitNote = { ev: 'ボーナスを引けないままここまで来たら、期待値がマイナスになります。', limit: '負けの上限に先に届きます。', closing: '閉店まで打てます。', now: '' }[r.quitBy];
  return `
    ${r.posterior ? `
      <div class="card">
        <div class="high-chance">設定4以上の可能性 <strong data-testid="high-chance">${Math.round(r.high * 100)}%</strong></div>
        <div class="bars" data-testid="posterior">
          ${r.posterior.map((p, i) => `<div class="bar-row${i >= 3 ? ' high' : ''}"><span>設定${i + 1}</span><div class="bar"><span style="width:${(p * 100).toFixed(1)}%"></span></div><strong>${Math.round(p * 100)}%</strong></div>`).join('')}
        </div>
      </div>` : ''}
    <div class="card verdict ${vd.cls}" data-testid="verdict">
      <div class="verdict-head"><span class="verdict-icon" aria-hidden="true">${vd.icon}</span><strong data-testid="verdict-label">${vd.label}</strong></div>
      ${r.reasons.map((x) => `<p>${esc(x)}</p>`).join('')}
      <dl class="kv">
        <div><dt>推奨ヤメライン</dt><dd data-testid="quit-line">${quit}</dd></div>
        ${quitNote ? `<p class="hint kv-note">${quitNote}</p>` : ''}
        <div><dt>最大追加投資</dt><dd data-testid="max-add">${r.maxAdd == null ? '<span class="muted">上限未設定</span>' : `${num(r.maxAdd)}枚`}</dd></div>
        ${r.evRest != null ? `<div><dt>現在期待値</dt><dd data-testid="ev-rest"><span class="${tone(r.evRest)}">${signedYen(roundYen(r.evRest, vm.method))}</span><small>（閉店まで約${num(r.remainingGames)}G）</small></dd></div>` : ''}
        ${r.evPerGame != null ? `<div><dt>推定機械割</dt><dd>${r.rate.toFixed(1)}%（1G ${signed(Math.round(r.evPerGame * 10) / 10)}円）</dd></div>` : ''}
      </dl>
    </div>
    <p class="disclaimer">※ スペックと数えた回数からの推定で、結果を保証するものではありません。1時間に約750G・ボーナスなしで1Gあたり約1.5枚として計算しています。</p>
    <button class="btn" type="button" data-action="judge-record">この台の結果を記録する</button>`;
}

// ---- 機種スペックの編集 ----

export function specView(vm, machine, fields) {
  const isNew = !machine;
  const val = (k) => (machine?.[k] ? machine[k].join(', ') : '');
  return `
    ${topbar(isNew ? '機種を追加' : 'スペックを編集', { back: '#/judge' })}
    <form class="content" id="spec-form" novalidate autocomplete="off">
      <p class="hint pad">設定1〜6の値を、カンマ区切りで6つ入力します。確率は分母（1/273.1 なら 273.1）。解析サイトなどの値を使ってください。空欄の項目は推測に使いません。</p>
      ${machine?.builtin ? `<p class="hint pad" data-testid="spec-source">組み込みの値：BIG・REG・機械割は解析サイトの掲載値${machine.note ? `、${esc(machine.note)}` : ''}です。チェリーは数え方がサイトによって違うため入れていません。</p>` : ''}
      <div class="field"><label class="field-label" for="sp-name">機種名</label>
        <input id="sp-name" name="name" type="text" maxlength="40" value="${esc(machine?.name ?? '')}" ${machine?.builtin ? 'readonly' : ''} placeholder="例：ハッピージャグラー"></div>
      ${fields.map((f) => `
        <div class="field"><label class="field-label" for="sp-${f.key}">${f.label}${f.required ? '' : '（任意）'}</label>
          <input id="sp-${f.key}" name="${f.key}" type="text" inputmode="decimal" placeholder="${f.key === 'rate' ? '97.0, 98.0, 99.5, 101.1, 103.3, 105.5' : '例：273.1, 269.7, 269.7, 259.0, 259.0, 255.0'}" value="${esc(val(f.key))}"></div>`).join('')}
      <button class="btn-primary" type="submit" data-testid="save-spec">保存</button>
      ${machine?.edited ? '<button class="btn-danger" type="button" data-action="spec-reset">組み込みの値に戻す</button>' : ''}
      ${machine && !machine.builtin ? '<button class="btn-danger" type="button" data-action="spec-delete">この機種を削除</button>' : ''}
    </form>`;
}

// ---- 店舗 ----

export function storesView(vm) {
  const { pf, data } = vm;
  const max = limit('maxStores');
  return `
    ${topbar('店舗')}
    <div class="content">
      ${data.stores.length ? `
        <div class="hero small">
          <div class="hero-label">貯メダル資産の合計（${data.stores.length}店舗）</div>
          <div class="hero-num">${num(pf.totalMedals)}<small>枚</small></div>
          <div class="hero-yen"><strong>${yen(pf.totalYen)}</strong></div>
        </div>` : ''}
      ${pf.rows.map((r) => `
        <a class="card store-card" href="#/store/${esc(r.store.id)}" data-testid="store-card">
          <div class="store-head">
            <h2 class="store-name">${r.store.favorite ? icon('star', 'fav') : ''}${esc(r.store.name)}</h2>
            <span class="muted">${rateLabel(r.store)}</span>
          </div>
          <div class="store-nums">
            <span class="store-medals">${num(r.medals)}<small>枚</small></span>
            <span class="store-yen">${yen(r.yen)}相当</span>
          </div>
          ${pf.totalYen > 0 ? `<div class="share"><span style="width:${Math.max(0, (r.yen / pf.totalYen) * 100).toFixed(1)}%"></span></div>` : ''}
          ${r.store.memo ? `<p class="store-memo">${esc(r.store.memo)}</p>` : ''}
        </a>`).join('')}
      ${data.stores.length >= max
        ? `<p class="hint pad">無料版で登録できる店舗は${max}店舗までです。</p>`
        : `<a class="btn-primary" href="#/store/new" data-testid="add-store">＋ 店舗を追加</a>`}
    </div>`;
}

export function storePreview(medals, exchangeRate, method) {
  const m = Math.trunc(Number(medals) || 0);
  const r = Number(exchangeRate);
  if (!(r > 0)) return '';
  return `${num(m)}枚 → <strong data-testid="store-preview">${yen(roundYen(medalsToYen(m, r), method))}相当</strong><span class="muted">（1枚 ≒ ${yenPerMedal(r).toFixed(2)}円）</span>`;
}

const EXCHANGE_PRESETS = [[50, '等価'], [52, ''], [55, ''], [56, ''], [57, '']];

export function storeFormView(vm, store) {
  const editing = Boolean(store);
  const s = store ?? { name: '', lendingRate: 50, exchangeRate: 50, favorite: vm.data.stores.length === 0, memo: '' };
  const medals = editing ? vm.data.balance(store.id) : '';
  return `
    ${topbar(editing ? '店舗を編集' : '店舗を登録', { back: '#/stores' })}
    <form class="content" id="store-form" novalidate autocomplete="off">
      <div class="field"><label class="field-label" for="st-name">店舗名</label>
        <input id="st-name" name="name" type="text" maxlength="40" required placeholder="例：〇〇ホール駅前店" value="${esc(s.name)}"></div>
      <div class="grid2">
        <div class="field"><label class="field-label" for="st-lending">貸出枚数</label>
          <div class="unit-input"><input id="st-lending" name="lendingRate" type="number" inputmode="decimal" min="1" step="any" value="${esc(s.lendingRate)}"><span>枚/千円</span></div></div>
        <div class="field"><label class="field-label" for="st-exchange">交換枚数</label>
          <div class="unit-input"><input id="st-exchange" name="exchangeRate" type="number" inputmode="decimal" min="1" step="any" value="${esc(s.exchangeRate)}"><span>枚/千円</span></div></div>
      </div>
      <div class="chips small">
        ${EXCHANGE_PRESETS.map(([r, l]) => `<button type="button" class="chip" data-action="exchange-preset" data-v="${r}">${r}枚交換${l ? `（${l}）` : ''}</button>`).join('')}
      </div>
      <p class="hint">貸出枚数＝1,000円で借りられる枚数、交換枚数＝1,000円分に交換するのに必要な枚数です。</p>
      <div class="field"><label class="field-label" for="st-medals">${editing ? '現在の貯メダル' : '今の貯メダル（初期枚数）'}</label>
        <div class="unit-input"><input id="st-medals" name="medals" type="number" inputmode="numeric" min="0" step="1" placeholder="0" value="${medals}"><span>枚</span></div>
        <div class="preview" id="store-preview">${storePreview(medals, s.exchangeRate, vm.method)}</div>
        ${editing ? '<p class="hint">枚数を変えると、差分を「その他（残高を修正）」として記録します。</p>' : ''}</div>
      <label class="switch"><input type="checkbox" name="favorite" ${s.favorite ? 'checked' : ''}><span>お気に入りの店舗（記録画面で先頭に表示）</span></label>
      <div class="field"><label class="field-label" for="st-memo">メモ</label>
        <textarea id="st-memo" name="memo" rows="2" maxlength="500" placeholder="営業時間・貯メダルの再プレイ上限など">${esc(s.memo)}</textarea></div>
      <button class="btn-primary" type="submit" data-testid="save-store">${editing ? '保存' : '登録する'}</button>
      ${editing ? '<button class="btn-danger" type="button" data-action="delete-store">この店舗を削除</button>' : ''}
    </form>`;
}

// ---- 設定 ----

export function settingsView(vm, env) {
  const { settings } = vm.data;
  const radio = (name, value, label) => `
    <label class="seg-opt"><input type="radio" name="${name}" value="${value}" ${settings[name] === value ? 'checked' : ''}><span>${label}</span></label>`;
  return `
    ${topbar('設定')}
    <div class="content">
      <section class="section"><h2>表示</h2>
        <div class="card">
          <div class="field-label">テーマ（自動＝スマホの設定に合わせる）</div>
          <div class="seg" role="radiogroup" aria-label="テーマ">
            ${radio('theme', 'system', '自動')}${radio('theme', 'light', 'ライト')}${radio('theme', 'dark', 'ダーク')}
          </div>
          <label class="field-label" for="set-rounding">円換算の端数</label>
          <select id="set-rounding" name="roundingMethod" class="select">
            <option value="floor"${settings.roundingMethod === 'floor' ? ' selected' : ''}>切り捨て（おすすめ）</option>
            <option value="round"${settings.roundingMethod === 'round' ? ' selected' : ''}>四捨五入</option>
            <option value="ceil"${settings.roundingMethod === 'ceil' ? ' selected' : ''}>切り上げ</option>
          </select>
        </div>
      </section>

      <section class="section"><h2>目標</h2>
        <div class="card">
          <p class="muted">目標の貯メダル（枚）。ホームに達成率が表示されます。0 で非表示。</p>
          ${goalForm(settings.targetMedals)}
        </div>
      </section>

      <section class="section"><h2>データのバックアップ</h2>
        <div class="card stack">
          <button class="btn" type="button" data-action="export-json">JSON で保存（すべてのデータ）</button>
          <button class="btn" type="button" data-action="import-json">JSON から復元</button>
          <input type="file" id="import-file" accept="application/json,.json" hidden>
          ${can('csv') ? '<button class="btn" type="button" data-action="export-csv">履歴を CSV で保存</button>' : ''}
          <p class="hint">データはこの端末の中だけに保存されます。機種変更の前や、定期的に JSON で保存しておくと安心です。</p>
        </div>
      </section>

      <section class="section"><h2>ホーム画面に追加</h2>
        <div class="card">
          ${env.standalone ? '<p>アプリとして起動しています。</p>'
            : env.canInstall ? '<button class="btn-primary" type="button" data-action="install">ホーム画面に追加する</button>'
            : `<p class="muted">${env.ios
              ? 'Safari の共有ボタン（□↑）→「ホーム画面に追加」で、アプリのように使えます。'
              : 'ブラウザのメニュー →「ホーム画面に追加」または「アプリをインストール」で、アプリのように使えます。'}</p>`}
          <p class="hint">ホーム画面から開くと、電波がない店内でも記録できます。</p>
        </div>
      </section>

      <section class="section"><h2>使い方ガイド</h2>
        <div class="card stack" data-testid="guide-list">
          ${env.guides.map(([key, title]) => `<button class="btn guide-link" type="button" data-action="guide" data-key="${key}">${esc(title)}</button>`).join('')}
          <p class="hint">各画面の右上の「？」からも、その画面の使い方を見られます。</p>
        </div>
      </section>

      <section class="section"><h2>このアプリについて</h2>
        <div class="card info">
          <dl>
            <div><dt>バージョン</dt><dd>${esc(env.version)}</dd></div>
            <div><dt>プラン</dt><dd>${esc(planLabel())}</dd></div>
            <div><dt>保存先</dt><dd data-testid="storage-kind">${esc(env.storageLabel)}</dd></div>
            <div><dt>通知</dt><dd>目標達成・記録忘れ・月末の通知は今後対応予定（今はホーム画面にお知らせを表示）</dd></div>
          </dl>
          <p class="hint">円換算は登録した交換枚数による目安で、実際の換金額とは異なる場合があります。</p>
          <button class="btn-danger" type="button" data-action="reset">すべてのデータを削除</button>
        </div>
      </section>
    </div>`;
}

export { perMedal };
