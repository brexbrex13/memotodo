import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Category, main } from '../api/client'
import { useCategories } from '../hooks/useCategories'
import { useCategoryMutations } from '../hooks/useCategoryMutations'
import { CATEGORY_COLOR_PRESETS, defaultCategoryColor } from '../lib/categoryColors'

export default function CategoryModal({ onClose }: { onClose: () => void }) {
  const { data: categories } = useCategories()
  const { create, update, remove, reorder } = useCategoryMutations()
  const [newName, setNewName] = useState('')
  const list = categories ?? []

  const addCategory = () => {
    const name = newName.trim()
    if (!name) return
    create.mutate(
      main.CreateCategoryRequest.createFrom({ name, color: defaultCategoryColor(list.length) }),
      { onSuccess: () => setNewName('') },
    )
  }

  const move = (index: number, dir: -1 | 1) => {
    const target = index + dir
    if (target < 0 || target >= list.length) return
    const ids = list.map((c) => c.id)
    ;[ids[index], ids[target]] = [ids[target], ids[index]]
    reorder.mutate(ids)
  }

  return createPortal(
    <>
      <div className="td-modal-overlay" style={{ display: 'block' }} onClick={onClose} />
      <div className="td-modal" style={{ display: 'flex' }}>
        <div className="td-modal-header">
          <span className="td-modal-title"><i className="bi bi-folder2" /> カテゴリ管理</span>
          <button className="td-panel-close" onClick={onClose}><i className="bi bi-x-lg" /></button>
        </div>
        <div className="td-modal-body">
          <div className="td-category-list">
            {list.map((c, i) => (
              <CategoryRow
                key={c.id}
                category={c}
                onRename={(name) => update.mutate({ id: c.id, req: main.UpdateCategoryRequest.createFrom({ name }) })}
                onColor={(color) => update.mutate({ id: c.id, req: main.UpdateCategoryRequest.createFrom({ color }) })}
                onMoveUp={() => move(i, -1)}
                onMoveDown={() => move(i, 1)}
                canMoveUp={i > 0}
                canMoveDown={i < list.length - 1}
                onDelete={() => {
                  if (confirm(`「${c.name}」を削除しますか？（所属タスクは「通常」に戻ります）`)) remove.mutate(c.id)
                }}
              />
            ))}
            {list.length === 0 && <div className="td-empty">カテゴリはまだありません</div>}
          </div>
          <div className="td-category-add-row">
            <input
              className="td-input"
              placeholder="新しいカテゴリ名"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') addCategory() }}
            />
            <button className="td-btn td-btn-primary td-btn-sm" onClick={addCategory}><i className="bi bi-plus" /> 追加</button>
          </div>
        </div>
        <div className="td-modal-footer">
          <button className="td-btn td-btn-secondary" onClick={onClose}>閉じる</button>
        </div>
      </div>
    </>,
    document.body,
  )
}

function CategoryRow({
  category,
  onRename,
  onColor,
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown,
  onDelete,
}: {
  category: Category
  onRename: (name: string) => void
  onColor: (color: string) => void
  onMoveUp: () => void
  onMoveDown: () => void
  canMoveUp: boolean
  canMoveDown: boolean
  onDelete: () => void
}) {
  // 名前入力はローカル状態で保持し、blur/Enter時にのみ保存する
  // （クエリ結果に直接バインドすると、保存の往復中に入力がちらつくため）。
  const [name, setName] = useState(category.name)

  const commit = () => {
    const trimmed = name.trim()
    if (trimmed && trimmed !== category.name) onRename(trimmed)
    else setName(category.name)
  }

  return (
    <div className="td-category-row">
      <span className="td-category-color-dot" style={{ background: category.color }} />
      <input
        className="td-input td-input-sm td-category-name-input"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
      />
      <div className="td-category-color-picker">
        {CATEGORY_COLOR_PRESETS.map((color) => (
          <button
            key={color}
            type="button"
            className={`td-color-swatch ${category.color === color ? 'is-selected' : ''}`}
            style={{ background: color }}
            title={color}
            onClick={() => onColor(color)}
          />
        ))}
      </div>
      <div className="td-category-row-actions">
        <button className="td-icon-btn" title="上へ" disabled={!canMoveUp} onClick={onMoveUp}>
          <i className="bi bi-arrow-up" />
        </button>
        <button className="td-icon-btn" title="下へ" disabled={!canMoveDown} onClick={onMoveDown}>
          <i className="bi bi-arrow-down" />
        </button>
        <button className="td-icon-btn td-btn-ghost-danger" title="削除" onClick={onDelete}>
          <i className="bi bi-trash3" />
        </button>
      </div>
    </div>
  )
}
