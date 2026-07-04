import { useQuery } from '@tanstack/react-query'
import { App, RecurringPanelData, RecurringTask } from '../api/client'
import { qk } from '../api/queryKeys'

export function useRecurringPanel() {
  return useQuery<RecurringPanelData>({
    queryKey: qk.recurringPanel(),
    queryFn: () => App.GetRecurringPanel(),
  })
}

export function useRecurringTasks() {
  return useQuery<RecurringTask[]>({
    queryKey: qk.recurringTasks(),
    queryFn: () => App.GetRecurringTasks(),
  })
}
