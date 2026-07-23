import { useMutation, useQueryClient } from '@tanstack/react-query'
import { App, main } from '../api/client'
import { qk } from '../api/queryKeys'

export function useCategoryMutations() {
  const qc = useQueryClient()
  const invalidate = () => qc.invalidateQueries({ queryKey: qk.categories() })
  const onError = (e: unknown) => alert((e as Error)?.message || '操作に失敗しました')

  const create = useMutation({
    mutationFn: (req: main.CreateCategoryRequest) => App.CreateCategory(req),
    onSuccess: invalidate,
    onError,
  })
  const update = useMutation({
    mutationFn: ({ id, req }: { id: number; req: main.UpdateCategoryRequest }) => App.UpdateCategory(id, req),
    onSuccess: invalidate,
    onError,
  })
  const remove = useMutation({
    mutationFn: (id: number) => App.DeleteCategory(id),
    // カテゴリ削除は所属タスクの category_id も変わるため一覧側も無効化する
    onSuccess: () => { invalidate(); qc.invalidateQueries({ queryKey: qk.todosAll() }) },
    onError,
  })
  const reorder = useMutation({
    mutationFn: (ids: number[]) => App.ReorderCategories(ids),
    onSuccess: invalidate,
    onError,
  })

  return { create, update, remove, reorder }
}
