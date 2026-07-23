import { useState } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { useTodos } from '../hooks/useTodos'
import { useCategories } from '../hooks/useCategories'
import { useUiStore, CategoryFilter } from '../state/uiStore'
import CategoryModal from './CategoryModal'

export default function FilterBar() {
  const datedOnly = useUiStore((s) => s.datedOnly)
  const setDatedOnly = useUiStore((s) => s.setDatedOnly)
  const categoryFilter = useUiStore((s) => s.categoryFilter)
  const setCategoryFilter = useUiStore((s) => s.setCategoryFilter)
  const { data: pending } = useTodos('pending')
  const { data: categories } = useCategories()
  const [manageOpen, setManageOpen] = useState(false)

  const list = pending ?? []
  const normalCount = list.filter((t) => t.category_id == null).length
  const countFor = (id: number) => list.filter((t) => t.category_id === id).length

  return (
    <div className="td-filter-bar">
      <div className="td-filter-chips">
        <button
          className={`td-chip ${categoryFilter === 'all' ? 'active' : ''}`}
          onClick={() => setCategoryFilter('all')}
        >
          すべて<span className="td-badge">{list.length}</span>
        </button>
        <Chip
          filterValue="normal"
          categoryId={null}
          active={categoryFilter === 'normal'}
          onSelect={() => setCategoryFilter('normal')}
        >
          通常<span className="td-badge">{normalCount}</span>
        </Chip>
        {(categories ?? []).map((c) => (
          <Chip
            key={c.id}
            filterValue={c.id}
            categoryId={c.id}
            active={categoryFilter === c.id}
            onSelect={() => setCategoryFilter(c.id)}
          >
            <span className="td-chip-dot" style={{ background: c.color }} />
            {c.name}<span className="td-badge">{countFor(c.id)}</span>
          </Chip>
        ))}
        <button className="td-icon-btn td-chip-manage" title="カテゴリを管理" onClick={() => setManageOpen(true)}>
          <i className="bi bi-gear" />
        </button>
      </div>
      <label className="td-dated-only-toggle">
        <span className="td-toggle">
          <input type="checkbox" checked={datedOnly} onChange={(e) => setDatedOnly(e.target.checked)} />
          <span className="td-toggle-track" />
        </span>
        <span>期日ありのみ</span>
      </label>
      {manageOpen && <CategoryModal onClose={() => setManageOpen(false)} />}
    </div>
  )
}

function Chip({
  filterValue,
  categoryId,
  active,
  onSelect,
  children,
}: {
  filterValue: CategoryFilter
  categoryId: number | null
  active: boolean
  onSelect: () => void
  children: React.ReactNode
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `chip-${filterValue}`,
    data: { type: 'category-target', categoryId },
  })
  return (
    <button
      ref={setNodeRef}
      className={`td-chip ${active ? 'active' : ''} ${isOver ? 'is-drop-target' : ''}`}
      onClick={onSelect}
    >
      {children}
    </button>
  )
}
