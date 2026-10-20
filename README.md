# メダルバンク

「スロットの貯メダルを、自分の資産として管理する」スマートフォン向けアプリ（PWA）。

- 開く → 「今日の記録」 → 店舗（前回の店舗が選択済み）→ `+1,000` などをタップ → 保存、の数秒で記録できる
- 総貯メダル・換金価値（店舗ごとの交換枚数で円換算）・今月の増減と収支をホームに大きく表示
- 端末内（IndexedDB）に保存。ホーム画面に追加すれば、電波のない店内でも使える

## 起動

```bash
npm install
npm start
```

http://localhost:8090 を開く。ビルド不要（HTML / CSS / JavaScript の ES Modules）。

## テスト

```bash
npm run test:all
```

`npm run lint`（読み込み忘れの検出）・`npm test`（計算・データ・バックアップ・オフライン）・`npm run test:e2e`（スマホ幅での画面操作。Windows では Edge を使用）を順に実行する。

指示書「完成後の動作確認」のうち、自動テストで確認しているもの：

| 項目 | テスト |
| --- | --- |
| 初期3,000枚 +1,000 -500 +1,500 → 5,000枚、55枚交換で約90,909円 | `tests/calculation.test.mjs`・`e2e/record.spec.mjs` |
| 店舗登録・編集・削除（記録もまとめて削除） | `e2e/stores.spec.mjs` |
| 貯メダル追加・減算・換金・詳細な遊技記録・元に戻す | `e2e/record.spec.mjs` |
| 履歴（日付ごと）・編集・削除・グラフ・目標・将来予測 | `e2e/history.spec.mjs` |
| JSON バックアップ・復元・CSV 出力・壊れたファイルの拒否 | `e2e/backup.spec.mjs`・`tests/data.test.mjs` |
| 320 / 375 / 390 / 414 / 430px で横スクロールなし・タップ領域・ダークモード | `e2e/layout.spec.mjs` |
| オフライン起動（サービスワーカー） | `tests/service-worker.test.mjs` |

実機（Android Chrome / iPhone Safari）でのホーム画面追加・機内モードでの起動は、公開後に手で確認する。

## 構成

```
www/                    アプリ本体（GitHub Pages・Capacitor の公開フォルダ）
  index.html            画面の骨組み・下部ナビ・スプラッシュ
  css/style.css         スタイル（320px〜、ダークモード対応）
  js/app.js             起動・画面の切り替え・操作の振り分け
  js/ui.js              各画面の描画（HTML を返すだけ）
  js/calculation.js     計算（純粋関数）：残高・円換算・集計・推移・目標・将来予測
  js/data.js            Service 層：データ構造・入力チェック・CRUD・JSON/CSV
  js/storage.js         Storage 層：IndexedDB（→ localStorage → メモリの順に代替）
  js/chart.js           グラフ（外部ライブラリなしの SVG）
  js/plan.js            無料版・有料版の機能の切り分け
  js/notify.js          お知らせの判定（将来のプッシュ通知用）
  manifest.json         PWA の設定（standalone 表示・アイコン）
  service-worker.js     オフライン対応
  icons/                アプリアイコン（scripts/make_icons.py で生成）
tests/                  単体テスト（node --test）
e2e/                    画面操作テスト（Playwright）
capacitor.config.json   ネイティブアプリ化の設定（webDir: www）
```

指示書の例ではファイルをリポジトリ直下に置いていたが、Capacitor でネイティブアプリにするときに `node_modules` などを含めずに `www/` だけを取り込めるよう、アプリ本体は `www/` にまとめた。

## データ構造

```
stores        id, name, lendingRate（貸出枚数/千円）, exchangeRate（交換枚数/千円）,
              initialMedals（登録時の枚数）, favorite, memo, createdAt, updatedAt, deletedAt
transactions  id, date, time, storeId, type, medals（±枚）, cash（±円）,
              machine, machineNumber, memo,
              detail { startMedals, endMedals, investment, payout } | null,
              createdAt, updatedAt, deletedAt
settings      theme, targetMedals, roundingMethod, lastStoreId
```

- **現在の貯メダル** = `initialMedals` + その店舗の記録の `medals` の合計（保存せず毎回計算するので、ずれない）。JSON 出力には `currentMedals` も書き出す。
- **円換算** = 枚数 × 1,000 ÷ 交換枚数。端数は設定で切り捨て（初期値）・四捨五入・切り上げ。合計は店舗ごとの丸める前の値を足してから丸める。
- **現金と貯メダルは別々**に記録する。`cash` は受け取った額（換金額）がプラス、現金投資がマイナス。
- **収支** = 貯メダルの増減（円換算）+ 現金の出入り。換金（-1,100枚・+20,000円）は資産の形が変わるだけなので収支は 0。
- 理由（`type`）：`play` 遊技結果 / `deposit` 貯メダル追加 / `withdraw` 引き出し / `exchange` 換金 / `transfer` 店舗移動 / `other` その他。追加は必ずプラス、引き出し・換金は必ずマイナスに自動でそろえる。

## 将来の拡張

### ネイティブアプリ（Android / iOS）

画面遷移は `#` によるハッシュ方式、パスはすべて相対、外部 CDN なしなので、`www/` をそのまま Capacitor に載せられる。

```bash
npm install @capacitor/core @capacitor/cli @capacitor/android @capacitor/ios
npx cap add android
npx cap add ios
npx cap sync
```

`capacitor.config.json` の `appId` は公開前に自分のドメインに合わせて変える。ネイティブ版ではサービスワーカーを登録しない（`app.js`）。保存先を SQLite などにしたい場合は `storage.js` に同じインターフェースのアダプタを追加する。

### クラウド同期（Firebase / Supabase）

- 保存先は `getAll / putMany / replaceAll` だけのアダプタ（`storage.js`）なので、クラウド用のアダプタを追加して `createDataService` に渡せばよい。
- すべてのレコードが UUID・`updatedAt` を持ち、削除は `deletedAt` を入れる論理削除。同期時は「`updatedAt` が新しい方を採用」「削除も相手に伝える」という一般的な方式がそのまま使える。
- Supabase なら `stores` / `transactions` テーブルに同じ列と `user_id` を足し、行レベルセキュリティで本人のデータだけ読めるようにする。

### 通知

`notify.js` の `pendingNotices()` が「目標達成」「1週間記録なし」「月末」を判定している。今はホーム画面に表示するだけ。Web Push か Capacitor の Local Notifications にこの結果を渡せば通知になる。

### 有料版

`plan.js` の `can('charts')` / `limit('maxStores')` で画面と処理を切り替える作りになっている。決済を実装するまでは `currentPlan = 'pro'`（すべて開放）。購入状態を確認する処理を入れて `setPlan('free' | 'pro')` を呼べば、無料版は店舗3つまで・グラフ/予測/CSV なし、になる。

## 公開（GitHub Pages）

GitHub にリポジトリを作って `main` に push すると、`.github/workflows/pages.yml` がテストを実行し、通ったら `www/` を公開する（リポジトリの Settings → Pages → Source を「GitHub Actions」にする）。

アイコンを変えるときは `scripts/make_icons.py` を編集して `npm run icons`。アプリのファイルを追加・削除したら `www/service-worker.js` の `SHELL` を更新し、`CACHE` の番号を上げる。
