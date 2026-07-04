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
      <div key={label} className={`td-dtoast-group${overdue ? ' is-overdue' : ''}`}>
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
