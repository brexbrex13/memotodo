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
