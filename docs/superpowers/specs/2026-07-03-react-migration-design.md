# MemoTodo フロントエンド React-ts 移行 設計書

- 日付: 2026-07-03
- 対象: `frontend/`（Go バックエンドと `wailsjs/` バインディングは原則無変更）
- ステータス: 設計確定（実装計画へ移行前のレビュー待ち）

## 1. 背景と目的

現状のフロントは **バンドラーなしのプレーン HTML/CSS/JS（ES Modules）** 構成で、`frontend/src/todo.js`（約1570行）が手動 DOM 操作（`innerHTML` / `appendChild`）で全画面を描画している。

この構造に起因して、「設定でインライン⇄モーダルを切り替えるとタスクが二重表示される」バグが発生した。原因は `loadList()` が並行に2回呼ばれ、`innerHTML=""`（クリア）と `await` 後の `appendChild`（追加）が交錯して行が二重追加されるレース（コード内 319-322 行のコメントが既知の落とし穴として警告済み）。当座は「世代番号ガード」＋「重複呼び出し除去」で修正済みだが、手動 DOM 由来の同種バグは今後も湧く構造的リスクである。

### 目的（成功の定義）

1. **手動 DOM／手動リフェッチ由来のバグを構造的に撲滅する**（最優先）
2. **保守性・見通しの改善**（1570行の一枚岩をコンポーネントに分割）
3. **難所でのエコシステム活用**（リッチテキスト・DnD 等をライブラリに委譲）

## 2. スコープと非スコープ

### スコープ
- `frontend/` を React + Vite + TypeScript 構成へ全面移行
- ビルド成果物の埋め込みパス調整（`main.go` / `wails.json`）
- CDN 参照（フォント・アイコン）の同梱化によるオフライン完全対応

### 非スコープ
- Go バックエンド（`app.go` の約25メソッド、トレイ常駐・二重起動フォーカス・ウィンドウ状態永続化）の挙動変更
- 見た目（UI デザイン）の刷新 — 既存 `todo.css` の見た目を維持する
- 機能追加 — 現行の機能セットを等価に移植する

## 3. 前提となる決定事項

| 論点 | 決定 |
|---|---|
| フレームワーク | React + Vite + **TypeScript**（react-ts） |
| npm/ポータビリティ | 開発・ビルドに Node.js/npm 必須を受容。配布物（exe）への単一埋め込み＝1フォルダ持ち運びは維持。README は「開発に npm 必須」に更新 |
| UI 方針 | 現状の見た目を維持（`todo.css` 移植）。難所だけライブラリ（リッチテキスト＝TipTap、DnD＝dnd-kit、日付＝ネイティブ input） |
| 状態管理 | **TanStack Query**（サーバー状態）＋ 軽量 UI ストア（純 UI 状態）。案3を採用 |
| 進め方 | プロトタイプ先行（縦割り1本で検証 → 合格後に残りを移植） |
| テスト | Vitest による純ロジック単体テストに集中。重い UI テストは書かない |

## 4. アーキテクチャ

### 4.1 ディレクトリ構成

```
frontend/
  index.html              # Vite エントリ。<div id="root">。CDN フォント/アイコンは廃止し同梱
  package.json            # 依存（後述）
  vite.config.ts / tsconfig.json
  wailsjs/                # 既存のまま（Wails が自動再生成）。React から import
  src/
    main.tsx              # QueryClientProvider でブート
    App.tsx               # レイアウト（ヘッダー/タブ/一覧/定期パネル/モーダル/トースト）
    styles/todo.css       # 既存 todo.css をそのまま移植（見た目維持）
    api/                  # App.* の薄い型付きラッパ ＋ queryKeys
    hooks/                # useTodos / useTodo / useRecurring / useSettings（Query/Mutation）
    state/uiStore.ts      # 純 UI 状態（activeTab, openDetailId, detailPattern, drafts, toast）
    components/           # 後述のコンポーネント木
    lib/                  # format.ts（日付整形/プレビュー/パス正規化/並び替え＝純ロジック・テスト対象）
    events.ts             # EventsOn 購読 → invalidate / toast 表示
```

### 4.2 ビルド配線の変更（Go 側に触れる唯一の箇所）

| 対象 | 現状 | 変更後 |
|---|---|---|
| `wails.json` | install/build/watcher が空、`serverUrl=""` | `frontend:install`=`npm install`、`frontend:build`=`npm run build`、`frontend:dev:watcher`=`npm run dev`、`serverUrl`=`auto`（Vite の dev サーバーを自動検出） |
| `main.go` L27 | `//go:embed all:frontend` | `//go:embed all:frontend/dist` |
| `main.go` L117 | `fs.Sub(assets, "frontend")` | `fs.Sub(assets, "frontend/dist")` |

Vite のビルド成果物は `frontend/dist` に出力されるため、埋め込み先をそこへ変更する。配布物への単一埋め込みは維持される。

### 4.3 アセット（CDN → 同梱）

- Bootstrap Icons: `bootstrap-icons` を npm 依存にして import（Vite がフォントをバンドル）
- Noto Sans JP: システムフォントフォールバック中心にするか `@fontsource/noto-sans-jp` を同梱。**プロトタイプ時に見た目とサイズを見て確定**

## 5. 状態管理とデータフロー

### 5.1 状態の二分

**① サーバー状態（Go/SQLite 由来）= TanStack Query**

| Query key | 取得元 | 用途 |
|---|---|---|
| `['todos', tab]` | `GetTodos(tab)` | 一覧（pending/done）。バッジ件数も `.length` から導出 |
| `['todo', id]` | `GetTodo(id)` | 詳細フォームの元データ |
| `['recurringPanel']` | `GetRecurringPanel()` | 定期パネル（残/近い/全て）＋赤/黄バッジ |
| `['settings']` | `GetSettings()` | 設定（detailPattern はここから） |
| `['nearOrOverdue']` | `GetNearOrOverdueMemos()` | 定期通知トーストのまとめ用 |

**② 純 UI 状態 = `state/uiStore.ts`（軽量ストア/Context）**

`activeTab` / `openDetailId` / `detailPattern`（settings のミラー）/ `drafts`（未保存編集）/ `toast`（表示中の通知）/ `recurringPanelOpen`。

### 5.2 ミューテーション → 無効化（invalidate）の対応

```
CreateTodo / UpdateTodo / CompleteTodo / RestoreTodo / DeleteTodo / ToggleImportant
    → invalidate ['todos'], ['nearOrOverdue']（該当なら ['todo', id]）
ReorderTodos            → invalidate ['todos','pending']  ※楽観的更新も可
BulkDeleteDoneTodos     → invalidate ['todos']
Create/Update/Delete/ToggleRecurringTask → invalidate ['recurringPanel'], ['recurringTasks']
SaveSettings            → invalidate ['settings'] → detailPattern を uiStore に反映
```

### 5.3 バックエンドイベント（`events.ts`）

`EventsOn` でリマインダー／定期通知を受けたら:
- トースト表示は uiStore（`toast` 状態）へ
- 関連クエリを invalidate（例: リマインダー発火 → `['todos']`, `['nearOrOverdue']`）

### 5.4 ドラフト（未保存編集の保持）

詳細フォームは `drafts[id]` を単一の真実として**制御コンポーネント**化する。保存・削除・キャンセルで該当ドラフトを破棄、ウィンドウが隠れたら全破棄（現行の思想を踏襲）。インライン⇄モーダルは**同じドラフト状態**を別の器に描画するだけ。

### 5.5 なぜ目的①（バグ撲滅）が達成されるか

- 「誰がいつ `loadList` を呼ぶか」という命令的リフェッチが消滅し、更新は必ず `mutation → invalidateQueries` の宣言的経路のみになる。
- TanStack Query が同一キーの重複リクエストを排除し、常に最新結果だけを反映する。今日の「クリアと append が交錯して二重描画」は原理的に起こり得ない（React が差分描画、Query がフェッチを一元管理）。
- インライン⇄モーダル切替は state 変更に伴う再描画なので、行の二重化は構造的に不可能。

## 6. コンポーネント構成

```
App
├─ Header                     設定ボタン
├─ Tabs                       pending / done ＋ 件数バッジ（['todos'] から導出）
├─ BulkDeleteBar              done タブ時のみ
├─ QuickInput                 Enter登録 / Alt+Enter改行（CreateTodo mutation）
├─ TodoList
│   ├─ TodoSection (期日なし)  ← dnd-kit の SortableContext でラップ
│   │   └─ TodoRow[]           SortableItem。チェック/重要/期日チップ/シェブロン
│   │       └─ TodoDetail (inline)   detailPattern==="inline" のとき行直下に展開
│   └─ TodoSection (期日あり)
│       └─ TodoRow[]
├─ RecurringTab + RecurringPanel   スライドオーバー（残/近い/全て、赤黄バッジ）
│   └─ RecurringRow[] / RecurringDetail (inline)
├─ Modals
│   ├─ DetailModal            detailPattern==="modal" のとき TodoDetail をポータル表示
│   ├─ SettingsModal          表示方式/通知時刻/通知方式/日数（SaveSettings）
│   └─ RecurringNotifyModal   周期種別ごとの通知日数
└─ ToastHost                  ReminderToast / PeriodicToast（uiStore.toast 駆動）

TodoDetail（インライン・モーダル共通の中身）
├─ TitleInput / DeadlineInput(native date) / ReminderRow
├─ RichTextEditor  ← TipTap
├─ DetectedLinks   ← lib/links.ts で本文から検出、OpenURL / OpenLocalPath
└─ Footer (削除 / 破棄 / 保存)
```

### 難所 → ライブラリ対応

| 難所 | 実装方針 |
|---|---|
| リッチテキスト（太字/赤字/リンク挿入/クリップボード画像貼付） | **TipTap**（StarterKit＋Link＋Image 拡張）。画像貼付は `handlePaste` でクリップボード画像を拾い `App.SaveImage(base64)` → 返ったパスを Image ノードに挿入。ツールバー（B/赤/リンク/画像）は現行踏襲 |
| ドラッグ並び替え（期日なしのみ） | **dnd-kit**（`SortableContext`＋`useSortable`）。ドロップ時に新順序で `ReorderTodos` mutation → invalidate。楽観的更新でチラつき防止 |
| 本文中リンク（URL/UNC/ローカルパス） | 検出は**バックエンド責務**で `todo.links: {type, value}[]` として返る。フロントは表示とクリック処理のみ（`OpenURL`/`OpenLocalPath`、`file://` 除去）。クライアント側検出は行わない |
| 日付/期日 | ネイティブ `input[type=date]` / `datetime-local` を維持（依存を増やさない） |
| インライン⇔モーダル | 同一 `TodoDetail` を器だけ替えて描画。モーダルは React Portal |
| トースト | 現行のオーバーレイ相当を uiStore 駆動のコンポーネントで再現（自動消滅なし＝現行踏襲） |

### 新規依存（最小限）

`react`, `react-dom`, `@tanstack/react-query`, `@tiptap/react`＋`@tiptap/starter-kit`＋`@tiptap/extension-link`＋`@tiptap/extension-image`, `@dnd-kit/core`＋`@dnd-kit/sortable`, `bootstrap-icons`。UI 状態ストアは Zustand か React Context（プロトタイプで軽い方を確定）。

## 7. エラー処理（現行踏襲）

- クエリ失敗 → リスト内に「読み込みに失敗しました」相当を表示
- ミューテーション失敗 → 現行の `_errMsg` 相当でトースト/アラート表示

## 8. テスト（Vitest、純ロジックに集中）

| 対象 | なぜ |
|---|---|
| `lib/format.ts` の `fmtDeadline`（YYYY-MM-DD → M/D(曜)、ローカル時刻で曜日算出） | 直近コミットで timezone date math バグを修正済み＝最も壊れやすい領域 |
| `lib/format.ts` の `normalizeLocalPath`（`file://` 除去＋復号） | ローカルパスを開く際の分岐で回帰しやすい純関数 |
| `lib/format.ts` の `previewText`（1行目＋省略記号） | 一覧表示の見出し整形 |
| `lib/format.ts` の `computeReorder`（並び替え後の id 順序） | DnD の並び替えロジック |

補足: 期日近接/期限切れ判定（`is_near`/`is_overdue`）とリンク検出はバックエンド責務のため、クライアント側テスト対象ではない。

UI は型安全＋実機確認でカバー（重い UI テストは書かない）。

## 9. 進め方（プロトタイプ先行 → 段階移植）

作業は別ブランチ `feat/react-migration` で行う。

### プロトタイプ（縦割り1本）— 検証ゲート

1. `frontend/` を Vite react-ts 化（`wailsjs/` は温存）、`todo.css` 移植、`QueryClientProvider` 起動
2. 実装範囲: ヘッダー＋タブ＋クイック入力＋一覧（期日なし/あり）＋TodoRow＋TodoDetail（TipTap リッチテキスト＝画像貼付・リンク含む、インライン&モーダル両方）＋dnd-kit 並び替え
3. `wails.json`/`main.go`（`frontend/dist`）を配線し、`wails dev` と `wails build` の両方が通ることを確認

**合否判定（すべて満たせば本移植へ）:**
- ① TipTap の画像貼付（`SaveImage`）が動く
- ② dnd-kit の並び替え → `ReorderTodos` が動く
- ③ インライン⇔モーダル切替で二重化しない
- ④ exe にビルド埋め込みできる

### 本移植フェーズ（プロトタイプ合格後）

- フェーズA: 定期タスクパネル（残/近い/全て、追加/編集/完了トグル、赤黄バッジ）
- フェーズB: 各モーダル（設定・定期通知設定）＋ `SaveSettings` 連携
- フェーズC: 通知トースト（リマインダー/定期）＋ `EventsOn` 配線 ＋ invalidate
- フェーズD: 純ロジックの Vitest、CDN 撤去の最終確認、旧 `todo.js`/旧 `index.html` 削除、README 更新（開発に npm 必須の旨）、`wails build` で最終確認

## 10. リスクと対策

| リスク | 対策 |
|---|---|
| TipTap でのクリップボード画像貼付が Wails WebView2 で期待通り動かない | プロトタイプの合否判定①で最優先検証。ダメなら現行の contenteditable + paste ハンドラを自前移植にフォールバック |
| `frontend/dist` 埋め込みの設定ミスでビルドが通らない | プロトタイプ段階で `wails build` まで通すことをゲートに含める |
| 見た目のリグレッション | `todo.css` をそのまま移植し、クラス名も踏襲。プロトタイプで現行と並べて目視確認 |
| 移植中に現行アプリが動かない期間が生じる | 別ブランチ作業。main は現行のまま維持し、全移植・検証完了後に統合 |
