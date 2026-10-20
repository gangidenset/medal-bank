// グラフ（外部ライブラリなしの SVG）。表示する要素の横幅に合わせて描き、
// 画面を回転・リサイズしたら描き直す。タップ（なぞり）でその時点の値を表示する。

const NS = 'http://www.w3.org/2000/svg';
const PAD = { top: 14, right: 10, bottom: 24, left: 48 };

function niceTicks(min, max, count = 4) {
  if (min === max) {
    const d = Math.abs(min) || 1;
    min -= d * 0.5;
    max += d * 0.5;
  }
  const raw = (max - min) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw);
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
  return { lo, hi, ticks };
}

/** 軸の数字は短く（12,000 → 1.2万） */
export function shortNum(v) {
  const a = Math.abs(v);
  if (a >= 100_000_000) return `${+(v / 100_000_000).toFixed(1)}億`;
  if (a >= 10_000) return `${+(v / 10_000).toFixed(2)}万`;
  return v.toLocaleString('ja-JP');
}

const el = (tag, attrs = {}, text) => {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (text != null) n.textContent = text;
  return n;
};

function frame(host, height) {
  const width = Math.max(240, Math.floor(host.clientWidth || 320));
  const svg = el('svg', { viewBox: `0 0 ${width} ${height}`, width, height, class: 'chart-svg', role: 'img' });
  return { svg, width, height, w: width - PAD.left - PAD.right, h: height - PAD.top - PAD.bottom };
}

function yAxis(svg, f, scale, ticks) {
  for (const t of ticks) {
    const y = scale(t);
    svg.append(el('line', { x1: PAD.left, x2: f.width - PAD.right, y1: y, y2: y, class: t === 0 ? 'chart-zero' : 'chart-grid' }));
    svg.append(el('text', { x: PAD.left - 6, y: y + 4, class: 'chart-label', 'text-anchor': 'end' }, shortNum(t)));
  }
}

function tooltip(host) {
  let tip = host.querySelector('.chart-tip');
  if (!tip) {
    tip = document.createElement('div');
    tip.className = 'chart-tip';
    tip.hidden = true;
    host.append(tip);
  }
  return tip;
}

/**
 * 折れ線グラフ。points: [{ label, value }]（古い順）
 * format(value) はツールチップの表示。
 */
export function lineChart(host, { points, format, ariaLabel, height = 190 }) {
  host.querySelector('svg')?.remove();
  const f = frame(host, height);
  const { svg } = f;
  svg.setAttribute('aria-label', ariaLabel ?? '');
  const values = points.map((p) => p.value);
  const { lo, hi, ticks } = niceTicks(Math.min(...values), Math.max(...values));
  const sy = (v) => PAD.top + f.h - ((v - lo) / (hi - lo)) * f.h;
  const sx = (i) => PAD.left + (points.length === 1 ? f.w / 2 : (i / (points.length - 1)) * f.w);
  yAxis(svg, f, sy, ticks);

  const xIdx = points.length <= 2 ? points.map((_, i) => i) : [0, Math.floor((points.length - 1) / 2), points.length - 1];
  for (const i of xIdx) {
    const anchor = i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle';
    svg.append(el('text', { x: sx(i), y: height - 6, class: 'chart-label', 'text-anchor': points.length === 1 ? 'middle' : anchor }, points[i].label));
  }
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${sx(i).toFixed(1)},${sy(p.value).toFixed(1)}`).join('');
  if (points.length > 1) {
    const base = sy(Math.max(lo, Math.min(0, hi)));
    svg.append(el('path', { d: `${line}L${sx(points.length - 1)},${base}L${sx(0)},${base}Z`, class: 'chart-area' }));
  }
  svg.append(el('path', { d: line, class: 'chart-line' }));
  const last = points.length - 1;
  svg.append(el('circle', { cx: sx(last), cy: sy(points[last].value), r: 4, class: 'chart-dot' }));
  const guide = el('line', { y1: PAD.top, y2: PAD.top + f.h, class: 'chart-guide', visibility: 'hidden' });
  const dot = el('circle', { r: 5, class: 'chart-dot', visibility: 'hidden' });
  svg.append(guide, dot);
  host.prepend(svg);

  const tip = tooltip(host);
  const show = (clientX) => {
    const rect = svg.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * f.width;
    const i = points.length === 1 ? 0 : Math.max(0, Math.min(last, Math.round(((x - PAD.left) / f.w) * last)));
    guide.setAttribute('x1', sx(i));
    guide.setAttribute('x2', sx(i));
    guide.setAttribute('visibility', 'visible');
    dot.setAttribute('cx', sx(i));
    dot.setAttribute('cy', sy(points[i].value));
    dot.setAttribute('visibility', 'visible');
    tip.hidden = false;
    tip.textContent = `${points[i].label}  ${format(points[i].value)}`;
    const left = Math.min(Math.max(sx(i) - tip.offsetWidth / 2, 0), f.width - tip.offsetWidth);
    tip.style.left = `${left}px`;
  };
  svg.addEventListener('pointerdown', (e) => show(e.clientX));
  svg.addEventListener('pointermove', (e) => { if (e.pointerType !== 'mouse' || e.buttons || !tip.hidden) show(e.clientX); });
}

/** 棒グラフ（プラスとマイナスで色を分ける）。items: [{ label, value }] */
export function barChart(host, { items, format, ariaLabel, height = 200 }) {
  host.querySelector('svg')?.remove();
  const f = frame(host, height);
  const { svg } = f;
  svg.setAttribute('aria-label', ariaLabel ?? '');
  const values = items.map((p) => p.value);
  const { lo, hi, ticks } = niceTicks(Math.min(0, ...values), Math.max(0, ...values));
  const sy = (v) => PAD.top + f.h - ((v - lo) / (hi - lo)) * f.h;
  yAxis(svg, f, sy, ticks);
  const slot = f.w / items.length;
  const bw = Math.max(4, Math.min(28, slot * 0.62));
  const every = slot < 26 ? 3 : slot < 40 ? 2 : 1;
  const tip = tooltip(host);
  items.forEach((it, i) => {
    const cx = PAD.left + slot * (i + 0.5);
    const y0 = sy(0);
    const y1 = sy(it.value);
    const bar = el('rect', {
      x: cx - bw / 2, y: Math.min(y0, y1), width: bw, height: Math.max(1, Math.abs(y1 - y0)), rx: 3,
      class: it.value < 0 ? 'chart-bar neg' : 'chart-bar pos',
    });
    const hit = el('rect', { x: cx - slot / 2, y: PAD.top, width: slot, height: f.h, class: 'chart-hit' });
    hit.addEventListener('pointerdown', () => {
      tip.hidden = false;
      tip.textContent = `${it.label}  ${format(it.value)}`;
      tip.style.left = `${Math.min(Math.max(cx - tip.offsetWidth / 2, 0), f.width - tip.offsetWidth)}px`;
    });
    svg.append(bar, hit);
    if ((items.length - 1 - i) % every === 0) {
      svg.append(el('text', { x: cx, y: height - 6, class: 'chart-label', 'text-anchor': 'middle' }, it.short ?? it.label));
    }
  });
  host.prepend(svg);
}
