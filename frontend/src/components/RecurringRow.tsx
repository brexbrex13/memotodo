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
