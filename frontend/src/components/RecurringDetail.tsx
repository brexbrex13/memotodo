import { useState } from 'react'
import { RecurringTask, main } from '../api/client'
import { useUiStore, RecurringDraft } from '../state/uiStore'
import { useRecurringMutations } from '../hooks/useRecurringMutations'
import { parsePeriodValue, encodePeriodValue } from '../lib/recurring'

const WEEKDAYS = ['月', '火', '水', '木', '金', '土', '日']

// task（元データ）に draft（未保存編集）を重ねた現在の表示値を作る。
// period_value は種別ごとの各サブ値（weekday/monthDay/yearMonth/yearDay）に分解して保持し、
// 保存時に encodePeriodValue で組み立てる（種別を切り替えても各値が消えないようにするため）。
function buildView(task: RecurringTask | null, draft?: RecurringDraft) {
  const parts = parsePeriodValue(task?.period_type ?? 'weekly', task?.period_value ?? '0')
  return {
    title: draft?.title ?? task?.title ?? '',
    memo: draft?.memo ?? task?.memo ?? '',
    period_type: draft?.period_type ?? task?.period_type ?? 'weekly',
    weekday: draft?.weekday ?? parts.weekday,
    monthDay: draft?.monthDay ?? parts.monthDay,
    yearMonth: draft?.yearMonth ?? parts.yearMonth,
    yearDay: draft?.yearDay ?? parts.yearDay,
    is_active: task?.is_active ?? true,
  }
}

export default function RecurringDetail({ task, modal = false }: { task: RecurringTask | null; modal?: boolean }) {
  const isNew = !task
  const key = isNew ? 'new' : String(task!.id)
  const draft = useUiStore((s) => s.recurringDrafts[key])
  const setDraft = useUiStore((s) => s.setRecurringDraft)
  const clearDraft = useUiStore((s) => s.clearRecurringDraft)
  const setOpenId = useUiStore((s) => s.setRecurringOpenId)
  const { create, update, remove, toggleActive } = useRecurringMutations()
  const [titleError, setTitleError] = useState(false)

  const v = buildView(task, draft)
  const patch = (p: Partial<RecurringDraft>) => setDraft(key, { ...(draft ?? {}), ...p })

  const closeDetail = () => {
    clearDraft(key)
    setOpenId(null)
  }

  const save = () => {
    const title = v.title.trim()
    if (!title) {
      setTitleError(true)
      return
    }
    setTitleError(false)
    const period_value = encodePeriodValue(v.period_type, {
      weekday: v.weekday,
      monthDay: v.monthDay,
      yearMonth: v.yearMonth,
      yearDay: v.yearDay,
    })
    const memo = v.memo.trim()
    if (isNew) {
      create.mutate(
        main.CreateRecurringTaskRequest.createFrom({ title, period_type: v.period_type, period_value, memo }),
        { onSuccess: closeDetail },
      )
    } else {
      update.mutate(
        {
          id: task!.id,
          req: main.UpdateRecurringTaskRequest.createFrom({ title, period_type: v.period_type, period_value, memo }),
        },
        { onSuccess: closeDetail },
      )
    }
  }

  const onDelete = () => {
    if (!confirm('この定期タスクを削除しますか？')) return
    remove.mutate(task!.id, { onSuccess: closeDetail })
  }

  const onToggleActive = () => {
    toggleActive.mutate({ id: task!.id, isActive: !task!.is_active }, { onSuccess: closeDetail })
  }

  return (
    <>
      {modal && (
        <div className="td-detail-label" style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
          {isNew ? '定期タスクを追加' : '定期タスクを編集'}
        </div>
      )}
      <div className="td-field">
        <span className="td-detail-label">タイトル <span className="td-required">*</span></span>
        <input
          type="text"
          className="td-input"
          maxLength={200}
          value={v.title}
          placeholder="定期タスクのタイトル"
          onChange={(e) => patch({ title: e.target.value })}
        />
        {titleError && <div className="td-error">タイトルを入力してください</div>}
      </div>
      <div className="td-field">
        <span className="td-detail-label">周期 <span className="td-required">*</span></span>
        <select className="td-input" value={v.period_type} onChange={(e) => patch({ period_type: e.target.value })}>
          <option value="weekly">週ごと（曜日）</option>
          <option value="monthly">月ごと（日付）</option>
          <option value="yearly">年ごと（月日）</option>
        </select>
      </div>

      {v.period_type === 'weekly' && (
        <div className="td-field">
          <span className="td-detail-label">曜日</span>
          <div className="td-weekday-row">
            {WEEKDAYS.map((n, i) => (
              <label className="td-weekday-btn" key={i}>
                <input
                  type="radio"
                  name={`r-weekday-${key}`}
                  value={i}
                  checked={String(v.weekday) === String(i)}
                  onChange={() => patch({ weekday: String(i) })}
                />
                <span>{n}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {v.period_type === 'monthly' && (
        <div className="td-field">
          <span className="td-detail-label">毎月 <span className="td-required">*</span> 日</span>
          <input
            type="number"
            className="td-input td-input-sm"
            min={1}
            max={31}
            value={v.monthDay}
            onChange={(e) => patch({ monthDay: parseInt(e.target.value, 10) || 1 })}
          />
        </div>
      )}

      {v.period_type === 'yearly' && (
        <div className="td-field">
          <span className="td-detail-label">毎年</span>
          <div className="td-yearly-row">
            <input
              type="number"
              className="td-input td-input-sm"
              min={1}
              max={12}
              value={v.yearMonth}
              onChange={(e) => patch({ yearMonth: parseInt(e.target.value, 10) || 1 })}
            />
            <span className="td-yearly-sep">月</span>
            <input
              type="number"
              className="td-input td-input-sm"
              min={1}
              max={31}
              value={v.yearDay}
              onChange={(e) => patch({ yearDay: parseInt(e.target.value, 10) || 1 })}
            />
            <span className="td-yearly-sep">日</span>
          </div>
        </div>
      )}

      <div className="td-field">
        <span className="td-detail-label">メモ</span>
        <textarea
          className="td-input td-textarea"
          rows={2}
          placeholder="メモ（省略可）"
          value={v.memo}
          onChange={(e) => patch({ memo: e.target.value })}
        />
      </div>

      <div className="td-detail-footer">
        <div className="td-detail-footer-left">
          {!isNew && (
            <>
              <button className="td-btn td-btn-ghost-danger td-btn-sm" onClick={onDelete}>
                <i className="bi bi-trash3" /> 削除
              </button>
              <button className="td-btn td-btn-ghost td-btn-sm" onClick={onToggleActive}>
                <i className={`bi ${v.is_active ? 'bi-pause' : 'bi-play'}`} /> {v.is_active ? '一時停止' : '再開'}
              </button>
            </>
          )}
        </div>
        <div className="td-detail-footer-right">
          <button className="td-btn td-btn-secondary" onClick={closeDetail}>キャンセル</button>
          <button className="td-btn td-btn-primary" onClick={save}>保存</button>
        </div>
      </div>
    </>
  )
}
