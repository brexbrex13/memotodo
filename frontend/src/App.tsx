import { useEffect } from 'react'
import { useSettings } from './hooks/useSettings'
import { useTodos, useTodo } from './hooks/useTodos'
import { useUiStore } from './state/uiStore'
import { useInlineDetailOutsideClose } from './hooks/useInlineDetailOutsideClose'
import { useAppEvents } from './hooks/useAppEvents'
import TitleBar from './components/TitleBar'
import TodoWorkspace from './components/TodoWorkspace'
import TodoList from './components/TodoList'
import QuickInput from './components/QuickInput'
import DetailModal from './components/DetailModal'
import SettingsModal from './components/SettingsModal'
import RecurringTab from './components/RecurringTab'
import RecurringPanel from './components/RecurringPanel'
import ToastHost from './components/ToastHost'

export default function App() {
  const { data: settings } = useSettings()
  const setDetailPattern = useUiStore((s) => s.setDetailPattern)
  const activeTab = useUiStore((s) => s.activeTab)
  const openId = useUiStore((s) => s.openId)
  const detailPattern = useUiStore((s) => s.detailPattern)
  const { data: todos } = useTodos()
  const openTodo = openId != null ? todos?.find((t) => t.id === openId) : undefined
  const forceDetailModalId = useUiStore((s) => s.forceDetailModalId)
  const setForceDetailModalId = useUiStore((s) => s.setForceDetailModalId)
  const { data: forcedTodo } = useTodo(forceDetailModalId)
  const settingsOpen = useUiStore((s) => s.settingsOpen)
  const setSettingsOpen = useUiStore((s) => s.setSettingsOpen)

  useInlineDetailOutsideClose()
  useAppEvents()

  useEffect(() => {
    if (settings?.detail_pattern === 'inline' || settings?.detail_pattern === 'modal') {
      setDetailPattern(settings.detail_pattern)
    }
  }, [settings?.detail_pattern, setDetailPattern])

  return (
    <div className="td-app">
      <TitleBar />
      <main className="td-main">
        <div className="td-content">
          {activeTab === 'pending' && <QuickInput />}
          <div className="td-list-wrap">
            {activeTab === 'pending' ? <TodoWorkspace /> : <TodoList />}
          </div>
        </div>
      </main>
      <RecurringTab />
      <RecurringPanel />
      {detailPattern === 'modal' && openTodo && <DetailModal todo={openTodo} />}
      {forcedTodo && <DetailModal todo={forcedTodo} onClose={() => setForceDetailModalId(null)} />}
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
      <ToastHost />
    </div>
  )
}
