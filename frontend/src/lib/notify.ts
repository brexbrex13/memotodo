import { Todo, RecurringTask, RecurringPanelData } from '../api/client'

export interface PeriodicGroups {
  recurringOverdue: RecurringTask[]
  recurringNear: RecurringTask[]
  todoOverdue: Todo[]
  todoNear: Todo[]
  isEmpty: boolean
}

// 定期通知トーストの4区分を組み立てる。元実装 _renderPeriodicToast に準拠：
// 定期=overdue と current(status==='pending')、通常=is_overdue と (!is_overdue && is_near)。
export function buildPeriodicGroups(
  memos: Todo[] | undefined,
  panel: RecurringPanelData | null | undefined,
): PeriodicGroups {
  const recurringOverdue = panel?.overdue ?? []
  const recurringNear = (panel?.current ?? []).filter((t) => t.status === 'pending')
  const list = memos ?? []
  const todoOverdue = list.filter((t) => t.is_overdue)
  const todoNear = list.filter((t) => !t.is_overdue && t.is_near)
  const isEmpty =
    recurringOverdue.length === 0 &&
    recurringNear.length === 0 &&
    todoOverdue.length === 0 &&
    todoNear.length === 0
  return { recurringOverdue, recurringNear, todoOverdue, todoNear, isEmpty }
}
