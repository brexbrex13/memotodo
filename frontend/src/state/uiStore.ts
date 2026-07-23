import { create } from 'zustand'
import { Todo } from '../api/client'

export type Tab = 'pending' | 'done'
export type DetailPattern = 'inline' | 'modal'

// 未保存編集ドラフト（DB には保存しない）
export interface TodoDraft {
  title?: string
  memo?: string
  deadline?: string | null
  reminder_enabled?: boolean
  reminder_at?: string | null
  // undefined=未変更、null=通常タスクに戻す、number=そのカテゴリへ変更
  category_id?: number | null
}

export type RecurringOpenId = number | 'new' | null

export type Toast =
  | { kind: 'reminder'; id: string; todo: Todo }
  | { kind: 'periodic'; id: string }

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
  recurringPanelOpen: boolean
  recurringOpenId: RecurringOpenId
  recurringDrafts: Record<string, RecurringDraft>
  setRecurringPanelOpen: (open: boolean) => void
  setRecurringOpenId: (id: RecurringOpenId) => void
  setRecurringDraft: (key: string, draft: RecurringDraft) => void
  clearRecurringDraft: (key: string) => void
  toasts: Toast[]
  pushToast: (t: Toast) => void
  dismissToast: (id: string) => void
  clearToastsByKind: (kind: Toast['kind']) => void
  clearAllDrafts: () => void
  forceDetailModalId: number | null
  setForceDetailModalId: (id: number | null) => void
  quickInputFocusToken: number
  requestQuickInputFocus: () => void
  // 「期日ありのみ」トグル。ONの間はカテゴリのグルーピングを解除し、
  // 期日ありタスクのみを期日の近い順のフラット一覧で表示する（永続化しないUI状態）。
  datedOnly: boolean
  setDatedOnly: (v: boolean) => void
  // カテゴリでの絞り込み（'all'=すべて／'normal'=通常のみ／数値=カテゴリID）。
  categoryFilter: CategoryFilter
  setCategoryFilter: (v: CategoryFilter) => void
  settingsOpen: boolean
  setSettingsOpen: (v: boolean) => void
}

export type CategoryFilter = 'all' | 'normal' | number

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
  datedOnly: false,
  setDatedOnly: (v) => set({ datedOnly: v }),
  categoryFilter: 'all',
  setCategoryFilter: (v) => set({ categoryFilter: v }),
  settingsOpen: false,
  setSettingsOpen: (v) => set({ settingsOpen: v }),
}))
