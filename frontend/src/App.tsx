import { useEffect } from 'react'
import { useSettings } from './hooks/useSettings'
import { useUiStore } from './state/uiStore'
import Tabs from './components/Tabs'
import TodoList from './components/TodoList'
import QuickInput from './components/QuickInput'

export default function App() {
  const { data: settings } = useSettings()
  const setDetailPattern = useUiStore((s) => s.setDetailPattern)
  const activeTab = useUiStore((s) => s.activeTab)

  useEffect(() => {
    if (settings?.detail_pattern === 'inline' || settings?.detail_pattern === 'modal') {
      setDetailPattern(settings.detail_pattern)
    }
  }, [settings?.detail_pattern, setDetailPattern])

  return (
    <div className="td-app">
      <header className="td-header">
        <div className="td-header-inner">
          <div className="td-header-left">
            <span className="td-logo-mark" />
            <span className="td-header-title">MemoTodo</span>
          </div>
          <div className="td-header-actions">
            <button className="td-icon-btn td-btn-settings" title="設定">
              <i className="bi bi-gear" />
            </button>
          </div>
        </div>
      </header>
      <main className="td-main">
        <div className="td-content">
          <Tabs />
          {activeTab === 'pending' && <QuickInput />}
          <div className="td-list-wrap"><TodoList /></div>
        </div>
      </main>
    </div>
  )
}
