import { createPortal } from 'react-dom'
import { Todo } from '../api/client'
import { useUiStore } from '../state/uiStore'
import TodoDetail from './TodoDetail'

export default function DetailModal({ todo, onClose }: { todo: Todo; onClose?: () => void }) {
  const setOpenId = useUiStore((s) => s.setOpenId)
  const close = onClose ?? (() => setOpenId(null))
  return createPortal(
    <>
      <div className="td-panel-overlay" style={{ display: 'block' }} onClick={close} />
      <div className="td-detail-modal" style={{ display: 'flex' }}>
        <div className="td-detail-modal-body">
          <TodoDetail todo={todo} modal />
        </div>
      </div>
    </>,
    document.body,
  )
}
