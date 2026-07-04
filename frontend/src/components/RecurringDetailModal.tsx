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
