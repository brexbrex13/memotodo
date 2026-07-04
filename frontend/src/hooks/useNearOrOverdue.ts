import { useQuery } from '@tanstack/react-query'
import { App, Todo } from '../api/client'
import { qk } from '../api/queryKeys'

export function useNearOrOverdue() {
  return useQuery<Todo[]>({
    queryKey: qk.nearOrOverdue(),
    queryFn: () => App.GetNearOrOverdueMemos(),
  })
}
