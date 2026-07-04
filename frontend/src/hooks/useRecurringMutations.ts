import { useMutation, useQueryClient } from '@tanstack/react-query'
import { App, main } from '../api/client'
import { qk } from '../api/queryKeys'

export function useRecurringMutations() {
  const qc = useQueryClient()
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: qk.recurringPanel() })
    qc.invalidateQueries({ queryKey: qk.recurringTasks() })
  }
  const onError = (e: unknown) => alert((e as Error)?.message || '操作に失敗しました')

  const create = useMutation({
    mutationFn: (req: main.CreateRecurringTaskRequest) => App.CreateRecurringTask(req),
    onSuccess: invalidate,
    onError,
  })
  const update = useMutation({
    mutationFn: ({ id, req }: { id: number; req: main.UpdateRecurringTaskRequest }) => App.UpdateRecurringTask(id, req),
    onSuccess: invalidate,
    onError,
  })
  const remove = useMutation({
    mutationFn: (id: number) => App.DeleteRecurringTask(id),
    onSuccess: invalidate,
    onError,
  })
  const toggleComplete = useMutation({
    mutationFn: (id: number) => App.ToggleRecurringTask(id),
    onSuccess: invalidate,
    onError,
  })
  const toggleActive = useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) =>
      App.UpdateRecurringTask(id, main.UpdateRecurringTaskRequest.createFrom({ is_active: isActive })),
    onSuccess: invalidate,
    onError,
  })

  return { create, update, remove, toggleComplete, toggleActive, invalidate }
}
