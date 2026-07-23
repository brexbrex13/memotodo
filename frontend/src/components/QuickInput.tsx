import { useState, useRef, useEffect } from 'react'
import { main } from '../api/client'
import { useTodoMutations } from '../hooks/useTodoMutations'
import { useCategories } from '../hooks/useCategories'
import { useUiStore } from '../state/uiStore'

export default function QuickInput({
  forceCategoryId,
  compact = false,
  autoFocus = false,
  onSubmitted,
}: {
  // 未指定なら現在のカテゴリ絞り込み(categoryFilter)に従う。指定時はそれを優先する
  // （カテゴリセクションの「＋」からのインライン追加用）。
  forceCategoryId?: number | null
  compact?: boolean
  autoFocus?: boolean
  onSubmitted?: () => void
}) {
  const [value, setValue] = useState('')
  const ref = useRef<HTMLTextAreaElement>(null)
  const { create } = useTodoMutations()
  const { data: categories } = useCategories()
  const categoryFilter = useUiStore((s) => s.categoryFilter)
  const focusToken = useUiStore((s) => s.quickInputFocusToken)

  const categoryId = forceCategoryId !== undefined ? forceCategoryId : typeof categoryFilter === 'number' ? categoryFilter : null
  const targetCategory = categoryId != null ? categories?.find((c) => c.id === categoryId) : undefined

  useEffect(() => {
    if (focusToken > 0) ref.current?.focus()
  }, [focusToken])

  useEffect(() => {
    if (autoFocus) ref.current?.focus()
  }, [autoFocus])

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
        category_id: categoryId ?? 0,
      }),
      { onSuccess: () => { setValue(''); ref.current?.focus(); onSubmitted?.() } },
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

  const placeholder = targetCategory
    ? `「${targetCategory.name}」にメモを入力してEnterで追加`
    : 'メモを入力してEnterで追加（Alt+Enterで改行）'

  return (
    <div className={`td-quick-input-wrap ${compact ? 'is-compact' : ''}`}>
      <textarea
        ref={ref}
        className="td-quick-input"
        rows={1}
        placeholder={placeholder}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKeyDown}
      />
    </div>
  )
}
