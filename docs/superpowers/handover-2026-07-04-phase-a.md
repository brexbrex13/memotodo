# ハンドオーバー：MemoTodo React移行 Phase A（定期タスクパネル）

> 目的：コンテキストをクリアした後の新セッションが、`develop` 起点で Phase A を迷わず再開できるようにする自己完結ドキュメント。

## 0. まず最初にやること（再開手順）

1. ブランチを確認：`git -C D:/Project/indie/memotodo branch --show-current` が `develop`（現在 `54dfe5d`）であること。`git status --short` がクリーンであること。
2. 読む順：この文書 →（全体設計）`docs/superpowers/specs/2026-07-03-react-migration-design.md` →（確立済みパターンの見本）`docs/superpowers/plans/2026-07-03-react-migration-prototype.md`。
3. Phase 0 のタスク履歴は `.superpowers/sdd/progress.md`（git-ignore のスクラッチ、ディスクには残る）に全記録あり。
4. Phase A は「新機能実装」なので **superpowers:brainstorming（必要なら）→ superpowers:writing-plans → superpowers:subagent-driven-development** の流れで進める。

## 1. プロジェクト現状スナップショット

- **アプリ**：Wails v2（Goバックエンド＋Web フロント）の Windows 常駐デスクトップ。メモ管理＋定期タスク。
- **移行状況**：フロントを「バンドラーなし素JS」から **React 18 + Vite 5 + TypeScript** へ移行中。
  - **Phase 0（プロトタイプ）完了・`develop` に統合済み**（マージ `f5de380`）。メモ一覧／クイック追加／行アクション／詳細（インライン＋モーダル・ドラフト）／TipTap リッチテキスト（画像貼付）／dnd-kit 並び替え／設定モーダル。4ゲート全PASS、Vitest 11/11。
  - **Go バックエンド（`app.go`）と `frontend/wailsjs/` バインディングは移行を通じて無変更。** Wails が `wails dev`/`wails build` 時に自動再生成する。
- **リモート構成（fork ワークフロー）**：
  - `origin` = **`totono/memotodo`**（自分の fork。develop など作業ブランチの push 先）
  - `upstream` = `brexbrex13/memotodo`（元の友人リポジトリ＝他人。参照元）
  - gh は **`totono`（個人アカウント）** で認証済み（`acorns-shiraki` は仕事用で非アクティブ）。
- **ブランチ構成**：
  - `main`（`49efc5c` = upstream/main と同一）= 現行バニラアプリの基点。**移行中はここで新規開発しない**。**旧 `frontend/src/todo.js` と旧 `frontend/index.html` が残っており、定期タスクの元実装の参照元**（`git show main:frontend/src/todo.js` 等、後述）。
  - `develop`（origin=totono に push 済み）= 移行統合ブランチ。**Phase A〜D はここを起点、push 先も `origin`(totono)**。
  - `feat/react-migration` = **削除済み**（develop に完全マージ済みだった）。
  - `fix/duplicate-rows-and-dev-startup`（`67f1f65`）= 二重表示バグ修正＋dev起動修正。ローカル＋`origin`(totono) にあり。**brexbrex13 への PR は保留**（totono の gh トークンで他人 public リポジトリへの PR 作成が 403/404、Web 比較も fork 直後の伝播で不安定だったため）。友人のバニラアプリに還元したくなったら後日 collaborator 追加 or Web から PR。**develop には無関係**（todo.js 削除済み）。

## 2. 開発環境の要点

- `go` / `wails` は `C:\Program Files\Go\bin` と `%USERPROFILE%\go\bin` にあるが、**Bashツールの PATH には通っていない**。wails コマンドを回すときは `export PATH="/c/Program Files/Go/bin:$HOME/go/bin:$PATH"` を前置。
- `node`/`npm` は Bash から使える。`opencode`（Kimi）も使える。
- `wails dev`（Vite 開発ループ）は動作確認済み。`wails build -platform windows/amd64` → `build/bin/memotodo.exe`。
- **検証分担**：サブエージェントは `npm run build`（tsc+vite）と `npm run test`（Vitest）まで（ヘッドレス）。**GUI目視（パネル開閉・ドラッグ等）はユーザー**。コントローラが `wails build`（PATH前置）で埋め込みビルドを確認。
- **作業後の掃除**：`git checkout -- go.mod frontend/wailsjs`（LF/CRLF 再生成ノイズを破棄）、稀に出る `rm -f ./nul`。`.gitignore` は node_modules/dist/.vite/*.syso/package.json.md5 をカバー済み。

## 3. 従うべきアーキテクチャ／規約（Phase 0 で確立）

- **サーバー状態＝TanStack Query**。クエリキーは `frontend/src/api/queryKeys.ts` の `qk` ファクトリに追加（例：`recurringPanel: () => ['recurringPanel']`, `recurringTasks: () => ['recurringTasks']`, `recurringTask: (id) => ['recurringTask', id]`）。更新は必ず **mutation → `invalidateQueries`**（命令的な手動リフェッチ禁止＝これが元バグの温床）。プレフィックス無効化は `qk.todosAll()` の要領。
- **UI状態＝Zustand** `frontend/src/state/uiStore.ts`。定期パネル用の UI 状態をここに追加（例：`recurringPanelOpen`, `recurringOpenId`, 定期用ドラフト `recurringDrafts`）。純UI状態のみ。
- **API**：`frontend/src/api/client.ts` が `App` と型を再エクスポート。**定期タスクのバインディングは既にある**：
  - `App.GetRecurringPanel(): Promise<todo.RecurringPanelData>`（`{ overdue: RecurringTask[]; current: RecurringTask[]; badge: {current:number; overdue:number} }`）
  - `App.GetRecurringTasks(): Promise<todo.RecurringTask[]>`
  - `App.GetRecurringTask(id: number): Promise<todo.RecurringTask>`
  - `App.CreateRecurringTask(req: main.CreateRecurringTaskRequest): Promise<number>`（req: `{ title; period_type; period_value; memo }`）
  - `App.UpdateRecurringTask(id: number, req: main.UpdateRecurringTaskRequest): Promise<void>`（req: `{ title?; memo?; period_type?; period_value?; is_active? }`）
  - `App.DeleteRecurringTask(id: number): Promise<void>`
  - `App.ToggleRecurringTask(id: number): Promise<void>`
  - 型 `todo.RecurringTask`: `{ id; title; memo; period_type; period_value; current_deadline; status; done_at; is_active; created_at; freq?; is_overdue? }`
- **コンポーネント**は `frontend/src/components/`。再利用する型・パターン：
  - `TodoDetail`（インライン＋モーダルを detailPattern で切替、Portal は `DetailModal`）＝定期の詳細フォームも同じ作りにする。
  - `RichTextEditor`（value/onChange は HTML、汎用）＝定期メモにそのまま使える。**onChange は内部で ref 経由（stale closure でドラフトを潰さないための既知の修正）。触らず流用。**
  - ドラフト制御パターン（store の drafts をマージして制御コンポーネント化、保存/削除で clear）。**未保存編集の保持は意図した仕様**（明示的な「変更を破棄」で消す）。
- **CSS**：`frontend/src/styles/todo.css` に定期パネルのクラスが既にある（`td-recurring-tab`, `td-recurring-tab-label`, `td-recurring-tab-badges`, `td-badge-dot`, `td-badge-yellow`, `td-badge-red`, `td-recurring-overlay`, `td-recurring-panel`, `td-recurring-panel-header`, `td-recurring-panel-body`, `td-recurring-row-wrap`, `td-recurring-detail-inline`, `td-recurring-overdue-block`, `td-separator` 等）。**新規クラスを作らず既存を踏襲**（見た目維持）。
- **メモは HTML 文字列**。リンク検出はバックエンド責務。`SaveSettings`/`Save*` はバックエンドがマージ（nil=保持）なので、編集しないフィールドを `{}` で送って消さない。

## 4. Phase A のスコープ（設計 §9 より）

定期タスクのスライドオーバーパネルと CRUD。**通知設定モーダル（定期の何日前通知＝recurring_display_days）は Phase B なので含めない。** 通知トースト/EventsOn は Phase C。

- **縦タブトリガー**（`td-recurring-tab`）＋赤/黄バッジ（`GetRecurringPanel().badge` の overdue=赤・current=黄）。
- **スライドオーバーパネル**：3セクション ―「残タスク（前回未完了＝overdue）」「期日が近い定期タスク（current）」「すべての定期タスク（`GetRecurringTasks()`）」。パネル開閉（タブクリック／オーバーレイ／閉じるボタン）。
- **定期タスク行**：タイトル、周期表示、`current_deadline`、完了トグル（`ToggleRecurringTask`）、詳細展開。
- **定期詳細フォーム（インライン＋モーダル、`TodoDetail` を踏襲）**：タイトル、周期種別（週次/月次/年次＝period_type）＋period_value、メモ（`RichTextEditor`）、保存（`CreateRecurringTask`/`UpdateRecurringTask`）、削除（`DeleteRecurringTask`）。追加ボタン（新規）、ドラフト保持。定期詳細も detailPattern（inline/modal）に従う（元アプリ準拠）。
- **クエリ無効化**：定期の各 mutation は `['recurringPanel']` と `['recurringTasks']`（該当なら `['recurringTask', id]`）を invalidate。バッジ件数は `recurringPanel` から導出。

## 5. 元実装（バニラ）の参照方法

定期パネルの正確な挙動・マークアップは **`main` ブランチに残る旧実装**を参照：
- マークアップ：`git show main:frontend/index.html`（定期パネル部）
- ロジック：`git show main:frontend/src/todo.js`（`renderRecurringPanel`, `_buildRecurringRow`, `_recurringDetailFormHtml`, `_wireRecurringDetailForm`, `openRecurringDetail`/`closeRecurringDetail` 等）
- CSS：`frontend/src/styles/todo.css`（develop に既にある。定期系クラス確認用）

## 6. プロセス（SDD × Kimi）

- **CLAUDE.md 方針**：実装・レビューのサブエージェントは **opencode 経由の Kimi K2.7** を第一候補に委譲：
  ```bash
  opencode run "$(cat <dispatch-file>)" -m kimi-for-coding/k2p7 --dangerously-skip-permissions --dir "D:/Project/indie/memotodo" </dev/null
  ```
  （Bashツール、`</dev/null` 必須。npm install 等で長い場合は `run_in_background: true`＋長め timeout。）失敗（非ゼロ終了/レート制限/認証等）時のみ `Agent`（claude/Sonnet）へフォールバックし、その旨を1行報告。
- **フロー**：Phase A の scope を brainstorm で詰める（必要なら）→ `docs/superpowers/plans/2026-07-04-phase-a-recurring.md` に writing-plans で計画 → subagent-driven-development（タスクごとに Kimi 実装者→レビュー用パッケージ生成→Kimi レビュアー→コントローラ査定→修正）。
- **レビュー査定の教訓**：レビュアーの誤検出に注意（例：lockfile/.gitignore 削除提案、意図的なドラフト保持を「リーク」と誤指摘、`qk.todos()` を引数なしで使う誤提案）。プランやオリジナル挙動と矛盾する指摘はコントローラが査定（盲目適用しない）。
- **SDD スクリプト**：`C:\Users\thisi\.claude\plugins\cache\claude-plugins-official\superpowers\6.1.1\skills\subagent-driven-development\scripts`（`task-brief`, `review-package`, `sdd-workspace`）。
- 各タスクは `npm run build`＋（該当すれば）`npm run test` を通し、GUIゲートはユーザーに依頼。フェーズ末に `wails build` で埋め込み確認。

## 7. コミット規約

- ブランチは `develop` 起点。実作業はさらに feature ブランチを切ってもよい（好みで。Phase 0 は develop 直下で進めた）。
- 各コミットメッセージ末尾に、**その時のセッションが提供する** `Co-Authored-By:` と `Claude-Session:` トレーラを付ける（ハーネスがセッションごとに正しい URL を注入する。この文書の値をハードコードしない）。

## 8. バグ修正ブランチ／PR の状況

- `feat/react-migration` は **削除済み**（develop に統合済み）。
- `fix/duplicate-rows-and-dev-startup`：二重表示バグ＋dev起動の修正。ローカル＋`origin`(totono) に push 済み。**brexbrex13 への PR 作成は断念**（totono トークンで他人 public repo への PR が 403/404）。当面は fork 側に温存。友人リポジトリへ還元したくなったら：`brexbrex13` が `totono` を collaborator に追加 → Web/CLI で PR、が確実。
- develop（React 版）にはこの修正は不要（todo.js を削除済みのため無関係）。

## 9. 完了の定義（Phase A）

- 定期パネルが開閉でき、3セクションが正しく表示、バッジが正しい。
- 定期タスクの追加/編集/削除/完了トグルが動き、mutation→invalidate で即反映。
- 詳細フォームがインライン/モーダル両対応、ドラフト保持、リッチテキスト動作。
- `npm run build`＋`npm run test` green、`wails build` で exe 生成、GUI目視（ユーザー）OK。
- 見た目が現行と一致（既存 CSS クラス踏襲）。
