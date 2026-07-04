import { createPortal } from 'react-dom'
import { useUiStore } from '../state/uiStore'
import ReminderToast from './ReminderToast'
import PeriodicToast from './PeriodicToast'

export default function ToastHost() {
  const toasts = useUiStore((s) => s.toasts)
  if (toasts.length === 0) return null
  return createPortal(
    <div className="td-dtoast-host">
      {toasts.map((t) =>
        t.kind === 'reminder' ? <ReminderToast key={t.id} todo={t.todo} /> : <PeriodicToast key={t.id} />,
      )}
    </div>,
    document.body,
  )
}
