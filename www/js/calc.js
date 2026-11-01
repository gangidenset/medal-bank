// 記録画面の電卓（枚数の足し算・引き算・掛け算・割り算）。
// 式は文字列で持ち、eval を使わずに計算する（× ÷ を先に計算）。

export const OPS = ['+', '−', '×', '÷'];

/** 式を数と演算子に分ける。例："1,200+300×2" → [1200, '+', 300, '×', 2] */
export function tokenize(expr) {
  const out = [];
  let num = '';
  for (const ch of String(expr).replace(/[,\s]/g, '').replace(/-/g, '−').replace(/\*/g, '×').replace(/\//g, '÷')) {
    if (/[0-9.]/.test(ch)) {
      num += ch;
    } else if (OPS.includes(ch)) {
      if (num === '' && out.length === 0 && ch === '−') { num = '-'; continue; } // 先頭のマイナス
      if (num !== '' && num !== '-') out.push(Number(num));
      num = '';
      if (out.length && typeof out.at(-1) === 'number') out.push(ch);
      else if (out.length) out[out.length - 1] = ch; // 演算子が続いたら後のものにする
    }
  }
  if (num !== '' && num !== '-') out.push(Number(num));
  if (typeof out.at(-1) === 'string') out.pop(); // 末尾の演算子は無視
  return out;
}

/** 式を計算する。計算できないときは null。0 で割ったときも null。 */
export function evaluate(expr) {
  const t = tokenize(expr);
  if (!t.length || t.some((x) => typeof x === 'number' && !Number.isFinite(x))) return null;
  // × ÷ を先に計算
  const terms = [t[0]];
  for (let i = 1; i < t.length; i += 2) {
    const op = t[i];
    const n = t[i + 1];
    if (op === '×') terms[terms.length - 1] *= n;
    else if (op === '÷') {
      if (n === 0) return null;
      terms[terms.length - 1] /= n;
    } else terms.push(op, n);
  }
  let v = terms[0];
  for (let i = 1; i < terms.length; i += 2) v = terms[i] === '+' ? v + terms[i + 1] : v - terms[i + 1];
  return Number.isFinite(v) ? v : null;
}

/** 枚数として使う値（整数に四捨五入）。 */
export function evaluateMedals(expr) {
  const v = evaluate(expr);
  return v === null ? null : Math.round(v);
}

/** ボタンを押したあとの式。 */
export function press(expr, key) {
  const s = String(expr ?? '');
  if (key === 'C') return '';
  if (key === 'back') return s.slice(0, -1);
  if (OPS.includes(key)) {
    if (s === '') return key === '−' ? '−' : '';
    if (OPS.includes(s.at(-1))) return s.slice(0, -1) + key;
    return s + key;
  }
  if (key === '=') {
    const v = evaluateMedals(s);
    return v === null ? s : String(v).replace('-', '−');
  }
  if (/^\d+$/.test(key)) {
    if (s.length >= 40) return s;
    // 数の先頭の 0 は 1つだけ
    const last = s.split(/[+−×÷]/).at(-1);
    if (last === '0') return s.slice(0, -1) + (key === '00' ? '0' : key);
    if (last === '' && key === '00') return s + '0';
    return s + key;
  }
  return s;
}

/** 入力欄の値を電卓の式に（-1200 → −1200）。 */
export function fromValue(v) {
  const n = Number(v);
  return v === '' || v === null || v === undefined || !Number.isFinite(n) ? '' : String(Math.trunc(n)).replace('-', '−');
}

/** 表示用に数へ 3 桁ごとのカンマを付ける。 */
export function formatExpr(expr) {
  return String(expr).replace(/\d+/g, (d) => Number(d).toLocaleString('ja-JP'));
}
