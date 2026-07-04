import { Todo } from '../api/client'
import { useUiStore } from '../state/uiStore'
import { useTodoMutations } from '../hooks/useTodoMutations'

// "YYYY-MM-DDTHH:mm:ss" -> "YYYY-MM-DD HH:mm"（元実装 _renderReminderToast 準拠）
function fmtReminderAt(iso: string): string {
  return iso ? iso.slice(0, 16).replace('T', ' ') : ''
}

export default function ReminderToast({ todo }: { todo: Todo }) {
  const dismissToast = useUiStore((s) => s.dismissToast)
  const setTab = useUiStore((s) => s.setTab)
  const setForceDetailModalId = useUiStore((s) => s.setForceDetailModalId)
  const { snooze: snoozeMutation } = useTodoMutations()
  const id = `reminder:${todo.id}`
  // 「今日」はローカル日付で判定する（toISOString は UTC 日付になり JST 早朝に前日へずれるため使わない。fmtDeadline と同じローカル基準）
  const now = new Date()
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const isOverdue = !!todo.reminder_at && todo.reminder_at.slice(0, 10) < today

  const snooze = (kind: '30' | '60' | 'tomorrow') => {
    snoozeMutation.mutate({ id: todo.id, amount: kind })
    dismissToast(id)
  }
  const openDetail = () => {
    dismissToast(id)
    setTab('pending') // setTab は openId を null にする＝インライン詳細と二重に開かない
    setForceDetailModalId(todo.id) // detailPattern に関わらず常にモーダルで開く
  }

  return (
    <div className="td-dtoast td-dtoast-reminder td-dtoast-in">
      <div className="td-dtoast-header">
        <span className="td-dtoast-label">リマインダー</span>
        <button className="td-dtoast-close" onClick={() => dismissToast(id)} aria-label="閉じる">
          <i className="bi bi-x-lg" />
        </button>
      </div>
      <div className="td-dtoast-body">
        <div className="td-dtoast-title">{todo.title}</div>
        {todo.reminder_at && (
          <div className={`td-dtoast-meta${isOverdue ? ' is-overdue' : ''}`}>
            <i className="bi bi-clock" /> {fmtReminderAt(todo.reminder_at)}
            {isOverdue ? '（期限切れ）' : ''}
          </div>
        )}
      </div>
      <div className="td-dtoast-snooze-row">
        <span className="td-dtoast-snooze-label">スヌーズ</span>
        <button className="td-dtoast-snooze" onClick={() => snooze('30')}>+30分</button>
        <button className="td-dtoast-snooze" onClick={() => snooze('60')}>+1時間</button>
        <button className="td-dtoast-snooze" onClick={() => snooze('tomorrow')}>明日朝9時</button>
      </div>
      <div className="td-dtoast-actions">
        <button className="td-dtoast-btn td-dtoast-btn-primary" onClick={openDetail}>詳細を見る</button>
        <button className="td-dtoast-btn" onClick={() => dismissToast(id)}>閉じる</button>
      </div>
    </div>
  )
}
