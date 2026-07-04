# Phase C: Discord 風ハイブリッド通知 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** バックエンドの通知イベントを購読し、ウィンドウ非表示時は OS ネイティブ通知・表示時は Discord 風のアプリ内スタックトーストを出すハイブリッド通知を実装する。

**Architecture:** Go スケジューラは既に `EventsEmit`（アプリ内用）と `notify.Push`（OS ネイティブ）の両方を発火している。バックエンドには「ウィンドウ表示中は `notify.Push` を抑制する」ゲートだけ足す。フロントは `useAppEvents`（EventsOn 購読）→ Zustand uiStore のトースト状態 → `ToastHost`/`ReminderToast`/`PeriodicToast`（React Portal・右下スタック・手動閉じ）で描画する。純ロジック（定期集約・トーストリデューサ）は Vitest で TDD、コンポーネント/配線は build 検証＋GUI 目視（ユーザー）。

**Tech Stack:** React 18 + Vite 5 + TypeScript、TanStack Query v5、Zustand v5、Vitest 2（jsdom, globals）、Go 1.25 + Wails v2、`git.sr.ht/~jackmordaunt/go-toast/v2`。

## Global Constraints

- ブランチは `develop` 起点、push 先 `origin`(totono)。各コミット末尾にセッション提供の `Co-Authored-By:` と `Claude-Session:` トレーラを付ける（ハーネス注入。サブエージェント＝Kimi のコミットはトレーラ無しで可）。
- `tsconfig` は `noUnusedLocals`/`noUnusedParameters: true`＝**未使用の import / 変数 / 引数は build エラー**になる。
- サーバー状態は TanStack Query のみ（命令的リフェッチ禁止、更新は mutation→`invalidateQueries`）。UI 状態は Zustand `state/uiStore.ts`。
- **Wails バインディング（`frontend/wailsjs/*`）と `internal/*` は変更しない。** `wails build` 後に出る `go.mod`/`frontend/wailsjs` の LF/CRLF 再生成ノイズは `git checkout -- go.mod frontend/wailsjs` で破棄。稀に出る `./nul` は `rm -f ./nul`。
- `go`/`wails` は Bash ツールの PATH に無い。wails/go 実行時は `export PATH="/c/Program Files/Go/bin:$HOME/go/bin:$PATH"` を前置。`node`/`npm` は Bash から直接使用可。
- 検証分担：build（`npm --prefix frontend run build` ＝ tsc+vite）＋ test（`npm --prefix frontend run test` ＝ `vitest run`）はヘッドレスで実行。**GUI 目視（スライドイン・スタック・スヌーズ・遷移・非表示時のネイティブ通知）はユーザーゲート。**
- 既存バインディング（変更禁止・呼び出しのみ）：`App.SnoozeReminder(id: number, kind: string): Promise<void>`（kind=`"30"`/`"60"`/`"tomorrow"`）、`App.GetNearOrOverdueMemos(): Promise<todo.Todo[]>`、`App.GetRecurringPanel(): Promise<todo.RecurringPanelData>`、`EventsOn(name, cb): () => void`（`frontend/wailsjs/runtime/runtime`、返り値は購読解除関数）。
- 型：`Todo` は `is_overdue: boolean` と `is_near: boolean` を持つ。`RecurringTask` は `status: string`・`current_deadline: string`(YYYY-MM-DD)。`fmtDeadline(iso)`（`lib/format.ts`）は `YYYY-MM-DD`→`M/D(曜)`。

---

### Task 1: 定期通知の集約純関数 `buildPeriodicGroups`

定期通知トーストの4区分（定期の期限切れ／定期の期日近い／通常の期限切れ／通常の期日近い）を組み立てる純関数。元バニラ `_renderPeriodicToast` の分類ロジックに忠実。

**Files:**
- Create: `frontend/src/lib/notify.ts`
- Test: `frontend/src/lib/notify.test.ts`

**Interfaces:**
- Consumes: `Todo`, `RecurringTask`, `RecurringPanelData`（`../api/client` から）。
- Produces:
  - `interface PeriodicGroups { recurringOverdue: RecurringTask[]; recurringNear: RecurringTask[]; todoOverdue: Todo[]; todoNear: Todo[]; isEmpty: boolean }`
  - `function buildPeriodicGroups(memos: Todo[] | undefined, panel: RecurringPanelData | null | undefined): PeriodicGroups`

- [ ] **Step 1: Write the failing test**

`frontend/src/lib/notify.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { buildPeriodicGroups } from './notify'
import { todo } from '../api/client'

const mkTodo = (id: number, over: boolean, near: boolean) =>
  todo.Todo.createFrom({ id, title: `t${id}`, is_overdue: over, is_near: near })
const mkRec = (id: number, status: string) =>
  todo.RecurringTask.createFrom({ id, title: `r${id}`, status, current_deadline: '2026-07-01' })

describe('buildPeriodicGroups', () => {
  it('空入力は isEmpty=true', () => {
    const g = buildPeriodicGroups([], { overdue: [], current: [], badge: { current: 0, overdue: 0 } } as any)
    expect(g.isEmpty).toBe(true)
  })
  it('undefined 入力でも落ちず isEmpty=true', () => {
    expect(buildPeriodicGroups(undefined, undefined).isEmpty).toBe(true)
  })
  it('定期は overdue と current(status=pending) を分ける', () => {
    const panel = {
      overdue: [mkRec(1, 'overdue')],
      current: [mkRec(2, 'pending'), mkRec(3, 'done')],
      badge: { current: 1, overdue: 1 },
    } as any
    const g = buildPeriodicGroups([], panel)
    expect(g.recurringOverdue.map((t) => t.id)).toEqual([1])
    expect(g.recurringNear.map((t) => t.id)).toEqual([2]) // done は除外
    expect(g.isEmpty).toBe(false)
  })
  it('通常は is_overdue と (!is_overdue && is_near) を分ける', () => {
    const memos = [mkTodo(10, true, false), mkTodo(11, false, true), mkTodo(12, false, false)]
    const g = buildPeriodicGroups(memos, { overdue: [], current: [], badge: { current: 0, overdue: 0 } } as any)
    expect(g.todoOverdue.map((t) => t.id)).toEqual([10])
    expect(g.todoNear.map((t) => t.id)).toEqual([11]) // near でも overdue でもない 12 は除外
    expect(g.isEmpty).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix frontend run test -- src/lib/notify.test.ts`
Expected: FAIL（`buildPeriodicGroups` が存在しない／`Cannot find module './notify'`）。

- [ ] **Step 3: Write minimal implementation**

`frontend/src/lib/notify.ts`:

```ts
import { Todo, RecurringTask, RecurringPanelData } from '../api/client'

export interface PeriodicGroups {
  recurringOverdue: RecurringTask[]
  recurringNear: RecurringTask[]
  todoOverdue: Todo[]
  todoNear: Todo[]
  isEmpty: boolean
}

// 定期通知トーストの4区分を組み立てる。元実装 _renderPeriodicToast に準拠：
// 定期=overdue と current(status==='pending')、通常=is_overdue と (!is_overdue && is_near)。
export function buildPeriodicGroups(
  memos: Todo[] | undefined,
  panel: RecurringPanelData | null | undefined,
): PeriodicGroups {
  const recurringOverdue = panel?.overdue ?? []
  const recurringNear = (panel?.current ?? []).filter((t) => t.status === 'pending')
  const list = memos ?? []
  const todoOverdue = list.filter((t) => t.is_overdue)
  const todoNear = list.filter((t) => !t.is_overdue && t.is_near)
  const isEmpty =
    recurringOverdue.length === 0 &&
    recurringNear.length === 0 &&
    todoOverdue.length === 0 &&
    todoNear.length === 0
  return { recurringOverdue, recurringNear, todoOverdue, todoNear, isEmpty }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --prefix frontend run test -- src/lib/notify.test.ts`
Expected: PASS（4 tests）。

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/notify.ts frontend/src/lib/notify.test.ts
git commit -m "feat(notify): add buildPeriodicGroups pure helper with tests"
```

---

### Task 2: uiStore にトースト・ドラフト消去・強制モーダル・focus 状態を追加

トースト状態と付随 UI 状態を Zustand に追加する。純粋なリデューサ（push 置換／dismiss／kind 消去）を Vitest で検証。

**Files:**
- Modify: `frontend/src/state/uiStore.ts`
- Test: `frontend/src/state/uiStore.test.ts`

**Interfaces:**
- Consumes: `Todo`（`../api/client`）。
- Produces（uiStore に追加する state / actions）:
  - `type Toast = { kind: 'reminder'; id: string; todo: Todo } | { kind: 'periodic'; id: string }`
  - `toasts: Toast[]`
  - `pushToast: (t: Toast) => void`（同 id は置換して末尾へ）
  - `dismissToast: (id: string) => void`
  - `clearToastsByKind: (kind: Toast['kind']) => void`
  - `clearAllDrafts: () => void`（`drafts` と `recurringDrafts` を空に）
  - `forceDetailModalId: number | null`, `setForceDetailModalId: (id: number | null) => void`
  - `quickInputFocusToken: number`, `requestQuickInputFocus: () => void`

- [ ] **Step 1: Write the failing test**

`frontend/src/state/uiStore.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { useUiStore } from './uiStore'
import { todo } from '../api/client'

const mkTodo = (id: number) => todo.Todo.createFrom({ id, title: `t${id}` })

beforeEach(() => {
  useUiStore.setState({
    toasts: [],
    drafts: {},
    recurringDrafts: {},
    forceDetailModalId: null,
    quickInputFocusToken: 0,
  })
})

describe('toasts reducer', () => {
  it('pushToast は末尾に追加する', () => {
    useUiStore.getState().pushToast({ kind: 'reminder', id: 'reminder:1', todo: mkTodo(1) })
    expect(useUiStore.getState().toasts).toHaveLength(1)
  })
  it('同 id の pushToast は置換（重複しない）', () => {
    const s = useUiStore.getState()
    s.pushToast({ kind: 'reminder', id: 'reminder:1', todo: mkTodo(1) })
    s.pushToast({ kind: 'reminder', id: 'reminder:1', todo: mkTodo(1) })
    expect(useUiStore.getState().toasts).toHaveLength(1)
  })
  it('periodic は id=periodic で常に単一', () => {
    const s = useUiStore.getState()
    s.pushToast({ kind: 'periodic', id: 'periodic' })
    s.pushToast({ kind: 'periodic', id: 'periodic' })
    expect(useUiStore.getState().toasts.filter((t) => t.kind === 'periodic')).toHaveLength(1)
  })
  it('dismissToast は id で1件削除', () => {
    const s = useUiStore.getState()
    s.pushToast({ kind: 'reminder', id: 'reminder:1', todo: mkTodo(1) })
    s.dismissToast('reminder:1')
    expect(useUiStore.getState().toasts).toHaveLength(0)
  })
  it('clearToastsByKind は指定 kind だけ削除', () => {
    const s = useUiStore.getState()
    s.pushToast({ kind: 'reminder', id: 'reminder:1', todo: mkTodo(1) })
    s.pushToast({ kind: 'periodic', id: 'periodic' })
    s.clearToastsByKind('periodic')
    const ts = useUiStore.getState().toasts
    expect(ts).toHaveLength(1)
    expect(ts[0].kind).toBe('reminder')
  })
})

describe('clearAllDrafts', () => {
  it('drafts と recurringDrafts を空にする', () => {
    useUiStore.setState({ drafts: { 1: { title: 'a' } }, recurringDrafts: { x: { title: 'b' } } })
    useUiStore.getState().clearAllDrafts()
    expect(useUiStore.getState().drafts).toEqual({})
    expect(useUiStore.getState().recurringDrafts).toEqual({})
  })
})

describe('quickInputFocusToken', () => {
  it('requestQuickInputFocus でインクリメント', () => {
    const before = useUiStore.getState().quickInputFocusToken
    useUiStore.getState().requestQuickInputFocus()
    expect(useUiStore.getState().quickInputFocusToken).toBe(before + 1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix frontend run test -- src/state/uiStore.test.ts`
Expected: FAIL（`pushToast` 等が undefined、`toasts` が存在しない）。

- [ ] **Step 3: Write minimal implementation**

`frontend/src/state/uiStore.ts` を以下のように変更する。

先頭の import に `Todo` を追加：

```ts
import { create } from 'zustand'
import { Todo } from '../api/client'
```

`RecurringOpenId` 型の近くに `Toast` 型を追加：

```ts
export type Toast =
  | { kind: 'reminder'; id: string; todo: Todo }
  | { kind: 'periodic'; id: string }
```

`interface UiState { ... }` の末尾（`clearRecurringDraft` の後）に以下を追加：

```ts
  toasts: Toast[]
  pushToast: (t: Toast) => void
  dismissToast: (id: string) => void
  clearToastsByKind: (kind: Toast['kind']) => void
  clearAllDrafts: () => void
  forceDetailModalId: number | null
  setForceDetailModalId: (id: number | null) => void
  quickInputFocusToken: number
  requestQuickInputFocus: () => void
```

`create<UiState>((set) => ({ ... }))` の末尾（`clearRecurringDraft` の実装の後）に以下を追加：

```ts
  toasts: [],
  // 同 id は置換して末尾へ（リマインダーは todo ごと、periodic は id='periodic' で単一）。
  pushToast: (t) =>
    set((s) => ({ toasts: [...s.toasts.filter((x) => x.id !== t.id), t] })),
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
  clearToastsByKind: (kind) => set((s) => ({ toasts: s.toasts.filter((x) => x.kind !== kind) })),
  // ウィンドウ非表示時に未保存ドラフトを全消去する（元実装 todo:window-hidden 準拠）。
  clearAllDrafts: () => set({ drafts: {}, recurringDrafts: {} }),
  // 通知経由の詳細表示：detailPattern に関わらず常にモーダルで開く（元実装 openDetailModal 準拠）。
  forceDetailModalId: null,
  setForceDetailModalId: (id) => set({ forceDetailModalId: id }),
  quickInputFocusToken: 0,
  requestQuickInputFocus: () => set((s) => ({ quickInputFocusToken: s.quickInputFocusToken + 1 })),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --prefix frontend run test -- src/state/uiStore.test.ts`
Expected: PASS（7 tests）。

- [ ] **Step 5: 全テスト＋build で回帰確認**

Run: `npm --prefix frontend run test && npm --prefix frontend run build`
Expected: 全テスト PASS（Task1 の 4 と既存 22 と本 7 ＝計 33）＋ build 成功（tsc の未使用 import エラー無し）。

- [ ] **Step 6: Commit**

```bash
git add frontend/src/state/uiStore.ts frontend/src/state/uiStore.test.ts
git commit -m "feat(notify): add toast/draft-clear/force-modal/focus state to uiStore"
```

---

### Task 3: Discord 風トーストコンポーネントと CSS

`ToastHost`（Portal・右下スタック）と `ReminderToast`/`PeriodicToast`、定期用クエリフック、Discord 風 CSS を追加する。まだ App には配線しない（Task 4）。build 検証で完了とする。

**Files:**
- Create: `frontend/src/hooks/useNearOrOverdue.ts`
- Create: `frontend/src/components/ReminderToast.tsx`
- Create: `frontend/src/components/PeriodicToast.tsx`
- Create: `frontend/src/components/ToastHost.tsx`
- Modify: `frontend/src/styles/todo.css`（末尾に追記）

**Interfaces:**
- Consumes: `buildPeriodicGroups`/`PeriodicGroups`（Task 1）、`useUiStore` の `toasts`/`dismissToast`/`setTab`/`setForceDetailModalId`/`setRecurringPanelOpen`（Task 2＋既存）、`useRecurringPanel`（既存 `hooks/useRecurring.ts`）、`App.SnoozeReminder`/`App.GetNearOrOverdueMemos`、`fmtDeadline`（`lib/format.ts`）。
- Produces:
  - `useNearOrOverdue(): UseQueryResult<Todo[]>`（key `qk.nearOrOverdue()`）
  - `ReminderToast`（default export、props `{ todo: Todo }`）
  - `PeriodicToast`（default export、props なし）
  - `ToastHost`（default export、props なし）

- [ ] **Step 1: 定期用クエリフックを作成**

`frontend/src/hooks/useNearOrOverdue.ts`:

```ts
import { useQuery } from '@tanstack/react-query'
import { App, Todo } from '../api/client'
import { qk } from '../api/queryKeys'

export function useNearOrOverdue() {
  return useQuery<Todo[]>({
    queryKey: qk.nearOrOverdue(),
    queryFn: () => App.GetNearOrOverdueMemos(),
  })
}
```

- [ ] **Step 2: ReminderToast を作成**

`frontend/src/components/ReminderToast.tsx`:

```tsx
import { App, Todo } from '../api/client'
import { useUiStore } from '../state/uiStore'

// "YYYY-MM-DDTHH:mm:ss" -> "YYYY-MM-DD HH:mm"（元実装 _renderReminderToast 準拠）
function fmtReminderAt(iso: string): string {
  return iso ? iso.slice(0, 16).replace('T', ' ') : ''
}

export default function ReminderToast({ todo }: { todo: Todo }) {
  const dismissToast = useUiStore((s) => s.dismissToast)
  const setTab = useUiStore((s) => s.setTab)
  const setForceDetailModalId = useUiStore((s) => s.setForceDetailModalId)
  const id = `reminder:${todo.id}`
  const today = new Date().toISOString().slice(0, 10)
  const isOverdue = !!todo.reminder_at && todo.reminder_at.slice(0, 10) < today

  const snooze = async (kind: '30' | '60' | 'tomorrow') => {
    try {
      await App.SnoozeReminder(todo.id, kind)
    } catch {
      // ベストエフォート（元実装も失敗は握りつぶして閉じる）
    }
    dismissToast(id)
  }
  const openDetail = () => {
    dismissToast(id)
    setTab('pending') // setTab は openId を null にする＝インライン詳細と二重に開かない
    setForceDetailModalId(todo.id) // detailPattern に関わらず常にモーダルで開く
  }

  return (
    <div className="td-dtoast td-dtoast-reminder td-dtoast-in">
      <div className="td-dtoast-header">
        <span className="td-dtoast-label">リマインダー</span>
        <button className="td-dtoast-close" onClick={() => dismissToast(id)} aria-label="閉じる">
          <i className="bi bi-x-lg" />
        </button>
      </div>
      <div className="td-dtoast-body">
        <div className="td-dtoast-title">{todo.title}</div>
        {todo.reminder_at && (
          <div className={`td-dtoast-meta${isOverdue ? ' is-overdue' : ''}`}>
            <i className="bi bi-clock" /> {fmtReminderAt(todo.reminder_at)}
            {isOverdue ? '（期限切れ）' : ''}
          </div>
        )}
      </div>
      <div className="td-dtoast-snooze-row">
        <span className="td-dtoast-snooze-label">スヌーズ</span>
        <button className="td-dtoast-snooze" onClick={() => snooze('30')}>+30分</button>
        <button className="td-dtoast-snooze" onClick={() => snooze('60')}>+1時間</button>
        <button className="td-dtoast-snooze" onClick={() => snooze('tomorrow')}>明日朝9時</button>
      </div>
      <div className="td-dtoast-actions">
        <button className="td-dtoast-btn td-dtoast-btn-primary" onClick={openDetail}>詳細を見る</button>
        <button className="td-dtoast-btn" onClick={() => dismissToast(id)}>閉じる</button>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: PeriodicToast を作成**

`frontend/src/components/PeriodicToast.tsx`:

```tsx
import { ReactNode } from 'react'
import { Todo, RecurringTask } from '../api/client'
import { useUiStore } from '../state/uiStore'
import { useRecurringPanel } from '../hooks/useRecurring'
import { useNearOrOverdue } from '../hooks/useNearOrOverdue'
import { buildPeriodicGroups } from '../lib/notify'
import { fmtDeadline } from '../lib/format'

export default function PeriodicToast() {
  const dismissToast = useUiStore((s) => s.dismissToast)
  const setTab = useUiStore((s) => s.setTab)
  const setForceDetailModalId = useUiStore((s) => s.setForceDetailModalId)
  const setRecurringPanelOpen = useUiStore((s) => s.setRecurringPanelOpen)
  const { data: panel } = useRecurringPanel()
  const { data: memos } = useNearOrOverdue()

  const g = buildPeriodicGroups(memos, panel)
  if (g.isEmpty) return null

  const gotoRecurring = () => {
    dismissToast('periodic')
    setRecurringPanelOpen(true)
  }
  const gotoTodo = (t: Todo) => {
    dismissToast('periodic')
    setTab('pending')
    setForceDetailModalId(t.id)
  }

  const recItem = (t: RecurringTask) => (
    <div key={`r${t.id}`} className="td-dtoast-item" onClick={gotoRecurring}>
      <span className="td-dtoast-item-title">{t.title}</span>
      {t.current_deadline && <span className="td-dtoast-item-meta">{fmtDeadline(t.current_deadline)}</span>}
    </div>
  )
  const todoItem = (t: Todo) => (
    <div key={`t${t.id}`} className="td-dtoast-item" onClick={() => gotoTodo(t)}>
      <span className="td-dtoast-item-title">{t.title}</span>
      {t.deadline && <span className="td-dtoast-item-meta">{fmtDeadline(t.deadline)}</span>}
    </div>
  )
  const group = (label: string, overdue: boolean, rows: ReactNode[]) =>
    rows.length === 0 ? null : (
      <div className={`td-dtoast-group${overdue ? ' is-overdue' : ''}`}>
        <div className="td-dtoast-group-label">{label}（{rows.length}件）</div>
        <div className="td-dtoast-group-list">{rows}</div>
      </div>
    )

  const recurringBlocks = [
    group('残タスク（期限切れ）', true, g.recurringOverdue.map(recItem)),
    group('期日が近い', false, g.recurringNear.map(recItem)),
  ].filter(Boolean)
  const todoBlocks = [
    group('期限切れ', true, g.todoOverdue.map(todoItem)),
    group('期日が近い', false, g.todoNear.map(todoItem)),
  ].filter(Boolean)

  return (
    <div className="td-dtoast td-dtoast-periodic td-dtoast-in">
      <div className="td-dtoast-header">
        <span className="td-dtoast-label">MemoTodo リマインド</span>
        <button className="td-dtoast-close" onClick={() => dismissToast('periodic')} aria-label="閉じる">
          <i className="bi bi-x-lg" />
        </button>
      </div>
      <div className="td-dtoast-body">
        {recurringBlocks.length > 0 && (
          <div className="td-dtoast-supergroup">
            <div className="td-dtoast-supergroup-label">定期タスク</div>
            {recurringBlocks}
          </div>
        )}
        {todoBlocks.length > 0 && (
          <div className="td-dtoast-supergroup">
            <div className="td-dtoast-supergroup-label">通常タスク</div>
            {todoBlocks}
          </div>
        )}
      </div>
      <div className="td-dtoast-actions">
        <button className="td-dtoast-btn" onClick={() => dismissToast('periodic')}>閉じる</button>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: ToastHost を作成**

`frontend/src/components/ToastHost.tsx`:

```tsx
import { createPortal } from 'react-dom'
import { useUiStore } from '../state/uiStore'
import ReminderToast from './ReminderToast'
import PeriodicToast from './PeriodicToast'

export default function ToastHost() {
  const toasts = useUiStore((s) => s.toasts)
  if (toasts.length === 0) return null
  return createPortal(
    <div className="td-dtoast-host">
      {toasts.map((t) =>
        t.kind === 'reminder' ? <ReminderToast key={t.id} todo={t.todo} /> : <PeriodicToast key={t.id} />,
      )}
    </div>,
    document.body,
  )
}
```

- [ ] **Step 5: Discord 風 CSS を追記**

`frontend/src/styles/todo.css` の末尾に以下を追加する（新規 `td-dtoast-*` クラス。既存 `td-toast-*` は触らない）。

```css
/* === Discord 風ハイブリッド通知トースト（Phase C） === */
/* 右下固定・縦スタック・スライドイン・手動閉じ。ダーク配色は Discord パレット準拠。 */
.td-dtoast-host {
  position: fixed;
  right: 16px;
  bottom: 16px;
  z-index: 3000;
  display: flex;
  flex-direction: column;
  gap: 10px;
  align-items: flex-end;
  pointer-events: none; /* 隙間のクリックを透過。カード側で有効化する。 */
}
.td-dtoast {
  pointer-events: auto;
  width: 340px;
  max-width: calc(100vw - 32px);
  background: #313338;
  color: #f2f3f5;
  border: 1px solid #1e1f22;
  border-radius: 10px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
  overflow: hidden;
  font-size: 13px;
}
.td-dtoast-in { animation: td-dtoast-slide-in 0.22s ease-out; }
@keyframes td-dtoast-slide-in {
  from { opacity: 0; transform: translateX(24px); }
  to   { opacity: 1; transform: translateX(0); }
}
.td-dtoast-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border-bottom: 1px solid #26272b;
}
.td-dtoast-label { font-weight: 700; font-size: 12px; letter-spacing: 0.03em; color: #b5bac1; }
.td-dtoast-close {
  border: none;
  background: transparent;
  color: #b5bac1;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 4px;
  line-height: 1;
}
.td-dtoast-close:hover { background: #3a3c42; color: #f2f3f5; }
.td-dtoast-body { padding: 10px 14px; display: flex; flex-direction: column; gap: 6px; max-height: 50vh; overflow-y: auto; }
.td-dtoast-title { font-size: 14px; font-weight: 700; white-space: pre-wrap; }
.td-dtoast-meta { font-size: 12px; color: #b5bac1; display: flex; align-items: center; gap: 5px; }
.td-dtoast-meta.is-overdue { color: #f23f43; font-weight: 700; }
.td-dtoast-snooze-row { display: flex; align-items: center; gap: 6px; padding: 0 14px 10px; flex-wrap: wrap; }
.td-dtoast-snooze-label { font-size: 11px; font-weight: 700; color: #b5bac1; }
.td-dtoast-snooze {
  border: 1px solid #4e5058;
  background: #2b2d31;
  color: #f2f3f5;
  border-radius: 6px;
  padding: 4px 8px;
  font-size: 12px;
  cursor: pointer;
}
.td-dtoast-snooze:hover { background: #3a3c42; }
.td-dtoast-actions { display: flex; gap: 8px; padding: 8px 14px 12px; }
.td-dtoast-btn {
  flex: 1;
  border: 1px solid #4e5058;
  background: #2b2d31;
  color: #f2f3f5;
  border-radius: 6px;
  padding: 7px 0;
  font-size: 12px;
  cursor: pointer;
}
.td-dtoast-btn:hover { background: #3a3c42; }
.td-dtoast-btn-primary { background: #5865f2; border-color: #5865f2; color: #fff; }
.td-dtoast-btn-primary:hover { background: #4752c4; }
.td-dtoast-supergroup + .td-dtoast-supergroup { margin-top: 8px; }
.td-dtoast-supergroup-label { font-size: 11px; font-weight: 700; color: #949ba4; margin-bottom: 4px; }
.td-dtoast-group + .td-dtoast-group { margin-top: 8px; }
.td-dtoast-group-label { font-size: 12px; font-weight: 700; color: #b5bac1; margin-bottom: 2px; }
.td-dtoast-group.is-overdue .td-dtoast-group-label { color: #f23f43; }
.td-dtoast-group-list { display: flex; flex-direction: column; }
.td-dtoast-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 6px;
  cursor: pointer;
}
.td-dtoast-item:hover { background: #3a3c42; }
.td-dtoast-item-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.td-dtoast-item-meta { color: #b5bac1; font-size: 11px; white-space: nowrap; flex-shrink: 0; }
.td-dtoast-group.is-overdue .td-dtoast-item-meta { color: #f23f43; font-weight: 700; }
```

- [ ] **Step 6: build で型・未使用 import を検証**

Run: `npm --prefix frontend run build`
Expected: 成功（tsc エラー無し・未使用 import 無し）。`PeriodicToast` は `ReactNode` を named import して `rows: ReactNode[]` で使用済み（自動 JSX ランタイムでは `React` がスコープに無いため `React.ReactNode` は使わない）。

- [ ] **Step 7: Commit**

```bash
git add frontend/src/hooks/useNearOrOverdue.ts frontend/src/components/ReminderToast.tsx frontend/src/components/PeriodicToast.tsx frontend/src/components/ToastHost.tsx frontend/src/styles/todo.css
git commit -m "feat(notify): add Discord-style toast components (ToastHost/Reminder/Periodic) and CSS"
```

---

### Task 4: イベント購読と App への配線

`useAppEvents` で EventsOn を購読し、App に `ToastHost` と強制詳細モーダルをマウント、QuickInput を focus トークンに反応させる。これで表示中のアプリ内トーストが端から端まで動く。

**Files:**
- Create: `frontend/src/hooks/useAppEvents.ts`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/DetailModal.tsx`
- Modify: `frontend/src/components/QuickInput.tsx`

**Interfaces:**
- Consumes: `EventsOn`（`../../wailsjs/runtime/runtime`）、`useQueryClient`、`qk`、Task 2 の uiStore actions、Task 3 の `ToastHost`。
- Produces: `useAppEvents(): void`。`DetailModal` に optional prop `onClose?: () => void` を追加。

- [ ] **Step 1: useAppEvents フックを作成**

`frontend/src/hooks/useAppEvents.ts`:

```ts
import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { EventsOn } from '../../wailsjs/runtime/runtime'
import { useUiStore } from '../state/uiStore'
import { qk } from '../api/queryKeys'
import { Todo } from '../api/client'

// バックエンドの通知イベントを購読する。マウント時に登録し、アンマウント時に解除する
// （EventsOn は購読解除関数を返す）。トースト表示は uiStore、関連クエリは invalidate。
export function useAppEvents() {
  const qc = useQueryClient()
  useEffect(() => {
    const { pushToast, setTab, requestQuickInputFocus, clearToastsByKind, clearAllDrafts } =
      useUiStore.getState()

    const offs = [
      EventsOn('todo:reminder', (payload: { todo?: Todo }) => {
        const t = payload?.todo
        if (!t) return
        pushToast({ kind: 'reminder', id: `reminder:${t.id}`, todo: t })
        qc.invalidateQueries({ queryKey: qk.todosAll() })
        qc.invalidateQueries({ queryKey: qk.nearOrOverdue() })
      }),
      EventsOn('todo:periodic', () => {
        pushToast({ kind: 'periodic', id: 'periodic' })
        qc.invalidateQueries({ queryKey: qk.nearOrOverdue() })
        qc.invalidateQueries({ queryKey: qk.recurringPanel() })
        qc.invalidateQueries({ queryKey: qk.recurringTasks() })
      }),
      EventsOn('todo:focus-quick-input', () => {
        setTab('pending')
        requestQuickInputFocus()
      }),
      EventsOn('todo:window-hidden', () => {
        clearToastsByKind('periodic')
        clearAllDrafts()
      }),
    ]
    return () => {
      offs.forEach((off) => off && off())
    }
  }, [qc])
}
```

- [ ] **Step 2: DetailModal に onClose を追加**

`frontend/src/components/DetailModal.tsx` を次に置き換える：

```tsx
import { createPortal } from 'react-dom'
import { Todo } from '../api/client'
import { useUiStore } from '../state/uiStore'
import TodoDetail from './TodoDetail'

export default function DetailModal({ todo, onClose }: { todo: Todo; onClose?: () => void }) {
  const setOpenId = useUiStore((s) => s.setOpenId)
  const close = onClose ?? (() => setOpenId(null))
  return createPortal(
    <>
      <div className="td-panel-overlay" style={{ display: 'block' }} onClick={close} />
      <div className="td-detail-modal" style={{ display: 'flex' }}>
        <div className="td-detail-modal-body">
          <TodoDetail todo={todo} modal />
        </div>
      </div>
    </>,
    document.body,
  )
}
```

- [ ] **Step 3: QuickInput を focus トークンに反応させる**

`frontend/src/components/QuickInput.tsx` の import と本体を変更する。

import 行を変更：

```tsx
import { useState, useRef, useEffect } from 'react'
import { main } from '../api/client'
import { useTodoMutations } from '../hooks/useTodoMutations'
import { useUiStore } from '../state/uiStore'
```

`const { create } = useTodoMutations()` の直後に追加：

```tsx
  const focusToken = useUiStore((s) => s.quickInputFocusToken)
  useEffect(() => {
    if (focusToken > 0) ref.current?.focus()
  }, [focusToken])
```

- [ ] **Step 4: App に useAppEvents / ToastHost / 強制モーダルを配線**

`frontend/src/App.tsx` を次のように変更する。

import 追加：

```tsx
import { useAppEvents } from './hooks/useAppEvents'
import ToastHost from './components/ToastHost'
```

コンポーネント本体、既存の selector 群の近くに追加：

```tsx
  const forceDetailModalId = useUiStore((s) => s.forceDetailModalId)
  const setForceDetailModalId = useUiStore((s) => s.setForceDetailModalId)
  const forcedTodo = forceDetailModalId != null ? todos?.find((t) => t.id === forceDetailModalId) : undefined
```

`useInlineDetailOutsideClose()` の近く（早期）に追加：

```tsx
  useAppEvents()
```

`return` 内、既存の `{detailPattern === 'modal' && openTodo && <DetailModal todo={openTodo} />}` の直後に追加：

```tsx
      {forcedTodo && <DetailModal todo={forcedTodo} onClose={() => setForceDetailModalId(null)} />}
```

`{settingsOpen && ...}` の後（`</div>` の直前）に追加：

```tsx
      <ToastHost />
```

- [ ] **Step 5: build＋test で検証**

Run: `npm --prefix frontend run build && npm --prefix frontend run test`
Expected: build 成功（未使用 import なし）＋全テスト PASS（33）。

- [ ] **Step 6: Commit**

```bash
git add frontend/src/hooks/useAppEvents.ts frontend/src/App.tsx frontend/src/components/DetailModal.tsx frontend/src/components/QuickInput.tsx
git commit -m "feat(notify): subscribe app events and mount ToastHost + forced detail modal"
```

- [ ] **Step 7: GUI 目視（ユーザーゲート）**

コントローラはユーザーに依頼：`wails dev` で (1) リマインダー発火時に右下へダークカードがスライドイン・スタック、(2) スヌーズ3種、(3)「詳細を見る」で pending＋モーダル詳細、(4) 定期通知で4区分集約と項目クリック遷移、(5) トレイ「タスク追加」で pending＋クイック入力 focus、(6) ウィンドウをトレイに隠すと定期トースト消滅＋ドラフト消去、を確認。

---

### Task 5: バックエンド：表示中は OS ネイティブ通知を抑制

ウィンドウ表示中（かつ非最小化）または前面化する場合は `notify.Push` をスキップし、二重通知を防ぐ（真の Discord 挙動）。純関数 `shouldPushNative` を Go テストで検証。

**Files:**
- Modify: `app.go`
- Modify: `main.go`
- Test: `app_test.go`（新規）

**Interfaces:**
- Produces: `func shouldPushNative(visible, minimised, toastEnabled, bringToFront bool) bool`。`App` に `windowVisible atomic.Bool` フィールド。

- [ ] **Step 1: shouldPushNative の失敗テストを書く**

`app_test.go`（プロジェクトルート、package main）:

```go
package main

import "testing"

func TestShouldPushNative(t *testing.T) {
	cases := []struct {
		name                                 string
		visible, minimised, toast, front, want bool
	}{
		{"toast無効なら出さない", true, false, false, false, false},
		{"表示中(非最小化)は抑制", true, false, true, false, false},
		{"表示中でも最小化なら出す", true, true, true, false, true},
		{"非表示なら出す", false, false, true, false, true},
		{"前面化するなら抑制", false, false, true, true, false},
	}
	for _, c := range cases {
		if got := shouldPushNative(c.visible, c.minimised, c.toast, c.front); got != c.want {
			t.Errorf("%s: shouldPushNative(%v,%v,%v,%v)=%v want %v",
				c.name, c.visible, c.minimised, c.toast, c.front, got, c.want)
		}
	}
}
```

- [ ] **Step 2: テストが失敗（未定義）することを確認**

Run: `export PATH="/c/Program Files/Go/bin:$HOME/go/bin:$PATH" && go test ./... -run TestShouldPushNative`
Expected: FAIL / ビルドエラー（`undefined: shouldPushNative`）。

- [ ] **Step 3: shouldPushNative を実装し、通知ハンドラに配線**

`app.go` の import に `sync/atomic` を追加：

```go
	"path/filepath"
	"runtime"
	"strings"
	"sync/atomic"
	"time"
```

`App` 構造体にフィールドを追加：

```go
type App struct {
	ctx           context.Context
	store         *todo.Store
	scheduler     *todo.Scheduler
	windowVisible atomic.Bool
}
```

`startup` の末尾（`a.initWindowsNotifications(dataDir)` の後）に追加：

```go
	a.windowVisible.Store(true)
```

`bringToFront` の末尾（`wailsruntime.WindowUnminimise(a.ctx)` の後）に追加：

```go
	a.windowVisible.Store(true)
```

`handleReminderNotify` の通知抑制部分を置き換える。現状：

```go
	if method.Toast {
		notify.Push("リマインダー", t.Title)
	}
```

を次に：

```go
	if shouldPushNative(a.windowVisible.Load(), wailsruntime.WindowIsMinimised(a.ctx), method.Toast, method.BringToFront) {
		notify.Push("リマインダー", t.Title)
	}
```

`handlePeriodicNotify` の通知抑制部分を置き換える。現状：

```go
	if method.Toast {
		if body := a.periodicNotifySummary(); body != "" {
			notify.Push("MemoTodo リマインド", body)
		}
	}
```

を次に：

```go
	if shouldPushNative(a.windowVisible.Load(), wailsruntime.WindowIsMinimised(a.ctx), method.Toast, method.BringToFront) {
		if body := a.periodicNotifySummary(); body != "" {
			notify.Push("MemoTodo リマインド", body)
		}
	}
```

`bringToFront` の直前あたり（`--- 通知 ---` 節の適切な場所）に純関数を追加：

```go
// shouldPushNative は OS ネイティブ通知（notify.Push）を出すべきか判定する。
// ウィンドウが見えている（表示中かつ非最小化）／これから前面化する場合は、
// アプリ内トーストが目に入るためネイティブ通知は抑制する（二重通知防止＝Discord 挙動）。
func shouldPushNative(visible, minimised, toastEnabled, bringToFront bool) bool {
	if !toastEnabled {
		return false
	}
	if bringToFront {
		return false
	}
	if visible && !minimised {
		return false
	}
	return true
}
```

- [ ] **Step 4: main.go でウィンドウ非表示時にフラグを下ろす**

`main.go` の `OnBeforeClose` 内、`wailsruntime.EventsEmit(ctx, "todo:window-hidden")` と `wailsruntime.WindowHide(ctx)` の間に追加：

```go
				wailsruntime.EventsEmit(ctx, "todo:window-hidden")
				app.windowVisible.Store(false)
				wailsruntime.WindowHide(ctx)
				return true
```

- [ ] **Step 5: Go テストが通ることを確認**

Run: `export PATH="/c/Program Files/Go/bin:$HOME/go/bin:$PATH" && go test ./... -run TestShouldPushNative && go build ./...`
Expected: PASS ＋ ビルド成功。

- [ ] **Step 6: Commit**

```bash
git add app.go main.go app_test.go
git commit -m "feat(notify): suppress native OS toast while window visible (hybrid gate)"
```

- [ ] **Step 7: 埋め込みビルド＋GUI 目視（ユーザーゲート）**

コントローラ：`export PATH="/c/Program Files/Go/bin:$HOME/go/bin:$PATH" && wails build -platform windows/amd64` → `build/bin/memotodo.exe` 生成を確認。その後 `git checkout -- go.mod frontend/wailsjs`（再生成ノイズ破棄）、必要なら `rm -f ./nul`。
ユーザーに依頼：(1) ウィンドウ表示中は Windows アクションセンター通知が**出ず**アプリ内トーストのみ、(2) ウィンドウをトレイに隠す／最小化すると Windows ネイティブ通知が出て音が鳴りクリックで前面化、を確認。

---

## Self-Review

**1. Spec coverage（spec §各項 → タスク対応）:**
- §2-1 ハイブリッド：Task 3/4（アプリ内）＋既存 `notify.Push`＋Task 5（排他）。✓
- §2-2 表示中はネイティブ抑制：Task 5（`shouldPushNative`＋`windowVisible`）。✓
- §2-3 ネイティブはシンプル：`internal/notify` 無変更（Task 5 は呼び出し条件のみ変更）。✓
- §2-4 スタック＋手動閉じ・自動消滅なし：Task 2（`toasts[]`）＋Task 3（`ToastHost` スタック、閉じ操作のみ、タイマー無し）。✓
- §2-5 通知からは常にモーダル：Task 2（`forceDetailModalId`）＋Task 4（App 配線、`setTab` で openId クリア）。✓
- §2-6 focus-quick-input は pending 切替後 focus：Task 2（token）＋Task 3/4（QuickInput・useAppEvents）。✓
- §2-7 新規 Discord CSS：Task 3（`td-dtoast-*`）。✓
- §3 4イベント購読：Task 4（`useAppEvents` の 4 EventsOn）。✓
- §5.3 定期4区分集約・空なら非表示・項目遷移：Task 1（`buildPeriodicGroups`）＋Task 3（`PeriodicToast`）。✓
- §7 エラー処理（スヌーズ best-effort・periodic 空で null・購読解除）：Task 3/4。✓
- §8 テスト（集約・トーストリデューサ・shouldPushNative）：Task 1/2/5。✓

**2. Placeholder scan:** "TBD"/"適宜"/"handle edge cases" 等の曖昧語なし。全コードステップに実コードあり。✓（Task 3 Step 6 の `React.ReactNode` 注意書きは具体的な代替コードを明示済み。）

**3. Type consistency:**
- `pushToast({ kind, id, todo })` の形は Task 2 定義・Task 4 呼び出しで一致。`id` は `reminder:${id}`/`'periodic'`。✓
- `dismissToast(id: string)`／`clearToastsByKind(kind)`／`setForceDetailModalId(number|null)`／`requestQuickInputFocus()`／`quickInputFocusToken`：Task 2 定義と Task 3/4 使用で一致。✓
- `buildPeriodicGroups(memos, panel)` の引数順・戻り値（`PeriodicGroups`）：Task 1 定義と Task 3 使用で一致。✓
- `DetailModal` の `onClose?`：Task 4 で定義・使用一致。✓
- `shouldPushNative(visible, minimised, toastEnabled, bringToFront)` の引数順：Task 5 のテスト・実装・呼び出しで一致。✓
- 既存 API 署名（`SnoozeReminder`/`GetNearOrOverdueMemos`/`GetRecurringPanel`/`EventsOn`/`fmtDeadline`/`setRecurringPanelOpen`/`setTab`）は本文書 Global Constraints と既存コードに一致。✓
