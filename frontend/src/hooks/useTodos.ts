import { useQuery } from '@tanstack/react-query'
import { App, Todo } from '../api/client'
import { qk } from '../api/queryKeys'
import { useUiStore } from '../state/uiStore'

export function useTodos(tab?: string) {
  const activeTab = useUiStore((s) => s.activeTab)
  const t = tab ?? activeTab
  return useQuery<Todo[]>({ queryKey: qk.todos(t), queryFn: () => App.GetTodos(t) })
}
