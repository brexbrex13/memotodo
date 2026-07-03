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
