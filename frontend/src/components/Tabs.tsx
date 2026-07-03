import { useTodos } from '../hooks/useTodos'
import { useUiStore } from '../state/uiStore'

export default function Tabs() {
  const activeTab = useUiStore((s) => s.activeTab)
  const setTab = useUiStore((s) => s.setTab)
  const { data: pending } = useTodos('pending')

  return (
    <div className="td-tabs-row">
      <div className="td-tabs">
        <button
          className={`td-tab ${activeTab === 'pending' ? 'active' : ''}`}
          onClick={() => setTab('pending')}
        >
          タスク一覧
          <span className="td-badge">{pending?.length ?? 0}</span>
        </button>
        <button
          className={`td-tab ${activeTab === 'done' ? 'active' : ''}`}
          onClick={() => setTab('done')}
        >
          完了済み
        </button>
      </div>
    </div>
  )
}
