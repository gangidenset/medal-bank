// 無料版・有料版の機能の切り分け。
// 画面やデータ処理は「can(機能)」「limit(上限)」だけを見るので、
// 将来は currentPlan を購入状態（アプリ内課金・サブスクリプション）から決めるだけで切り替えられる。

export const PLANS = {
  free: {
    label: '無料版',
    limits: { maxStores: 3 },
    features: [],
  },
  pro: {
    label: '有料版',
    limits: { maxStores: Infinity },
    features: ['charts', 'forecast', 'csv', 'analysis', 'cloudBackup', 'sync'],
  },
};

// 決済を実装するまでは、すべての機能を開放する
let currentPlan = 'pro';

export const planId = () => currentPlan;
export const planLabel = () => (currentPlan === 'pro' ? '開発版（すべての機能を利用できます）' : PLANS[currentPlan].label);
export const setPlan = (id) => { if (PLANS[id]) currentPlan = id; };
export const can = (feature) => PLANS[currentPlan].features.includes(feature);
export const limit = (name) => PLANS[currentPlan].limits[name];
