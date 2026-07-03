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
