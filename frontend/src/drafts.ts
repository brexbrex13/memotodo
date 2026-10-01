import { Task } from "./types";
export const editable = [
  "title",
  "memo",
  "deadline",
  "reminder_at",
  "category_id",
  "important",
] as const;
// Only user-edited fields are carried over. Scheduler/notification state is
// authoritative, and simultaneous changes to the same field never overwrite.
export function mergeDraft(base: Task, draft: Task, latest: Task): Task {
  const result = { ...latest };
  for (const key of editable) {
    if (draft[key] === base[key]) continue;
    if (latest[key] !== base[key] && latest[key] !== draft[key])
      throw new Error(
        "同じ項目が別の画面で更新されました。入力をコピーしてから再読込してください",
      );
    Object.assign(result, { [key]: draft[key] });
  }
  return result;
}
