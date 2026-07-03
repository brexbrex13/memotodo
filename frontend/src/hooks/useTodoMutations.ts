import { useMutation, useQueryClient } from '@tanstack/react-query'
import { App, main } from '../api/client'

export function useTodoMutations() {
  const qc = useQueryClient()
  const invalidateLists = () => {
    qc.invalidateQueries({ queryKey: ['todos'] })
    qc.invalidateQueries({ queryKey: ['nearOrOverdue'] })
  }

  const create = useMutation({
    mutationFn: (req: main.CreateTodoRequest) => App.CreateTodo(req),
    onSuccess: invalidateLists,
  })

  return { create, invalidateLists }
}
