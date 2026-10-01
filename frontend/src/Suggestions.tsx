import { useState } from "react";
import { Task } from "./types";
export function suggestions(
  tasks: Task[],
  query: string,
  minimum: number,
  category = -1,
): string[] {
  const q = query.trim().normalize("NFKC").toLocaleLowerCase();
  if (!q || minimum === 0 || query.includes("\n")) return [];
  const counts = new Map<
    string,
    { title: string; count: number; recent: string; category: boolean }
  >();
  for (const t of tasks) {
    if (t.series_id || t.deleted_at) continue;
    const key = t.title.trim().normalize("NFKC").toLocaleLowerCase();
    if (!key.startsWith(q) || key === q) continue;
    const old = counts.get(key);
    if (old) {
      old.count++;
      old.category ||= t.category_id === category;
      if (t.created_at > old.recent) {
        old.recent = t.created_at;
        old.title = t.title;
      }
    } else
      counts.set(key, {
        title: t.title,
        count: 1,
        recent: t.created_at,
        category: t.category_id === category,
      });
  }
  return [...counts.values()]
    .filter((v) => v.count >= minimum)
    .sort(
      (a, b) =>
        Number(b.category) - Number(a.category) ||
        b.count - a.count ||
        b.recent.localeCompare(a.recent),
    )
    .slice(0, 5)
    .map((v) => v.title);
}
export function useSuggestions(
  tasks: Task[],
  query: string,
  minimum: number,
  onChoose: (title: string) => void,
  category = -1,
) {
  const [closed, setClosed] = useState(""),
    [index, setIndex] = useState(-1),
    [active, setActive] = useState(false);
  const items =
    !active || closed === query
      ? []
      : suggestions(tasks, query, minimum, category);
  const choose = (title: string) => {
    onChoose(title);
    setClosed(title);
    setIndex(-1);
  };
  const keyDown = (e: React.KeyboardEvent) => {
    if (e.nativeEvent.isComposing || e.keyCode === 229 || !items.length)
      return false;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setIndex((i) =>
        i < 0
          ? e.key === "ArrowDown"
            ? 0
            : items.length - 1
          : (i + (e.key === "ArrowDown" ? 1 : -1) + items.length) %
            items.length,
      );
      return true;
    }
    if ((e.key === "Tab" && !e.shiftKey) || (e.key === "Enter" && index >= 0)) {
      e.preventDefault();
      choose(items[Math.min(Math.max(index, 0), items.length - 1)]);
      return true;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      setClosed(query);
      setIndex(-1);
      return true;
    }
    return false;
  };
  const list = items.length ? (
    <div
      className="task-suggestions"
      role="listbox"
      aria-label="タスク名の候補"
    >
      {items.map((title, i) => (
        <button
          key={title}
          role="option"
          aria-selected={i === index}
          className={i === index ? "active" : ""}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => choose(title)}
        >
          {title}
        </button>
      ))}
    </div>
  ) : null;
  return {
    list,
    keyDown,
    open: items.length > 0,
    blur: () => setActive(false),
    reset: () => {
      setActive(true);
      setClosed("");
      setIndex(-1);
    },
  };
}
