# 設計：MemoTodo React移行 Phase C（Discord 風ハイブリッド通知）

> 対象：`develop` 起点。前提ドキュメント＝`docs/superpowers/handover-2026-07-04-phase-c.md`、全体設計 `docs/superpowers/specs/2026-07-03-react-migration-design.md`（§5.3 イベント／§6 ToastHost）、Phase A 計画 `docs/superpowers/plans/2026-07-04-phase-a-recurring.md`。
>
> 本書は brainstorming の成果物（design spec）。次段階は writing-plans による実装プラン作成。

## 1. 目的とスコープ

React 移行の Phase C。バックエンドイベント（`EventsOn`）を購読して通知を出す部分を React で実装する。従来の「移行はパリティ（現行踏襲）」方針に対し、**通知だけはユーザー要望により Discord 風のハイブリッド通知に強化する**（＝パリティを超えた新機能）。

- **In-scope**：アプリ内トースト（Discord 風・右下スタック・スライドイン・手動閉じ）、OS ネイティブ通知との排他制御（表示中はネイティブ抑制）、4イベントの購読とクエリ無効化、通知からの遷移。
- **Out-of-scope**：ネイティブ通知へのアクションボタン追加（スヌーズ等）＝今回はしない（ネイティブはシンプルな呼び出しのまま）。定期通知トーストの自動消滅＝しない。

## 2. 確定した設計判断（brainstorming 合意）

1. **方式＝ハイブリッド（Discord そのもの）**：ウィンドウ非表示時は OS ネイティブ通知、表示時はアプリ内トースト。
2. **表示中は OS 通知を抑制**（真の Discord 挙動。二重通知を出さない）。→ バックエンドにウィンドウ表示状態の追跡を追加。
3. **ネイティブ通知はシンプルな呼び出しのまま**（タイトル＋本文＋音、クリックで前面化）。既存 `internal/notify`（`go-toast/v2`）を変更しない。
4. **アプリ内トースト＝スタック＋手動閉じ**（自動消滅なし。期日リマインダーの見逃し防止）。右下スライドイン・複数カード縦積み。
5. **通知からの詳細表示は detailPattern に関わらず常にモーダル**（元バニラ挙動 `openDetailModal` 準拠）。
6. **`todo:focus-quick-input` は pending タブへ切替してから focus**（tray「タスク追加」で確実にクイック入力を出す）。
7. **Discord 風スタイルは新規 CSS**で作成（旧 `td-toast-*` は流用しない）。「既存 CSS 踏襲」パリティ原則からの意図的逸脱。旧クラスの削除は任意。

## 3. 現状の到達点（重要：ハイブリッドの下地は実装済み）

`app.go` / `internal/notify/toast.go` を確認した結果、**バックエンドはすでにネイティブ＋アプリ内の両チャネルを発火している**（移行を通じて無変更）：

- **OS ネイティブ通知**：`internal/notify`（`git.sr.ht/~jackmordaunt/go-toast/v2` の薄いラッパー）が Windows アクションセンター通知を実装済み。`notify.Init(iconPath, onActivated)` でアプリ登録＋クリック時 `bringToFront`、`notify.Push(title, body)` で音付き通知。Windows 以外は no-op ビルド。
- **アプリ内イベント**：`handleReminderNotify` / `handlePeriodicNotify` が `EventsEmit("todo:reminder", {todo})` / `EventsEmit("todo:periodic")` を **常に**発火。加えて `settings.*NotifyMethod.Toast` が真なら `notify.Push` も発火、`BringToFront` が真ならウィンドウ前面化。
- 従って**不足しているのは React 側のアプリ内トースト本体のみ**（Phase C 本来のスコープ）。加えて Discord 化のための「表示中はネイティブ抑制」ゲートを足す。

イベント一覧（発火元 = Go スケジューラ）：

| イベント | payload | 意味 |
|---|---|---|
| `todo:reminder` | `{ todo: Todo }` | リマインダー発火 |
| `todo:periodic` | なし | 定期通知（内容はフロントが取得して集約） |
| `todo:focus-quick-input` | なし | クイック入力へフォーカス（tray「タスク追加」／多重起動時） |
| `todo:window-hidden` | なし | ウィンドウがトレイに隠れた（`main.go` の `OnBeforeClose`→`WindowHide` 直前に発火） |

## 4. バックエンド変更（最小限）

移行方針として「バックエンド無変更」を守ってきたが、判断2（表示中はネイティブ抑制）の実現にのみ手を入れる。

### 4.1 ウィンドウ表示状態の追跡
- `App` に `windowVisible atomic.Bool` を追加（`sync/atomic`）。スケジューラ goroutine（通知発火）と UI スレッド（表示/非表示）の双方から触るため atomic。
- 更新点：
  - `startup(ctx)`：起動時はウィンドウ表示状態 → `true`。
  - `bringToFront()`：`WindowShow`/`WindowUnminimise` 後 → `true`。
  - `main.go` の `OnBeforeClose`：`wailsruntime.WindowHide(ctx)` の直前に `app.windowVisible.Store(false)`（`todo:window-hidden` を EventsEmit している箇所と同じ場所）。

### 4.2 ネイティブ通知の抑制ゲート
`handleReminderNotify` / `handlePeriodicNotify` にて、`notify.Push` 呼び出しを次の条件で抑制する（`EventsEmit` と `BringToFront` の挙動は不変）：

```go
// 「表示中（かつ非最小化）」または「これから前面化する」なら、アプリ内トーストが
// 見えるのでネイティブ通知は出さない（二重通知の抑制＝Discord 挙動）。
suppressNative := (a.windowVisible.Load() && !wailsruntime.WindowIsMinimised(a.ctx)) || method.BringToFront
if method.Toast && !suppressNative {
    notify.Push(/* リマインダー: title, t.Title / 定期: "MemoTodo リマインド", summary */)
}
```

- 純粋な判定ロジックは `shouldPushNative(visible, minimised, toastEnabled, bringToFront bool) bool` として切り出し可能（Go ユニットテスト対象・任意）。
- 設定セマンティクスは不変：`method.Toast`＝OS 通知チャネルを使う、`method.BringToFront`＝ウィンドウ前面化。

## 5. フロントエンド変更

確立パターン準拠：**副作用＝フック／サーバー状態＝TanStack Query（mutation→invalidate）／UI 状態＝Zustand／オーバーレイ＝React Portal（`DetailModal` と同様）**。

### 5.1 uiStore 追加（`state/uiStore.ts`、純 UI 状態のみ）

```ts
export type Toast =
  | { kind: 'reminder'; id: string; todo: Todo }   // id = `reminder:${todo.id}`
  | { kind: 'periodic'; id: 'periodic' }           // 単一（集約内容はコンポーネントが取得）

// 追加する state / actions
toasts: Toast[]
pushToast: (t: Toast) => void          // 同 id は置換（定期は常に単一、リマインダーは todo ごとに積む）
dismissToast: (id: string) => void
clearToastsByKind: (kind: Toast['kind']) => void
clearAllDrafts: () => void             // drafts と recurringDrafts を全消去
forceDetailModalId: number | null      // 通知経由：detailPattern に関わらず常にモーダルで開く
setForceDetailModalId: (id: number | null) => void
quickInputFocusToken: number           // インクリメントで focus 要求
requestQuickInputFocus: () => void
```

- `pushToast` は「新しいものを末尾（＝画面下・スタック手前）に、同 id は置換」。リマインダー再発火は同 todo なら置換。
- `pushToast` のリデューサ（置換／追加）と `dismissToast`／`clearToastsByKind` は純ロジック＝Vitest 対象。

### 5.2 `hooks/useAppEvents.ts`（新規）

App で一度だけ実行。`useEffect` 内で `EventsOn` 購読、cleanup で返り値（解除関数）を全て呼ぶ（HMR/再マウント時の二重購読防止）。`EventsOn(eventName, cb): () => void` は `frontend/wailsjs/runtime/runtime` から import。

- `todo:reminder`：`payload?.todo` があれば `pushToast({kind:'reminder', id:`reminder:${todo.id}`, todo})`。`queryClient.invalidateQueries` で `qk.todosAll()`（＝`['todos']` プレフィックス）と `qk.nearOrOverdue()`。
- `todo:periodic`：`pushToast({kind:'periodic', id:'periodic'})`。invalidate は `qk.nearOrOverdue()`／`qk.recurringPanel()`／`qk.recurringTasks()`。
- `todo:focus-quick-input`：`setTab('pending')` → `requestQuickInputFocus()`。
- `todo:window-hidden`：`clearToastsByKind('periodic')` ＋ `clearAllDrafts()`。

### 5.3 `components/ToastHost.tsx`（新規）

- `useUiStore` の `toasts` を購読し、React Portal（`document.body` 直下）に右下固定のスタックコンテナを描画。各カードはスライドイン。
- 種別で分岐：`reminder` → `<ReminderToast>`、`periodic` → `<PeriodicToast>`。

#### `ReminderToast`（`todo` を受け取る）
- 表示：ラベル「リマインダー」、`todo.title`、`reminder_at`（`YYYY-MM-DD HH:mm`、当日より前なら「期限切れ」強調）。
- スヌーズ行：`+30分`/`+1時間`/`明日朝9時` → `App.SnoozeReminder(todo.id, "30"|"60"|"tomorrow")`（`Promise<void>`）。try/catch のベストエフォート、結果に関わらず `dismissToast`。
- アクション：「詳細を見る」＝`dismissToast` → `setTab('pending')` → `setForceDetailModalId(todo.id)`。「閉じる」＝`dismissToast`。

#### `PeriodicToast`
- `useRecurringPanel()`（既存）＋ `useNearOrOverdue()`（**新規フック**：`App.GetNearOrOverdueMemos(): Promise<Todo[]>`、key `qk.nearOrOverdue()`）を購読。
- 集約（元バニラ `_renderPeriodicToast` 準拠。`Todo` は `is_overdue`/`is_near` を持つ）：
  - 定期・残タスク（期限切れ）＝`recurringPanel.overdue`
  - 定期・期日が近い＝`recurringPanel.current` を `status === 'pending'` で filter
  - 通常・期限切れ＝`memos.filter(t => t.is_overdue)`
  - 通常・期日が近い＝`memos.filter(t => !t.is_overdue && t.is_near)`
  - 4区分すべて空なら `null` を返す（＝何も描画しない）。
- 各項目クリック：定期項目 → `dismissToast` → `setRecurringPanelOpen(true)`。通常項目 → `dismissToast` → `setTab('pending')` → `setForceDetailModalId(t.id)`。
- 集約・分類ロジックは純関数 `buildPeriodicGroups(memos, panel)` として `lib/notify.ts`（新規）に切り出し、Vitest 対象。

### 5.4 `App.tsx` / `QuickInput.tsx`
- `App.tsx`：`useAppEvents()` を実行、`<ToastHost/>` をマウント。詳細モーダルの描画条件を拡張：現行 `detailPattern === 'modal' && openTodo` に加え、`forceDetailModalId != null` のときも `<DetailModal>` を描画（対象 todo は `todos?.find(id === forceDetailModalId)`）。モーダルを閉じたら `setForceDetailModalId(null)`。
- `QuickInput.tsx`：`quickInputFocusToken` を `useEffect` 依存にして `ref.current?.focus()`。

### 5.5 スタイル（`styles/todo.css`）
- Discord 風トーストの新規クラスを追加（例プレフィックス `td-dtoast-*`）：右下固定スタックコンテナ、ダーク角丸カード、ヘッダ（ラベル＋閉じる）、ボディ、スヌーズ行、アクション、集約グループ（スーパーグループ／グループラベル／項目行／期限切れ強調）、スライドイン `@keyframes`。
- 集約のマークアップ構造は元実装（スーパーグループ「定期タスク／通常タスク」→ グループ「〜（N件）」→ 項目行）を踏襲し、視覚のみ Discord 化。
- 旧 `td-toast-*`（旧単一オーバーレイ用・明色右上）は React 未使用。削除は任意（本 Phase では放置可）。

## 6. データフロー

```
Scheduler(Go) → handleReminder/Periodic
  ├─ [表示状態ゲート] method.Toast && !suppressNative → notify.Push（ネイティブ）
  ├─ method.BringToFront → bringToFront
  └─ EventsEmit（常時）
        → EventsOn（useAppEvents / React）
             → uiStore.pushToast + queryClient.invalidateQueries
                  → ToastHost 再描画（右下スタック）
                       → ユーザー操作（スヌーズ / 詳細 / 遷移 / 閉じる）
                            → App.SnoozeReminder / setTab / setForceDetailModalId / setRecurringPanelOpen / dismissToast
```

排他：ウィンドウ表示中はネイティブ抑制されアプリ内トーストのみ。非表示/最小化時はネイティブのみ（アプリ内 `EventsEmit` は届くが不可視。次に開いたとき残るのは許容。定期は `window-hidden` で消去済み）。

## 7. エラー処理

- `useAppEvents`：cleanup で全 `EventsOn` 解除関数を呼ぶ（二重購読防止）。
- スヌーズ：`App.SnoozeReminder` を try/catch、失敗しても `dismissToast`（元実装のベストエフォート踏襲。ブロッキングな alert は出さない）。
- `PeriodicToast`：クエリ失敗（`isError`）時は `null`（元実装は fetch 失敗で非表示）。
- ネイティブ通知：`notify.Push` は既存どおり失敗してもログのみ（アプリ動作継続）。
- 表示状態フラグ：`atomic.Bool` で競合回避。

## 8. テスト

- **Vitest（純ロジック）**：
  - `buildPeriodicGroups(memos, panel)` の4区分分類（overdue/near/pending filter、全空判定）。
  - uiStore トーストリデューサ（`pushToast` の同 id 置換／追加順、`dismissToast`、`clearToastsByKind`）。
- **Go（任意）**：`shouldPushNative(...)` の真理値表。
- **GUI 目視（ユーザーゲート）**：スライドイン・スタック・スヌーズ・詳細遷移・定期項目遷移・**ウィンドウ非表示時にネイティブ通知が出て表示時は出ない**こと・`window-hidden` でのドラフト消去。
- 自動ゲート：`npm --prefix frontend run build`（tsc+vite、未使用 import 禁止）＋ `npm --prefix frontend run test`。フェーズ末に `wails build`（PATH 前置）で埋め込み確認。

## 9. 影響ファイル

- **新規**：`frontend/src/hooks/useAppEvents.ts`、`frontend/src/components/ToastHost.tsx`、`frontend/src/components/ReminderToast.tsx`、`frontend/src/components/PeriodicToast.tsx`、`frontend/src/lib/notify.ts`（純関数＋型）、`frontend/src/hooks/useNearOrOverdue.ts`、対応する `*.test.ts`。
- **変更**：`frontend/src/state/uiStore.ts`、`frontend/src/App.tsx`、`frontend/src/components/QuickInput.tsx`、`frontend/src/styles/todo.css`、`app.go`、`main.go`。
- **無変更**：`internal/notify/*`、`internal/todo/*`、`frontend/wailsjs/*`（Wails 自動再生成）。

## 10. 完了の定義

- ウィンドウ非表示/最小化時は OS ネイティブ通知が出る（音付き・クリックで前面化）。**表示中はネイティブが出ず**アプリ内トーストのみ。
- アプリ内トーストが右下にスライドインしてスタックし、手動で閉じるまで残る（自動消滅しない）。
- リマインダートースト：スヌーズ3種が効く、「詳細を見る」で pending＋常にモーダルで該当詳細が開く。
- 定期通知トースト：4区分が正しく集約表示され、項目クリックで定期パネル／該当メモ詳細へ遷移。
- `todo:focus-quick-input` で pending＋クイック入力にフォーカス。`todo:window-hidden` で定期トーストとドラフトが消える。
- `npm run build`＋`npm run test` green、`wails build` で exe 生成、GUI 目視（ユーザー）OK。
