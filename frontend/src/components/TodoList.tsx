import { useState } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { Category, Todo } from '../api/client'
import { useTodos } from '../hooks/useTodos'
import { useCategories } from '../hooks/useCategories'
import { useCategoryCollapse } from '../hooks/useCategoryCollapse'
import { useUiStore } from '../state/uiStore'
import { GroupKey, matchesGroup } from '../lib/categoryGroups'
import TodoRow from './TodoRow'
import QuickInput from './QuickInput'

export default function TodoList() {
  const activeTab = useUiStore((s) => s.activeTab)
  const datedOnly = useUiStore((s) => s.datedOnly)
  const categoryFilter = useUiStore((s) => s.categoryFilter)
  const { data: todos, isLoading, isError } = useTodos()
  const { data: categories } = useCategories()

  if (isLoading) return <div className="td-loading"><span className="td-spinner" /></div>
  if (isError) return <div style={{ padding: 24, color: 'var(--accent)', fontSize: 13 }}>読み込みに失敗しました</div>
  const list = todos ?? []
  if (list.length === 0) return <div className="td-empty">タスクはありません</div>

  // GetTodos は「期日なし(sort_order昇順)→期日あり(期日昇順)」で既に整列済みのため、
  // filter で部分集合を取り出しても相対順序は保たれる。

  if (activeTab === 'done') {
    const done = [...list].sort((a, b) => (b.done_at || '').localeCompare(a.done_at || ''))
    return (
      <div className="td-card">
        <div className="td-list">{done.map((t) => <TodoRow key={t.id} todo={t} />)}</div>
      </div>
    )
  }

  if (datedOnly && categoryFilter === 'all') {
    const dated = list.filter((t) => t.deadline)
    if (dated.length === 0) return <div className="td-empty">期日ありのタスクはありません</div>
    return (
      <div className="td-card">
        <div className="td-list">{dated.map((t) => <TodoRow key={t.id} todo={t} draggable />)}</div>
      </div>
    )
  }

  if (categoryFilter !== 'all') {
    const groupKey: GroupKey = categoryFilter === 'normal' ? 'normal' : categoryFilter
    const filtered = list.filter((t) => matchesGroup(t, groupKey))
    const shown = datedOnly ? filtered.filter((t) => t.deadline) : filtered
    if (shown.length === 0) return <div className="td-empty">タスクはありません</div>
    const noDate = datedOnly ? [] : shown.filter((t) => !t.deadline)
    const dated = shown.filter((t) => t.deadline)
    return (
      <div className="td-card">
        <SortableContext items={noDate.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          <div className="td-list">
            {noDate.map((t) => <TodoRow key={t.id} todo={t} sortableGroupKey={groupKey} />)}
            {dated.map((t) => <TodoRow key={t.id} todo={t} draggable />)}
          </div>
        </SortableContext>
      </div>
    )
  }

  // categoryFilter === 'all' && !datedOnly: 通常タスク（見出しなし）→カテゴリごとのセクション
  const normalTasks = list.filter((t) => matchesGroup(t, 'normal'))
  return (
    <div className="td-card-group">
      <CategorySection groupKey="normal" tasks={normalTasks} />
      {(categories ?? []).map((c) => {
        const tasks = list.filter((t) => matchesGroup(t, c.id))
        return <CategorySection key={c.id} groupKey={c.id} tasks={tasks} category={c} />
      })}
    </div>
  )
}

function CategorySection({ groupKey, tasks, category }: { groupKey: GroupKey; tasks: Todo[]; category?: Category }) {
  const { collapsed, toggleCollapse } = useCategoryCollapse()
  const [addOpen, setAddOpen] = useState(false)
  const isCollapsed = typeof groupKey === 'number' && collapsed.has(groupKey)
  const droppableId = `section-${groupKey}`
  const { setNodeRef, isOver } = useDroppable({
    id: droppableId,
    data: { type: 'category-target', categoryId: groupKey === 'normal' ? null : groupKey },
  })

  const noDate = tasks.filter((t) => !t.deadline)
  const dated = tasks.filter((t) => t.deadline)

  return (
    <div className="td-card td-category-section">
      {category && (
        <div
          className={`td-category-header ${isOver ? 'is-drop-target' : ''}`}
          ref={setNodeRef}
        >
          <button className="td-icon-btn td-category-collapse-btn" onClick={() => toggleCollapse(category.id)}>
            <i className={`bi ${isCollapsed ? 'bi-chevron-right' : 'bi-chevron-down'}`} />
          </button>
          <span className="td-category-dot" style={{ background: category.color }} />
          <span className="td-category-header-label">{category.name}</span>
          <span className="td-badge">{tasks.length}</span>
          <button className="td-icon-btn td-category-add-btn" title="このカテゴリへ追加" onClick={() => setAddOpen((v) => !v)}>
            <i className="bi bi-plus-lg" />
          </button>
        </div>
      )}
      {!category && <div ref={setNodeRef} className={isOver ? 'is-drop-target' : ''} />}
      {!isCollapsed && (
        <>
          {addOpen && category && (
            <div className="td-category-inline-add">
              <QuickInput forceCategoryId={category.id} compact autoFocus onSubmitted={() => setAddOpen(false)} />
            </div>
          )}
          <SortableContext items={noDate.map((t) => t.id)} strategy={verticalListSortingStrategy}>
            <div className="td-list">
              {noDate.map((t) => <TodoRow key={t.id} todo={t} sortableGroupKey={groupKey} />)}
              {dated.map((t) => <TodoRow key={t.id} todo={t} draggable />)}
              {tasks.length === 0 && <div className="td-category-empty-hint">タスクをここにドラッグ</div>}
            </div>
          </SortableContext>
        </>
      )}
    </div>
  )
}
