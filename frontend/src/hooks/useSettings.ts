import { useQuery } from '@tanstack/react-query'
import { App, Settings } from '../api/client'
import { qk } from '../api/queryKeys'

export function useSettings() {
  return useQuery<Settings>({ queryKey: qk.settings(), queryFn: () => App.GetSettings() })
}
