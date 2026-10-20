// 設定推測・ヤメ判断で使う機種スペック（Aタイプ）。
// 確率は設定1〜6の分母（1/273.1 → 273.1）、rate は機械割（%）。
// 組み込みは BIG・REG・機械割のみ（一般に公表されている数値をもとにした目安）。
// ブドウ・チェリー・単独REG・チェリーREG は、利用者が設定画面で入力すると推測に使われる。

export const SPEC_FIELDS = [
  { key: 'bb', label: 'BIG', required: true },
  { key: 'rb', label: 'REG', required: true },
  { key: 'rbSolo', label: '単独REG' },
  { key: 'rbCherry', label: 'チェリーREG' },
  { key: 'grape', label: 'ブドウ' },
  { key: 'cherry', label: 'チェリー' },
  { key: 'rate', label: '機械割（%）', required: true },
];

export const BUILTIN_MACHINES = [
  {
    id: 'im-ex',
    name: 'SアイムジャグラーEX',
    bb: [273.1, 269.7, 269.7, 259.0, 259.0, 255.0],
    rb: [439.8, 399.6, 331.0, 315.1, 255.0, 255.0],
    rate: [97.0, 98.0, 99.5, 101.1, 103.3, 105.5],
  },
  {
    id: 'my5',
    name: 'マイジャグラーV',
    bb: [273.1, 270.8, 266.4, 254.0, 240.9, 229.1],
    rb: [409.6, 385.5, 336.1, 290.0, 268.6, 229.1],
    rate: [97.0, 98.0, 99.9, 102.8, 105.3, 109.4],
  },
  {
    id: 'funky2',
    name: 'ファンキージャグラー2',
    bb: [266.4, 259.0, 256.0, 249.2, 240.1, 219.9],
    rb: [439.8, 407.1, 366.1, 322.8, 299.3, 262.1],
    rate: [97.0, 98.5, 99.8, 102.0, 104.3, 109.0],
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

/** 機種名からスペックを探す（「アイムジャグラー」→ SアイムジャグラーEX など） */
export function machineByName(name, machines = allMachines()) {
  const s = String(name ?? '');
  const exact = machines.find((m) => m.name === s);
  if (exact) return exact;
  const id = /アイム/.test(s) ? 'im-ex' : /マイジャグ/.test(s) ? 'my5' : /ファンキー/.test(s) ? 'funky2' : null;
  return machines.find((m) => m.id === id) ?? null;
}
