import type { CSSProperties } from 'react'
import { useDraggable } from '@dnd-kit/core'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Todo } from '../api/client'
import { useUiStore } from '../state/uiStore'
import { useTodoMutations } from '../hooks/useTodoMutations'
import { useCategories } from '../hooks/useCategories'
import { GroupKey } from '../lib/categoryGroups'
import { fmtDeadline, previewText } from '../lib/format'
import TodoDetail from './TodoDetail'

interface DragHandle {
  attributes: ReturnType<typeof useSortable>['attributes']
  listeners: ReturnType<typeof useSortable>['listeners']
  setNodeRef: (el: HTMLElement | null) => void
  style: CSSProperties
}

// sortableGroupKey: 期日なしタスク（そのグループ内で手動並び替え可）。
// draggable: 期日ありタスク等、並び替えは不可だがカテゴリチップ／見出しへドロップして仕分け可。
// どちらも無指定ならドラッグ不可（完了済み表示など）。
export default function TodoRow({
  todo,
  sortableGroupKey,
  draggable = false,
}: {
  todo: Todo
  sortableGroupKey?: GroupKey
  draggable?: boolean
}) {
  if (sortableGroupKey !== undefined) return <SortableTodoRow todo={todo} groupKey={sortableGroupKey} />
  if (draggable) return <DraggableTodoRow todo={todo} />
  return <TodoRowContent todo={todo} />
}

function SortableTodoRow({ todo, groupKey }: { todo: Todo; groupKey: GroupKey }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: todo.id,
    data: { type: 'todo', todoId: todo.id, groupKey },
  })
  const style = { transform: CSS.Transform.toString(transform), transition }
  return <TodoRowContent todo={todo} drag={{ attributes, listeners, setNodeRef, style }} isDragging={isDragging} />
}

function DraggableTodoRow({ todo }: { todo: Todo }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: todo.id,
    data: { type: 'todo', todoId: todo.id },
  })
  const style = { transform: CSS.Translate.toString(transform) }
  return <TodoRowContent todo={todo} drag={{ attributes, listeners, setNodeRef, style }} isDragging={isDragging} />
}

function TodoRowContent({ todo, drag, isDragging }: { todo: Todo; drag?: DragHandle; isDragging?: boolean }) {
  const activeTab = useUiStore((s) => s.activeTab)
  const openId = useUiStore((s) => s.openId)
  const detailPattern = useUiStore((s) => s.detailPattern)
  const setOpenId = useUiStore((s) => s.setOpenId)
  const setForceDetailModalId = useUiStore((s) => s.setForceDetailModalId)
  const { complete, restore, toggleImportant } = useTodoMutations()
  const { data: categories } = useCategories()
  const isDone = activeTab === 'done'
  const isOpen = openId === todo.id
  const showInline = isOpen && detailPattern === 'inline'
  const category = todo.category_id != null ? categories?.find((c) => c.id === todo.category_id) : undefined

  const rowClass = [
    'td-row',
    isDone ? 'is-done' : '',
    todo.is_overdue && !isDone ? 'is-overdue' : '',
    todo.is_important ? 'is-important' : '',
    isDragging ? 'is-dragging' : '',
  ].join(' ')

  const chipClass = todo.is_overdue && !isDone ? 'is-overdue' : todo.is_near && !isDone ? 'is-near' : ''

  return (
    <div className="td-row-wrap" data-id={todo.id} ref={drag?.setNodeRef} style={drag?.style}>
      <div className={rowClass}>
        {drag ? (
          <div className="td-drag-handle" title="ドラッグして並び替え・カテゴリ変更" {...drag.attributes} {...drag.listeners}>
            <i className="bi bi-grip-vertical" />
          </div>
        ) : null}
        <div className="td-row-main">
          <div
            className="td-row-title"
            onClick={() => setOpenId(isOpen ? null : todo.id)}
            onContextMenu={(e) => { e.preventDefault(); setForceDetailModalId(todo.id) }}
            title="右クリックで詳細を編集"
          >
            {category && <span className="td-category-dot" style={{ background: category.color }} title={category.name} />}
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
          <div className={`td-checkbox ${isDone ? 'is-checked' : ''}`} title={isDone ? '未完了に戻す' : '完了にする'} onClick={() => (isDone ? restore.mutate(todo.id) : complete.mutate(todo.id))}>
            {isDone ? <i className="bi bi-check-lg" /> : null}
          </div>
        </div>
      </div>
      {showInline && <TodoDetail todo={todo} />}
    </div>
  )
}
