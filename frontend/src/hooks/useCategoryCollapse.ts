import { useMutation, useQueryClient } from '@tanstack/react-query'
import { App, main } from '../api/client'
import { qk } from '../api/queryKeys'
import { useSettings } from './useSettings'

// 「すべて」表示でのカテゴリ折りたたみ状態。settings.collapsed_categories に永続化する。
export function useCategoryCollapse() {
  const { data: settings } = useSettings()
  const qc = useQueryClient()
  const collapsed = new Set(settings?.collapsed_categories ?? [])

  const toggle = useMutation({
    mutationFn: (categoryId: number) => {
      const next = collapsed.has(categoryId)
        ? [...collapsed].filter((id) => id !== categoryId)
        : [...collapsed, categoryId]
      return App.SaveSettings(main.SaveSettingsRequest.createFrom({ collapsed_categories: next }))
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.settings() }),
  })

  return { collapsed, toggleCollapse: (id: number) => toggle.mutate(id) }
}
