import { Todo, main } from '../api/client'
import { useUiStore, TodoDraft } from '../state/uiStore'
import { useTodoMutations } from '../hooks/useTodoMutations'
import { useCategories } from '../hooks/useCategories'
import RichTextEditor from './RichTextEditor'
import DetectedLinks from './DetectedLinks'

// ドラフトと元 todo をマージした現在値（現行 _applyTodoDraft と同じ）
function merged(todo: Todo, draft?: TodoDraft) {
  return { ...todo, ...(draft ?? {}) }
}

export default function TodoDetail({ todo, modal = false }: { todo: Todo; modal?: boolean }) {
  const draft = useUiStore((s) => s.drafts[todo.id])
  const setDraft = useUiStore((s) => s.setDraft)
  const clearDraft = useUiStore((s) => s.clearDraft)
  const setOpenId = useUiStore((s) => s.setOpenId)
  const { update, remove } = useTodoMutations()
  const { data: categories } = useCategories()
  const v = merged(todo, draft)

  const patch = (p: Partial<TodoDraft>) => setDraft(todo.id, { ...(draft ?? {}), ...p })

  const save = () => {
    const req = main.UpdateTodoRequest.createFrom({
      title: (v.title ?? '').trim() || todo.title,
      memo: v.memo ?? '',
      deadline: v.deadline || '',
      reminder_enabled: !!v.reminder_enabled,
      reminder_at: v.reminder_enabled && v.reminder_at ? `${v.reminder_at}:00` : '',
      category_id: v.category_id ?? 0,
    })
    update.mutate({ id: todo.id, req }, { onSuccess: () => { clearDraft(todo.id); setOpenId(null) } })
  }

  const reminderAt = (v.reminder_at ?? '').slice(0, 16)

  return (
    <div className="td-detail-inline">
      {modal && (
        <textarea
          className="td-detail-title-input"
          rows={1}
          placeholder="メモを入力"
          value={v.title ?? ''}
          onChange={(e) => patch({ title: e.target.value })}
        />
      )}
      <div className="td-detail-grid">
        <label className="td-field">
          <span className="td-detail-label">期日</span>
          <input type="date" className="td-input" value={v.deadline || ''}
            onChange={(e) => patch({ deadline: e.target.value })} />
        </label>
        <label className="td-field">
          <span className="td-detail-label">カテゴリ</span>
          <select className="td-input" value={v.category_id ?? 0}
            onChange={(e) => patch({ category_id: Number(e.target.value) || null })}>
            <option value={0}>通常</option>
            {(categories ?? []).map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </label>
        <label className="td-field" style={{ gridColumn: '1 / -1' }}>
          <span className="td-detail-label">リマインダー</span>
          <div className="td-reminder-row">
            <label className="td-toggle">
              <input type="checkbox" checked={!!v.reminder_enabled}
                onChange={(e) => patch({ reminder_enabled: e.target.checked })} />
              <span className="td-toggle-track" />
            </label>
            <input type="datetime-local" className="td-input" value={reminderAt}
              disabled={!v.reminder_enabled}
              onChange={(e) => patch({ reminder_at: e.target.value })} />
          </div>
        </label>
      </div>

      <div className="td-field">
        <span className="td-detail-label">詳細メモ</span>
        <RichTextEditor value={v.memo ?? ''} onChange={(html) => patch({ memo: html })} />
        <DetectedLinks links={todo.links} />
      </div>

      <div className="td-detail-footer">
        <div className="td-detail-footer-left">
          <button className="td-btn td-btn-ghost-danger td-btn-sm"
            onClick={() => { if (confirm('このメモを削除しますか？')) remove.mutate(todo.id, { onSuccess: () => { clearDraft(todo.id); setOpenId(null) } }) }}>
            <i className="bi bi-trash3" /> 削除
          </button>
        </div>
        {modal && <button className="td-btn td-btn-secondary" onClick={() => { clearDraft(todo.id); setOpenId(null) }}>変更を破棄</button>}
        <button className="td-btn td-btn-primary" onClick={save}><i className="bi bi-floppy" /> 保存</button>
      </div>
    </div>
  )
}
