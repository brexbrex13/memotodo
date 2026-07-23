import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core'
import { useTodos } from '../hooks/useTodos'
import { useTodoMutations } from '../hooks/useTodoMutations'
import { matchesGroup, GroupKey } from '../lib/categoryGroups'
import { computeReorder } from '../lib/format'
import FilterBar from './FilterBar'
import TodoList from './TodoList'

interface TodoDragData {
  type: 'todo'
  todoId: number
  groupKey?: GroupKey
}

interface CategoryTargetData {
  type: 'category-target'
  categoryId: number | null
}

// フィルタチップ（カテゴリへドロップ）とタスク一覧（並び替え・カテゴリセクション見出しへの
// ドロップ）を1つの DndContext にまとめる。チップ・一覧は別コンポーネントの兄弟だが、
// dnd-kit の各フックは Context の祖先にさえ DndContext があれば動くため、ここで
// onDragEnd の解決ロジックだけを持てばよい。
export default function TodoWorkspace() {
  const { data: todos } = useTodos('pending')
  const { reorder, setCategory } = useTodoMutations()
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  const onDragEnd = (e: DragEndEvent) => {
    const active = e.active.data.current as TodoDragData | undefined
    const over = e.over?.data.current as CategoryTargetData | TodoDragData | undefined
    if (!active || active.type !== 'todo' || !over) return

    if (over.type === 'category-target') {
      setCategory.mutate({ id: active.todoId, categoryId: over.categoryId })
      return
    }

    // 同一グループ内の並び替え（期日なしタスクのみ）
    if (over.type === 'todo' && active.groupKey !== undefined && over.groupKey === active.groupKey) {
      const groupKey = active.groupKey
      const ids = (todos ?? []).filter((t) => !t.deadline && matchesGroup(t, groupKey)).map((t) => t.id)
      const next = computeReorder(ids, active.todoId, over.todoId)
      if (next.join() !== ids.join()) reorder.mutate(next)
    }
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <FilterBar />
      <TodoList />
    </DndContext>
  )
}
