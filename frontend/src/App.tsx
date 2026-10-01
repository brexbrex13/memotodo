import { useCallback, useEffect, useRef, useState } from "react";
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  closestCenter,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  arrayMove,
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
  localISO,
  urgency,
  urgencyLabel,
  textOnly,
} from "./types";
import { TaskDetail, DraftHandle } from "./TaskDetail";
import { SeriesForm } from "./SeriesForm";
import { SettingsForm } from "./SettingsForm";
function Card({
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
      className={"sticky " + u + (t.important ? " important" : "")}
    >
      <div className="card-top">
        <button
          className="grip"
          title="ドラッグして並び替え（キーボード：Space→矢印）"
          disabled={!drag}
          {...s.attributes}
          {...s.listeners}
        >
          ⠿
        </button>
        {t.important && <span title="重要">★</span>}
        {t.series_id > 0 && <span title="定期タスク">↻</span>}
        {t.status === "pending" && !t.deleted_at && (
          <button
            className="finish"
            title="完了して外す"
            aria-label={t.title + "を完了"}
            onClick={complete}
          >
            ✓
          </button>
        )}
      </div>
      <button className="card-content" onClick={open}>
        <span className="card-title">{t.title}</span>
        {t.memo && (
          <span className="memo-preview">
            {textOnly(t.memo).slice(0, 140) || "画像・メモあり"}
          </span>
        )}
        <span className="card-meta">
          {u && <strong>{urgencyLabel[u]} · </strong>}
          {t.deadline && "期限 " + t.deadline.replace("T", " ").slice(0, 16)}
          {t.reminder_at && (
            <span>♧ 通知 {t.reminder_at.replace("T", " ").slice(0, 16)}</span>
          )}
          {t.deleted_at && <span>削除 {t.deleted_at.slice(0, 10)}</span>}
          {t.status !== "pending" && (
            <span>
              {t.status === "skipped" ? "見送り" : "完了"}{" "}
              {t.done_at.slice(0, 10)}
            </span>
          )}
        </span>
      </button>
    </article>
  );
}
export default function App() {
  const [data, setData] = useState<Snapshot | null>(null),
    [error, setError] = useState(""),
    [view, setView] = useState("board"),
    [query, setQuery] = useState(""),
    [filter, setFilter] = useState("all"),
    [sort, setSort] = useState("manual"),
    [category, setCategory] = useState(-1),
    [quick, setQuick] = useState(localStorage.getItem("quick-draft") ?? ""),
    [adding, setAdding] = useState(false),
    [selected, setSelected] = useState<Task | null>(null),
    [series, setSeries] = useState<Series | null>(null),
    [settings, setSettings] = useState(false),
    [categoryEdit, setCategoryEdit] = useState<Category | null>(null);
  const handle = useRef<DraftHandle | null>(null),
    quickRef = useRef<HTMLTextAreaElement>(null),
    errorRef = useRef("");
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  const report = useCallback((e: unknown) => {
    const msg = e instanceof Error ? e.message : String(e);
    errorRef.current = msg;
    setError(msg);
  }, []);
  const reload = useCallback(async () => {
    try {
      setData(await api<Snapshot>("GetSnapshot"));
    } catch (e) {
      report(e);
    }
  }, [report]);
  const flush = async () => {
    await handle.current?.flush();
  };
  const navigate = async (fn: () => void) => {
    try {
      await flush();
      setSelected(null);
      fn();
    } catch (e) {
      report(e);
    }
  };
  const open = async (t: Task) => {
    try {
      await flush();
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
      on("board:changed", () => void reload()),
      on("board:error", report),
      on("board:quick", () => quickRef.current?.focus()),
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
    return () => {
      off.forEach((f) => f());
      clearInterval(timer);
    };
  }, []);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === "n") {
        e.preventDefault();
        quickRef.current?.focus();
      }
      if (e.ctrlKey && e.key === "f") {
        e.preventDefault();
        document.getElementById("search")?.focus();
      }
      if (e.key === "Escape" && selected) void navigate(() => {});
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [selected]);
  useEffect(() => {
    localStorage.setItem("quick-draft", quick);
  }, [quick]);
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
  const changeState = async (t: Task, state: string) => {
    try {
      if (selected?.id === t.id) await flush();
      await api("SetState", t.id, state);
      if (selected?.id === t.id) setSelected(null);
      await reload();
    } catch (e) {
      report(e);
    }
  };
  if (!data)
    return (
      <main className="loading">
        <h1>MemoTodo</h1>
        <p>{error || "ボードを読み込み中…"}</p>
        <button onClick={() => void reload()}>再試行</button>
      </main>
    );
  const now = new Date(),
    pending = data.tasks.filter((t) => t.status === "pending" && !t.deleted_at),
    urgent = pending
      .filter((t) => urgency(t, data.settings, now))
      .sort((a, b) => a.deadline.localeCompare(b.deadline));
  const notices = data.notifications.filter((n) => !n.acknowledged);
  let tasks = data.tasks
    .filter((t) =>
      view === "trash"
        ? !!t.deleted_at
        : view === "history"
          ? !t.deleted_at && t.status !== "pending"
          : !t.deleted_at && t.status === "pending",
    )
    .filter((t) => category < 0 || t.category_id === category)
    .filter(
      (t) =>
        !query ||
        [
          t.title,
          textOnly(t.memo),
          data.categories.find((c) => c.id === t.category_id)?.name ?? "",
        ]
          .join("\n")
          .toLocaleLowerCase()
          .includes(query.toLocaleLowerCase()),
    )
    .filter((t) =>
      filter === "important"
        ? t.important
        : filter === "recurring"
          ? t.series_id > 0
          : filter === "overdue"
            ? urgency(t, data.settings, now) === "overdue"
            : filter === "near"
              ? !!urgency(t, data.settings, now)
              : true,
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
  const groups = [
    { id: 0, name: "未分類", color: "#fff1a8", sort_order: 0 },
    ...data.categories.slice().sort((a, b) => a.sort_order - b.sort_order),
  ].filter((c) => category < 0 || c.id === category);
  const drag =
    view === "board" && sort === "manual" && !query && filter === "all";
  const dropped = async (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const a = tasks.findIndex((t) => t.id === e.active.id),
      b = tasks.findIndex((t) => t.id === e.over?.id);
    if (a < 0 || b < 0 || tasks[a].category_id !== tasks[b].category_id) return;
    try {
      await flush();
      const ids = arrayMove(tasks, a, b).map((t) => t.id);
      await api("Reorder", ids);
      await reload();
    } catch (e) {
      report(e);
    }
  };
  return (
    <div
      className={"app " + (data.settings.compact ? "compact" : "")}
      style={{ fontSize: data.settings.font_size }}
    >
      <header className="app-header">
        <div className="brand">
          <span>▤</span>
          <h1>MemoTodo</h1>
          <small>思いついたら、貼っておく。</small>
        </div>
        <div className="actions">
          <button
            onClick={() =>
              void navigate(() => {
                setView("board");
                quickRef.current?.focus();
              })
            }
          >
            ＋ 付箋
          </button>
          <button onClick={() => void navigate(() => setSettings(true))}>
            設定
          </button>
          <button
            title="トレイに格納"
            onClick={() =>
              void flush()
                .then(() => api("FinishClose", "hide"))
                .catch(report)
            }
          >
            トレイへ
          </button>
        </div>
      </header>
      {error && (
        <div className="error" role="alert">
          {error}
          <button
            onClick={() => {
              errorRef.current = "";
              setError("");
            }}
          >
            閉じる
          </button>
        </div>
      )}
      {data.settings.pause_until &&
        new Date(data.settings.pause_until) > now && (
          <div className="pause">
            通知を保留中：
            {data.settings.pause_until.replace("T", " ").slice(0, 16)}まで{" "}
            <button
              onClick={() =>
                void api("SaveSettings", { ...data.settings, pause_until: "" })
                  .then(reload)
                  .catch(report)
              }
            >
              今すぐ再開
            </button>
          </div>
        )}
      <section className="deadline-band" aria-label="期限の確認">
        <div className="band-title">
          <strong>期限の確認</strong>
          <span className="danger">
            超過{" "}
            {
              urgent.filter((t) => urgency(t, data.settings) === "overdue")
                .length
            }
          </span>
          <span>
            今日{" "}
            {urgent.filter((t) => urgency(t, data.settings) === "today").length}
          </span>
          <span>
            近日{" "}
            {urgent.filter((t) => urgency(t, data.settings) === "near").length}
          </span>
        </div>
        <div className="band-items">
          {urgent.length ? (
            urgent.map((t) => (
              <button
                key={t.id}
                className={urgency(t, data.settings)}
                onClick={() => void open(t)}
              >
                <b>
                  {t.important ? "★ " : ""}
                  {t.title}
                </b>
                <small>
                  {urgencyLabel[urgency(t, data.settings)]} ·{" "}
                  {t.deadline.replace("T", " ").slice(0, 16)}
                  {t.series_id ? " · 定期" : ""}
                </small>
              </button>
            ))
          ) : (
            <span className="muted">
              期限が近い付箋はありません。期限のない付箋も、下のボードで確認できます。
            </span>
          )}
        </div>
      </section>
      <div className="workspace">
        <nav className="sidebar">
          <button
            className={view === "board" ? "active" : ""}
            onClick={() => void navigate(() => setView("board"))}
          >
            ▤ ボード <span>{pending.length}</span>
          </button>
          <button
            className={view === "series" ? "active" : ""}
            onClick={() => void navigate(() => setView("series"))}
          >
            ↻ 定期設定{" "}
            <span>{data.series.filter((s) => !s.deleted).length}</span>
          </button>
          <button
            className={view === "history" ? "active" : ""}
            onClick={() => void navigate(() => setView("history"))}
          >
            ✓ 完了・見送り
          </button>
          <button
            className={view === "trash" ? "active" : ""}
            onClick={() => void navigate(() => setView("trash"))}
          >
            ♲ ごみ箱
          </button>
          <h3>貼る場所</h3>
          <button
            className={category === -1 ? "active" : ""}
            onClick={() => setCategory(-1)}
          >
            すべて
          </button>
          {[
            { id: 0, name: "未分類", color: "#fff1a8", sort_order: 0 },
            ...data.categories,
          ].map((c) => (
            <button
              key={c.id}
              className={category === c.id ? "active" : ""}
              onClick={() => setCategory(c.id)}
            >
              <i style={{ background: c.color }} />
              {c.name}
              <span>
                {pending.filter((t) => t.category_id === c.id).length}
              </span>
            </button>
          ))}
          <button
            onClick={() =>
              void navigate(() =>
                setCategoryEdit({
                  id: 0,
                  name: "",
                  color: "#fff1a8",
                  sort_order: 0,
                }),
              )
            }
          >
            ＋ 場所を追加
          </button>
          <div className="sidebar-foot">
            未確認の通知 {notices.length}件
            <button onClick={() => void api("OpenTask", 0).catch(report)}>
              ボードを前面へ
            </button>
            <small>
              Ctrl+N 追加 · Ctrl+F 検索
              <br />
              ×でトレイ常駐
            </small>
          </div>
        </nav>
        <main className="board-main">
          {view === "series" ? (
            <>
              <div className="section-head">
                <h2>定期設定</h2>
                <button
                  className="primary"
                  onClick={() => setSeries(emptySeries())}
                >
                  ＋ 定期タスク
                </button>
              </div>
              <p className="muted">
                ロボットが周期ごとに付箋を追加します。既に作られた付箋は、停止・編集しても残ります。
              </p>
              {data.series
                .filter((s) => !s.deleted)
                .map((s) => (
                  <section className="series-row" key={s.id}>
                    <div>
                      <h3>{s.title}</h3>
                      <p>
                        {s.active ? "稼働中" : "一時停止"} · {s.interval}
                        {
                          (
                            {
                              daily: "日",
                              weekly: "週",
                              monthly: "月",
                              yearly: "年",
                            } as Record<string, string>
                          )[s.period]
                        }
                        ごと · 次回期限 {s.next_due || s.first_due}
                      </p>
                      <p>
                        未完了{" "}
                        {pending.filter((t) => t.series_id === s.id).length}
                        件（期限超過{" "}
                        {
                          pending.filter(
                            (t) =>
                              t.series_id === s.id &&
                              urgency(t, data.settings) === "overdue",
                          ).length
                        }
                        件）
                      </p>
                    </div>
                    <div className="actions">
                      <button onClick={() => setSeries(s)}>編集</button>
                      <button
                        onClick={() =>
                          void api("SaveSeries", { ...s, active: !s.active })
                            .then(reload)
                            .catch(report)
                        }
                      >
                        {s.active ? "一時停止" : "再開"}
                      </button>
                      <button
                        className="danger"
                        onClick={() => {
                          if (
                            confirm(
                              "この定期設定を終了しますか？既存の付箋は残ります。",
                            )
                          )
                            void api("StopSeries", s.id)
                              .then(reload)
                              .catch(report);
                        }}
                      >
                        終了
                      </button>
                    </div>
                  </section>
                ))}
              {!data.series.some((s) => !s.deleted) && (
                <div className="empty">
                  毎週の作業や月末の確認を登録できます。
                </div>
              )}
            </>
          ) : (
            <>
              <div className="section-head">
                <h2>
                  {view === "board"
                    ? "付箋ボード"
                    : view === "history"
                      ? "完了・見送り"
                      : "ごみ箱"}
                </h2>
                <small>{tasks.length}件</small>
              </div>
              {view === "board" && (
                <div className="quick">
                  <textarea
                    ref={quickRef}
                    aria-label="新しい付箋"
                    placeholder="要件をぱぱっと入力… Enterで貼る · Alt+Enterで改行"
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
                  <button
                    className="primary"
                    disabled={adding || !quick.trim()}
                    onClick={() => void add()}
                  >
                    貼る
                  </button>
                </div>
              )}
              <div className="filters">
                <input
                  id="search"
                  aria-label="検索"
                  placeholder="内容・メモ・場所を検索"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                <select
                  aria-label="絞り込み"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                >
                  <option value="all">すべて</option>
                  <option value="important">★ 重要</option>
                  <option value="overdue">期限超過</option>
                  <option value="near">期限の確認</option>
                  <option value="recurring">定期タスク</option>
                </select>
                <select
                  aria-label="並び順"
                  value={sort}
                  onChange={(e) => setSort(e.target.value)}
                >
                  <option value="manual">ボードの並び順</option>
                  <option value="deadline">期限順</option>
                  <option value="important">重要順</option>
                  <option value="created">作成が新しい順</option>
                </select>
              </div>
              {view === "history" && (
                <p className="muted">
                  完了した付箋は保管しています。詳細から再開できます。
                </p>
              )}
              {view === "trash" && (
                <p className="muted">
                  削除した付箋はここに保管しています。詳細から元に戻せます。
                </p>
              )}
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={(e) => void dropped(e)}
              >
                {groups.map((c) => {
                  const items = tasks.filter((t) => t.category_id === c.id),
                    collapsed = data.settings.collapsed.includes(c.id);
                  return (
                    <section
                      className="category"
                      key={c.id}
                      style={
                        { "--category-color": c.color } as React.CSSProperties
                      }
                    >
                      <div className="category-head">
                        <button
                          onClick={() =>
                            void api("SaveSettings", {
                              ...data.settings,
                              collapsed: collapsed
                                ? data.settings.collapsed.filter(
                                    (x) => x !== c.id,
                                  )
                                : [...data.settings.collapsed, c.id],
                            })
                              .then(reload)
                              .catch(report)
                          }
                        >
                          {collapsed ? "▸" : "▾"} {c.name}{" "}
                          <small>{items.length}</small>
                        </button>
                        {c.id > 0 && (
                          <button
                            title="場所の名前・色を編集"
                            onClick={() =>
                              void navigate(() => setCategoryEdit(c))
                            }
                          >
                            編集
                          </button>
                        )}
                      </div>
                      {!collapsed && (
                        <SortableContext
                          items={items.map((t) => t.id)}
                          strategy={rectSortingStrategy}
                        >
                          <div className="cards">
                            {items.map((t) => (
                              <Card
                                key={t.id}
                                t={t}
                                u={urgency(t, data.settings)}
                                drag={drag}
                                open={() => void open(t)}
                                complete={() => void changeState(t, "done")}
                              />
                            ))}
                          </div>
                          {!items.length && (
                            <p className="empty-small">
                              {query || filter !== "all"
                                ? "条件に合う付箋はありません"
                                : "ここに付箋を貼れます"}
                            </p>
                          )}
                        </SortableContext>
                      )}
                    </section>
                  );
                })}
              </DndContext>
            </>
          )}
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
      </div>
      {series && (
        <SeriesForm
          initial={series}
          categories={data.categories}
          onClose={() => setSeries(null)}
          onSaved={() => void reload()}
          onError={report}
        />
      )}{" "}
      {settings && (
        <SettingsForm
          initial={data.settings}
          onClose={() => setSettings(false)}
          onSaved={() => void reload()}
          onError={report}
        />
      )}{" "}
      {categoryEdit && (
        <div className="overlay">
          <section className="modal small">
            <header>
              <h2>貼る場所</h2>
              <button onClick={() => setCategoryEdit(null)}>×</button>
            </header>
            <div className="modal-body">
              <label>
                名前
                <input
                  value={categoryEdit.name}
                  onChange={(e) =>
                    setCategoryEdit({ ...categoryEdit, name: e.target.value })
                  }
                />
              </label>
              <label>
                付箋の色
                <input
                  type="color"
                  value={categoryEdit.color}
                  onChange={(e) =>
                    setCategoryEdit({ ...categoryEdit, color: e.target.value })
                  }
                />
              </label>
            </div>
            <footer>
              {categoryEdit.id > 0 && (
                <button
                  className="danger"
                  onClick={() => {
                    if (
                      confirm(
                        "この場所を削除しますか？付箋と定期設定は未分類に移します。",
                      )
                    )
                      void api("DeleteCategory", categoryEdit.id)
                        .then(() => {
                          setCategoryEdit(null);
                          void reload();
                        })
                        .catch(report);
                  }}
                >
                  場所を削除
                </button>
              )}
              <button
                className="primary"
                onClick={() =>
                  void api("SaveCategory", categoryEdit)
                    .then(() => {
                      setCategoryEdit(null);
                      void reload();
                    })
                    .catch(report)
                }
              >
                保存
              </button>
            </footer>
          </section>
        </div>
      )}
    </div>
  );
}
export function Notifications() {
  const [data, setData] = useState<Snapshot | null>(null),
    [error, setError] = useState("");
  const reload = () =>
    void api<Snapshot>("GetSnapshot")
      .then(setData)
      .catch((e) => setError(String(e)));
  useEffect(() => {
    reload();
    void api("Ready", "notifications").catch((e) => setError(String(e)));
    const off = on("board:changed", reload);
    const t = setInterval(reload, 15000);
    return () => {
      off();
      clearInterval(t);
    };
  }, []);
  const call = (method: string, ...args: unknown[]) =>
    void api(method, ...args)
      .then(reload)
      .catch((e) => setError(String(e)));
  if (!data) return <p>通知を読み込み中…</p>;
  const ns = data.notifications.filter((n) => !n.acknowledged);
  return (
    <main className="notifications">
      <header>
        <div>
          <strong>MemoTodo</strong>
          <h1>未確認の通知 {ns.length}件</h1>
        </div>
        <button onClick={() => call("OpenTask", 0)}>ボードを開く</button>
      </header>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="notice-list">
        {ns.map((n) => {
          const task = data.tasks.find((t) => t.id === n.task_id);
          return (
            <section key={n.id} className="notice">
              <span className="badge">
                {n.kind === "summary"
                  ? "期限のまとめ"
                  : n.kind === "test"
                    ? "テスト"
                    : "リマインダー"}
              </span>
              <h2>
                {data.settings.private
                  ? "内容はボードで確認してください"
                  : (task?.title ?? n.title)}
              </h2>
              {!data.settings.private && task?.deadline && (
                <p>期限 {task.deadline.replace("T", " ").slice(0, 16)}</p>
              )}
              <small>{n.fired_at.replace("T", " ").slice(0, 16)}</small>
              <div className="actions">
                {n.task_id > 0 && (
                  <>
                    <button onClick={() => call("OpenTask", n.task_id)}>
                      詳細
                    </button>
                    <button onClick={() => call("Snooze", n.id, 10)}>
                      10分後
                    </button>
                    <button onClick={() => call("Snooze", n.id, 60)}>
                      1時間後
                    </button>
                    <button onClick={() => call("SetState", n.task_id, "done")}>
                      完了
                    </button>
                  </>
                )}
                <button
                  className="primary"
                  onClick={() => call("Acknowledge", n.id)}
                >
                  確認
                </button>
              </div>
            </section>
          );
        })}
        {!ns.length && <p>未確認の通知はありません。</p>}
      </div>
      <footer>
        <button
          onClick={() =>
            call("SaveSettings", {
              ...data.settings,
              pause_until: localISO(new Date(Date.now() + 3600000)),
            })
          }
        >
          1時間保留
        </button>
        <button
          className="primary"
          disabled={!ns.length}
          onClick={() => call("Acknowledge", 0)}
        >
          すべて確認
        </button>
      </footer>
    </main>
  );
}
