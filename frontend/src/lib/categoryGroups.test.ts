import { describe, it, expect } from 'vitest'
import { matchesGroup } from './categoryGroups'
import { Todo } from '../api/client'

function todo(category_id: number | null): Todo {
  return { category_id } as Todo
}

describe('matchesGroup', () => {
  it('normal は category_id が null/undefined のタスクにマッチする', () => {
    expect(matchesGroup(todo(null), 'normal')).toBe(true)
    expect(matchesGroup(todo(3), 'normal')).toBe(false)
  })
  it('数値のカテゴリIDは一致するタスクだけにマッチする', () => {
    expect(matchesGroup(todo(3), 3)).toBe(true)
    expect(matchesGroup(todo(3), 4)).toBe(false)
    expect(matchesGroup(todo(null), 3)).toBe(false)
  })
})
