import { useEffect, useState } from "react";
import { Category } from "./types";

export function CategoryTabs({
  categories,
  selected,
  all,
  onSelect,
  onManage,
}: {
  categories: Category[];
  selected: number;
  all: boolean;
  onSelect: (id: number) => void;
  onManage: (id: number) => void;
}) {
  const [context, setContext] = useState<{
    id: number;
    x: number;
    y: number;
  } | null>(null);
  useEffect(() => {
    if (!context) return;
    const close = (e: PointerEvent) => {
      if (!(e.target as Element).closest(".category-context")) setContext(null);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") setContext(null);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", key);
    window.addEventListener("resize", dismiss);
    function dismiss() {
      setContext(null);
    }
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", key);
      window.removeEventListener("resize", dismiss);
    };
  }, [context]);
  return (
    <div className="filters category-tabs" aria-label="カテゴリ">
      <button
        className={all ? "active" : ""}
        onClick={() => onSelect(-1)}
        data-tip="全カテゴリのタスクを表示"
      >
        全て
      </button>
      {categories.map((c) => (
        <button
          key={c.id}
          className={selected === c.id ? "active" : ""}
          title={c.name}
          onClick={() => onSelect(c.id)}
          onContextMenu={(e) => {
            e.preventDefault();
            setContext({
              id: c.id,
              x: Math.max(8, Math.min(e.clientX, window.innerWidth - 168)),
              y: Math.max(8, Math.min(e.clientY, window.innerHeight - 56)),
            });
          }}
        >
          {c.name}
        </button>
      ))}
      <button
        className="category-add-tab"
        aria-label="カテゴリを追加"
        data-tip="カテゴリを追加・管理"
        onClick={() => onManage(0)}
      >
        ＋
      </button>
      {context && (
        <div
          className="category-context"
          role="menu"
          aria-label="カテゴリの操作"
          style={{ left: context.x, top: context.y }}
        >
          <button
            role="menuitem"
            autoFocus
            onClick={() => {
              onManage(context.id);
              setContext(null);
            }}
          >
            編集
          </button>
        </div>
      )}
    </div>
  );
}
