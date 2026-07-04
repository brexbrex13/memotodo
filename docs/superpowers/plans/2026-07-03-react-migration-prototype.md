# React-ts 移行プロトタイプ 実装計画（Phase 0）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** MemoTodo のフロントを React + Vite + TypeScript へ移行するための「縦割り1本」プロトタイプを作り、4つの合否判定（TipTap画像貼付／dnd-kit並び替え／インライン⇔モーダル無二重化／exe埋め込みビルド）を通す。

**Architecture:** Go バックエンドと `frontend/wailsjs/` バインディングは無変更。`frontend/` をバンドラーなし素JSから Vite React-TS へ置換し、`main.go` の埋め込み先を `frontend/dist` に変える。サーバー状態は TanStack Query（`App.*` を query/mutation でラップし mutation→invalidate）、純UI状態は Zustand ストア。見た目は既存 `todo.css` をそのまま移植。

**Tech Stack:** React 18, Vite 5, TypeScript 5, @tanstack/react-query 5, zustand 5, TipTap 2（StarterKit/Link/Image/TextStyle/Color）, dnd-kit（core/sortable/utilities）, bootstrap-icons, Vitest + Testing Library。

## Global Constraints

- 対象範囲は **プロトタイプ（Phase 0）のみ**。定期タスクパネル・各モーダル・通知トースト・`EventsOn` はこの計画では扱わない（ゲート通過後に別計画）。
- **Go バックエンド（`app.go`）と `frontend/wailsjs/` は変更しない。** Wails が `wails dev`/`wails build` 時に自動再生成する。
- 見た目は現行維持。CSS クラス名は既存 `todo.css` のものを踏襲する（新規クラスを増やさない）。
- メモ本文（`memo`）は **HTML 文字列**として保存・取得する（現行 `memoEditor.innerHTML` と同じ契約）。
- リンク検出は**バックエンドの責務**で `todo.links: {type, value}[]` として返る。フロントは表示とクリック処理（`OpenURL` / `OpenLocalPath`）のみ。クライアント側でのリンク検出は実装しない。
- 画像保存の契約：`App.SaveImage(dataUrl: string)` に **data URL**（`FileReader.readAsDataURL` の結果）を渡すと、`<img src>` にそのまま使える **URL 文字列**が返る。
- ビルド成果物は `frontend/dist`。`main.go` の埋め込みをそこへ向ける。配布物（exe）への単一埋め込み＝1フォルダ持ち運びは維持する。
- 開発コマンドは **PATH に `go` と `wails` が通った新規ターミナル**で実行する（`C:\Program Files\Go\bin` と `%USERPROFILE%\go\bin`）。作業は `feat/react-migration` ブランチ。
- API 型（`frontend/wailsjs/go/models.ts` より、変更禁止）：
  - `todo.Todo`: `{ id:number; title:string; memo:string; status:string; deadline:string; reminder_enabled:boolean; reminder_at:string; reminded:boolean; created_at:string; done_at:string; is_important:boolean; sort_order:number; is_overdue:boolean; is_near:boolean; links?: todo.Link[] }`
  - `todo.Link`: `{ type:string; value:string }`
  - `todo.Settings`: `{ notify_times:string[]; detail_pattern:string; recurring_display_days:Record<string,number>; todo_near_deadline_days:number; reminder_notify_method:NotifyMethod; periodic_notify_method:NotifyMethod }`
  - `main.CreateTodoRequest`: `{ title; memo; deadline; reminder_enabled; reminder_at; is_important }`
  - `main.UpdateTodoRequest`: すべて optional `{ title?; memo?; deadline?; reminder_enabled?; reminder_at?; status?; done_at?; is_important? }`
  - App 関数（`frontend/wailsjs/go/main/App`）：`GetTodos(status:string):Promise<Todo[]>` / `GetTodo(id):Promise<Todo>` / `CreateTodo(req):Promise<number>` / `UpdateTodo(id, req):Promise<void>` / `CompleteTodo(id):Promise<void>` / `RestoreTodo(id):Promise<void>` / `DeleteTodo(id):Promise<void>` / `ToggleImportant(id):Promise<void>` / `ReorderTodos(ids:number[]):Promise<void>` / `SaveImage(dataUrl):Promise<string>` / `OpenURL(url):Promise<void>` / `OpenLocalPath(path):Promise<void>` / `GetSettings():Promise<Settings>` / `SaveSettings(req):Promise<Settings>`。

---

## File Structure

**新規作成（`frontend/` 配下）**
- `package.json` / `vite.config.ts` / `tsconfig.json` / `tsconfig.node.json` — Vite/TS/Vitest 設定
- `index.html` — Vite エントリ（`<div id="root">`）※既存を置換
- `src/main.tsx` — ブート（QueryClientProvider）
- `src/App.tsx` — レイアウト
- `src/vite-env.d.ts` — Vite 型
- `src/styles/todo.css` — 既存 `frontend/src/todo.css` を移動
- `src/api/client.ts` — `App.*` と型の再エクスポート
- `src/api/queryKeys.ts` — query key ファクトリ
- `src/state/uiStore.ts` — Zustand（activeTab / openId / detailPattern / drafts）
- `src/lib/format.ts` + `src/lib/format.test.ts` — 純ロジック＋テスト
- `src/hooks/useSettings.ts` / `src/hooks/useTodos.ts` / `src/hooks/useTodoMutations.ts`
- `src/components/Tabs.tsx` / `QuickInput.tsx` / `TodoList.tsx` / `TodoRow.tsx` / `TodoDetail.tsx` / `DetailModal.tsx` / `RichTextEditor.tsx` / `DetectedLinks.tsx`

**変更**
- `wails.json` — install/build/watcher/serverUrl
- `main.go` — 埋め込み `frontend/dist`

**削除**
- `frontend/src/todo.js`（Task 11、全機能移植後）

---

## Task 1: Vite React-TS 足場と Wails 配線

**Files:**
- Create: `frontend/package.json`, `frontend/vite.config.ts`, `frontend/tsconfig.json`, `frontend/tsconfig.node.json`, `frontend/src/vite-env.d.ts`, `frontend/src/main.tsx`, `frontend/src/App.tsx`
- Modify (replace): `frontend/index.html`
- Modify: `wails.json`, `main.go`

**Interfaces:**
- Produces: `frontend/dist/` ビルド成果物、`wails dev`/`wails build` が通る React アプリの土台。

- [ ] **Step 1: `frontend/package.json` を作成**

```json
{
  "name": "memotodo-frontend",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "test": "vitest run"
  },
  "dependencies": {
    "@dnd-kit/core": "^6.1.0",
    "@dnd-kit/sortable": "^8.0.0",
    "@dnd-kit/utilities": "^3.2.2",
    "@tanstack/react-query": "^5.51.0",
    "@tiptap/extension-color": "^2.5.0",
    "@tiptap/extension-image": "^2.5.0",
    "@tiptap/extension-link": "^2.5.0",
    "@tiptap/extension-text-style": "^2.5.0",
    "@tiptap/pm": "^2.5.0",
    "@tiptap/react": "^2.5.0",
    "@tiptap/starter-kit": "^2.5.0",
    "bootstrap-icons": "^1.11.3",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "zustand": "^5.0.0"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.4.0",
    "@testing-library/react": "^16.0.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.0",
    "jsdom": "^24.1.0",
    "typescript": "^5.5.0",
    "vite": "^5.3.0",
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 2: `frontend/vite.config.ts` を作成（Vitest 設定込み）**

```ts
/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: { outDir: 'dist', emptyOutDir: true },
  test: { environment: 'jsdom', globals: true },
})
```

- [ ] **Step 3: `frontend/tsconfig.json` と `frontend/tsconfig.node.json` を作成**

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "allowJs": true
  },
  "include": ["src", "wailsjs"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

`tsconfig.node.json`:
```json
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true
  },
  "include": ["vite.config.ts"]
}
```

- [ ] **Step 4: `frontend/src/vite-env.d.ts` を作成**

```ts
/// <reference types="vite/client" />
```

- [ ] **Step 5: `frontend/index.html` を置換**

```html
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8" />
  <meta content="width=device-width, initial-scale=1.0" name="viewport" />
  <title>MemoTodo</title>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/src/main.tsx"></script>
</body>
</html>
```

- [ ] **Step 6: `frontend/src/main.tsx` と最小 `frontend/src/App.tsx` を作成**

`main.tsx`:
```tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
```

`App.tsx`:
```tsx
export default function App() {
  return <div style={{ padding: 24 }}>MemoTodo (React prototype)</div>
}
```

- [ ] **Step 7: `wails.json` を Vite 用に更新**

```json
{
  "$schema": "https://wails.io/schemas/config.v2.json",
  "name": "memotodo",
  "outputfilename": "memotodo",
  "frontend:install": "npm install",
  "frontend:build": "npm run build",
  "frontend:dev:watcher": "npm run dev",
  "frontend:dev:serverUrl": "auto",
  "author": { "name": "MemoTodo", "email": "" }
}
```

- [ ] **Step 8: `main.go` の埋め込み先を `frontend/dist` に変更**

`main.go` の該当2箇所を変更する:
```go
//go:embed all:frontend/dist
var assets embed.FS
```
```go
frontendFS, err := fs.Sub(assets, "frontend/dist")
```

- [ ] **Step 9: 依存インストールと初回ビルドで `dist` を生成**

Run（新規ターミナル、`frontend/` 内）: `npm install && npm run build`
Expected: `frontend/dist/index.html` と `dist/assets/` が生成される（`//go:embed all:frontend/dist` がコンパイル可能になる）

- [ ] **Step 10: `wails dev` で React が起動することを確認**

Run（プロジェクト直下）: `wails dev`
Expected: ウィンドウに「MemoTodo (React prototype)」が表示。例の serverUrl 自動検出エラーが出ない。

- [ ] **Step 11: `wails build` で exe に埋め込めることを確認**

Run: `wails build -platform windows/amd64`
Expected: `build/bin/memotodo.exe` が生成され、起動すると同じ画面が出る（`dist` が埋め込まれている）。

- [ ] **Step 12: コミット**

```bash
git add frontend/package.json frontend/vite.config.ts frontend/tsconfig.json frontend/tsconfig.node.json frontend/index.html frontend/src/main.tsx frontend/src/App.tsx frontend/src/vite-env.d.ts wails.json main.go
git commit -m "feat(proto): scaffold Vite React-TS frontend and wire Wails to frontend/dist"
```

---

## Task 2: スタイル移植・App シェル・Zustand ストア

**Files:**
- Move: `frontend/src/todo.css` → `frontend/src/styles/todo.css`
- Create: `frontend/src/state/uiStore.ts`
- Modify: `frontend/src/main.tsx`, `frontend/src/App.tsx`

**Interfaces:**
- Produces: `useUiStore` フック（`activeTab`, `openId`, `detailPattern`, `drafts` と各 setter）、既存デザインが当たった空レイアウト。

- [ ] **Step 1: CSS を移動し、`main.tsx` で読み込む**

`frontend/src/todo.css` を `frontend/src/styles/todo.css` へ移動。`main.tsx` の先頭に import を追加:
```tsx
import 'bootstrap-icons/font/bootstrap-icons.css'
import './styles/todo.css'
```

- [ ] **Step 2: `frontend/src/state/uiStore.ts` を作成**

```ts
import { create } from 'zustand'

export type Tab = 'pending' | 'done'
export type DetailPattern = 'inline' | 'modal'

// 未保存編集ドラフト（DB には保存しない）
export interface TodoDraft {
  title?: string
  memo?: string
  deadline?: string | null
  reminder_enabled?: boolean
  reminder_at?: string | null
}

interface UiState {
  activeTab: Tab
  openId: number | null
  detailPattern: DetailPattern
  drafts: Record<number, TodoDraft>
  setTab: (t: Tab) => void
  setOpenId: (id: number | null) => void
  setDetailPattern: (p: DetailPattern) => void
  setDraft: (id: number, draft: TodoDraft) => void
  clearDraft: (id: number) => void
}

export const useUiStore = create<UiState>((set) => ({
  activeTab: 'pending',
  openId: null,
  detailPattern: 'inline',
  drafts: {},
  setTab: (t) => set({ activeTab: t, openId: null }),
  setOpenId: (id) => set({ openId: id }),
  setDetailPattern: (p) => set({ detailPattern: p }),
  setDraft: (id, draft) => set((s) => ({ drafts: { ...s.drafts, [id]: draft } })),
  clearDraft: (id) =>
    set((s) => {
      const next = { ...s.drafts }
      delete next[id]
      return { drafts: next }
    }),
}))
```

- [ ] **Step 3: `App.tsx` に既存クラス名でレイアウトの骨格を組む**

```tsx
export default function App() {
  return (
    <div className="td-app">
      <header className="td-header">
        <div className="td-header-inner">
          <div className="td-header-left">
            <span className="td-logo-mark" />
            <span className="td-header-title">MemoTodo</span>
          </div>
          <div className="td-header-actions">
            <button className="td-icon-btn td-btn-settings" title="設定">
              <i className="bi bi-gear" />
            </button>
          </div>
        </div>
      </header>
      <main className="td-main">
        <div className="td-content">
          {/* Tabs / QuickInput / TodoList はこの後のタスクで差し込む */}
        </div>
      </main>
    </div>
  )
}
```

- [ ] **Step 4: `wails dev` で見た目を確認**

Run: `wails dev`
Expected: 既存デザインのヘッダー（ロゴ・タイトル・設定ギア）が現行と同じ見た目で表示される。

- [ ] **Step 5: コミット**

```bash
git add frontend/src/styles/todo.css frontend/src/state/uiStore.ts frontend/src/main.tsx frontend/src/App.tsx
git rm frontend/src/todo.css
git commit -m "feat(proto): port todo.css, add app shell and Zustand UI store"
```

---

## Task 3: API ラッパ・QueryClient・useSettings

**Files:**
- Create: `frontend/src/api/client.ts`, `frontend/src/api/queryKeys.ts`, `frontend/src/hooks/useSettings.ts`
- Modify: `frontend/src/main.tsx`, `frontend/src/App.tsx`

**Interfaces:**
- Produces: `App`（バインディング再エクスポート）、`qk`（query key ファクトリ）、`useSettings()`（`{ data?: Settings }`）。
- Consumes: Task 2 の `useUiStore`。

- [ ] **Step 1: `frontend/src/api/client.ts` を作成**

```ts
import * as App from '../../wailsjs/go/main/App'
import { todo, main } from '../../wailsjs/go/models'

export { App, todo, main }
export type Todo = todo.Todo
export type Settings = todo.Settings
export type Link = todo.Link
```

- [ ] **Step 2: `frontend/src/api/queryKeys.ts` を作成**

```ts
export const qk = {
  todos: (tab: string) => ['todos', tab] as const,
  todo: (id: number) => ['todo', id] as const,
  settings: () => ['settings'] as const,
  nearOrOverdue: () => ['nearOrOverdue'] as const,
}
```

- [ ] **Step 3: `main.tsx` を QueryClientProvider で包む**

```tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App'
import 'bootstrap-icons/font/bootstrap-icons.css'
import './styles/todo.css'

const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false, staleTime: 1000 } },
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>,
)
```

- [ ] **Step 4: `frontend/src/hooks/useSettings.ts` を作成**

```ts
import { useQuery } from '@tanstack/react-query'
import { App, Settings } from '../api/client'
import { qk } from '../api/queryKeys'

export function useSettings() {
  return useQuery<Settings>({ queryKey: qk.settings(), queryFn: () => App.GetSettings() })
}
```

- [ ] **Step 5: `App.tsx` で settings を読み、detailPattern をストアへ反映**

`App.tsx` の関数本体に以下を追加（早期に）:
```tsx
import { useEffect } from 'react'
import { useSettings } from './hooks/useSettings'
import { useUiStore } from './state/uiStore'
// ...
const { data: settings } = useSettings()
const setDetailPattern = useUiStore((s) => s.setDetailPattern)
useEffect(() => {
  if (settings?.detail_pattern === 'inline' || settings?.detail_pattern === 'modal') {
    setDetailPattern(settings.detail_pattern)
  }
}, [settings?.detail_pattern, setDetailPattern])
```
（動作確認用に一時的に `<div>pattern: {useUiStore((s) => s.detailPattern)}</div>` を `td-content` 内に置いてよい）

- [ ] **Step 6: `wails dev` で settings 取得を確認**

Run: `wails dev`
Expected: 一時表示した `pattern: inline`（または modal）が出る＝`GetSettings` が Query 経由で取れている。確認後、一時表示は削除。

- [ ] **Step 7: コミット**

```bash
git add frontend/src/api frontend/src/hooks/useSettings.ts frontend/src/main.tsx frontend/src/App.tsx
git commit -m "feat(proto): add typed API layer, TanStack Query client, useSettings"
```

---

## Task 4: 純ロジック（format）と Vitest

**Files:**
- Create: `frontend/src/lib/format.ts`, `frontend/src/lib/format.test.ts`

**Interfaces:**
- Produces: `fmtDeadline(iso: string): string`, `previewText(text: string): string`, `normalizeLocalPath(path: string): string`, `computeReorder(ids: number[], fromId: number, toId: number): number[]`。

- [ ] **Step 1: 失敗するテストを書く**

`frontend/src/lib/format.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { fmtDeadline, previewText, normalizeLocalPath, computeReorder } from './format'

describe('fmtDeadline', () => {
  it('空文字は空を返す', () => expect(fmtDeadline('')).toBe(''))
  it('YYYY-MM-DD を M/D(曜) に整形する', () => {
    // 2026-07-03 は金曜
    expect(fmtDeadline('2026-07-03')).toBe('7/3(金)')
  })
  it('ローカル時刻で曜日を計算する（UTCずれで前日にならない）', () => {
    // 2026-01-01 は木曜
    expect(fmtDeadline('2026-01-01')).toBe('1/1(木)')
  })
})

describe('previewText', () => {
  it('単一行はそのまま', () => expect(previewText('買い物')).toBe('買い物'))
  it('複数行は1行目＋省略記号', () => expect(previewText('件名\n詳細')).toBe('件名　…'))
  it('null/undefined は空', () => expect(previewText(undefined as unknown as string)).toBe(''))
})

describe('normalizeLocalPath', () => {
  it('通常パスはそのまま', () =>
    expect(normalizeLocalPath('C:\\work\\a.txt')).toBe('C:\\work\\a.txt'))
  it('file:// を剥がして復号する', () =>
    expect(normalizeLocalPath('file:///C:/work/%E3%81%82.txt')).toBe('/C:/work/あ.txt'))
})

describe('computeReorder', () => {
  it('from を to の位置へ移動した新しい順序を返す', () => {
    expect(computeReorder([1, 2, 3, 4], 4, 2)).toEqual([1, 4, 2, 3])
  })
  it('from か to が無ければ元の配列を返す', () => {
    expect(computeReorder([1, 2, 3], 9, 2)).toEqual([1, 2, 3])
  })
})
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run（`frontend/` 内）: `npm run test`
Expected: FAIL（`format.ts` が存在しない／export が未定義）

- [ ] **Step 3: `frontend/src/lib/format.ts` を実装**

```ts
const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土']

// "YYYY-MM-DD" -> "M/D(曜)"。曜日はローカル時刻の new Date(y, m-1, d) で求める
// （Date.parse("YYYY-MM-DD") は UTC 扱いになり時差で前日にずれるため使わない）。
export function fmtDeadline(iso: string): string {
  if (!iso) return ''
  const [y, m, d] = iso.split('-').map(Number)
  const wd = WEEKDAYS[new Date(y, m - 1, d).getDay()]
  return `${m}/${d}(${wd})`
}

export function previewText(text: string): string {
  const lines = String(text ?? '').split('\n')
  return lines[0] + (lines.length > 1 ? '　…' : '')
}

// リンク一覧のローカルパスクリック時の正規化（現行 _renderLinks と同じ挙動）
export function normalizeLocalPath(path: string): string {
  return path.startsWith('file://') ? decodeURIComponent(path.slice(7)) : path
}

// ドラッグ並び替え後の新しい id 順序を返す（fromId を toId の位置へ挿入）
export function computeReorder(ids: number[], fromId: number, toId: number): number[] {
  const from = ids.indexOf(fromId)
  const to = ids.indexOf(toId)
  if (from < 0 || to < 0) return ids
  const next = ids.slice()
  next.splice(to, 0, next.splice(from, 1)[0])
  return next
}
```

- [ ] **Step 4: テストを実行して成功を確認**

Run: `npm run test`
Expected: PASS（全 11 アサーション green）

- [ ] **Step 5: コミット**

```bash
git add frontend/src/lib/format.ts frontend/src/lib/format.test.ts
git commit -m "feat(proto): add pure format/reorder helpers with Vitest tests"
```

---

## Task 5: useTodos・Tabs・一覧表示（読み取り専用）

**Files:**
- Create: `frontend/src/hooks/useTodos.ts`, `frontend/src/components/Tabs.tsx`, `frontend/src/components/TodoList.tsx`, `frontend/src/components/TodoRow.tsx`
- Modify: `frontend/src/App.tsx`

**Interfaces:**
- Produces: `useTodos(tab)`（`{ data?: Todo[] }`）、`<Tabs/>`, `<TodoList/>`, `<TodoRow todo/>`。
- Consumes: `useUiStore`, `qk`, `App.GetTodos`, `fmtDeadline`, `previewText`。

- [ ] **Step 1: `frontend/src/hooks/useTodos.ts` を作成**

```ts
import { useQuery } from '@tanstack/react-query'
import { App, Todo } from '../api/client'
import { qk } from '../api/queryKeys'
import { useUiStore } from '../state/uiStore'

export function useTodos(tab?: string) {
  const activeTab = useUiStore((s) => s.activeTab)
  const t = tab ?? activeTab
  return useQuery<Todo[]>({ queryKey: qk.todos(t), queryFn: () => App.GetTodos(t) })
}
```

- [ ] **Step 2: `frontend/src/components/Tabs.tsx` を作成**

```tsx
import { useTodos } from '../hooks/useTodos'
import { useUiStore } from '../state/uiStore'

export default function Tabs() {
  const activeTab = useUiStore((s) => s.activeTab)
  const setTab = useUiStore((s) => s.setTab)
  const { data: pending } = useTodos('pending')

  return (
    <div className="td-tabs-row">
      <div className="td-tabs">
        <button
          className={`td-tab ${activeTab === 'pending' ? 'active' : ''}`}
          onClick={() => setTab('pending')}
        >
          タスク一覧
          <span className="td-badge">{pending?.length ?? 0}</span>
        </button>
        <button
          className={`td-tab ${activeTab === 'done' ? 'active' : ''}`}
          onClick={() => setTab('done')}
        >
          完了済み
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: `frontend/src/components/TodoRow.tsx` を作成（読み取り専用）**

```tsx
import { Todo } from '../api/client'
import { useUiStore } from '../state/uiStore'
import { fmtDeadline, previewText } from '../lib/format'

export default function TodoRow({ todo }: { todo: Todo }) {
  const activeTab = useUiStore((s) => s.activeTab)
  const openId = useUiStore((s) => s.openId)
  const setOpenId = useUiStore((s) => s.setOpenId)
  const isDone = activeTab === 'done'
  const isOpen = openId === todo.id

  const rowClass = [
    'td-row',
    isDone ? 'is-done' : '',
    todo.is_overdue && !isDone ? 'is-overdue' : '',
    todo.is_important ? 'is-important' : '',
  ].join(' ')

  const chipClass = todo.is_overdue && !isDone ? 'is-overdue' : todo.is_near && !isDone ? 'is-near' : ''

  return (
    <div className={rowClass}>
      <div className={`td-checkbox ${isDone ? 'is-checked' : ''}`} title={isDone ? '未完了に戻す' : '完了にする'}>
        {isDone ? <i className="bi bi-check-lg" /> : null}
      </div>
      <div className="td-row-main">
        <div className="td-row-title" onClick={() => setOpenId(isOpen ? null : todo.id)}>
          {previewText(todo.title)}
        </div>
      </div>
      <div className="td-row-side">
        {todo.reminder_enabled ? (
          <span className="td-meta-icon" title="リマインダーあり"><i className="bi bi-bell" /></span>
        ) : null}
        {todo.memo && todo.memo.trim() ? (
          <span className="td-meta-icon" title="詳細メモあり"><i className="bi bi-journal-text" /></span>
        ) : null}
        <button className={`td-icon-btn td-btn-important ${todo.is_important ? 'is-active' : ''}`} title="重要">
          <i className={`bi ${todo.is_important ? 'bi-star-fill' : 'bi-star'}`} />
        </button>
        {todo.deadline ? <span className={`td-deadline-chip ${chipClass}`}>{fmtDeadline(todo.deadline)}</span> : null}
        <button className="td-icon-btn td-chevron" title="詳細" onClick={() => setOpenId(isOpen ? null : todo.id)}>
          <i className={`bi ${isOpen ? 'bi-chevron-up' : 'bi-chevron-down'}`} />
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: `frontend/src/components/TodoList.tsx` を作成**

```tsx
import { useTodos } from '../hooks/useTodos'
import { useUiStore } from '../state/uiStore'
import TodoRow from './TodoRow'

export default function TodoList() {
  const activeTab = useUiStore((s) => s.activeTab)
  const { data: todos, isLoading, isError } = useTodos()

  if (isLoading) return <div className="td-loading"><span className="td-spinner" /></div>
  if (isError) return <div style={{ padding: 24, color: 'var(--accent)', fontSize: 13 }}>読み込みに失敗しました</div>
  const list = todos ?? []
  if (list.length === 0) return <div className="td-empty">タスクはありません</div>

  const noDate = activeTab === 'done' ? [] : list.filter((t) => !t.deadline)
  const dated = activeTab === 'done'
    ? [...list].sort((a, b) => (b.done_at || '').localeCompare(a.done_at || ''))
    : list.filter((t) => t.deadline)
  const flat = activeTab === 'done' ? dated : null

  return (
    <div className="td-card-group">
      {flat ? (
        <div className="td-card">
          <div className="td-list">{flat.map((t) => <TodoRow key={t.id} todo={t} />)}</div>
        </div>
      ) : (
        <>
          {noDate.length > 0 && (
            <div className="td-card">
              <div className="td-section-label">期日なし</div>
              <div className="td-list" id="tdListNoDate">{noDate.map((t) => <TodoRow key={t.id} todo={t} />)}</div>
            </div>
          )}
          {dated.length > 0 && (
            <div className="td-card">
              <div className="td-section-label"><i className="bi bi-calendar3" /> 期日あり</div>
              <div className="td-list">{dated.map((t) => <TodoRow key={t.id} todo={t} />)}</div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 5: `App.tsx` の `td-content` に `<Tabs/>` と `<TodoList/>` を差し込む**

```tsx
import Tabs from './components/Tabs'
import TodoList from './components/TodoList'
// td-content 内:
// <Tabs />
// <div className="td-list-wrap"><TodoList /></div>
```

- [ ] **Step 6: `wails dev` で一覧表示を確認**

Run: `wails dev`
Expected: 既存 DB のメモが「期日なし／期日あり」に分かれて現行と同じ見た目で表示。タブ切替で pending/done が切り替わり、バッジ件数が出る。

- [ ] **Step 7: コミット**

```bash
git add frontend/src/hooks/useTodos.ts frontend/src/components/Tabs.tsx frontend/src/components/TodoList.tsx frontend/src/components/TodoRow.tsx frontend/src/App.tsx
git commit -m "feat(proto): render todo list (read-only) with tabs and badge via TanStack Query"
```

---

## Task 6: クイック入力と CreateTodo

**Files:**
- Create: `frontend/src/hooks/useTodoMutations.ts`, `frontend/src/components/QuickInput.tsx`
- Modify: `frontend/src/App.tsx`

**Interfaces:**
- Produces: `useTodoMutations()`（この時点では `create`）、`<QuickInput/>`。
- Consumes: `App.CreateTodo`, `qk`, `useQueryClient`。

- [ ] **Step 1: `frontend/src/hooks/useTodoMutations.ts` を作成**

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { App, main } from '../api/client'

export function useTodoMutations() {
  const qc = useQueryClient()
  const invalidateLists = () => {
    qc.invalidateQueries({ queryKey: ['todos'] })
    qc.invalidateQueries({ queryKey: ['nearOrOverdue'] })
  }

  const create = useMutation({
    mutationFn: (req: main.CreateTodoRequest) => App.CreateTodo(req),
    onSuccess: invalidateLists,
  })

  return { create, invalidateLists }
}
```

- [ ] **Step 2: `frontend/src/components/QuickInput.tsx` を作成**

```tsx
import { useState, useRef } from 'react'
import { main } from '../api/client'
import { useTodoMutations } from '../hooks/useTodoMutations'

export default function QuickInput() {
  const [value, setValue] = useState('')
  const ref = useRef<HTMLTextAreaElement>(null)
  const { create } = useTodoMutations()

  const submit = () => {
    const title = value.trim()
    if (!title) return
    create.mutate(
      main.CreateTodoRequest.createFrom({
        title,
        memo: '',
        deadline: '',
        reminder_enabled: false,
        reminder_at: '',
        is_important: false,
      }),
      { onSuccess: () => { setValue(''); ref.current?.focus() } },
    )
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter=登録 / Alt+Enter=改行（現行踏襲）
    if (e.key === 'Enter' && !e.altKey) {
      e.preventDefault()
      submit()
    }
  }

  return (
    <div className="td-quick-input-wrap">
      <div className="td-quick-input-label">タスクを登録</div>
      <textarea
        ref={ref}
        className="td-quick-input"
        rows={1}
        placeholder="メモを入力してEnterで追加（Alt+Enterで改行）"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKeyDown}
      />
      <div className="td-quick-input-hint">Enter で追加　・　Alt+Enter で改行</div>
    </div>
  )
}
```

- [ ] **Step 3: `App.tsx` に `<QuickInput/>` を差し込む（pending タブのみ表示）**

```tsx
import QuickInput from './components/QuickInput'
import { useUiStore } from './state/uiStore'
// td-content 内、Tabs の直後:
// {useUiStore((s) => s.activeTab) === 'pending' && <QuickInput />}
```

- [ ] **Step 4: `wails dev` で追加を確認**

Run: `wails dev`
Expected: 入力して Enter → 一覧に即反映（invalidate による再取得）。Alt+Enter で改行できる。

- [ ] **Step 5: コミット**

```bash
git add frontend/src/hooks/useTodoMutations.ts frontend/src/components/QuickInput.tsx frontend/src/App.tsx
git commit -m "feat(proto): add quick input with CreateTodo mutation and invalidation"
```

---

## Task 7: 行アクション（完了トグル・重要・削除）

**Files:**
- Modify: `frontend/src/hooks/useTodoMutations.ts`, `frontend/src/components/TodoRow.tsx`

**Interfaces:**
- Produces: `useTodoMutations()` に `complete`, `restore`, `toggleImportant`, `remove` を追加。
- Consumes: `App.CompleteTodo`/`RestoreTodo`/`DeleteTodo`/`ToggleImportant`。

- [ ] **Step 1: `useTodoMutations.ts` にミューテーションを追加**

`return` を以下に差し替え、各 mutation を定義:
```ts
  const complete = useMutation({ mutationFn: (id: number) => App.CompleteTodo(id), onSuccess: invalidateLists })
  const restore = useMutation({ mutationFn: (id: number) => App.RestoreTodo(id), onSuccess: invalidateLists })
  const remove = useMutation({ mutationFn: (id: number) => App.DeleteTodo(id), onSuccess: invalidateLists })
  const toggleImportant = useMutation({ mutationFn: (id: number) => App.ToggleImportant(id), onSuccess: invalidateLists })

  return { create, complete, restore, remove, toggleImportant, invalidateLists }
```

- [ ] **Step 2: `TodoRow.tsx` のチェックボックス・スターを配線**

`TodoRow` 内で `const { complete, restore, toggleImportant } = useTodoMutations()` を取得し、チェックボックスとスターに onClick を追加:
```tsx
// チェックボックス
onClick={() => (isDone ? restore.mutate(todo.id) : complete.mutate(todo.id))}
// スターボタン
onClick={() => toggleImportant.mutate(todo.id)}
```
（`import { useTodoMutations } from '../hooks/useTodoMutations'` を追加）

- [ ] **Step 3: `wails dev` で確認**

Run: `wails dev`
Expected: チェックで完了/未完了が切り替わり一覧が更新。スターで重要フラグが切り替わり枠色が変わる。

- [ ] **Step 4: コミット**

```bash
git add frontend/src/hooks/useTodoMutations.ts frontend/src/components/TodoRow.tsx
git commit -m "feat(proto): wire complete/restore/important row actions"
```

---

## Task 8: 詳細フォーム（インライン＋モーダル）・ドラフト・保存

**Files:**
- Create: `frontend/src/components/TodoDetail.tsx`, `frontend/src/components/DetailModal.tsx`
- Modify: `frontend/src/components/TodoRow.tsx`, `frontend/src/components/TodoList.tsx`, `frontend/src/App.tsx`, `frontend/src/hooks/useTodoMutations.ts`

**Interfaces:**
- Produces: `<TodoDetail todo/>`（メモは一旦 `<textarea>`。Task 9 で TipTap に置換）、`<DetailModal/>`、`update` ミューテーション。
- Consumes: `useUiStore`（openId/detailPattern/drafts）、`App.UpdateTodo`。

- [ ] **Step 1: `useTodoMutations.ts` に `update` を追加**

```ts
  const update = useMutation({
    mutationFn: ({ id, req }: { id: number; req: main.UpdateTodoRequest }) => App.UpdateTodo(id, req),
    onSuccess: (_d, { id }) => { invalidateLists(); qc.invalidateQueries({ queryKey: ['todo', id] }) },
  })
```
`return` に `update` を追加。

- [ ] **Step 2: `frontend/src/components/TodoDetail.tsx` を作成**

```tsx
import { Todo, main } from '../api/client'
import { useUiStore, TodoDraft } from '../state/uiStore'
import { useTodoMutations } from '../hooks/useTodoMutations'

// ドラフトと元 todo をマージした現在値（現行 _applyTodoDraft と同じ）
function merged(todo: Todo, draft?: TodoDraft) {
  return { ...todo, ...(draft ?? {}) }
}

export default function TodoDetail({ todo, modal = false }: { todo: Todo; modal?: boolean }) {
  const draft = useUiStore((s) => s.drafts[todo.id])
  const setDraft = useUiStore((s) => s.setDraft)
  const clearDraft = useUiStore((s) => s.clearDraft)
  const setOpenId = useUiStore((s) => s.setOpenId)
  const { update, remove } = useTodoMutations()
  const v = merged(todo, draft)

  const patch = (p: Partial<TodoDraft>) => setDraft(todo.id, { ...(draft ?? {}), ...p })

  const save = () => {
    const req = main.UpdateTodoRequest.createFrom({
      title: (v.title ?? '').trim() || todo.title,
      memo: v.memo ?? '',
      deadline: v.deadline || '',
      reminder_enabled: !!v.reminder_enabled,
      reminder_at: v.reminder_enabled && v.reminder_at ? `${v.reminder_at}:00` : '',
    })
    update.mutate({ id: todo.id, req }, { onSuccess: () => { clearDraft(todo.id); setOpenId(null) } })
  }

  const reminderAt = (v.reminder_at ?? '').slice(0, 16)

  return (
    <div className="td-detail-inline">
      {modal && (
        <textarea
          className="td-detail-title-input"
          rows={1}
          placeholder="メモを入力"
          value={v.title ?? ''}
          onChange={(e) => patch({ title: e.target.value })}
        />
      )}
      <div className="td-detail-grid">
        <label className="td-field">
          <span className="td-detail-label">期日</span>
          <input type="date" className="td-input" value={v.deadline || ''}
            onChange={(e) => patch({ deadline: e.target.value })} />
        </label>
        <label className="td-field">
          <span className="td-detail-label">リマインダー</span>
          <div className="td-reminder-row">
            <label className="td-toggle">
              <input type="checkbox" checked={!!v.reminder_enabled}
                onChange={(e) => patch({ reminder_enabled: e.target.checked })} />
              <span className="td-toggle-track" />
            </label>
            <input type="datetime-local" className="td-input" value={reminderAt}
              disabled={!v.reminder_enabled}
              onChange={(e) => patch({ reminder_at: e.target.value })} />
          </div>
        </label>
      </div>

      <div className="td-field">
        <span className="td-detail-label">詳細メモ</span>
        {/* Task 9 で RichTextEditor に置換 */}
        <textarea className="td-editor" style={{ minHeight: 120 }} value={v.memo ?? ''}
          onChange={(e) => patch({ memo: e.target.value })} />
      </div>

      <div className="td-detail-footer">
        <div className="td-detail-footer-left">
          <button className="td-btn td-btn-ghost-danger td-btn-sm"
            onClick={() => { if (confirm('このメモを削除しますか？')) remove.mutate(todo.id, { onSuccess: () => { clearDraft(todo.id); setOpenId(null) } }) }}>
            <i className="bi bi-trash3" /> 削除
          </button>
        </div>
        {modal && <button className="td-btn td-btn-secondary" onClick={() => { clearDraft(todo.id); setOpenId(null) }}>変更を破棄</button>}
        <button className="td-btn td-btn-primary" onClick={save}><i className="bi bi-floppy" /> 保存</button>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: `frontend/src/components/DetailModal.tsx` を作成（Portal）**

```tsx
import { createPortal } from 'react-dom'
import { Todo } from '../api/client'
import { useUiStore } from '../state/uiStore'
import TodoDetail from './TodoDetail'

export default function DetailModal({ todo }: { todo: Todo }) {
  const setOpenId = useUiStore((s) => s.setOpenId)
  return createPortal(
    <>
      <div className="td-panel-overlay" style={{ display: 'block' }} onClick={() => setOpenId(null)} />
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

- [ ] **Step 4: `TodoRow.tsx` にインライン詳細を条件表示**

`TodoRow` の戻り値を `<div className="td-row-wrap" data-id={todo.id}>` で包み、行の下にインライン詳細を出す:
```tsx
import { useUiStore } from '../state/uiStore'
import TodoDetail from './TodoDetail'
// ...
const detailPattern = useUiStore((s) => s.detailPattern)
const showInline = isOpen && detailPattern === 'inline'
// return:
// <div className="td-row-wrap" data-id={todo.id}>
//   <div className={rowClass}> ... 既存の行 ... </div>
//   {showInline && <TodoDetail todo={todo} />}
// </div>
```

- [ ] **Step 5: `App.tsx` でモーダル詳細をレンダリング**

開いている todo をモーダルで出す（`detailPattern === 'modal'` 時）。`App.tsx` に:
```tsx
import DetailModal from './components/DetailModal'
// ...
const openId = useUiStore((s) => s.openId)
const { data: todos } = useTodos()
const detailPattern = useUiStore((s) => s.detailPattern)
const openTodo = openId != null ? todos?.find((t) => t.id === openId) : undefined
// JSX 末尾（td-app 内）:
// {detailPattern === 'modal' && openTodo && <DetailModal todo={openTodo} />}
```
（`useTodos` は Query キャッシュ共有のため追加コストはほぼ無い）

- [ ] **Step 6: `wails dev` で確認（ゲート③）**

Run: `wails dev`
Expected:
- 行のシェブロン/タイトルで詳細が開く（インライン）。期日・リマインダー・メモ（textarea）を編集して保存 → 一覧に反映。
- 設定で modal に切り替えると（後の Task で設定 UI を作るまでは、DB の `detail_pattern` を modal にして起動）モーダルで開く。
- **インライン⇔モーダルを何度切り替えても行が二重にならない**（宣言的描画のため構造的に不可能なことを目視確認）。

- [ ] **Step 7: コミット**

```bash
git add frontend/src/components/TodoDetail.tsx frontend/src/components/DetailModal.tsx frontend/src/components/TodoRow.tsx frontend/src/App.tsx frontend/src/hooks/useTodoMutations.ts
git commit -m "feat(proto): todo detail form (inline + modal) with drafts and UpdateTodo"
```

---

## Task 9: リッチテキストエディタ（TipTap）とリンク表示

**Files:**
- Create: `frontend/src/components/RichTextEditor.tsx`, `frontend/src/components/DetectedLinks.tsx`
- Modify: `frontend/src/components/TodoDetail.tsx`

**Interfaces:**
- Produces: `<RichTextEditor value onChange/>`（HTML 文字列の入出力）、`<DetectedLinks links/>`。
- Consumes: `App.SaveImage`, `App.OpenURL`, `App.OpenLocalPath`, `normalizeLocalPath`。

- [ ] **Step 1: `frontend/src/components/RichTextEditor.tsx` を作成**

```tsx
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import Image from '@tiptap/extension-image'
import TextStyle from '@tiptap/extension-text-style'
import { Color } from '@tiptap/extension-color'
import { App } from '../api/client'

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result as string)
    r.onerror = reject
    r.readAsDataURL(blob)
  })
}

export default function RichTextEditor({
  value,
  onChange,
}: {
  value: string
  onChange: (html: string) => void
}) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      TextStyle,
      Color,
      Link.configure({ openOnClick: false }),
      Image,
    ],
    content: value || '',
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    editorProps: {
      // 保存済みメモ内・貼付後のリンクは既定ブラウザで開く（現行 _wireExternalLinkOpeners 相当）
      handleClickOn: (_view, _pos, _node, _nodePos, event) => {
        const a = (event.target as HTMLElement)?.closest('a[href]')
        if (a) {
          event.preventDefault()
          App.OpenURL(a.getAttribute('href') || '').catch(() => {})
          return true
        }
        return false
      },
      // クリップボード画像の貼付 → SaveImage → 画像ノード挿入
      handlePaste: (view, event) => {
        const items = Array.from(event.clipboardData?.items || [])
        const img = items.find((it) => it.type.startsWith('image/'))
        if (!img) return false
        event.preventDefault()
        const blob = img.getAsFile()
        if (!blob) return true
        blobToDataUrl(blob)
          .then((dataUrl) => App.SaveImage(dataUrl))
          .then((src) => editor?.chain().focus().setImage({ src }).run())
          .catch(() => alert('画像の保存に失敗しました'))
        return true
      },
    },
  })

  const insertImageFromClipboard = async () => {
    try {
      const clipItems = await navigator.clipboard.read()
      for (const it of clipItems) {
        const type = it.types.find((t) => t.startsWith('image/'))
        if (type) {
          const blob = await it.getType(type)
          const dataUrl = await blobToDataUrl(blob)
          const src = await App.SaveImage(dataUrl)
          editor?.chain().focus().setImage({ src }).run()
          return
        }
      }
      alert('クリップボードに画像がありません')
    } catch {
      alert('クリップボードへのアクセスに失敗しました')
    }
  }

  const addLink = () => {
    const prev = editor?.getAttributes('link').href as string | undefined
    const url = prompt('URLを入力:', prev || 'https://')
    if (url == null) return
    if (url === '') editor?.chain().focus().unsetLink().run()
    else editor?.chain().focus().setLink({ href: url }).run()
  }

  if (!editor) return null

  return (
    <div className="td-editor-wrap">
      <div className="td-editor-toolbar">
        <button className="td-editor-btn" type="button" title="太字 (Ctrl+B)"
          onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleBold().run() }}><b>B</b></button>
        <button className="td-editor-btn" type="button" title="赤文字"
          onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().setColor('#CC0000').run() }}>
          <span style={{ color: '#CC0000', fontWeight: 700, fontSize: 12 }}>赤</span></button>
        <button className="td-editor-btn" type="button" title="リンク挿入"
          onMouseDown={(e) => { e.preventDefault(); addLink() }}><i className="bi bi-link-45deg" /></button>
        <div className="td-editor-sep" />
        <button className="td-editor-btn" type="button" title="クリップボードから画像を貼り付け"
          onMouseDown={(e) => { e.preventDefault(); insertImageFromClipboard() }}><i className="bi bi-image" /></button>
      </div>
      <EditorContent editor={editor} className="td-editor" />
    </div>
  )
}
```

- [ ] **Step 2: `frontend/src/components/DetectedLinks.tsx` を作成**

```tsx
import { Link } from '../api/client'
import { App } from '../api/client'
import { normalizeLocalPath } from '../lib/format'

export default function DetectedLinks({ links }: { links?: Link[] }) {
  if (!links || links.length === 0) return null
  return (
    <div className="td-links" data-role="links" style={{ display: 'block' }}>
      <div className="td-detail-label">検出されたリンク</div>
      <div>
        {links.map((link, i) =>
          link.type === 'url' ? (
            <div className="td-link-item" key={i}>
              <i className="bi bi-link-45deg" />{' '}
              <a href={link.value} onClick={(e) => { e.preventDefault(); App.OpenURL(link.value).catch(() => {}) }}>
                {link.value}
              </a>
            </div>
          ) : (
            <div className="td-link-item" key={i}>
              <i className="bi bi-folder2" />{' '}
              <span className="td-link-path" title="クリックして開く"
                onClick={() => App.OpenLocalPath(normalizeLocalPath(link.value)).catch(() => alert('パスを開けませんでした'))}>
                {link.value}
              </span>
            </div>
          ),
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: `TodoDetail.tsx` の textarea を RichTextEditor に置換し、DetectedLinks を追加**

`詳細メモ` の `<textarea className="td-editor" ...>` を削除し:
```tsx
import RichTextEditor from './RichTextEditor'
import DetectedLinks from './DetectedLinks'
// 詳細メモ欄:
// <RichTextEditor value={v.memo ?? ''} onChange={(html) => patch({ memo: html })} />
// メモ欄の下:
// <DetectedLinks links={todo.links} />
```

- [ ] **Step 4: `wails dev` で確認（ゲート①）**

Run: `wails dev`
Expected:
- 太字・赤文字・リンク挿入が効く。保存すると HTML として保持され、再度開くと復元される。
- **クリップボード画像を貼り付け（Ctrl+V／画像ボタン）→ `SaveImage` が呼ばれ画像が表示される（WebView2 で成功）**。保存後の再表示でも画像が出る。
- 保存済みメモ内のリンク・検出リンク一覧のクリックで既定ブラウザ／エクスプローラーが開く。

- [ ] **Step 5: コミット**

```bash
git add frontend/src/components/RichTextEditor.tsx frontend/src/components/DetectedLinks.tsx frontend/src/components/TodoDetail.tsx
git commit -m "feat(proto): TipTap rich text editor (bold/red/link/image paste) and detected links"
```

---

## Task 10: dnd-kit による並び替え（期日なし）

**Files:**
- Modify: `frontend/src/components/TodoList.tsx`, `frontend/src/components/TodoRow.tsx`, `frontend/src/hooks/useTodoMutations.ts`

**Interfaces:**
- Produces: 期日なしリストのドラッグ並び替え → `App.ReorderTodos`。
- Consumes: `@dnd-kit/*`, `computeReorder`。

- [ ] **Step 1: `useTodoMutations.ts` に `reorder` を追加**

```ts
  const reorder = useMutation({
    mutationFn: (ids: number[]) => App.ReorderTodos(ids),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['todos', 'pending'] }),
  })
```
`return` に `reorder` を追加。

- [ ] **Step 2: `TodoRow.tsx` を sortable 対応にする**

`draggable`（= pending タブかつ期日なし）の行だけドラッグハンドルを出し、`useSortable` を適用する。`TodoRow` に prop `draggable?: boolean` を追加:
```tsx
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
// TodoRow({ todo, draggable = false }):
const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: todo.id })
const dndStyle = draggable ? { transform: CSS.Transform.toString(transform), transition } : undefined
// td-row-wrap に ref/style を付与:
// <div className="td-row-wrap" data-id={todo.id} ref={draggable ? setNodeRef : undefined} style={dndStyle}>
// 行内先頭にハンドル（draggable のとき）:
// {draggable && <div className="td-drag-handle" title="ドラッグして並び替え" {...attributes} {...listeners}><i className="bi bi-grip-vertical" /></div>}
```

- [ ] **Step 3: `TodoList.tsx` の期日なしリストを DndContext/SortableContext で包む**

```tsx
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { useTodoMutations } from '../hooks/useTodoMutations'
import { computeReorder } from '../lib/format'
// TodoList 内:
const { reorder } = useTodoMutations()
const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))
const onDragEnd = (e: DragEndEvent) => {
  const from = Number(e.active.id)
  const to = e.over ? Number(e.over.id) : from
  if (from === to) return
  const ids = noDate.map((t) => t.id)
  reorder.mutate(computeReorder(ids, from, to))
}
// 期日なしカードの td-list を包む:
// <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
//   <SortableContext items={noDate.map((t) => t.id)} strategy={verticalListSortingStrategy}>
//     <div className="td-list" id="tdListNoDate">
//       {noDate.map((t) => <TodoRow key={t.id} todo={t} draggable />)}
//     </div>
//   </SortableContext>
// </DndContext>
```
（期日ありリスト・done リストの `TodoRow` は `draggable` を付けない）

- [ ] **Step 4: `wails dev` で確認（ゲート②）**

Run: `wails dev`
Expected: 期日なしのメモをグリップでドラッグ → 並びが変わり、`ReorderTodos` 後の再取得でも順序が保持される。期日あり／完了済みではドラッグハンドルが出ない。

- [ ] **Step 5: コミット**

```bash
git add frontend/src/components/TodoList.tsx frontend/src/components/TodoRow.tsx frontend/src/hooks/useTodoMutations.ts
git commit -m "feat(proto): drag-and-drop reorder for undated todos via dnd-kit"
```

---

## Task 11: プロトタイプ合否判定と後片付け

**Files:**
- Delete: `frontend/src/todo.js`
- （変更なしの検証タスク）

- [ ] **Step 1: 旧素JSエントリを削除**

```bash
git rm frontend/src/todo.js
```
（旧 `index.html` は Task 1 で置換済み、旧 `todo.css` は Task 2 で移動済み）

- [ ] **Step 2: 単体テストを実行**

Run（`frontend/` 内）: `npm run test`
Expected: PASS（`format.test.ts` 全 green）

- [ ] **Step 3: `wails dev` で全操作を通し確認**

Run: `wails dev`
確認項目: 一覧表示 / タブ切替 / クイック入力追加 / 完了・重要・削除 / 詳細（インライン・モーダル）編集保存 / リッチテキスト（太字・赤・リンク・画像貼付）/ 検出リンク open / 期日なしドラッグ並び替え。

- [ ] **Step 4: `wails build` で埋め込みビルドを確認（ゲート④）**

Run: `wails build -platform windows/amd64`
Expected: `build/bin/memotodo.exe` が生成され、単体起動で全画面・全操作が動く（`frontend/dist` が埋め込まれている）。

- [ ] **Step 5: 合否判定を記録**

以下4点をすべて満たすか確認し、結果を PR / コミットメッセージに明記する:
- ① TipTap の画像貼付が WebView2 で成功
- ② dnd-kit の並び替え → `ReorderTodos` が成功
- ③ インライン⇔モーダル切替で行が二重化しない
- ④ exe にビルド埋め込みでき、単体起動で動作

全て OK ならフェーズA〜D（定期パネル／モーダル群／通知トースト＋EventsOn／テスト拡充・README更新・旧資産削除の最終確認）の計画作成へ進む。いずれか NG の場合は該当リスクの代替案（例: 画像貼付は自前 paste ハンドラ）を検討してから本移植へ。

- [ ] **Step 6: コミット**

```bash
git add -A
git commit -m "chore(proto): remove legacy todo.js; record prototype gate results"
```

---

## Self-Review

**1. Spec coverage:**
- ビルド配線（wails.json / main.go embed=frontend/dist / CDN撤去）→ Task 1・2 ✓
- 状態の二分（Query / uiStore）→ Task 2・3・5 ✓
- mutation→invalidate → Task 6・7・8・10 ✓
- コンポーネント木（Header/Tabs/QuickInput/List/Row/Detail/Modal/RichText/Links）→ Task 2・5〜10 ✓（定期パネル・設定/通知モーダル・トースト・EventsOn は Phase 0 対象外として明示）
- 難所対応（TipTap/dnd-kit/ネイティブ日付/inline⇔modal Portal）→ Task 9・10・8 ✓
- テスト（純ロジック Vitest）→ Task 4 ✓
- プロトタイプ合否判定4点 → Task 8③・9①・10②・11④ ✓
- **スペック訂正**：スペック §6 の「`lib/links.ts` でリンク検出（純関数テスト）」は誤り。検出はバックエンド責務で、フロントは `todo.links` の表示＋open のみ（本計画の Global Constraints と Task 9 で訂正済み）。テスト対象は `fmtDeadline`/`previewText`/`normalizeLocalPath`/`computeReorder` に変更。

**2. Placeholder scan:** 各コード手順に実コードを記載。UI 確認手順は Vitest 対象外のため「`wails dev` で目視確認」を検証手段とする（純ロジックのみ Task 4 で TDD）。TBD/TODO なし（「Task 9 で置換」等は段階実装の意図的な明示で、当該 Task に実コードあり）。

**3. Type consistency:** `main.CreateTodoRequest`/`main.UpdateTodoRequest`/`todo.Todo`/`todo.Settings`/`todo.Link` は `models.ts` と一致。`useUiStore` の `activeTab/openId/detailPattern/drafts` と各 setter 名、`useTodoMutations` の `create/complete/restore/remove/toggleImportant/update/reorder/invalidateLists`、`qk.todos/todo/settings/nearOrOverdue`、`fmtDeadline/previewText/normalizeLocalPath/computeReorder` を全 Task で統一。
