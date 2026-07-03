# Phase A: 定期タスクパネル 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** MemoTodo の React フロントに、定期タスクのスライドオーバーパネル（残/近い/全て・赤黄バッジ）と CRUD（追加/編集/削除/完了トグル/一時停止）、および定期タスクの通知設定モーダル（`recurring_display_days`）を、現行バニラ実装の挙動・見た目を忠実に移植して実装する。

**Architecture:** Phase 0 で確立したパターンに完全準拠。サーバー状態は TanStack Query（`GetRecurringPanel`/`GetRecurringTasks` をクエリ化、各 mutation は `['recurringPanel']`＋`['recurringTasks']` を invalidate）、純 UI 状態は Zustand（`recurringPanelOpen`/`recurringOpenId`/`recurringDrafts`、`detailPattern` は既存を共用）。詳細フォームは inline/modal 両対応（modal は React Portal）で、TodoDetail/DetailModal と対称に別コンポーネントとして作る。定期メモは**プレーン textarea**（現行踏襲・RichTextEditor は使わない）。周期値（`period_value`）の組立/分解とメタ表記は純関数に切り出し Vitest で TDD する。

**Tech Stack:** React 18, TypeScript 5, @tanstack/react-query 5, zustand 5, Vitest（純ロジックのみ）。新規依存なし。Go バックエンド・`frontend/wailsjs/` は無変更（Wails が自動再生成）。

## Global Constraints

- **Go バックエンド（`app.go`）と `frontend/wailsjs/` は変更しない。** Wails が `wails dev`/`wails build` 時に自動再生成する。
- 見た目は現行維持。**新規 CSS クラスを作らず**、`frontend/src/styles/todo.css` の既存クラスを踏襲する（定期系クラスは実在確認済み）。
- 定期タスクのメモは**プレーンテキスト**（`<textarea>`）として扱う。RichTextEditor は使わない。HTML 化しない。
- サーバー状態の更新は必ず **mutation → `invalidateQueries`** の宣言的経路のみ（命令的な手動リフェッチ禁止＝元バグの温床）。
- `SaveSettings` はバックエンドがマージ（nil=保持）。通知設定モーダルは `recurring_display_days` のみ送り、他フィールドは省略して保持させる。
- 定期詳細の inline/modal 切替は既存 `detailPattern`（settings ミラー）に従う。未保存ドラフトは保持が意図仕様（明示的な「キャンセル」/保存/削除で破棄）。
- **検証分担**：各タスク末に `npm run build`（`tsc && vite build`＝型チェック込み）を green にする。純ロジックは `npm run test`（Vitest）。**GUI 目視（パネル開閉・ドラッグ等）はユーザー**。フェーズ末にコントローラが `wails build`（PATH 前置）で埋め込みビルドを確認。
- `tsconfig` は `noUnusedLocals`/`noUnusedParameters: true`。**未使用 import があると `npm run build` が失敗する**ため、各タスクで使うものだけ import すること。
- 作業ブランチは `develop` 直下（Phase 0 と同様）。push 先は `origin`(totono)。

### API 型・バインディング（`frontend/wailsjs/` より。変更禁止）

- `todo.RecurringTask`: `{ id:number; title:string; memo:string; period_type:string; period_value:string; current_deadline:string; status:string; done_at:string; is_active:boolean; created_at:string; freq?:string; is_overdue?:boolean }`
- `todo.RecurringBadge`: `{ current:number; overdue:number }`
- `todo.RecurringPanelData`: `{ overdue: RecurringTask[]; current: RecurringTask[]; badge: RecurringBadge }`
- `main.CreateRecurringTaskRequest`: `{ title:string; period_type:string; period_value:string; memo:string }`
- `main.UpdateRecurringTaskRequest`（全て optional）: `{ title?; memo?; period_type?; period_value?; is_active? }`
- `main.SaveSettingsRequest`: `{ notify_times:string[]; detail_pattern?:string; recurring_display_days:Record<string,number>; todo_near_deadline_days?:number; reminder_notify_method?; periodic_notify_method? }`
- App 関数（`frontend/wailsjs/go/main/App`）: `GetRecurringPanel():Promise<RecurringPanelData>` / `GetRecurringTasks():Promise<RecurringTask[]>` / `GetRecurringTask(id):Promise<RecurringTask>` / `CreateRecurringTask(req):Promise<number>` / `UpdateRecurringTask(id, req):Promise<void>` / `DeleteRecurringTask(id):Promise<void>` / `ToggleRecurringTask(id):Promise<void>` / `SaveSettings(req):Promise<Settings>` / `GetSettings():Promise<Settings>`

### period_value のエンコード規約（現行バニラと一致）

- **weekly**: 曜日インデックス文字列 `"0"`〜`"6"`（**0=月, 1=火, …, 6=日**）
- **monthly**: 日の文字列 `"1"`〜`"31"`
- **yearly**: `"MM-DD"`（0 埋め。例 7月3日 → `"07-03"`）

---

## File Structure

**新規作成（`frontend/src/` 配下）**
- `lib/recurring.ts` + `lib/recurring.test.ts` — 周期値の分解/組立・メタ表記（純ロジック＋Vitest）
- `hooks/useRecurring.ts` — `useRecurringPanel()` / `useRecurringTasks()`（クエリ）
- `hooks/useRecurringMutations.ts` — create/update/remove/toggleComplete/toggleActive（mutation）
- `components/RecurringTab.tsx` — 縦タブ＋赤黄バッジ
- `components/RecurringPanel.tsx` — スライドオーバーパネル（3 セクション・ヘッダー・各モーダルの所有）
- `components/RecurringRow.tsx` — 行（overdue/current/all の 3 variant）
- `components/RecurringDetail.tsx` — 詳細フォーム（inline/modal 共用、プレーン textarea メモ）
- `components/RecurringDetailModal.tsx` — modal モードの Portal ラッパ
- `components/RecurringNotifyModal.tsx` — 通知設定（`recurring_display_days`）モーダル

**変更**
- `api/client.ts` — `RecurringTask` / `RecurringPanelData` 型を再エクスポート
- `api/queryKeys.ts` — `recurringPanel()` / `recurringTasks()` を追加
- `state/uiStore.ts` — `recurringPanelOpen` / `recurringOpenId` / `recurringDrafts` と setter を追加
- `App.tsx` — `<RecurringTab/>`＋`<RecurringPanel/>` を配線

---

## Task 1: 純ロジック（lib/recurring.ts）と Vitest

**Files:**
- Create: `frontend/src/lib/recurring.ts`
- Test: `frontend/src/lib/recurring.test.ts`

**Interfaces:**
- Produces:
  - `type PeriodParts = { weekday: string; monthDay: number; yearMonth: number; yearDay: number }`
  - `parsePeriodValue(periodType: string, periodValue: string): PeriodParts`
  - `encodePeriodValue(periodType: string, parts: PeriodParts): string`
  - `recurringMetaLabel(t: { period_type: string; period_value: string; is_active: boolean }): string`

- [ ] **Step 1: 失敗するテストを書く**

`frontend/src/lib/recurring.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { parsePeriodValue, encodePeriodValue, recurringMetaLabel } from './recurring'

describe('parsePeriodValue', () => {
  it('weekly は曜日 index を返す', () =>
    expect(parsePeriodValue('weekly', '3')).toEqual({ weekday: '3', monthDay: 1, yearMonth: 1, yearDay: 1 }))
  it('monthly は日を数値で返す', () =>
    expect(parsePeriodValue('monthly', '15')).toEqual({ weekday: '0', monthDay: 15, yearMonth: 1, yearDay: 1 }))
  it('yearly は MM-DD を月日に分解する', () =>
    expect(parsePeriodValue('yearly', '07-03')).toEqual({ weekday: '0', monthDay: 1, yearMonth: 7, yearDay: 3 }))
  it('空値はデフォルトを返す', () =>
    expect(parsePeriodValue('weekly', '')).toEqual({ weekday: '0', monthDay: 1, yearMonth: 1, yearDay: 1 }))
})

describe('encodePeriodValue', () => {
  const base = { weekday: '2', monthDay: 15, yearMonth: 7, yearDay: 3 }
  it('weekly は曜日文字列', () => expect(encodePeriodValue('weekly', base)).toBe('2'))
  it('monthly は日文字列', () => expect(encodePeriodValue('monthly', base)).toBe('15'))
  it('yearly は 0 埋め MM-DD', () => expect(encodePeriodValue('yearly', base)).toBe('07-03'))
})

describe('recurringMetaLabel', () => {
  it('weekly は曜日名', () =>
    expect(recurringMetaLabel({ period_type: 'weekly', period_value: '0', is_active: true })).toBe('週ごと（毎週月曜）'))
  it('monthly は日', () =>
    expect(recurringMetaLabel({ period_type: 'monthly', period_value: '15', is_active: true })).toBe('月ごと（毎月15日）'))
  it('yearly は月日', () =>
    expect(recurringMetaLabel({ period_type: 'yearly', period_value: '07-03', is_active: true })).toBe('年ごと（毎年7月3日）'))
  it('停止中は接尾辞が付く', () =>
    expect(recurringMetaLabel({ period_type: 'weekly', period_value: '1', is_active: false })).toBe('週ごと（毎週火曜）・停止中'))
})
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run（`frontend/` 内）: `npm run test`
Expected: FAIL（`recurring.ts` が存在しない／export が未定義）

- [ ] **Step 3: `frontend/src/lib/recurring.ts` を実装**

```ts
const WEEKDAY_NAMES = ['月', '火', '水', '木', '金', '土', '日']

export type PeriodParts = {
  weekday: string // '0'..'6'（0=月）
  monthDay: number // 1..31
  yearMonth: number // 1..12
  yearDay: number // 1..31
}

// period_value をフォーム初期値へ分解する（別種別・空値はデフォルト）。
export function parsePeriodValue(periodType: string, periodValue: string): PeriodParts {
  const parts: PeriodParts = { weekday: '0', monthDay: 1, yearMonth: 1, yearDay: 1 }
  if (periodType === 'weekly') {
    parts.weekday = periodValue || '0'
  } else if (periodType === 'monthly') {
    parts.monthDay = parseInt(periodValue, 10) || 1
  } else if (periodType === 'yearly') {
    const [m, d] = (periodValue || '1-1').split('-')
    parts.yearMonth = parseInt(m, 10) || 1
    parts.yearDay = parseInt(d, 10) || 1
  }
  return parts
}

// フォーム入力から period_value 文字列を組み立てる（yearly は 0 埋め MM-DD）。
export function encodePeriodValue(periodType: string, parts: PeriodParts): string {
  if (periodType === 'weekly') return String(parts.weekday)
  if (periodType === 'monthly') return String(parts.monthDay)
  const m = String(parts.yearMonth).padStart(2, '0')
  const d = String(parts.yearDay).padStart(2, '0')
  return `${m}-${d}`
}

// 一覧のメタ表記（現行 _recurringMetaLabel と一致）。
export function recurringMetaLabel(t: { period_type: string; period_value: string; is_active: boolean }): string {
  const periodLabel: Record<string, string> = { weekly: '週ごと', monthly: '月ごと', yearly: '年ごと' }
  let meta = periodLabel[t.period_type] || t.period_type
  if (t.period_type === 'weekly') {
    meta += `（毎週${WEEKDAY_NAMES[parseInt(t.period_value, 10)] || t.period_value}曜）`
  } else if (t.period_type === 'monthly') {
    meta += `（毎月${t.period_value}日）`
  } else if (t.period_type === 'yearly') {
    const [m, d] = t.period_value.split('-')
    meta += `（毎年${parseInt(m, 10)}月${parseInt(d, 10)}日）`
  }
  if (!t.is_active) meta += '・停止中'
  return meta
}
```

- [ ] **Step 4: テストを実行して成功を確認**

Run: `npm run test`
Expected: PASS（`recurring.test.ts` の 11 アサーション green。既存 `format.test.ts` も green のまま）

- [ ] **Step 5: コミット**

```bash
git add frontend/src/lib/recurring.ts frontend/src/lib/recurring.test.ts
git commit -m "feat(recurring): add pure period-value/meta helpers with Vitest tests"
```

---

## Task 2: データ層（client 型・queryKeys・uiStore・useRecurring・useRecurringMutations）

**Files:**
- Modify: `frontend/src/api/client.ts`, `frontend/src/api/queryKeys.ts`, `frontend/src/state/uiStore.ts`
- Create: `frontend/src/hooks/useRecurring.ts`, `frontend/src/hooks/useRecurringMutations.ts`

**Interfaces:**
- Consumes: Task なし（既存 `App`/`qk`/`useUiStore` を拡張）。
- Produces:
  - `client.ts`: `export type RecurringTask = todo.RecurringTask`, `export type RecurringPanelData = todo.RecurringPanelData`
  - `qk.recurringPanel(): readonly ['recurringPanel']`, `qk.recurringTasks(): readonly ['recurringTasks']`
  - `uiStore`: `recurringPanelOpen: boolean`, `recurringOpenId: number | 'new' | null`, `recurringDrafts: Record<string, RecurringDraft>`, `setRecurringPanelOpen(open)`, `setRecurringOpenId(id)`, `setRecurringDraft(key, draft)`, `clearRecurringDraft(key)`; `type RecurringOpenId = number | 'new' | null`; `interface RecurringDraft { title?; memo?; period_type?; weekday?; monthDay?; yearMonth?; yearDay? }`
  - `useRecurring.ts`: `useRecurringPanel()`（`{ data?: RecurringPanelData }`）, `useRecurringTasks()`（`{ data?: RecurringTask[] }`）
  - `useRecurringMutations.ts`: `useRecurringMutations()` → `{ create, update, remove, toggleComplete, toggleActive, invalidate }`
    - `create.mutate(req: main.CreateRecurringTaskRequest)`
    - `update.mutate({ id: number; req: main.UpdateRecurringTaskRequest })`
    - `remove.mutate(id: number)`
    - `toggleComplete.mutate(id: number)`
    - `toggleActive.mutate({ id: number; isActive: boolean })`

- [ ] **Step 1: `api/client.ts` に型を追記**

末尾に追加:
```ts
export type RecurringTask = todo.RecurringTask
export type RecurringPanelData = todo.RecurringPanelData
```

- [ ] **Step 2: `api/queryKeys.ts` にキーを追記**

`qk` オブジェクトに追加:
```ts
  recurringPanel: () => ['recurringPanel'] as const,
  recurringTasks: () => ['recurringTasks'] as const,
```

- [ ] **Step 3: `state/uiStore.ts` に定期用 UI 状態を追記**

`TodoDraft` の下に型を追加:
```ts
export type RecurringOpenId = number | 'new' | null

// 定期タスクの未保存編集ドラフト（DB には保存しない）。period_value は保存時に
// weekday/monthDay/yearMonth/yearDay から組み立てる（種別切替で各値を保持するため）。
export interface RecurringDraft {
  title?: string
  memo?: string
  period_type?: string
  weekday?: string
  monthDay?: number
  yearMonth?: number
  yearDay?: number
}
```

`interface UiState` に追加:
```ts
  recurringPanelOpen: boolean
  recurringOpenId: RecurringOpenId
  recurringDrafts: Record<string, RecurringDraft>
  setRecurringPanelOpen: (open: boolean) => void
  setRecurringOpenId: (id: RecurringOpenId) => void
  setRecurringDraft: (key: string, draft: RecurringDraft) => void
  clearRecurringDraft: (key: string) => void
```

`create<UiState>((set) => ({ ... }))` の中に追加（既存の drafts 実装の下）:
```ts
  recurringPanelOpen: false,
  recurringOpenId: null,
  recurringDrafts: {},
  // パネルを閉じるときは開いていた詳細を畳む（ドラフトは保持）。
  setRecurringPanelOpen: (open) => set(open ? { recurringPanelOpen: true } : { recurringPanelOpen: false, recurringOpenId: null }),
  setRecurringOpenId: (id) => set({ recurringOpenId: id }),
  setRecurringDraft: (key, draft) => set((s) => ({ recurringDrafts: { ...s.recurringDrafts, [key]: draft } })),
  clearRecurringDraft: (key) =>
    set((s) => {
      const next = { ...s.recurringDrafts }
      delete next[key]
      return { recurringDrafts: next }
    }),
```

- [ ] **Step 4: `hooks/useRecurring.ts` を作成**

```ts
import { useQuery } from '@tanstack/react-query'
import { App, RecurringPanelData, RecurringTask } from '../api/client'
import { qk } from '../api/queryKeys'

export function useRecurringPanel() {
  return useQuery<RecurringPanelData>({
    queryKey: qk.recurringPanel(),
    queryFn: () => App.GetRecurringPanel(),
  })
}

export function useRecurringTasks() {
  return useQuery<RecurringTask[]>({
    queryKey: qk.recurringTasks(),
    queryFn: () => App.GetRecurringTasks(),
  })
}
```

- [ ] **Step 5: `hooks/useRecurringMutations.ts` を作成**

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { App, main } from '../api/client'
import { qk } from '../api/queryKeys'

export function useRecurringMutations() {
  const qc = useQueryClient()
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: qk.recurringPanel() })
    qc.invalidateQueries({ queryKey: qk.recurringTasks() })
  }

  const create = useMutation({
    mutationFn: (req: main.CreateRecurringTaskRequest) => App.CreateRecurringTask(req),
    onSuccess: invalidate,
  })
  const update = useMutation({
    mutationFn: ({ id, req }: { id: number; req: main.UpdateRecurringTaskRequest }) => App.UpdateRecurringTask(id, req),
    onSuccess: invalidate,
  })
  const remove = useMutation({
    mutationFn: (id: number) => App.DeleteRecurringTask(id),
    onSuccess: invalidate,
  })
  const toggleComplete = useMutation({
    mutationFn: (id: number) => App.ToggleRecurringTask(id),
    onSuccess: invalidate,
  })
  const toggleActive = useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) =>
      App.UpdateRecurringTask(id, main.UpdateRecurringTaskRequest.createFrom({ is_active: isActive })),
    onSuccess: invalidate,
  })

  return { create, update, remove, toggleComplete, toggleActive, invalidate }
}
```

- [ ] **Step 6: 型チェック（ビルド）とテストを確認**

Run（`frontend/` 内）: `npm run build`
Expected: PASS（tsc 型エラーなし・vite build 成功。※この時点で新規フックは未使用でも、`export` された関数は `noUnusedLocals` の対象外なのでエラーにならない）

Run: `npm run test`
Expected: PASS（既存 + Task 1 のテストが green のまま）

- [ ] **Step 7: コミット**

```bash
git add frontend/src/api/client.ts frontend/src/api/queryKeys.ts frontend/src/state/uiStore.ts frontend/src/hooks/useRecurring.ts frontend/src/hooks/useRecurringMutations.ts
git commit -m "feat(recurring): add data layer (queries, mutations, UI store, query keys)"
```

---

## Task 3: 縦タブ＋パネル本体＋行（読み取り・完了トグル・削除）

**Files:**
- Create: `frontend/src/components/RecurringTab.tsx`, `frontend/src/components/RecurringRow.tsx`, `frontend/src/components/RecurringPanel.tsx`
- Modify: `frontend/src/App.tsx`

**Interfaces:**
- Consumes: `useRecurringPanel`/`useRecurringTasks`（Task 2）、`useRecurringMutations`（Task 2）、`useUiStore`（Task 2 拡張）、`fmtDeadline`（`lib/format`）、`recurringMetaLabel`（Task 1）、`RecurringTask`（Task 2）。
- Produces: `<RecurringTab/>`, `<RecurringRow task variant/>`（`variant: 'overdue' | 'current' | 'all'`）, `<RecurringPanel/>`。

- [ ] **Step 1: `components/RecurringTab.tsx` を作成**

```tsx
import { useRecurringPanel } from '../hooks/useRecurring'
import { useUiStore } from '../state/uiStore'

export default function RecurringTab() {
  const { data } = useRecurringPanel()
  const setPanelOpen = useUiStore((s) => s.setRecurringPanelOpen)
  const current = data?.badge?.current ?? 0
  const overdue = data?.badge?.overdue ?? 0

  return (
    <div className="td-recurring-tab" onClick={() => setPanelOpen(true)}>
      <span className="td-recurring-tab-label">定期タスク</span>
      <div className="td-recurring-tab-badges">
        {current > 0 && <span className="td-badge-dot td-badge-yellow">{current}</span>}
        {overdue > 0 && <span className="td-badge-dot td-badge-red">{overdue}</span>}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: `components/RecurringRow.tsx` を作成（3 variant・完了トグル・削除）**

```tsx
import { RecurringTask } from '../api/client'
import { useUiStore } from '../state/uiStore'
import { useRecurringMutations } from '../hooks/useRecurringMutations'
import { fmtDeadline } from '../lib/format'
import { recurringMetaLabel } from '../lib/recurring'

type Variant = 'overdue' | 'current' | 'all'

export default function RecurringRow({ task, variant }: { task: RecurringTask; variant: Variant }) {
  const setOpenId = useUiStore((s) => s.setRecurringOpenId)
  const { toggleComplete, remove } = useRecurringMutations()

  const onToggle = (e: React.MouseEvent) => {
    e.stopPropagation()
    toggleComplete.mutate(task.id)
  }
  const onDelete = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm('この定期タスクを削除しますか？')) return
    remove.mutate(task.id)
  }
  const openDetail = () => setOpenId(task.id)

  return (
    <div className="td-recurring-row-wrap" data-id={task.id}>
      {variant === 'all' ? (
        <div className={`td-recurring-all-row ${task.is_active ? '' : 'is-paused'}`} onClick={openDetail}>
          <div className="td-recurring-all-info">
            <div className="td-recurring-all-title">{task.title}</div>
            <div className="td-recurring-all-meta">
              {recurringMetaLabel(task)}
              {task.current_deadline ? `・次回 ${fmtDeadline(task.current_deadline)}` : ''}
            </div>
          </div>
          <span className={`td-recurring-status-chip ${task.status === 'done' ? 'is-done' : 'is-pending'}`}>
            {task.status === 'done' ? '今期完了' : '未完了'}
          </span>
          <div className="td-recurring-all-actions">
            <button className="td-icon-btn" title="削除" onClick={onDelete}>
              <i className="bi bi-trash3" />
            </button>
          </div>
        </div>
      ) : variant === 'overdue' ? (
        <div className="td-recurring-occ-row is-overdue" onClick={openDetail}>
          <div className="td-recurring-occ-info">
            <div className="td-recurring-occ-title">{task.title}</div>
            <div className="td-recurring-occ-meta">{fmtDeadline(task.current_deadline)} 期限・未完了</div>
          </div>
          <button className="td-btn td-btn-secondary td-btn-sm" onClick={onToggle}>完了にする</button>
        </div>
      ) : (
        <div className="td-recurring-occ-row" onClick={openDetail}>
          <div className={`td-checkbox ${task.status === 'done' ? 'is-checked' : ''}`} onClick={onToggle}>
            {task.status === 'done' ? <i className="bi bi-check-lg" /> : null}
          </div>
          <div className={`td-recurring-occ-info ${task.status === 'done' ? 'is-done' : ''}`}>
            <div className="td-recurring-occ-title">{task.title}</div>
          </div>
          <span className="td-recurring-occ-freq">{fmtDeadline(task.current_deadline)}</span>
        </div>
      )}
    </div>
  )
}
```

> 注: 行クリックは `setOpenId(task.id)` を呼ぶが、詳細フォームは Task 4 で描画する。この Task では state が変わるだけで見た目は変化しない（中間状態・想定内）。

- [ ] **Step 3: `components/RecurringPanel.tsx` を作成（本体・3 セクション）**

`current` が空かつ `overdue` も空のときだけ「期日が近い定期タスクはありません」を表示する（現行踏襲）。「すべての定期タスク」は overdue/current に出た id を除外する。

```tsx
import { useRecurringPanel, useRecurringTasks } from '../hooks/useRecurring'
import { useUiStore } from '../state/uiStore'
import RecurringRow from './RecurringRow'

export default function RecurringPanel() {
  const open = useUiStore((s) => s.recurringPanelOpen)
  const setPanelOpen = useUiStore((s) => s.setRecurringPanelOpen)
  const setOpenId = useUiStore((s) => s.setRecurringOpenId)
  const { data: panel } = useRecurringPanel()
  const { data: allTasks } = useRecurringTasks()

  const overdue = panel?.overdue ?? []
  const current = panel?.current ?? []
  const shownIds = new Set([...overdue, ...current].map((t) => t.id))
  const rest = (allTasks ?? []).filter((t) => !shownIds.has(t.id))

  return (
    <>
      <div
        className="td-recurring-overlay"
        style={{ display: open ? 'block' : 'none' }}
        onClick={() => setPanelOpen(false)}
      />
      <aside className={`td-recurring-panel ${open ? 'is-open' : ''}`}>
        <div className="td-recurring-panel-header">
          <span className="td-panel-title"><i className="bi bi-arrow-repeat" /> 定期タスク</span>
          <div className="td-recurring-panel-header-actions">
            <button className="td-icon-btn" title="定期タスクを追加" onClick={() => setOpenId('new')}>
              <i className="bi bi-plus-lg" />
            </button>
            <button className="td-icon-btn" title="定期タスクの通知設定">
              <i className="bi bi-gear" />
            </button>
            <button className="td-icon-btn" title="閉じる" onClick={() => setPanelOpen(false)}>
              <i className="bi bi-x-lg" />
            </button>
          </div>
        </div>
        <div className="td-recurring-panel-body">
          {overdue.length > 0 && (
            <div className="td-recurring-overdue-block">
              <div className="td-recurring-overdue-title">残タスク（前回分が未完了です）</div>
              {overdue.map((t) => (
                <RecurringRow key={t.id} task={t} variant="overdue" />
              ))}
            </div>
          )}

          <div className="td-section-label">期日が近い定期タスク</div>
          {current.map((t) => (
            <RecurringRow key={t.id} task={t} variant="current" />
          ))}
          {current.length === 0 && overdue.length === 0 && (
            <div className="td-empty">期日が近い定期タスクはありません</div>
          )}

          <div className="td-separator">
            <span className="td-separator-line" />
            <span className="td-separator-label"><i className="bi bi-list-ul" /> すべての定期タスク</span>
            <span className="td-separator-line" />
          </div>
          {rest.map((t) => (
            <RecurringRow key={t.id} task={t} variant="all" />
          ))}
          {rest.length === 0 && <div className="td-empty">定期タスクはまだありません</div>}
        </div>
      </aside>
    </>
  )
}
```

> 注: 通知設定ギアの onClick は Task 6 で、追加ボタンの実フォーム描画は Task 4 で差し込む。この Task では追加ボタンは state を変えるのみ。

- [ ] **Step 4: `App.tsx` に `<RecurringTab/>` と `<RecurringPanel/>` を配線**

`import` を追加:
```tsx
import RecurringTab from './components/RecurringTab'
import RecurringPanel from './components/RecurringPanel'
```

`.td-app` の中、`</main>` の直後（既存の `{detailPattern === 'modal' && openTodo && <DetailModal .../>}` の前）に追加:
```tsx
      <RecurringTab />
      <RecurringPanel />
```

- [ ] **Step 5: 型チェック（ビルド）**

Run（`frontend/` 内）: `npm run build`
Expected: PASS（型エラーなし）

- [ ] **Step 6: GUI 目視（ユーザー依頼）**

Run: `wails dev`（コントローラ/ユーザー）
確認項目:
- 右端に「定期タスク」縦タブが出る。定期タスクがあれば黄（current）/赤（overdue）バッジが件数付きで出る（0 のバッジは非表示）。
- タブクリックでパネルがスライドイン。オーバーレイ／閉じるボタンで閉じる。
- 3 セクション（残タスク／期日が近い／すべて）が現行と同じ見た目で表示。空セクションのメッセージが正しい。
- current 行のチェックボックス・overdue 行の「完了にする」で完了トグル → 即反映。all 行のゴミ箱で削除（確認ダイアログ）→ 即反映。

- [ ] **Step 7: コミット**

```bash
git add frontend/src/components/RecurringTab.tsx frontend/src/components/RecurringRow.tsx frontend/src/components/RecurringPanel.tsx frontend/src/App.tsx
git commit -m "feat(recurring): recurring tab, slide-over panel, rows with complete/delete"
```

---

## Task 4: 詳細フォーム（インライン）・ドラフト・作成/更新/一時停止

**Files:**
- Create: `frontend/src/components/RecurringDetail.tsx`
- Modify: `frontend/src/components/RecurringRow.tsx`, `frontend/src/components/RecurringPanel.tsx`

**Interfaces:**
- Consumes: `useUiStore`（recurringDrafts/recurringOpenId/detailPattern）、`useRecurringMutations`、`parsePeriodValue`/`encodePeriodValue`（Task 1）、`RecurringTask`/`main`（client）。
- Produces: `<RecurringDetail task modal? />`（`task: RecurringTask | null`。`null`＝新規。**外側の `td-recurring-detail-inline`/`td-detail-modal-body` ラッパは呼び出し側が付ける**。この中身はフラグメントで返す）。

- [ ] **Step 1: `components/RecurringDetail.tsx` を作成**

メモは**プレーン textarea**。タイトル必須（空なら inline エラーで送信中止）。周期種別ごとに条件表示。保存/キャンセル/削除/一時停止でドラフト破棄＆詳細を畳む（パネルは閉じない）。

```tsx
import { useState } from 'react'
import { RecurringTask, main } from '../api/client'
import { useUiStore, RecurringDraft } from '../state/uiStore'
import { useRecurringMutations } from '../hooks/useRecurringMutations'
import { parsePeriodValue, encodePeriodValue } from '../lib/recurring'

const WEEKDAYS = ['月', '火', '水', '木', '金', '土', '日']

// task（元データ）に draft（未保存編集）を重ねた現在の表示値を作る。
// period_value は種別ごとの各サブ値（weekday/monthDay/yearMonth/yearDay）に分解して保持し、
// 保存時に encodePeriodValue で組み立てる（種別を切り替えても各値が消えないようにするため）。
function buildView(task: RecurringTask | null, draft?: RecurringDraft) {
  const parts = parsePeriodValue(task?.period_type ?? 'weekly', task?.period_value ?? '0')
  return {
    title: draft?.title ?? task?.title ?? '',
    memo: draft?.memo ?? task?.memo ?? '',
    period_type: draft?.period_type ?? task?.period_type ?? 'weekly',
    weekday: draft?.weekday ?? parts.weekday,
    monthDay: draft?.monthDay ?? parts.monthDay,
    yearMonth: draft?.yearMonth ?? parts.yearMonth,
    yearDay: draft?.yearDay ?? parts.yearDay,
    is_active: task?.is_active ?? true,
  }
}

export default function RecurringDetail({ task, modal = false }: { task: RecurringTask | null; modal?: boolean }) {
  const isNew = !task
  const key = isNew ? 'new' : String(task!.id)
  const draft = useUiStore((s) => s.recurringDrafts[key])
  const setDraft = useUiStore((s) => s.setRecurringDraft)
  const clearDraft = useUiStore((s) => s.clearRecurringDraft)
  const setOpenId = useUiStore((s) => s.setRecurringOpenId)
  const { create, update, remove, toggleActive } = useRecurringMutations()
  const [titleError, setTitleError] = useState(false)

  const v = buildView(task, draft)
  const patch = (p: Partial<RecurringDraft>) => setDraft(key, { ...(draft ?? {}), ...p })

  const closeDetail = () => {
    clearDraft(key)
    setOpenId(null)
  }

  const save = () => {
    const title = v.title.trim()
    if (!title) {
      setTitleError(true)
      return
    }
    setTitleError(false)
    const period_value = encodePeriodValue(v.period_type, {
      weekday: v.weekday,
      monthDay: v.monthDay,
      yearMonth: v.yearMonth,
      yearDay: v.yearDay,
    })
    const memo = v.memo.trim()
    if (isNew) {
      create.mutate(
        main.CreateRecurringTaskRequest.createFrom({ title, period_type: v.period_type, period_value, memo }),
        { onSuccess: closeDetail },
      )
    } else {
      update.mutate(
        {
          id: task!.id,
          req: main.UpdateRecurringTaskRequest.createFrom({ title, period_type: v.period_type, period_value, memo }),
        },
        { onSuccess: closeDetail },
      )
    }
  }

  const onDelete = () => {
    if (!confirm('この定期タスクを削除しますか？')) return
    remove.mutate(task!.id, { onSuccess: closeDetail })
  }

  const onToggleActive = () => {
    toggleActive.mutate({ id: task!.id, isActive: !task!.is_active }, { onSuccess: closeDetail })
  }

  return (
    <>
      {modal && (
        <div className="td-detail-label" style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
          {isNew ? '定期タスクを追加' : '定期タスクを編集'}
        </div>
      )}
      <div className="td-field">
        <span className="td-detail-label">タイトル <span className="td-required">*</span></span>
        <input
          type="text"
          className="td-input"
          maxLength={200}
          value={v.title}
          placeholder="定期タスクのタイトル"
          onChange={(e) => patch({ title: e.target.value })}
        />
        {titleError && <div className="td-error">タイトルを入力してください</div>}
      </div>
      <div className="td-field">
        <span className="td-detail-label">周期 <span className="td-required">*</span></span>
        <select className="td-input" value={v.period_type} onChange={(e) => patch({ period_type: e.target.value })}>
          <option value="weekly">週ごと（曜日）</option>
          <option value="monthly">月ごと（日付）</option>
          <option value="yearly">年ごと（月日）</option>
        </select>
      </div>

      {v.period_type === 'weekly' && (
        <div className="td-field">
          <span className="td-detail-label">曜日</span>
          <div className="td-weekday-row">
            {WEEKDAYS.map((n, i) => (
              <label className="td-weekday-btn" key={i}>
                <input
                  type="radio"
                  name={`r-weekday-${key}`}
                  value={i}
                  checked={String(v.weekday) === String(i)}
                  onChange={() => patch({ weekday: String(i) })}
                />
                <span>{n}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {v.period_type === 'monthly' && (
        <div className="td-field">
          <span className="td-detail-label">毎月 <span className="td-required">*</span> 日</span>
          <input
            type="number"
            className="td-input td-input-sm"
            min={1}
            max={31}
            value={v.monthDay}
            onChange={(e) => patch({ monthDay: parseInt(e.target.value, 10) || 1 })}
          />
        </div>
      )}

      {v.period_type === 'yearly' && (
        <div className="td-field">
          <span className="td-detail-label">毎年</span>
          <div className="td-yearly-row">
            <input
              type="number"
              className="td-input td-input-sm"
              min={1}
              max={12}
              value={v.yearMonth}
              onChange={(e) => patch({ yearMonth: parseInt(e.target.value, 10) || 1 })}
            />
            <span className="td-yearly-sep">月</span>
            <input
              type="number"
              className="td-input td-input-sm"
              min={1}
              max={31}
              value={v.yearDay}
              onChange={(e) => patch({ yearDay: parseInt(e.target.value, 10) || 1 })}
            />
            <span className="td-yearly-sep">日</span>
          </div>
        </div>
      )}

      <div className="td-field">
        <span className="td-detail-label">メモ</span>
        <textarea
          className="td-input td-textarea"
          rows={2}
          placeholder="メモ（省略可）"
          value={v.memo}
          onChange={(e) => patch({ memo: e.target.value })}
        />
      </div>

      <div className="td-detail-footer">
        <div className="td-detail-footer-left">
          {!isNew && (
            <>
              <button className="td-btn td-btn-ghost-danger td-btn-sm" onClick={onDelete}>
                <i className="bi bi-trash3" /> 削除
              </button>
              <button className="td-btn td-btn-ghost td-btn-sm" onClick={onToggleActive}>
                <i className={`bi ${v.is_active ? 'bi-pause' : 'bi-play'}`} /> {v.is_active ? '一時停止' : '再開'}
              </button>
            </>
          )}
        </div>
        <div className="td-detail-footer-right">
          <button className="td-btn td-btn-secondary" onClick={closeDetail}>キャンセル</button>
          <button className="td-btn td-btn-primary" onClick={save}>保存</button>
        </div>
      </div>
    </>
  )
}
```

- [ ] **Step 2: `RecurringRow.tsx` に inline 詳細を条件表示**

`import` を追加:
```tsx
import RecurringDetail from './RecurringDetail'
```

コンポーネント本体の先頭（`const { toggleComplete, remove } = useRecurringMutations()` の下）に追加:
```tsx
  const openId = useUiStore((s) => s.recurringOpenId)
  const detailPattern = useUiStore((s) => s.detailPattern)
  const showInline = openId === task.id && detailPattern === 'inline'
```

`td-recurring-row-wrap` の中、行 JSX の**後**（閉じ `</div>`（wrap）の直前）に追加:
```tsx
      {showInline && (
        <div className="td-recurring-detail-inline">
          <RecurringDetail task={task} />
        </div>
      )}
```

- [ ] **Step 3: `RecurringPanel.tsx` に「新規追加」inline フォームを差し込む**

`import` を追加:
```tsx
import RecurringDetail from './RecurringDetail'
```

`recurringOpenId`/`detailPattern` を購読（`const setOpenId = ...` の下）:
```tsx
  const openId = useUiStore((s) => s.recurringOpenId)
  const detailPattern = useUiStore((s) => s.detailPattern)
```

`td-recurring-panel-body` の**先頭**（overdue ブロックの前）に追加:
```tsx
          {openId === 'new' && detailPattern === 'inline' && (
            <div className="td-recurring-detail-inline">
              <RecurringDetail task={null} />
            </div>
          )}
```

- [ ] **Step 4: 型チェック（ビルド）**

Run（`frontend/` 内）: `npm run build`
Expected: PASS（型エラーなし）

- [ ] **Step 5: GUI 目視（ユーザー依頼、inline モード）**

Run: `wails dev`（settings の detail_pattern が `inline` の状態で）
確認項目:
- 行クリック／シェブロンで直下にインライン詳細が開く。タイトル・周期種別（週次=曜日ラジオ／月次=日／年次=月日）・メモ（プレーン textarea）が編集でき、保存で一覧に即反映。
- 「＋」追加ボタンでパネル先頭に新規フォームが開き、作成 → 一覧に即反映。
- タイトル空で保存 → 「タイトルを入力してください」エラーが出て送信されない。
- 既存タスクで「一時停止/再開」トグル・「削除」が効く。
- キャンセル／保存後にフォームが畳まれ、パネルは開いたまま。編集途中でパネルを閉じて再度開くと編集内容が保持されている（キャンセルすると破棄）。

- [ ] **Step 6: コミット**

```bash
git add frontend/src/components/RecurringDetail.tsx frontend/src/components/RecurringRow.tsx frontend/src/components/RecurringPanel.tsx
git commit -m "feat(recurring): inline detail form with drafts, create/update/toggle-active"
```

---

## Task 5: 詳細フォームのモーダル対応（Portal）

**Files:**
- Create: `frontend/src/components/RecurringDetailModal.tsx`
- Modify: `frontend/src/components/RecurringPanel.tsx`

**Interfaces:**
- Consumes: `RecurringDetail`（Task 4）、`useUiStore`、`RecurringTask`。
- Produces: `<RecurringDetailModal task />`（`task: RecurringTask | null`。React Portal で `document.body` に描画、既存 `td-detail-modal` マークアップを流用）。

- [ ] **Step 1: `components/RecurringDetailModal.tsx` を作成**

```tsx
import { createPortal } from 'react-dom'
import { RecurringTask } from '../api/client'
import { useUiStore } from '../state/uiStore'
import RecurringDetail from './RecurringDetail'

export default function RecurringDetailModal({ task }: { task: RecurringTask | null }) {
  const setOpenId = useUiStore((s) => s.setRecurringOpenId)
  return createPortal(
    <>
      <div className="td-panel-overlay" style={{ display: 'block' }} onClick={() => setOpenId(null)} />
      <div className="td-detail-modal" style={{ display: 'flex' }}>
        <div className="td-detail-modal-body">
          <RecurringDetail task={task} modal />
        </div>
      </div>
    </>,
    document.body,
  )
}
```

- [ ] **Step 2: `RecurringPanel.tsx` で modal モード時にモーダルを描画**

`import` を追加:
```tsx
import RecurringDetailModal from './RecurringDetailModal'
```

`rest` を算出した後に、開いている id からタスクを解決するロジックを追加:
```tsx
  const modalTask =
    typeof openId === 'number' ? [...overdue, ...current, ...rest].find((t) => t.id === openId) ?? null : null
```

パネルのフラグメント末尾（`</aside>` の後）に追加:
```tsx
      {detailPattern === 'modal' && openId != null && <RecurringDetailModal task={modalTask} />}
```

（`openId === 'new'` のときは `modalTask` が `null` になり、新規フォームがモーダルで開く。）

- [ ] **Step 3: 型チェック（ビルド）**

Run（`frontend/` 内）: `npm run build`
Expected: PASS（型エラーなし）

- [ ] **Step 4: GUI 目視（ユーザー依頼、modal モード）**

Run: `wails dev`（settings の detail_pattern を `modal` にして）
確認項目:
- 行クリック／「＋」追加でモーダル（`td-detail-modal`）が開き、編集・作成・更新・削除・一時停止が効く。オーバーレイ／キャンセルで閉じる。
- **インライン⇔モーダルを設定で何度切り替えても行が二重にならない**（宣言的描画のため構造的に不可能なことを目視確認）。

- [ ] **Step 5: コミット**

```bash
git add frontend/src/components/RecurringDetailModal.tsx frontend/src/components/RecurringPanel.tsx
git commit -m "feat(recurring): modal detail form via portal (detailPattern-aware)"
```

---

## Task 6: 定期タスクの通知設定モーダル（recurring_display_days）

**Files:**
- Create: `frontend/src/components/RecurringNotifyModal.tsx`
- Modify: `frontend/src/components/RecurringPanel.tsx`

**Interfaces:**
- Consumes: `useSettings`（既存）、`App.SaveSettings`、`main.SaveSettingsRequest`、`qk`（recurringPanel/settings）。
- Produces: `<RecurringNotifyModal onClose />`（React Portal。`td-modal-over-panel` マークアップ流用）。

- [ ] **Step 1: `components/RecurringNotifyModal.tsx` を作成**

`SaveSettings` は `recurring_display_days` のみ送る（他フィールドはバックエンドが保持）。保存後 `['recurringPanel']`＋`['settings']` を invalidate。

```tsx
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useQueryClient } from '@tanstack/react-query'
import { App, main } from '../api/client'
import { useSettings } from '../hooks/useSettings'
import { qk } from '../api/queryKeys'

export default function RecurringNotifyModal({ onClose }: { onClose: () => void }) {
  const { data: settings } = useSettings()
  const qc = useQueryClient()
  const [weekly, setWeekly] = useState(3)
  const [monthly, setMonthly] = useState(7)
  const [yearly, setYearly] = useState(14)
  const seeded = useRef(false)

  // モーダルを開いた時点の設定値で初期化。
  useEffect(() => {
    if (!settings || seeded.current) return
    seeded.current = true
    const days = settings.recurring_display_days || {}
    setWeekly(days.weekly ?? 3)
    setMonthly(days.monthly ?? 7)
    setYearly(days.yearly ?? 14)
  }, [settings])

  const save = async () => {
    try {
      await App.SaveSettings(
        main.SaveSettingsRequest.createFrom({
          recurring_display_days: {
            weekly: Number.isNaN(weekly) ? 0 : weekly,
            monthly: Number.isNaN(monthly) ? 0 : monthly,
            yearly: Number.isNaN(yearly) ? 0 : yearly,
          },
        }),
      )
      qc.invalidateQueries({ queryKey: qk.recurringPanel() })
      qc.invalidateQueries({ queryKey: qk.settings() })
      onClose()
    } catch (e) {
      alert((e as Error)?.message || '保存に失敗しました')
    }
  }

  return createPortal(
    <>
      <div
        className="td-modal-overlay td-modal-overlay-over-panel"
        style={{ display: 'block' }}
        onClick={onClose}
      />
      <div className="td-modal td-modal-over-panel" style={{ display: 'flex' }}>
        <div className="td-modal-header">
          <span className="td-modal-title"><i className="bi bi-gear" /> 定期タスクの通知設定</span>
          <button className="td-panel-close" onClick={onClose}><i className="bi bi-x-lg" /></button>
        </div>
        <div className="td-modal-body">
          <div className="td-field">
            <span className="td-label">期日の何日前から通知するか（周期種別ごと）</span>
          </div>
          <div className="td-field">
            <label className="td-label">週ごとのタスク</label>
            <input
              type="number"
              className="td-input td-input-sm"
              min={0}
              max={366}
              value={Number.isNaN(weekly) ? '' : weekly}
              onChange={(e) => setWeekly(parseInt(e.target.value, 10))}
            />
          </div>
          <div className="td-field">
            <label className="td-label">月ごとのタスク</label>
            <input
              type="number"
              className="td-input td-input-sm"
              min={0}
              max={366}
              value={Number.isNaN(monthly) ? '' : monthly}
              onChange={(e) => setMonthly(parseInt(e.target.value, 10))}
            />
          </div>
          <div className="td-field">
            <label className="td-label">年ごとのタスク</label>
            <input
              type="number"
              className="td-input td-input-sm"
              min={0}
              max={366}
              value={Number.isNaN(yearly) ? '' : yearly}
              onChange={(e) => setYearly(parseInt(e.target.value, 10))}
            />
          </div>
        </div>
        <div className="td-modal-footer">
          <button className="td-btn td-btn-secondary" onClick={onClose}>閉じる</button>
          <button className="td-btn td-btn-primary" onClick={save}><i className="bi bi-floppy" /> 保存</button>
        </div>
      </div>
    </>,
    document.body,
  )
}
```

- [ ] **Step 2: `RecurringPanel.tsx` でギアボタンにモーダルを配線**

`import` を追加:
```tsx
import { useState } from 'react'
import RecurringNotifyModal from './RecurringNotifyModal'
```

コンポーネント本体に notify 開閉 state を追加（`const rest = ...` の付近）:
```tsx
  const [notifyOpen, setNotifyOpen] = useState(false)
```

通知設定ギアボタンに `onClick` を追加（Task 3 で置いた `<button className="td-icon-btn" title="定期タスクの通知設定">`）:
```tsx
            <button className="td-icon-btn" title="定期タスクの通知設定" onClick={() => setNotifyOpen(true)}>
              <i className="bi bi-gear" />
            </button>
```

パネルのフラグメント末尾（`RecurringDetailModal` の描画の後）に追加:
```tsx
      {notifyOpen && <RecurringNotifyModal onClose={() => setNotifyOpen(false)} />}
```

- [ ] **Step 3: 型チェック（ビルド）**

Run（`frontend/` 内）: `npm run build`
Expected: PASS（型エラーなし）

- [ ] **Step 4: GUI 目視（ユーザー依頼）**

Run: `wails dev`
確認項目:
- パネルヘッダーのギアで通知設定モーダルが開き、週/月/年の日数が現行設定で初期化される。
- 保存 → モーダルが閉じ、日数変更が定期パネルの「期日が近い」判定に反映される（`recurringPanel` 再取得）。他の設定（表示方式・通知時刻等）が消えていないこと。

- [ ] **Step 5: コミット**

```bash
git add frontend/src/components/RecurringNotifyModal.tsx frontend/src/components/RecurringPanel.tsx
git commit -m "feat(recurring): notify-settings modal (recurring_display_days) wired to gear"
```

---

## Task 7: フェーズ仕上げ（通し確認・埋め込みビルド）

**Files:**
- （変更なしの検証タスク）

- [ ] **Step 1: 単体テストとビルドを確認**

Run（`frontend/` 内）: `npm run test`
Expected: PASS（`format.test.ts` + `recurring.test.ts` 全 green）

Run: `npm run build`
Expected: PASS（型エラーなし・`frontend/dist` 生成）

- [ ] **Step 2: `wails dev` で全操作を通し確認（ユーザー）**

確認項目（inline / modal 両方で）:
- 縦タブ＋バッジ（黄=current・赤=overdue、0 は非表示）
- パネル開閉（タブ／オーバーレイ／閉じる）
- 3 セクション表示（残タスク／期日が近い／すべて）＋空メッセージ
- 追加／編集／削除／完了トグル／一時停止・再開
- 詳細フォーム（週次=曜日・月次=日・年次=月日、プレーン textarea メモ、タイトル必須バリデーション）
- inline⇔modal 切替で行が二重化しない
- 通知設定モーダル（日数保存 → パネル反映、他設定を消さない）
- 未保存編集の保持（パネル閉→再開で保持、キャンセルで破棄）

- [ ] **Step 3: `wails build` で埋め込みビルドを確認（コントローラ、PATH 前置）**

Run: `export PATH="/c/Program Files/Go/bin:$HOME/go/bin:$PATH" && wails build -platform windows/amd64`
Expected: `build/bin/memotodo.exe` が生成され、単体起動で定期パネル一式が動く（`frontend/dist` 埋め込み）。

- [ ] **Step 4: 後片付け**

Run: `git checkout -- go.mod frontend/wailsjs`（LF/CRLF 再生成ノイズがあれば破棄。稀に出る `./nul` は `rm -f ./nul`）

- [ ] **Step 5: 完了確認とコミット（あれば）**

Phase A 完了の定義（設計 §9 相当）を満たすか確認:
- 定期パネルが開閉でき、3 セクションとバッジが正しい。
- 追加/編集/削除/完了トグル/一時停止が mutation→invalidate で即反映。
- 詳細フォームが inline/modal 両対応、ドラフト保持、プレーン textarea メモ動作。
- 通知設定モーダルが動作し、他設定を保持。
- `npm run build`＋`npm run test` green、`wails build` で exe 生成、GUI 目視（ユーザー）OK、見た目が現行と一致。

検証タスクのため通常コミットは不要。ゲート結果を最終コミット/PR メッセージに記す場合のみコミットする。

---

## Self-Review

**1. Spec coverage（設計 §9 フェーズA ＋ 今回の確定スコープ）:**
- 縦タブ＋赤黄バッジ（`GetRecurringPanel().badge`）→ Task 3 ✓
- スライドオーバーパネル 3 セクション（残=overdue／近い=current／全て=`GetRecurringTasks` を id 除外）→ Task 3 ✓
- 定期行（タイトル・周期・current_deadline・完了トグル・詳細展開）→ Task 3・4 ✓
- 詳細フォーム（inline＋modal、`TodoDetail` 対称、周期種別、プレーン textarea メモ、作成/更新/削除、追加、ドラフト保持、一時停止）→ Task 4・5 ✓
- クエリ無効化（各 mutation → `['recurringPanel']`＋`['recurringTasks']`；通知保存 → `['recurringPanel']`＋`['settings']`）→ Task 2・6 ✓
- 通知設定モーダル（`recurring_display_days`、部分 SaveSettings）→ Task 6 ✓（**今回スコープ拡張：ユーザー決定**）
- 純ロジック（period_value 分解/組立・メタ表記）Vitest → Task 1 ✓

**2. Placeholder scan:** 各コード手順に実コードを記載。UI 確認は Vitest 対象外のため「`wails dev` で目視（ユーザー）」を検証手段とする（純ロジックのみ Task 1 で TDD）。「Task N で差し込み」等は段階実装の意図的明示で、当該 Task に実コードあり。TBD/TODO なし。

**3. Type consistency:**
- `RecurringDraft`（title/memo/period_type/weekday/monthDay/yearMonth/yearDay）は Task 2 定義 → Task 4 `buildView`/`patch` で一致使用。
- `useRecurringMutations` の `create/update/remove/toggleComplete/toggleActive` は Task 2 定義 → Task 3（toggleComplete/remove）・Task 4（create/update/remove/toggleActive）で一致。
- `qk.recurringPanel/recurringTasks/settings` は Task 2 追加 → Task 6 で settings 併用。
- `parsePeriodValue/encodePeriodValue/recurringMetaLabel`（Task 1）→ Task 3（metaLabel）・Task 4（parse/encode）で一致。
- API 型 `main.CreateRecurringTaskRequest`/`main.UpdateRecurringTaskRequest`/`main.SaveSettingsRequest`/`todo.RecurringTask`/`todo.RecurringPanelData`/`todo.RecurringBadge` は `models.ts` と一致（Global Constraints に列挙）。
- コンポーネント props：`RecurringRow{task, variant}` / `RecurringDetail{task, modal?}` / `RecurringDetailModal{task}` / `RecurringNotifyModal{onClose}` を定義箇所と使用箇所で統一。
