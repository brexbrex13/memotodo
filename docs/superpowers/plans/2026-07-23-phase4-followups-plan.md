# Phase 4: 運用で見つかった気づきへの対応 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**背景:** PR #11（`docs/superpowers/specs/2026-07-23-category-organization-design.md` の Phase 1〜3 実装）をマージし、実機で操作した結果、いくつかのバグと使い勝手上の改善点が見つかった。design spec の Phase 4 は元々「任意・将来検討」として仕様未確定だったが、今回はその枠を実際の気づき対応に充てる。**本ドキュメントは実装計画のみであり、コード変更はこのセッションでは行わない**（実装は別セッション）。

**対象コミット:** `main`（PR #11 マージ後、`367b93d` 相当 + マージコミット `6c35d70`）。

---

## Global Constraints

- 各タスクごとに `cd frontend && npx tsc --noEmit && npx vitest run` と `go build ./... && go vet ./... && go test ./...` を green にすること。
- この環境（実装予定セッション含む）は GUI を表示できないため、D&D の見た目やスクロール挙動は **コードレビューでの整合性確認＋ユーザーの実機確認** に頼る。実装セッションは「実機確認をお願いします」と明記すること。
- 既存の設計原則を踏襲: サーバー状態は TanStack Query（mutation → invalidateQueries）、純 UI 状態は zustand、見た目は `todo.css` の既存クラス体系に合わせる。

---

## Task 1: 期日ありタスクの並び順バグを修正

### 現象
ユーザー環境で「期日順に並んでいないように見える」。

### 根本原因（コード確認済み）
`internal/todo/todo.go` の `GetTodos`:
```sql
ORDER BY (deadline IS NOT NULL), sort_order ASC, deadline ASC, created_at ASC
```
`sort_order` が `deadline` より先に比較されている。さらに `CreateTodo`（同ファイル）は
**期日の有無に関わらず** 常に `MIN(sort_order) - 1` を新規タスクに割り当てる
（期日なしタスクを常に先頭に出すための実装だが、期日ありタスクにも同じ値が付与されてしまう）。

結果として、期日ありタスク同士の並びは実質「作成順（新しいほど sort_order が小さい）」で決まり、
`deadline ASC` は `sort_order` が完全に一致した場合の tie-break にしかならない
（ほぼ発生しない）。フロントエンド（`TodoList.tsx`）はこの並び順をそのまま信頼して
`filter` しているだけなので、バックエンドのバグがそのまま表示に出る。

### 対応方針
- `GetTodos` の `ORDER BY` を「期日なし＝sort_order昇順」「期日あり＝deadline昇順→created_at昇順」に
  正しく分離する。実装案：
  ```sql
  ORDER BY
    (deadline IS NOT NULL),
    CASE WHEN deadline IS NULL THEN sort_order END ASC,
    deadline ASC,
    created_at ASC
  ```
  （期日ありグループでは `CASE` が `NULL` になり `ORDER BY NULL` は影響しないため、
  実質 `deadline ASC, created_at ASC` だけで決まる）
- `CreateTodo` の `sort_order` 採番自体は変更不要（期日なしタスクの手動並び替え用の値としては
  従来通り機能している。表示順の問題はSQLの比較優先順位側にあった）。
- 変更は `internal/todo/todo.go` の1メソッドのみ。フロントエンドの変更は不要
  （既存の「バックエンドの整列済み順序を信頼して filter する」設計はそのまま活かせる）。

### 検証
- `internal/todo/todo_test.go`（新規）で、期日なし2件＋期日あり3件（意図的に作成順と
  deadline の順序をズラす）を投入し `GetTodos("pending")` の返り値順序を検証する
  テストを追加する。

- [ ] `GetTodos` の ORDER BY を修正
- [ ] 並び順を検証する Go テストを追加
- [ ] `go test ./...` green

---

## Task 2: D&D中のドラッグ要素のz-index問題を修正

### 現象
「D&Dの機能は正しく動作するが、視覚的に正しく描画されていない」＝ドラッグ中の行が
スティッキーヘッダー等の後ろに隠れて見える。

### 根本原因（コード確認済み）
- `frontend/src/styles/todo.css` の `.td-category-section .td-category-header` に
  `position: sticky; z-index: 5;` を設定済み（Phase2で追加）。
- 一方、`frontend/src/components/TodoRow.tsx`（`SortableTodoRow`/`DraggableTodoRow`）は
  dnd-kit の `transform` をインラインstyleに適用しているだけで、**ドラッグ中の要素に
  z-index の引き上げを行っていない**。そのため、ドラッグ中の行がスティッキーヘッダー
  （z-index:5）や他のカードの下を通過する際に視覚的に隠れる。
- dnd-kit の標準的な解決策は `@dnd-kit/core` の `<DragOverlay>` を使い、ドラッグ中の
  見た目を「元のDOMツリーの外」に `position: fixed` のポータル的レイヤーとして描画すること
  （ページ内の他要素のスタッキングコンテキストの影響を受けない）。

### 対応方針
- `frontend/src/components/TodoWorkspace.tsx` の `<DndContext>` に `<DragOverlay>` を追加し、
  ドラッグ中の `active` な todo を `TodoRow`（非ドラッグ版のプレーン表示）として描画する。
  - `onDragStart` で `activeId` を state に保持し、`DragOverlay` 内でその id に対応する
    todo を `useTodos('pending')` のキャッシュから探して表示する。
  - `DragOverlay` は高い `z-index`（例: 400。既存の `.td-toast`(500) より下、
    `.td-modal`(200番台) より上）を持つラッパー要素でくるむ新規CSSクラス
    （例 `.td-drag-overlay`）を追加する。
  - ドラッグ中の元の行は dnd-kit の標準機能（`useSortable`/`useDraggable` の
    `isDragging` フラグ）で半透明化する（`opacity: .4` 程度）ことで、
    「元の位置」と「DragOverlayでの見た目」が二重に見えないようにする。
- 影響範囲: `TodoWorkspace.tsx`、`TodoRow.tsx`（`isDragging` を受け取って半透明化）、`todo.css`。

### 検証
- コードレビューでスタッキングの整合性を確認（DragOverlayがtoast/tooltip等より下、
  通常コンテンツより上であること）。
- **実機でのD&D目視確認をユーザーに依頼する**（この環境ではGUI確認不可のため）。

- [ ] `DragOverlay` を導入し、ドラッグ中の行をポータルレイヤーで描画
- [ ] 元の行を `isDragging` 時に半透明化
- [ ] `.td-drag-overlay` の z-index を既存レイヤーと整合させる
- [ ] `npx tsc --noEmit && npx vitest run` green
- [ ] 実機確認をユーザーに依頼

---

## Task 3: カテゴリは0件でも「すべて」表示にセクションを出す

### 現象
「カテゴリは0件でも表示されるようにしてください（D&Dで簡単に動かせるように）」。

### 根本原因（コード確認済み）
`frontend/src/components/TodoList.tsx` の「すべて」表示（`categoryFilter === 'all'`）で:
```tsx
{(categories ?? []).map((c) => {
  const tasks = list.filter((t) => matchesGroup(t, c.id))
  if (tasks.length === 0) return null   // ← 0件のカテゴリはセクション自体が消える
  return <CategorySection key={c.id} groupKey={c.id} tasks={tasks} category={c} />
})}
```
0件のカテゴリはセクション（＝D&Dのドロップ先）自体が描画されないため、「すべて」表示から
そのカテゴリへドラッグで仕分けることができない（フィルタチップへのドロップは可能だが、
「すべて」表示内で完結できない）。

### 対応方針
- `if (tasks.length === 0) return null` のガードを削除し、0件でも `CategorySection` を
  常に描画する。
- `CategorySection` 内の空状態表示: 0件のときは `td-list` の代わりに
  「タスクをここにドラッグ」のような軽いプレースホルダ（例 `td-category-empty-hint`）を
  出すと、ドロップ先であることが視覚的にわかりやすい（必須ではないが推奨）。
- 折りたたみ状態（`collapsed_categories`）には影響しない（既存のトグルロジックをそのまま使う）。

### 検証
- `npx vitest run`（既存の `categoryGroups.test.ts` 等に影響がないことを確認。
  新規ロジックテストは不要 — 純粋な表示条件の変更のため）。
- 実機で「タスクが0件のカテゴリにD&Dで登録できるか」を確認してもらう。

- [ ] `TodoList.tsx` の0件フィルタを削除
- [ ] （任意）空カテゴリ用のドロップ先ヒント表示を追加
- [ ] `npx tsc --noEmit && npx vitest run` green

---

## Task 4: 詳細画面のカテゴリ選択欄を「詳細メモ」より下へ移動

### 現象
「カテゴリ設定は詳細メモよりも下にしてください（基本的にカテゴリはD&Dでの設定をメインにしたい）」。

### 現状（コード確認済み）
`frontend/src/components/TodoDetail.tsx` では、カテゴリの `<select>` が `td-detail-grid`
（期日・リマインダーと同じグリッド、詳細メモより **上**）に配置されている。

### 対応方針
- カテゴリ選択欄を `td-detail-grid`（期日・リマインダー）から外し、「詳細メモ」
  （`RichTextEditor`/`DetectedLinks`）ブロックの **下** に、独立した `td-field` として配置する。
  D&Dが主動線であることを踏まえ、視覚的な優先度も下げる（見出しを補助的なトーンにする等は任意）。
- `td-detail-grid` は期日・リマインダーの2項目に戻る（`gridColumn: '1 / -1'` の
  インラインstyle調整も、リマインダーを2カラムに戻すか現状維持するか実装時に判断）。

### 検証
- `npx tsc --noEmit && npx vitest run`
- 実機でインライン/モーダル両方の詳細表示を目視確認してもらう。

- [ ] `TodoDetail.tsx` でカテゴリ`<select>`を詳細メモブロックの下へ移動
- [ ] `td-detail-grid` のレイアウトを整理
- [ ] `npx tsc --noEmit && npx vitest run` green

---

## Task 5: 行タイトルの複数行表示・全文確認手段の追加

### 現象
- 「件名に複数行対応にも関わらず、表示が1行にしか対応していない」
- 「見切れているとウィンドウを広げるしか確認のすべがない」
- 「右クリック→編集ボタンなどで編集画面（全文字確認できるイメージ）を追加してほしい」

### 根本原因（コード確認済み）
- `frontend/src/lib/format.ts` の `previewText()` は複数行タイトルの1行目＋「　…」を返すが、
  `frontend/src/styles/todo.css` の `.td-row-title` が
  `white-space: nowrap; overflow: hidden; text-overflow: ellipsis;` のため、
  **1行目自体も長ければ省略される**。複数行タイトルの全文を見る手段が、
  現状は「行をクリックして詳細を開く」（`detailPattern==='inline'`なら
  行下に展開、`'modal'`ならモーダル）しかない。
- さらに、**インライン表示（`detailPattern==='inline'`）ではタイトル編集欄
  （`textarea.td-detail-title-input`）自体が描画されない**
  （`TodoDetail.tsx` で `{modal && <textarea .../>}` と、`modal===true` のときのみ表示）。
  つまり設定が「インライン」のユーザーは、そもそもタイトルを見る/編集する手段がない。
- CSSに `.td-row-title-input` という未使用の定義が残っている（過去に検討されたが
  未配線と思われる）。今回の実装で使うか、そのまま削除するかは実装時に判断。

### 対応方針
1. **行タイトル表示**: `previewText()` に加えて、行の高さを保ちつつ2〜3行までは
   `-webkit-line-clamp` 等で複数行プレビューを許可する（`white-space: nowrap` を外し、
   `display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;` 等）。
   ただし行の高さが不揃いになるため、一覧の見た目への影響を実装時に確認する。
2. **右クリック→編集**: `TodoRowContent` の行要素（`.td-row` または `.td-row-title`）に
   `onContextMenu` ハンドラを追加し、`preventDefault()` の上で
   **`detailPattern` に関わらず強制的にモーダル詳細を開く**。
   既存の `useUiStore` の `forceDetailModalId`（通知クリック時に使っている仕組み）を
   再利用できる（`setForceDetailModalId(todo.id)`）。これにより、インライン設定の
   ユーザーでも右クリックから全文表示・編集ができるモーダルへ到達できる。
   - シンプルな独自コンテキストメニューではなく、右クリック＝即モーダルを開く、
     という単純な対応で要件（全文確認・編集）は満たせる。メニューUIが必要かは
     ユーザーに実装前に確認するのが望ましい（「編集ボタン」という表現もあるため、
     右クリック即開き案で十分か、行内に常時「編集」アイコンボタンを出す案が良いか
     は実装セッションで確認する）。
3. インライン表示時にタイトル編集自体ができない問題は、上記の「右クリックで強制モーダル」で
   実質的に回避できる（モーダルなら常にタイトル欄が出る）。恒久対応として
   インライン展開時にもタイトルの複数行表示（読み取り専用でよい）を追加するかは任意。

### 検証
- `npx tsc --noEmit && npx vitest run`
- 実機で「長い複数行タイトルの行」「右クリックでの詳細モーダル起動」を確認してもらう。

- [ ] 行タイトルのプレビュー表示を複数行対応にする（`todo.css`調整）
- [ ] 右クリックで `forceDetailModalId` を使い強制モーダルを開く挙動を追加
- [ ] （要ユーザー確認）右クリック即モーダル案 vs 独自コンテキストメニュー案の選定
- [ ] 未使用の `.td-row-title-input` CSSを整理（採用するか削除するか）
- [ ] `npx tsc --noEmit && npx vitest run` green

---

## 実装順序の推奨

依存関係はほぼ無いため並行実装可能だが、影響範囲の小ささ順に:
Task 3（0件フィルタ削除）→ Task 4（カテゴリ欄移動）→ Task 1（ソートバグ）→
Task 5（タイトル複数行・右クリック）→ Task 2（DragOverlay）の順が無難
（Task 2はdnd-kit周りの変更でリグレッションリスクがやや高いため最後に）。

## スコープ外

- QuickInputの「タスクを登録」ラベル・「Enter で追加」ヒントの削除は
  本計画作成と同じセッションで**既に対応済み**（`QuickInput.tsx`／`todo.css`）。
