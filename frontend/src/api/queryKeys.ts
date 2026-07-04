export const qk = {
  todosAll: () => ['todos'] as const,
  todos: (tab: string) => ['todos', tab] as const,
  todo: (id: number) => ['todo', id] as const,
  settings: () => ['settings'] as const,
  nearOrOverdue: () => ['nearOrOverdue'] as const,
  recurringPanel: () => ['recurringPanel'] as const,
  recurringTasks: () => ['recurringTasks'] as const,
}
