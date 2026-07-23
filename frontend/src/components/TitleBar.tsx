import { WindowToggleMaximise } from '../../wailsjs/runtime/runtime'
import { App } from '../api/client'
import { useTodos } from '../hooks/useTodos'
import { useUiStore } from '../state/uiStore'

// OSタイトルバー廃止（フレームレス化）に伴うミニタイトルバー。
// ドラッグ領域を兼ね（.td-titlebar に --wails-draggable: drag をCSSで指定）、
// ダブルクリックで最大化/復元する。ボタン類は .td-titlebar-actions 等で no-drag に戻す。
export default function TitleBar() {
  const activeTab = useUiStore((s) => s.activeTab)
  const setTab = useUiStore((s) => s.setTab)
  const setSettingsOpen = useUiStore((s) => s.setSettingsOpen)
  const { data: pending } = useTodos('pending')
  const showDone = activeTab === 'done'

  return (
    <div className="td-titlebar" onDoubleClick={() => WindowToggleMaximise()}>
      <div className="td-titlebar-left">
        <span className="td-logo-mark" />
        <span className="td-titlebar-title">MemoTodo</span>
      </div>
      <div className="td-titlebar-actions">
        <button
          className={`td-icon-btn td-btn-done-toggle ${showDone ? 'is-active' : ''}`}
          title={showDone ? 'タスク一覧に戻る' : '完了済みを表示'}
          onClick={() => setTab(showDone ? 'pending' : 'done')}
        >
          <i className="bi bi-check2-circle" />
          {!showDone && (pending?.length ?? 0) > 0 && <span className="td-badge">{pending?.length}</span>}
        </button>
        <button className="td-icon-btn td-btn-settings" title="設定" onClick={() => setSettingsOpen(true)}>
          <i className="bi bi-gear" />
        </button>
        <button className="td-icon-btn td-btn-close" title="閉じる（トレイに格納）" onClick={() => App.CloseToTray()}>
          <i className="bi bi-x-lg" />
        </button>
      </div>
    </div>
  )
}
