import type { CSSProperties } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Todo } from '../api/client'
import { useUiStore } from '../state/uiStore'
import { useTodoMutations } from '../hooks/useTodoMutations'
import { fmtDeadline, previewText } from '../lib/format'
import TodoDetail from './TodoDetail'

interface Sortable {
  attributes: ReturnType<typeof useSortable>['attributes']
  listeners: ReturnType<typeof useSortable>['listeners']
  setNodeRef: ReturnType<typeof useSortable>['setNodeRef']
  dndStyle: CSSProperties
}

export default function TodoRow({ todo, draggable = false }: { todo: Todo; draggable?: boolean }) {
  if (draggable) {
    return <SortableTodoRow todo={todo} />
  }
  return <TodoRowContent todo={todo} />
}

function SortableTodoRow({ todo }: { todo: Todo }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: todo.id })
  const dndStyle = { transform: CSS.Transform.toString(transform), transition }
  return <TodoRowContent todo={todo} sortable={{ attributes, listeners, setNodeRef, dndStyle }} />
}

function TodoRowContent({ todo, sortable }: { todo: Todo; sortable?: Sortable }) {
  const activeTab = useUiStore((s) => s.activeTab)
  const openId = useUiStore((s) => s.openId)
  const detailPattern = useUiStore((s) => s.detailPattern)
  const setOpenId = useUiStore((s) => s.setOpenId)
  const { complete, restore, toggleImportant } = useTodoMutations()
  const isDone = activeTab === 'done'
  const isOpen = openId === todo.id
  const showInline = isOpen && detailPattern === 'inline'

  const rowClass = [
    'td-row',
    isDone ? 'is-done' : '',
    todo.is_overdue && !isDone ? 'is-overdue' : '',
    todo.is_important ? 'is-important' : '',
  ].join(' ')

  const chipClass = todo.is_overdue && !isDone ? 'is-overdue' : todo.is_near && !isDone ? 'is-near' : ''

  return (
    <div className="td-row-wrap" data-id={todo.id} ref={sortable?.setNodeRef} style={sortable?.dndStyle}>
      <div className={rowClass}>
        {sortable ? (
          <div className="td-drag-handle" title="ドラッグして並び替え" {...sortable.attributes} {...sortable.listeners}>
            <i className="bi bi-grip-vertical" />
          </div>
        ) : null}
        <div className={`td-checkbox ${isDone ? 'is-checked' : ''}`} title={isDone ? '未完了に戻す' : '完了にする'} onClick={() => (isDone ? restore.mutate(todo.id) : complete.mutate(todo.id))}>
          {isDone ? <i className="bi bi-check-lg" /> : null}
        </div>
        <div className="td-row-main">
          <div className="td-row-title" onClick={() => setOpenId(isOpen ? null : todo.id)}>
            {previewText(todo.title)}
          </div>
        </div>
        <div className="td-row-side">
          {todo.reminder_enabled ? (
            <span
              className={`td-meta-icon${todo.reminded ? ' is-reminded' : ''}`}
              title={todo.reminded ? 'リマインダー通知済み' : 'リマインダーあり'}
            >
              <i className={`bi ${todo.reminded ? 'bi-bell-fill' : 'bi-bell'}`} />
            </span>
          ) : null}
          {todo.memo && todo.memo.trim() ? (
            <span className="td-meta-icon" title="詳細メモあり"><i className="bi bi-journal-text" /></span>
          ) : null}
          <button className={`td-icon-btn td-btn-important ${todo.is_important ? 'is-active' : ''}`} title="重要" onClick={() => toggleImportant.mutate(todo.id)}>
            <i className={`bi ${todo.is_important ? 'bi-star-fill' : 'bi-star'}`} />
          </button>
          {todo.deadline ? <span className={`td-deadline-chip ${chipClass}`}>{fmtDeadline(todo.deadline)}</span> : null}
          <button className="td-icon-btn td-chevron" title="詳細" onClick={() => setOpenId(isOpen ? null : todo.id)}>
            <i className={`bi ${isOpen ? 'bi-chevron-up' : 'bi-chevron-down'}`} />
          </button>
        </div>
      </div>
      {showInline && <TodoDetail todo={todo} />}
    </div>
  )
}
