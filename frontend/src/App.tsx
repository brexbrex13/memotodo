import { useCallback, useEffect, useRef, useState } from "react";
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  useDroppable,
  closestCenter,
  pointerWithin,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { api, on } from "./api";
import {
  Category,
  Series,
  Snapshot,
  Task,
  emptyTask,
  emptySeries,
  urgency,
  urgencyLabel,
  textOnly,
} from "./types";
import { TaskDetail, DraftHandle } from "./TaskDetail";
import { SeriesForm } from "./SeriesForm";
import { SettingsForm } from "./SettingsForm";
import { CategoryManager } from "./CategoryManager";

function Bell() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      aria-hidden="true"
    >
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />
    </svg>
  );
}
function Row({
  t,
  u,
  open,
  complete,
  drag,
}: {
  t: Task;
  u: string;
  open: () => void;
  complete: () => void;
  drag: boolean;
}) {
  const s = useSortable({ id: t.id, disabled: !drag });
  return (
    <article
      ref={s.setNodeRef}
      style={{
        transform: CSS.Transform.toString(s.transform),
        transition: s.transition,
      }}
      className={"task-row " + u + (s.isDragging ? " dragging" : "")}
    >
      <button
        className="grip"
        aria-label={t.title + "を移動"}
        data-tip="ドラッグで並べ替え・カテゴリ移動。キーボードはSpace→矢印。"
        disabled={!drag}
        {...s.attributes}
        {...s.listeners}
      >
        ⠿
      </button>
      {t.important && (
        <span className="star" data-tip="重要">
          ★
        </span>
      )}
      <button className="card-content" onClick={open}>
        <span className="task-title">{t.title}</span>
        {t.memo && (
          <span className="memo-mark" data-tip="メモあり">
            ▤
          </span>
        )}
      </button>
      {t.deadline && (
        <time
          className={"task-deadline " + u}
          data-tip={urgencyLabel[u] || "期限"}
        >
          {t.deadline.slice(0, 10).replace(/-/g, "/")}
        </time>
      )}
      {t.reminder_at && (
        <span data-tip={"通知 " + t.reminder_at.replace("T", " ").slice(0, 16)}>
          ♧
        </span>
      )}
      {t.status === "pending" && !t.deleted_at && (
        <input
          type="checkbox"
          className="complete-check"
          aria-label={t.title + "を完了"}
          checked={false}
          onChange={complete}
        />
      )}
    </article>
  );
}
function Group({
  c,
  hideTitle,
  children,
}: {
  c: Category;
  hideTitle: boolean;
  children: React.ReactNode;
}) {
  const drop = useDroppable({ id: "category:" + c.id });
  return (
    <section
      ref={drop.setNodeRef}
      className={"category" + (drop.isOver ? " drop-over" : "")}
      style={{ background: c.color, color: c.text_color || "#302d25" }}
      aria-label={c.name}
    >
      {!hideTitle && <div className="category-caption">{c.name}</div>}
      {children}
    </section>
  );
}
export default function App() {
  const [data, setData] = useState<Snapshot | null>(null),
    [error, setError] = useState(""),
    [view, setView] = useState("board"),
    [category, setCategory] = useState(-1),
    [query, setQuery] = useState(""),
    [important, setImportant] = useState(false),
    [dated, setDated] = useState(false),
    [sort, setSort] = useState("manual"),
    [quick, setQuick] = useState(localStorage.getItem("quick-draft") ?? ""),
    [adding, setAdding] = useState(false),
    [selected, setSelected] = useState<Task | null>(null),
    [series, setSeries] = useState<Series | null>(null),
    [togglingSeries, setTogglingSeries] = useState<number | null>(null),
    [settings, setSettings] = useState(false),
    [panel, setPanel] = useState(""),
    [menu, setMenu] = useState(false),
    [deadline, setDeadline] = useState(""),
    [search, setSearch] = useState(false);
  const handle = useRef<DraftHandle | null>(null),
    quickRef = useRef<HTMLTextAreaElement>(null);
  const report = useCallback(
    (e: unknown) => setError(e instanceof Error ? e.message : String(e)),
    [],
  );
  const reload = useCallback(async () => {
    try {
      setData(await api<Snapshot>("GetSnapshot"));
    } catch (e) {
      report(e);
    }
  }, [report]);
  const flush = () => handle.current?.flush() ?? Promise.resolve();
  const navigate = async (fn: () => void) => {
    try {
      await flush();
      setSelected(null);
      setMenu(false);
      setDeadline("");
      fn();
    } catch (e) {
      report(e);
    }
  };
  const open = async (t: Task) => {
    try {
      await flush();
      setPanel("");
      setDeadline("");
      setSelected(null);
      setTimeout(() => setSelected(t), 0);
    } catch (e) {
      report(e);
    }
  };
  useEffect(() => {
    void reload();
    void api("Ready", "board").catch(report);
    const off = [
      on("board:notices", () => {
        setPanel("notices");
        setSelected(null);
      }),
      on("board:changed", () => void reload()),
      on("board:error", report),
      on("board:quick", () => {
        setView("board");
        quickRef.current?.focus();
      }),
      on("board:open", (id) => {
        void api<Snapshot>("GetSnapshot")
          .then((v) => {
            setData(v);
            const t = v.tasks.find((x) => x.id === Number(id));
            if (t) void open(t);
          })
          .catch(report);
      }),
      on("board:close-request", (mode) => {
        void flush()
          .then(() => api("FinishClose", String(mode)))
          .catch(report);
      }),
    ];
    const timer = setInterval(() => void reload(), 60000);
    let resizeTimer: ReturnType<typeof setTimeout>;
    const resize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(
        () => void api("SaveMainWindowSize").catch(report),
        400,
      );
    };
    window.addEventListener("resize", resize);
    return () => {
      off.forEach((f) => f());
      clearInterval(timer);
      clearTimeout(resizeTimer);
      window.removeEventListener("resize", resize);
    };
  }, []);
  useEffect(() => {
    localStorage.setItem("quick-draft", quick);
  }, [quick]);
  useEffect(() => {
    if (data?.categories.find((c) => c.id === category)?.dormant)
      setCategory(-1);
  }, [data, category]);
  useEffect(() => {
    const click = (e: PointerEvent) => {
      if (!(e.target as Element).closest("[data-popup],.popover")) {
        setMenu(false);
        setDeadline("");
      }
    };
    const key = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === "n") {
        e.preventDefault();
        setView("board");
        quickRef.current?.focus();
      }
      if (e.ctrlKey && e.key === "f") {
        e.preventDefault();
        setSearch(true);
        setTimeout(() => document.getElementById("search")?.focus(), 0);
      }
      if (e.key === "Escape") {
        setMenu(false);
        setDeadline("");
        if (selected) void navigate(() => {});
        else setPanel("");
      }
    };
    document.addEventListener("pointerdown", click);
    window.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", click);
      window.removeEventListener("keydown", key);
    };
  }, [selected]);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  const add = async () => {
    if (adding || !quick.trim()) return;
    setAdding(true);
    try {
      await api("SaveTask", {
        ...emptyTask(category > 0 ? category : 0),
        title: quick,
      });
      setQuick("");
      await reload();
      quickRef.current?.focus();
    } catch (e) {
      report(e);
    } finally {
      setAdding(false);
    }
  };
  const state = async (t: Task, value: string) => {
    try {
      if (selected?.id === t.id) await flush();
      await api("SetState", t.id, value);
      if (selected?.id === t.id) setSelected(null);
      await reload();
    } catch (e) {
      report(e);
    }
  };
  if (!data)
    return (
      <main className="loading">
        <p>{error || "読み込み中…"}</p>
        <button onClick={() => void reload()}>再試行</button>
      </main>
    );
  const pending = data.tasks.filter(
    (t) => t.status === "pending" && !t.deleted_at,
  );
  const urgent = pending
    .filter((t) => urgency(t, data.settings))
    .sort((a, b) => a.deadline.localeCompare(b.deadline));
  const categories = [
    {
      id: 0,
      name: "未分類",
      color: "#fffdf8",
      text_color: "#302d25",
      sort_order: -1,
    },
    ...data.categories
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order || a.id - b.id),
  ];
  const visibleCategories = categories.filter((c) => !c.dormant);
  let tasks = data.tasks
    .filter((t) =>
      view === "trash"
        ? !!t.deleted_at
        : view === "history"
          ? !t.deleted_at && t.status !== "pending"
          : !t.deleted_at && t.status === "pending",
    )
    .filter(
      (t) =>
        (view !== "board" && view !== "recurring") ||
        (view === "recurring" ? t.series_id > 0 : t.series_id === 0),
    )
    .filter((t) => category < 0 || t.category_id === category)
    .filter((t) => !important || t.important)
    .filter((t) => !dated || t.deadline)
    .filter(
      (t) =>
        !query ||
        [
          t.title,
          textOnly(t.memo),
          categories.find((c) => c.id === t.category_id)?.name ?? "",
        ]
          .join("\n")
          .toLocaleLowerCase()
          .includes(query.toLocaleLowerCase()),
    );
  tasks = tasks.sort((a, b) =>
    sort === "deadline"
      ? (a.deadline || "9999").localeCompare(b.deadline || "9999")
      : sort === "important"
        ? Number(b.important) - Number(a.important) ||
          a.sort_order - b.sort_order
        : sort === "created"
          ? b.created_at.localeCompare(a.created_at)
          : a.sort_order - b.sort_order || b.id - a.id,
  );
  const groups = (
    view === "board" || view === "recurring" ? visibleCategories : categories
  )
    .filter((c) => category < 0 || c.id === category)
    .filter(
      (c) => view !== "recurring" || tasks.some((t) => t.category_id === c.id),
    );
  const drag =
    (view === "board" || view === "recurring") &&
    sort === "manual" &&
    !query &&
    !important &&
    !dated;
  const dropped = async (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const moving = tasks.find((t) => t.id === e.active.id);
    if (!moving) return;
    const target = String(e.over.id).startsWith("category:")
      ? Number(String(e.over.id).split(":")[1])
      : tasks.find((t) => t.id === e.over?.id)?.category_id;
    if (target === undefined) return;
    try {
      await flush();
      if (moving.category_id !== target)
        await api("MoveTask", moving.id, target);
      const items = tasks.filter(
        (t) => t.category_id === target && t.id !== moving.id,
      );
      const index = items.findIndex((t) => t.id === e.over?.id);
      items.splice(index < 0 ? items.length : index, 0, moving);
      await api(
        "Reorder",
        items.map((t) => t.id),
      );
      await reload();
    } catch (e) {
      report(e);
      void reload();
    }
  };
  const popupTasks = pending
    .filter(
      (t) =>
        t.deadline &&
        (deadline === "all" || urgency(t, data.settings) === deadline),
    )
    .sort((a, b) => a.deadline.localeCompare(b.deadline));
  const setTab = (next: string, id = -1) =>
    void navigate(() => {
      setView(next);
      setCategory(id);
      setPanel("");
    });
  return (
    <div
      className={"app " + (data.settings.compact ? "compact" : "")}
      style={{ fontSize: data.settings.font_size }}
    >
      <header className="app-header">
        <h1 style={{ "--wails-draggable": "drag" } as React.CSSProperties}>
          MemoTodo
        </h1>
        <div className="app-actions">
          <button
            className="icon"
            data-popup
            data-tip="期限の近い順に確認"
            aria-label="期限順の一覧"
            onClick={() => {
              setMenu(false);
              setDeadline(deadline === "all" ? "" : "all");
            }}
          >
            <Bell />
          </button>
          <button
            className="icon"
            data-popup
            aria-label="メニュー"
            onClick={() => {
              setDeadline("");
              setMenu(!menu);
            }}
          >
            ⋯
          </button>
          <button
            className="icon"
            aria-label="トレイに格納"
            data-tip="トレイに格納"
            onClick={() =>
              void flush()
                .then(() => api("FinishClose", "hide"))
                .catch(report)
            }
          >
            ×
          </button>
        </div>
      </header>
      {menu && (
        <nav className="popover app-menu">
          <button onClick={() => void navigate(() => setPanel("categories"))}>
            カテゴリ管理
          </button>
          <button onClick={() => void navigate(() => setPanel("series"))}>
            定期設定
          </button>
          <button onClick={() => void navigate(() => setPanel("notices"))}>
            未確認の通知
          </button>
          <button onClick={() => setTab("history")}>完了済み</button>
          <button onClick={() => setTab("trash")}>ごみ箱</button>
          <button onClick={() => void navigate(() => setSettings(true))}>
            設定
          </button>
        </nav>
      )}
      {error && (
        <div className="error" role="alert">
          {error}
          <button onClick={() => setError("")}>×</button>
        </div>
      )}
      {data.settings.pause_until &&
        new Date(data.settings.pause_until) > new Date() && (
          <div className="pause">
            通知保留中
            <button
              onClick={() =>
                void api("SaveSettings", { ...data.settings, pause_until: "" })
                  .then(reload)
                  .catch(report)
              }
            >
              再開
            </button>
          </div>
        )}
      {urgent.length > 0 && (
        <section className="deadline-band" aria-label="期限の確認">
          <div className="band-counts">
            {["overdue", "today", "near"].map((u) => {
              const n = urgent.filter(
                (t) => urgency(t, data.settings) === u,
              ).length;
              return (
                n > 0 && (
                  <button
                    key={u}
                    className={u}
                    data-popup
                    onClick={() => {
                      setMenu(false);
                      setDeadline(deadline === u ? "" : u);
                    }}
                  >
                    {u === "today"
                      ? "今日"
                      : u === "near"
                        ? "近日"
                        : "期限超過"}{" "}
                    {n}
                  </button>
                )
              );
            })}
          </div>
          <div className="band-items">
            {urgent.slice(0, 5).map((t) => (
              <button
                key={t.id}
                className={urgency(t, data.settings)}
                data-tip={
                  t.title + " · " + t.deadline + (t.series_id ? " · 定期" : "")
                }
                onClick={() => void open(t)}
              >
                {t.title}
                <small>{t.deadline.slice(5, 10).replace("-", "/")}</small>
              </button>
            ))}
          </div>
        </section>
      )}
      {deadline && (
        <section className="popover deadline-popup" aria-label="期限タスク一覧">
          <header>
            <strong>
              {deadline === "all" ? "期限順" : urgencyLabel[deadline]}
            </strong>
            <button
              aria-label="期限一覧を閉じる"
              onClick={() => setDeadline("")}
            >
              ×
            </button>
          </header>
          <div>
            {popupTasks.map((t) => (
              <button
                className="deadline-item"
                key={t.id}
                onClick={() => void open(t)}
              >
                <span>
                  {t.title}
                  <small>
                    {t.series_id ? "定期 · " : ""}
                    {categories.find((c) => c.id === t.category_id)?.name}
                  </small>
                </span>
                <time className={urgency(t, data.settings)}>
                  {t.deadline.slice(0, 10)}
                </time>
              </button>
            ))}
            {!popupTasks.length && (
              <p className="empty-small">該当するタスクはありません</p>
            )}
          </div>
        </section>
      )}
      <div className="workspace">
        <main className="board-main">
          <div className="filters">
            <button
              className={
                "recurring-tab " + (view === "recurring" ? "active" : "")
              }
              onClick={() => setTab("recurring")}
            >
              定期
            </button>
            <button
              className={view === "board" && category < 0 ? "active" : ""}
              onClick={() => setTab("board")}
            >
              すべて
            </button>
            {visibleCategories.map((c) => (
              <button
                key={c.id}
                className={category === c.id ? "active" : ""}
                onClick={() =>
                  setTab(view === "recurring" ? "recurring" : "board", c.id)
                }
              >
                {c.name}
              </button>
            ))}
            <span className="spacer" />
            <button
              aria-label="検索"
              data-tip="検索 Ctrl+F"
              onClick={() => setSearch(!search)}
            >
              ⌕
            </button>
            <label className="check">
              <input
                type="checkbox"
                checked={dated}
                onChange={(e) => setDated(e.target.checked)}
              />
              期限あり
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={important}
                onChange={(e) => setImportant(e.target.checked)}
              />
              重要
            </label>
            <select
              aria-label="並び順"
              value={sort}
              onChange={(e) => setSort(e.target.value)}
            >
              <option value="manual">手動順</option>
              <option value="deadline">期限順</option>
              <option value="important">重要順</option>
              <option value="created">追加順</option>
            </select>
          </div>
          {search && (
            <input
              id="search"
              aria-label="検索"
              className="search"
              placeholder="タスク・メモ・カテゴリを検索"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          )}
          {view === "board" && (
            <div className="quick">
              <textarea
                ref={quickRef}
                aria-label="新しい付箋"
                placeholder={
                  category > 0
                    ? "このカテゴリに追加…"
                    : "タスクを入力してEnterで追加"
                }
                data-tip="Enterで追加、Shift+Enterで改行"
                value={quick}
                disabled={adding}
                onChange={(e) => setQuick(e.target.value)}
                onKeyDown={(e) => {
                  if (
                    e.key === "Enter" &&
                    !e.altKey &&
                    !e.shiftKey &&
                    !e.nativeEvent.isComposing &&
                    e.keyCode !== 229
                  ) {
                    e.preventDefault();
                    void add();
                  }
                }}
              />
            </div>
          )}
          {(view === "history" || view === "trash") && (
            <div className="section-head">
              <h2>{view === "history" ? "完了済み" : "ごみ箱"}</h2>
              <button onClick={() => setTab("board")}>一覧に戻る</button>
            </div>
          )}
          <DndContext
            sensors={sensors}
            collisionDetection={(args) => {
              const hits = pointerWithin(args);
              return hits.length
                ? hits.filter((h) => typeof h.id === "number").length
                  ? hits.filter((h) => typeof h.id === "number")
                  : hits
                : closestCenter(args);
            }}
            onDragEnd={(e) => void dropped(e)}
          >
            {groups.map((c) => {
              const items = tasks.filter((t) => t.category_id === c.id);
              return (
                <Group c={c} hideTitle={category >= 0} key={c.id}>
                  <SortableContext
                    items={items.map((t) => t.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    {items.map((t) => (
                      <Row
                        key={t.id}
                        t={t}
                        u={urgency(t, data.settings)}
                        drag={drag}
                        open={() => void open(t)}
                        complete={() => void state(t, "done")}
                      />
                    ))}
                  </SortableContext>
                  {!items.length && <div className="empty-category" />}
                </Group>
              );
            })}
          </DndContext>
          {!groups.length && <p className="empty-small">タスクはありません</p>}
        </main>
        {selected && (
          <TaskDetail
            key={selected.id}
            task={selected}
            categories={data.categories}
            onClose={() => setSelected(null)}
            onSaved={() => void reload()}
            onError={report}
            handle={handle}
          />
        )}
        {panel === "categories" && (
          <CategoryManager
            data={data}
            onClose={() => setPanel("")}
            onSaved={() => reload()}
            onError={report}
          />
        )}
        {panel === "series" && (
          <aside className="detail series-manager">
            <header>
              <h2>定期設定</h2>
              <button
                aria-label="定期設定を閉じる"
                onClick={() => setPanel("")}
              >
                ×
              </button>
            </header>
            <div className="detail-body">
              <button
                className="primary"
                onClick={() => setSeries(emptySeries())}
              >
                定期タスクを追加
              </button>
              {data.series
                .filter((s) => !s.deleted)
                .map((s) => (
                  <section className="series-row" key={s.id}>
                    <button
                      className="series-title"
                      onClick={() => setSeries(s)}
                    >
                      {s.title}
                    </button>
                    <small>次回期限 {s.next_due}</small>
                    <small>
                      未完了{" "}
                      {pending.filter((t) => t.series_id === s.id).length}件
                    </small>
                    <div className="series-auto-add">
                      <span>タスクの自動追加</span>
                      <button
                        className="series-switch"
                        role="switch"
                        aria-label={`${s.title}の自動追加`}
                        aria-checked={s.active}
                        disabled={togglingSeries !== null}
                        data-tip="OFFで今後の追加を一時停止します。追加済みのタスクは残ります。再開時に停止中の過去分は追加しません。"
                        onClick={async () => {
                          setTogglingSeries(s.id);
                          try {
                            await api("SaveSeries", {
                              ...s,
                              active: !s.active,
                            });
                            await reload();
                          } catch (e) {
                            report(e);
                          } finally {
                            setTogglingSeries(null);
                          }
                        }}
                      >
                        <span aria-hidden="true" />
                      </button>
                      <small>{s.active ? "ON" : "OFF"}</small>
                    </div>
                    <div className="actions">
                      <button onClick={() => setSeries(s)}>編集</button>
                      <button
                        className="danger"
                        onClick={() => {
                          if (
                            confirm(
                              "定期設定を削除しますか？作成済みのタスクは残ります。",
                            )
                          )
                            void api("StopSeries", s.id)
                              .then(reload)
                              .catch(report);
                        }}
                      >
                        削除
                      </button>
                    </div>
                  </section>
                ))}
            </div>
          </aside>
        )}
        {panel === "notices" && (
          <aside className="detail">
            <header>
              <h2>未確認の通知</h2>
              <button onClick={() => setPanel("")}>×</button>
            </header>
            <div className="detail-body">
              {data.notifications
                .filter((n) => !n.acknowledged)
                .map((n) => (
                  <section className="series-row" key={n.id}>
                    <button
                      className="series-title"
                      onClick={() =>
                        void api("OpenTask", n.task_id).catch(report)
                      }
                    >
                      {n.title}
                    </button>
                    <div className="actions">
                      {n.task_id > 0 && (
                        <>
                          <button
                            onClick={() =>
                              void api("Snooze", n.id, 10)
                                .then(reload)
                                .catch(report)
                            }
                          >
                            10分後
                          </button>
                          <button
                            onClick={() =>
                              void api("SetState", n.task_id, "done")
                                .then(reload)
                                .catch(report)
                            }
                          >
                            完了
                          </button>
                        </>
                      )}
                      <button
                        onClick={() =>
                          void api("Acknowledge", n.id)
                            .then(reload)
                            .catch(report)
                        }
                      >
                        閉じる
                      </button>
                    </div>
                  </section>
                ))}
            </div>
          </aside>
        )}
      </div>
      {series && (
        <SeriesForm
          initial={series}
          categories={data.categories}
          defaultShowDays={data.settings.series_show_days ?? 7}
          onClose={() => setSeries(null)}
          onSaved={() => void reload()}
          onError={report}
        />
      )}
      {settings && (
        <SettingsForm
          initial={data.settings}
          onClose={() => setSettings(false)}
          onSaved={() => void reload()}
          onError={report}
        />
      )}
    </div>
  );
}
export function Notifications() {
  const [data, setData] = useState<Snapshot | null>(null),
    [error, setError] = useState("");
  const id = Number(new URLSearchParams(location.search).get("notice") || 0);
  const reload = () =>
    void api<Snapshot>("GetSnapshot")
      .then(setData)
      .catch((e) => setError(String(e)));
  useEffect(() => {
    reload();
    void api("Ready", id ? "notifications:" + id : "notifications").catch((e) =>
      setError(String(e)),
    );
    const off = on("board:changed", reload);
    const timer = setInterval(reload, 15000);
    return () => {
      off();
      clearInterval(timer);
    };
  }, []);
  const call = (method: string, ...args: unknown[]) =>
    void api(method, ...args)
      .then(reload)
      .catch((e) => setError(String(e)));
  if (!data) return <p>読み込み中…</p>;
  const pending = data.notifications.filter((n) => !n.acknowledged),
    n = id ? pending.find((n) => n.id === id) : pending[0];
  if (!n) return <div className="notice-window" />;
  const task = data.tasks.find((t) => t.id === n.task_id),
    summary = n.kind === "summary",
    urgent = data.tasks
      .filter((t) => urgency(t, data.settings))
      .sort((a, b) => a.deadline.localeCompare(b.deadline));
  const open = () => call("OpenTask", n.task_id);
  return (
    <main
      className={
        "notice-window " + (summary ? "summary-notice" : "task-notice")
      }
    >
      <header>
        <strong>{summary ? "期限の確認" : "MemoTodo"}</strong>
        {pending.length > 1 && (
          <button
            data-tip="未確認の通知をすべて表示"
            onClick={() => call("OpenNotifications")}
          >
            未確認 {pending.length}件
          </button>
        )}
        <button
          aria-label="通知を閉じる"
          data-tip="通知を閉じる。タスクは未完了のまま残ります。"
          onClick={() => call("Acknowledge", n.id)}
        >
          ×
        </button>
      </header>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {summary ? (
        <>
          <div className="summary-list">
            {!data.settings.private ? (
              urgent.map((t) => (
                <div className="summary-item" key={t.id}>
                  <button onClick={() => call("OpenTask", t.id)}>
                    {t.title}
                    <small>
                      {t.deadline} · {urgencyLabel[urgency(t, data.settings)]}
                    </small>
                  </button>
                  <button onClick={() => call("SetState", t.id, "done")}>
                    完了
                  </button>
                </div>
              ))
            ) : (
              <p>期限が近いタスク {urgent.length}件</p>
            )}
          </div>
          <footer>
            <button
              className="primary"
              onClick={() => call("OpenFromNotice", n.id, 0)}
            >
              ボードを開く
            </button>
            <button onClick={() => call("Acknowledge", n.id)}>閉じる</button>
          </footer>
        </>
      ) : (
        <>
          <button className="notice-content" onClick={open}>
            <h2>
              {data.settings.private
                ? "タスクの通知"
                : (task?.title ?? n.title)}
            </h2>
            {!data.settings.private && task?.deadline && (
              <small>期限 {task.deadline}</small>
            )}
          </button>
          <footer>
            {n.task_id > 0 && (
              <>
                <button onClick={open}>タスクを開く</button>
                <button
                  data-tip="10分後に再通知"
                  onClick={() => call("Snooze", n.id, 10)}
                >
                  10分後
                </button>
                <button
                  className="primary"
                  onClick={() => call("SetState", n.task_id, "done")}
                >
                  完了
                </button>
              </>
            )}
            <button
              data-tip="タスクは完了せず、通知だけを閉じる"
              onClick={() => call("Acknowledge", n.id)}
            >
              閉じる
            </button>
          </footer>
        </>
      )}
    </main>
  );
}
