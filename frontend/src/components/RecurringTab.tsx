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
