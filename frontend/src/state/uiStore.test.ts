import { describe, it, expect, beforeEach } from 'vitest'
import { useUiStore } from './uiStore'
import { todo } from '../api/client'

const mkTodo = (id: number) => todo.Todo.createFrom({ id, title: `t${id}` })

beforeEach(() => {
  useUiStore.setState({
    toasts: [],
    drafts: {},
    recurringDrafts: {},
    forceDetailModalId: null,
    quickInputFocusToken: 0,
  })
})

describe('toasts reducer', () => {
  it('pushToast は末尾に追加する', () => {
    useUiStore.getState().pushToast({ kind: 'reminder', id: 'reminder:1', todo: mkTodo(1) })
    expect(useUiStore.getState().toasts).toHaveLength(1)
  })
  it('同 id の pushToast は置換（重複しない）', () => {
    const s = useUiStore.getState()
    s.pushToast({ kind: 'reminder', id: 'reminder:1', todo: mkTodo(1) })
    s.pushToast({ kind: 'reminder', id: 'reminder:1', todo: mkTodo(1) })
    expect(useUiStore.getState().toasts).toHaveLength(1)
  })
  it('periodic は id=periodic で常に単一', () => {
    const s = useUiStore.getState()
    s.pushToast({ kind: 'periodic', id: 'periodic' })
    s.pushToast({ kind: 'periodic', id: 'periodic' })
    expect(useUiStore.getState().toasts.filter((t) => t.kind === 'periodic')).toHaveLength(1)
  })
  it('dismissToast は id で1件削除', () => {
    const s = useUiStore.getState()
    s.pushToast({ kind: 'reminder', id: 'reminder:1', todo: mkTodo(1) })
    s.dismissToast('reminder:1')
    expect(useUiStore.getState().toasts).toHaveLength(0)
  })
  it('clearToastsByKind は指定 kind だけ削除', () => {
    const s = useUiStore.getState()
    s.pushToast({ kind: 'reminder', id: 'reminder:1', todo: mkTodo(1) })
    s.pushToast({ kind: 'periodic', id: 'periodic' })
    s.clearToastsByKind('periodic')
    const ts = useUiStore.getState().toasts
    expect(ts).toHaveLength(1)
    expect(ts[0].kind).toBe('reminder')
  })
})

describe('clearAllDrafts', () => {
  it('drafts と recurringDrafts を空にする', () => {
    useUiStore.setState({ drafts: { 1: { title: 'a' } }, recurringDrafts: { x: { title: 'b' } } })
    useUiStore.getState().clearAllDrafts()
    expect(useUiStore.getState().drafts).toEqual({})
    expect(useUiStore.getState().recurringDrafts).toEqual({})
  })
})

describe('quickInputFocusToken', () => {
  it('requestQuickInputFocus でインクリメント', () => {
    const before = useUiStore.getState().quickInputFocusToken
    useUiStore.getState().requestQuickInputFocus()
    expect(useUiStore.getState().quickInputFocusToken).toBe(before + 1)
  })
})
