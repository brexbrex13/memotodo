import { useState, useRef } from 'react'
import { main } from '../api/client'
import { useTodoMutations } from '../hooks/useTodoMutations'

export default function QuickInput() {
  const [value, setValue] = useState('')
  const ref = useRef<HTMLTextAreaElement>(null)
  const { create } = useTodoMutations()

  const submit = () => {
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

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter=登録 / Alt+Enter=改行（現行踏襲）
    if (e.key === 'Enter' && !e.altKey) {
      e.preventDefault()
      submit()
    }
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
