# ハンドオーバー：MemoTodo React移行 Phase C（通知トースト＋EventsOn）

> 目的：Phase A 完了後、`develop` 起点で次フェーズを迷わず再開できるようにする自己完結ドキュメント。
> 前フェーズの記録は `docs/superpowers/handover-2026-07-04-phase-a.md`（Phase A 着手時）と本書。

## 0. まず最初にやること（再開手順）

1. ブランチ確認：`git -C D:/Project/indie/memotodo branch --show-current` が `develop`（現在 `4229ce8`、origin=totono に push 済み）。`git status --short` がクリーン。
2. 読む順：本書 →（全体設計）`docs/superpowers/specs/2026-07-03-react-migration-design.md`（§5.3 イベント、§6 ToastHost）→（Phase A の確立パターン）`docs/superpowers/plans/2026-07-04-phase-a-recurring.md` →（Phase 0 見本）`docs/superpowers/plans/2026-07-03-react-migration-prototype.md`。
3. タスク履歴は `.superpowers/sdd/progress.md`（git-ignore のスクラッチ、ディスクに残る）に Phase 0/A 全記録あり。
4. 新機能実装なので **superpowers:brainstorming（必要なら）→ writing-plans → subagent-driven-development** の流れ。実装/レビューは **CLAUDE.md 方針で opencode 経由 Kimi K2.7 を第一候補**に委譲（失敗時のみ Sonnet フォールバック）。

## 1. フェーズ状況の整理（重要）

設計 §9 の当初のフェーズ分けと実際の完了状況にズレがあるので注意：

- **Phase 0（プロトタイプ）✅ 完了**（develop に統合済み、マージ `f5de380`）。メモ一覧/追加/行アクション/詳細(inline+modal)/TipTap/dnd-kit/設定モーダル。
- **Phase A（定期タスクパネル）✅ 完了**（本セッション、commits `92616c6`..`4229ce8`）。縦タブ+バッジ、スライドパネル3セクション、行3variant、詳細フォーム(inline+modal,プレーンtextareaメモ)、CRUD/完了トグル/一時停止、**通知設定モーダル(recurring_display_days)**。自動ゲート(Vitest22/22, npm build, wails build exe)全PASS。
- **Phase B（各モーダル：設定・定期通知設定）＝実質完了**。当初 Phase B スコープだった 2 モーダルは既に存在：
  - `SettingsModal`（表示方式/通知時刻/期日何日前/通知方式）＝Phase 0 の Task S（commit `33cbc42`）で実装済み。
  - `RecurringNotifyModal`（recurring_display_days）＝Phase A（commit `d77d3ac`）で実装済み。
  - → **Phase B として新規にやることは基本的に無い**。
- **Phase C（通知トースト＋EventsOn）＝これが次の実質作業。未着手。** ← 本書の主題。
- **Phase D（仕上げ）＝一部のみ残**。旧 `todo.js`/旧 `index.html` は Phase 0 で削除済み、CDN 撤去も Phase 0 済み。残りは主に **README 更新（開発に npm 必須）** と最終 wails build 確認、任意の純ロジックテスト拡充。

## 2. プロジェクト現状スナップショット

- **アプリ**：Wails v2（Goバックエンド＋Webフロント）の Windows 常駐デスクトップ。メモ管理＋定期タスク＋通知。
- **フロント**：React 18 + Vite 5 + TypeScript。サーバー状態=TanStack Query、UI状態=Zustand(`state/uiStore.ts`)。
- **Go バックエンド（`app.go`）と `frontend/wailsjs/` は移行を通じて無変更。** Wails が `wails dev`/`wails build` 時に自動再生成する。
- **リモート（fork ワークフロー）**：`origin`=`totono/memotodo`（自分の fork。develop の push 先）／`upstream`=`brexbrex13/memotodo`（友人＝参照元）。gh は `totono` で認証。
- **ブランチ**：`develop`（`4229ce8`、origin=totono に push 済み）＝移行統合ブランチ。Phase C もここ起点、push 先 origin(totono)。`main`＝現行バニラ（旧 `todo.js`/`index.html` の参照元）。

## 3. Phase C のスコープ（設計 §5.3 / §6）

バックエンドイベント（`EventsOn`）を購読して通知トーストを出す。トースト UI は Zustand 駆動、関連クエリを invalidate。

### 3.1 EventsOn イベント（オリジナル `main:frontend/src/todo.js` L1465付近 `_initNotifications` 参照）
- `todo:reminder`（payload=todo）→ リマインダートースト。スヌーズ（`App.SnoozeReminder(id, "30"|"60"|"tomorrow")`）、「詳細を見る」で pending タブへ切替＋該当詳細を開く。
- `todo:periodic`（引数なし）→ 定期通知トースト（集約表示：定期の overdue/near ＋ 通常タスクの overdue/near）。`App.GetRecurringPanel()` と `App.GetNearOrOverdueMemos()` を併用。各項目クリックで定期パネルを開く／pending タブへ切替。
- `todo:focus-quick-input` → クイック入力へフォーカス。
- `todo:window-hidden` → 定期トーストを閉じる。**加えて Phase 0/A で繰越した「ウィンドウ非表示でドラフト全消去」もここで対応**（uiStore の `drafts` と `recurringDrafts` を全 clear）。

### 3.2 バインディング（既存・変更禁止）
- `App.GetNearOrOverdueMemos(): Promise<todo.Todo[]>`（`frontend/wailsjs/go/main/App.d.ts`）
- `App.SnoozeReminder(id: number, kind: string): Promise<void>`（kind: `"30"`/`"60"`/`"tomorrow"`）
- `EventsOn(eventName, callback): () => void`（`frontend/wailsjs/runtime/runtime.js`）。返り値は購読解除関数。
- `App.GetRecurringPanel()`（Phase A で query 化済み＝`useRecurringPanel`）。

### 3.3 実装方針（Phase 0/A の確立パターンに準拠）
- **`events.ts`（新規）または `useAppEvents` フック**：`useEffect` で `EventsOn(...)` を購読し、cleanup で購読解除。トースト表示は uiStore、関連クエリは `queryClient.invalidateQueries`。
- **uiStore に toast 状態を追加**：例 `toast: { kind: 'reminder'|'periodic', ... } | null` と setter。純 UI 状態のみ。
- **`ToastHost` コンポーネント（新規）**：uiStore.toast 駆動で `ReminderToast`/`PeriodicToast` を描画（React Portal 可）。**自動消滅なし＝現行踏襲**（オリジナルは periodic に自動タイマーあり／reminder は手動閉じ。要確認：`_showToast` の `_toastTimer`）。
- **クエリ無効化**：リマインダー発火 → `['todos']`・`['nearOrOverdue']`（必要なら該当 `['todo', id]`）。定期通知 → `['recurringPanel']`・`['recurringTasks']`。
- **CSS**：トースト系クラスは `frontend/src/styles/todo.css` に実在（`td-toast`, `td-toast-header`, `td-toast-body`, `td-toast-actions`, `td-toast-close`, `td-toast-group`, `td-toast-group-label`, `td-toast-group-list`, `td-toast-in`, `td-btn-snooze`, `td-toast-snooze-row`/`-label` 等）。**新規クラスを作らず踏襲**。
- **元実装参照**：`git show main:frontend/src/todo.js` の `#region 通知トースト`（L1268〜）＝`_showToast`/`_closeToast`/`_renderReminderToast`/`_renderPeriodicToast`/`_toastItemRow`/`_toastGroupBlock`/`_initNotifications`。マークアップと集約ロジックはここに忠実に。

## 4. 従うべき確立パターン（Phase 0/A で確立）

- **サーバー状態=TanStack Query**、更新は必ず **mutation → `invalidateQueries`**（命令的リフェッチ禁止）。クエリキーは `frontend/src/api/queryKeys.ts` の `qk` に追加（`qk.nearOrOverdue()` は既存）。プレフィックス無効化は `qk.todosAll()` 要領。
- **UI状態=Zustand** `frontend/src/state/uiStore.ts`。トースト状態はここへ。
- **mutation フックに `onError` あり**（Phase A parity pass `4229ce8` で `useTodoMutations`/`useRecurringMutations` 両方に `alert((e as Error)?.message || '操作に失敗しました')` を付与済み）。新規 mutation も同様に。
- **インライン詳細のアウトサイドクリック閉じ**＝`frontend/src/hooks/useInlineDetailOutsideClose.ts`（parity pass で新設、App で実行、mousedown-arm+click, inline時のみ, ドラフト保持）。
- **API ラッパ**：`frontend/src/api/client.ts` が `App`/`todo`/`main` と型を再エクスポート（`RecurringTask`/`RecurringPanelData` 追加済み）。
- **メモは HTML 文字列**（通常タスク。定期メモはプレーンテキスト）。リンク検出はバックエンド責務。`SaveSettings`/`Save*` はマージ（nil=保持）なので編集しないフィールドは送らない。

## 5. 繰越事項（Phase A レビューで査定・据置＝Phase C/D で対応検討）

- **ウィンドウ非表示でドラフト全消去**（`todo:window-hidden`）＝Phase C の EventsOn で対応（§3.1）。オリジナルは switchTab でも開いている詳細のドラフトを capture（React は onChange で常時 store 反映のため capture 不要、tab 切替時の全消去要否は要確認）。
- **`scrollIntoView`（開いた行/新規フォームへ smooth スクロール）**＝オリジナルは `openRecurringDetail` inline で実施。React 未実装（Minor・視覚影響小）。
- **二重モーダル排他ガード**＝Todo 詳細モーダルと定期詳細モーダルが同時描画されうる（オリジナルは `_activeModalKind` で1つに制限）。実用上はオーバーレイで遮られ発生しにくい（Minor）。
- いずれも `.superpowers/sdd/progress.md` の Phase A 節に記録済み。

## 6. Phase D（仕上げ）で残っていること

- **README 更新**：開発に Node.js/npm 必須である旨（設計 §3）。現状の README を確認して追記。
- 純ロジックの Vitest 拡充（任意）。現状 `format.test.ts`(11) ＋ `recurring.test.ts`(11)=22。
- 最終 `wails build` で埋め込み確認（Phase A 時点で PASS 済み）。
- （済）旧 `frontend/src/todo.js`・旧 `index.html` 削除、CDN 撤去（Phase 0 で完了）。

## 7. 開発環境・検証・プロセス

- `go`/`wails` は `C:\Program Files\Go\bin` と `%USERPROFILE%\go\bin`。**Bashツールの PATH に無い**ので wails 実行時は `export PATH="/c/Program Files/Go/bin:$HOME/go/bin:$PATH"` を前置。
- `node`/`npm` は Bash から使用可。テスト/ビルドは `npm --prefix frontend run test` / `npm --prefix frontend run build`（tsc+vite）。`tsconfig` は `noUnusedLocals`/`noUnusedParameters: true`＝未使用 import 禁止。
- **検証分担**：サブエージェント（Kimi）は `npm run build`＋`npm run test` まで（ヘッドレス）。**GUI 目視（トースト表示・スヌーズ・遷移等）はユーザー**。コントローラがフェーズ末に `wails build`（PATH 前置）で埋め込み確認。
- **作業後の掃除**：`wails build` は `go.mod`/`frontend/wailsjs` に LF/CRLF 再生成ノイズを出す（`git diff` が空＝内容変化なし）。`git checkout -- go.mod frontend/wailsjs` で破棄。稀に出る `./nul` は `rm -f ./nul`。
- **SDD × Kimi**：実装/レビューのディスパッチは `opencode run "$(cat <dispatch-file>)" -m kimi-for-coding/k2p7 --dangerously-skip-permissions --dir "D:/Project/indie/memotodo" </dev/null`（Bashツール、`</dev/null` 必須）。SDD スクリプト＝`C:\Users\thisi\.claude\plugins\cache\claude-plugins-official\superpowers\6.1.1\skills\subagent-driven-development\scripts`（`task-brief`/`review-package`/`sdd-workspace`）。
- **レビュー査定の教訓**：レビュアーの誤検出に注意（意図的ドラフト保持を「リーク」と誤指摘、現行バニラ踏襲の挙動を「バグ」扱い、既存 SettingsModal パターンへの過剰な型指摘など）。プランやオリジナル挙動と矛盾する指摘はコントローラが査定（盲目適用しない）。

## 8. コミット規約

- ブランチは `develop` 起点、push 先 `origin`(totono)。
- 各コミットメッセージ末尾に、その時のセッションが提供する `Co-Authored-By:` と `Claude-Session:` トレーラを付ける（ハーネスが注入。本書の値をハードコードしない）。サブエージェント（Kimi）コミットはトレーラ無しでよい（Phase 0/A も同様）。

## 9. Phase A 完了サマリ（参考）

- commits: `92616c6`(純ロジック) `581af1d`(データ層) `feb204c`(タブ+パネル+行) `7d31f03`(詳細inline) `3535d6b`(詳細modal) `d77d3ac`(通知設定モーダル) `4229ce8`(parity: onError+外クリック閉じ, todo+定期)。
- 全タスクレビュー ✅、whole-branch レビュー "With fixes" → parity pass 適用 → 再レビュー ✅。
- 自動ゲート：Vitest 22/22、`npm run build`、`wails build`→`build/bin/memotodo.exe` 全 PASS。
- **GUI 目視ゲートはユーザー実施**（本書作成時点で push 済み。GUI で問題が出たら develop 上で追修正）。
