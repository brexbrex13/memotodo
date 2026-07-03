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
