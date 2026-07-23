import { Todo } from '../api/client'

// 'normal' = 通常タスク（category_id が無い）、数値 = そのカテゴリID。
export type GroupKey = 'normal' | number

export function matchesGroup(todo: Todo, key: GroupKey): boolean {
  if (key === 'normal') return todo.category_id == null
  return todo.category_id === key
}
