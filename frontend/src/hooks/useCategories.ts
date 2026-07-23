import { useQuery } from '@tanstack/react-query'
import { App, Category } from '../api/client'
import { qk } from '../api/queryKeys'

export function useCategories() {
  return useQuery<Category[]>({ queryKey: qk.categories(), queryFn: () => App.GetCategories() })
}
