import { useState, useRef, useEffect } from 'react'
import { main } from '../api/client'
import { useTodoMutations } from '../hooks/useTodoMutations'
import { useUiStore } from '../state/uiStore'

export default function QuickInput() {
  const [value, setValue] = useState('')
  const ref = useRef<HTMLTextAreaElement>(null)
  const { create } = useTodoMutations()
  const focusToken = useUiStore((s) => s.quickInputFocusToken)
  useEffect(() => {
    if (focusToken > 0) ref.current?.focus()
  }, [focusToken])

  // 内容に合わせて高さを自動調整する（max-height はCSSで220pxに制限、超過分はスクロール）。
  // border-box なので下端にスクロールバーが出ないよう枠線分(offsetHeight-clientHeight)を足す。
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight + el.offsetHeight - el.clientHeight}px`
  }, [value])

  const submit = () => {
    if (create.isPending) return
    const title = value.trim()
    if (!title) return
    create.mutate(
      main.CreateTodoRequest.createFrom({
        title,
        memo: '',
        deadline: '',
        reminder_enabled: false,
        reminder_at: '',
        is_important: false,
      }),
      { onSuccess: () => { setValue(''); ref.current?.focus() } },
    )
  }

  // カーソル位置に改行を挿入する（textarea 既定では Alt+Enter は改行にならないため自前で挿入）。
  const insertNewline = () => {
    const el = ref.current
    if (!el) return
    const start = el.selectionStart
    const end = el.selectionEnd
    setValue(value.slice(0, start) + '\n' + value.slice(end))
    // state 反映後の再描画を待ってキャレットを改行直後へ戻す
    requestAnimationFrame(() => {
      el.selectionStart = el.selectionEnd = start + 1
    })
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter=登録 / Alt+Enter=改行（現行踏襲）
    if (e.key !== 'Enter') return
    e.preventDefault()
    if (e.altKey) insertNewline()
    else submit()
  }

  return (
    <div className="td-quick-input-wrap">
      <div className="td-quick-input-label">タスクを登録</div>
      <textarea
        ref={ref}
        className="td-quick-input"
        rows={1}
        placeholder="メモを入力してEnterで追加（Alt+Enterで改行）"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKeyDown}
      />
      <div className="td-quick-input-hint">Enter で追加　・　Alt+Enter で改行</div>
    </div>
  )
}
