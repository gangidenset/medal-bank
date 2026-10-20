// 設定推測・ヤメ判断で使う機種スペック（Aタイプ）。
// 確率は設定1〜6の分母（1/273.1 → 273.1）、rate は機械割（%）。
// - BIG・REG・機械割：解析サイト（ナナプレス・パチセブン・P-WORLD 等）で一致している掲載値
// - ブドウ・単独BIG/REG・チェリーBIG/REG：シミュレーターアプリでの各設定数百万G の実戦値（掲載がある機種のみ）
// - チェリーは「ボーナス重複を含むか」など数え方がサイトごとに違うため組み込んでいない（利用者がスペック画面で入力できる）

export const SPEC_FIELDS = [
  { key: 'bb', label: 'BIG', required: true },
  { key: 'bbSolo', label: '単独BIG' },
  { key: 'bbCherry', label: 'チェリーBIG' },
  { key: 'rb', label: 'REG', required: true },
  { key: 'rbSolo', label: '単独REG' },
  { key: 'rbCherry', label: 'チェリーREG' },
  { key: 'grape', label: 'ブドウ' },
  { key: 'cherry', label: 'チェリー' },
  { key: 'rate', label: '機械割（%）', required: true },
];

const APP_VALUES = 'ブドウ・単独/チェリーのBIG・REG はシミュレーターアプリの実戦値';

export const BUILTIN_MACHINES = [
  {
    id: 'im-ex',
    name: 'SアイムジャグラーEX',
    bb: [273.1, 269.7, 269.7, 259.0, 259.0, 255.0],
    rb: [439.8, 399.6, 331.0, 315.1, 255.0, 255.0],
    bbSolo: [415.28, 402.09, 397.61, 388.20, 386.40, 382.26],
    bbCherry: [843.88, 850.34, 862.07, 813.01, 783.09, 786.16],
    rbSolo: [644.33, 572.74, 490.92, 450.86, 360.23, 373.69],
    rbCherry: [1466.28, 1269.04, 1239.16, 1031.99, 843.17, 850.34],
    grape: [6.06, 6.04, 6.04, 6.04, 6.02, 5.80],
    rate: [97.0, 98.0, 99.5, 101.1, 103.3, 105.5],
    note: APP_VALUES,
  },
  {
    id: 'my5',
    name: 'マイジャグラーV',
    bb: [273.1, 270.8, 266.4, 254.0, 240.1, 229.1],
    rb: [409.6, 385.5, 336.1, 290.0, 268.6, 229.1],
    bbSolo: [410.28, 408.72, 413.62, 379.31, 348.71, 345.22],
    rbSolo: [652.73, 607.65, 500.25, 411.91, 397.19, 333.81],
    rbCherry: [1091.69, 1094.48, 1046.38, 1026.68, 888.35, 759.10],
    grape: [5.90, 5.88, 5.82, 5.81, 5.79, 5.69],
    rate: [97.0, 98.0, 99.9, 102.8, 105.3, 109.4],
    note: APP_VALUES,
  },
  {
    id: 'funky2',
    name: 'ファンキージャグラー2',
    bb: [266.4, 259.0, 256.0, 249.2, 240.1, 219.9],
    rb: [439.8, 407.1, 366.1, 322.8, 299.3, 262.1],
    bbSolo: [405.18, 401.17, 395.62, 377.93, 374.29, 343.84],
    rbSolo: [644.60, 562.32, 504.96, 451.06, 417.18, 361.75],
    rbCherry: [1385.67, 1397.94, 1274.41, 1217.03, 1106.59, 1017.97],
    grape: [5.95, 5.92, 5.90, 5.85, 5.78, 5.72],
    rate: [97.0, 98.5, 99.8, 102.0, 104.3, 109.0],
    note: APP_VALUES,
  },
  {
    id: 'happy3',
    name: 'ハッピージャグラーVⅢ',
    bb: [273.1, 270.8, 263.2, 254.0, 239.2, 226.0],
    rb: [397.2, 362.1, 332.7, 300.6, 273.1, 256.0],
    grape: [6.07, 6.03, 6.00, 5.86, 5.84, 5.80],
    rate: [97.0, 98.1, 99.9, 102.9, 105.8, 108.4],
    note: 'ブドウはシミュレーターアプリの実戦値',
  },
  {
    id: 'mr',
    name: 'ミスタージャグラー',
    bb: [268.6, 267.5, 260.1, 249.2, 240.9, 237.4],
    rb: [374.5, 354.2, 331.0, 291.3, 257.0, 237.4],
    rate: [97.0, 98.0, 99.8, 102.7, 105.5, 107.3],
  },
  {
    id: 'gogo3',
    name: 'ゴーゴージャグラー3',
    bb: [259.0, 258.0, 257.0, 254.0, 247.3, 234.9],
    rb: [354.2, 332.7, 306.2, 268.6, 247.3, 234.9],
    rate: [97.2, 98.2, 99.4, 101.6, 103.8, 106.5],
  },
  {
    id: 'ultra',
    name: 'ウルトラミラクルジャグラー',
    bb: [267.5, 261.1, 256.0, 242.7, 233.2, 216.3],
    rb: [425.6, 402.1, 350.5, 322.8, 297.9, 277.7],
    rate: [97.0, 98.1, 99.8, 102.1, 104.5, 108.1],
  },
  {
    id: 'girls-ss',
    name: 'ジャグラーガールズSS',
    bb: [273.1, 270.8, 260.1, 250.1, 243.6, 226.0],
    rb: [381.0, 350.5, 316.6, 281.3, 270.8, 252.1],
    rate: [97.0, 97.9, 99.9, 102.1, 104.0, 107.5],
  },
];

/** 組み込み + 利用者が編集・追加した機種（同じ id は利用者の値を優先） */
export function allMachines(custom = []) {
  const map = new Map(BUILTIN_MACHINES.map((m) => [m.id, { ...m, builtin: true }]));
  for (const c of custom) map.set(c.id, { ...c, builtin: map.has(c.id), edited: map.has(c.id) });
  return [...map.values()];
}

/** スペックの入力チェック。6つの正の数の配列にそろえる（任意項目は空なら undefined） */
export function normalizeSpec(input) {
  const name = String(input.name ?? '').trim().slice(0, 40);
  if (!name) throw new Error('機種名を入力してください');
  const spec = { id: String(input.id || ''), name };
  for (const f of SPEC_FIELDS) {
    const raw = input[f.key];
    const list = Array.isArray(raw) ? raw : String(raw ?? '').split(/[,、\s]+/).filter(Boolean);
    if (!list.length) {
      if (f.required) throw new Error(`${f.label}の数値を入力してください`);
      continue;
    }
    const nums = list.map(Number);
    const ok = nums.length === 6 && nums.every((n) => Number.isFinite(n) && (f.key === 'rate' ? n >= 50 && n <= 200 : n > 1 && n < 100000));
    if (!ok) throw new Error(`${f.label}は設定1〜6の6つの数を入力してください${f.key === 'rate' ? '' : '（1/273.1 なら 273.1）'}`);
    spec[f.key] = nums;
  }
  return spec;
}

const NAME_PATTERNS = [
  [/アイム/, 'im-ex'],
  [/マイジャグ/, 'my5'],
  [/ファンキー/, 'funky2'],
  [/ハッピー/, 'happy3'],
  [/ミスター/, 'mr'],
  [/ゴーゴー/, 'gogo3'],
  [/ウルトラ|ミラクル/, 'ultra'],
  [/ガールズ/, 'girls-ss'],
];

/** 機種名からスペックを探す（「アイムジャグラー」→ SアイムジャグラーEX など） */
export function machineByName(name, machines = allMachines()) {
  const s = String(name ?? '');
  const exact = machines.find((m) => m.name === s);
  if (exact) return exact;
  const id = NAME_PATTERNS.find(([re]) => re.test(s))?.[1];
  return machines.find((m) => m.id === id) ?? null;
}
