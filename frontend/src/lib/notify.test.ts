import { describe, it, expect } from 'vitest'
import { buildPeriodicGroups } from './notify'
import { todo } from '../api/client'

const mkTodo = (id: number, over: boolean, near: boolean) =>
  todo.Todo.createFrom({ id, title: `t${id}`, is_overdue: over, is_near: near })
const mkRec = (id: number, status: string) =>
  todo.RecurringTask.createFrom({ id, title: `r${id}`, status, current_deadline: '2026-07-01' })

describe('buildPeriodicGroups', () => {
  it('空入力は isEmpty=true', () => {
    const g = buildPeriodicGroups([], { overdue: [], current: [], badge: { current: 0, overdue: 0 } } as any)
    expect(g.isEmpty).toBe(true)
  })
  it('undefined 入力でも落ちず isEmpty=true', () => {
    expect(buildPeriodicGroups(undefined, undefined).isEmpty).toBe(true)
  })
  it('定期は overdue と current(status=pending) を分ける', () => {
    const panel = {
      overdue: [mkRec(1, 'overdue')],
      current: [mkRec(2, 'pending'), mkRec(3, 'done')],
      badge: { current: 1, overdue: 1 },
    } as any
    const g = buildPeriodicGroups([], panel)
    expect(g.recurringOverdue.map((t) => t.id)).toEqual([1])
    expect(g.recurringNear.map((t) => t.id)).toEqual([2]) // done は除外
    expect(g.isEmpty).toBe(false)
  })
  it('通常は is_overdue と (!is_overdue && is_near) を分ける', () => {
    const memos = [mkTodo(10, true, false), mkTodo(11, false, true), mkTodo(12, false, false)]
    const g = buildPeriodicGroups(memos, { overdue: [], current: [], badge: { current: 0, overdue: 0 } } as any)
    expect(g.todoOverdue.map((t) => t.id)).toEqual([10])
    expect(g.todoNear.map((t) => t.id)).toEqual([11]) // near でも overdue でもない 12 は除外
    expect(g.isEmpty).toBe(false)
  })
})
