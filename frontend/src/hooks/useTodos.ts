import { useQuery } from '@tanstack/react-query'
import { App, Todo } from '../api/client'
import { qk } from '../api/queryKeys'
import { useUiStore } from '../state/uiStore'

export function useTodos(tab?: string) {
  const activeTab = useUiStore((s) => s.activeTab)
  const t = tab ?? activeTab
  return useQuery<Todo[]>({ queryKey: qk.todos(t), queryFn: () => App.GetTodos(t) })
}

// 単一メモを id で取得する（activeTab の一覧に依存しないので、リマインダーの強制モーダルなど
// 現在のタブに無いメモも確実に解決できる）。id が null の間は取得しない。
export function useTodo(id: number | null) {
  return useQuery<Todo>({
    queryKey: qk.todo(id ?? 0),
    queryFn: () => App.GetTodo(id as number),
    enabled: id != null,
  })
}
