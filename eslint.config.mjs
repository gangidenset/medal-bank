// 読み込み忘れ（未定義の名前）と、使っていない import を見つける（npm run lint）
import globals from 'globals';

export default [
  {
    files: ['www/**/*.js'],
    languageOptions: { ecmaVersion: 2024, sourceType: 'module', globals: { ...globals.browser } },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': ['error', { args: 'none' }],
    },
  },
  {
    files: ['www/service-worker.js'],
    languageOptions: { sourceType: 'script', globals: { ...globals.serviceworker } },
  },
  {
    files: ['**/*.mjs'],
    languageOptions: { ecmaVersion: 2024, sourceType: 'module', globals: { ...globals.node, ...globals.browser } },
    rules: { 'no-undef': 'error' },
  },
];
