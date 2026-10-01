import { useEffect, useRef, useState } from "react";
import { api } from "./api";
import { editable, mergeDraft } from "./drafts";
import { Category, Snapshot, Task } from "./types";
import { Editor } from "./Editor";
import { Icon } from "./Icons";
export type DraftHandle = { flush: () => Promise<void> };
export function TaskDetail({
  task,
  categories,
  onClose,
  onSaved,
  onError,
  handle,
}: {
  task: Task;
  categories: Category[];
  onClose: () => void;
  onSaved: () => void;
  onError: (e: unknown) => void;
  handle: React.MutableRefObject<DraftHandle | null>;
}) {
  const [draft, setDraft] = useState(task),
    [status, setStatus] = useState("保存済み"),
    [busy, setBusy] = useState(false);
  const current = useRef(task),
    saved = useRef(task),
    chain = useRef(Promise.resolve()),
    uploading = useRef(false);
  const change = (patch: Partial<Task>) => {
    const v = { ...current.current, ...patch };
    current.current = v;
    setDraft(v);
    setStatus("未保存");
    localStorage.setItem(
      "draft:" + task.id,
      JSON.stringify({ draft: v, base: saved.current }),
    );
  };
  const flush = () => {
    chain.current = chain.current
      .catch(() => {})
      .then(async () => {
        if (uploading.current)
          throw new Error("画像を保存中です。完了後に操作してください");
        const v = current.current;
        if (
          JSON.stringify({ ...v, version: 0 }) ===
          JSON.stringify({ ...saved.current, version: 0 })
        )
          return;
        setStatus("保存中…");
        try {
          const base = saved.current;
          let result: Task;
          try {
            result = await api<Task>("SaveTask", {
              ...v,
              version: base.version,
            });
          } catch (e) {
            if (!String(e).includes("別の画面")) throw e;
            const snapshot = await api<Snapshot>("GetSnapshot");
            const latest = snapshot.tasks.find((t) => t.id === task.id);
            if (!latest) throw e;
            result = await api<Task>("SaveTask", mergeDraft(base, v, latest));
          }
          const during = current.current;
          current.current = { ...result };
          for (const key of editable) {
            if (during[key] !== v[key])
              Object.assign(current.current, { [key]: during[key] });
          }
          saved.current = result;
          setDraft(current.current);
          if (
            JSON.stringify({ ...current.current, version: 0 }) ===
            JSON.stringify({ ...result, version: 0 })
          ) {
            localStorage.removeItem("draft:" + task.id);
            setStatus("保存済み");
          } else setStatus("未保存");
          onSaved();
        } catch (e) {
          setStatus("保存失敗 — 入力はこの画面に残っています");
          throw e;
        }
      });
    return chain.current;
  };
  handle.current = { flush };
  useEffect(() => {
    const raw = localStorage.getItem("draft:" + task.id);
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as { draft?: Task; base?: Task } & Task;
        const v = parsed.draft ?? parsed;
        if (v.id === task.id) {
          current.current = mergeDraft(parsed.base ?? task, v, task);
          setDraft(current.current);
          setStatus("未保存の入力を復元しました");
        }
      } catch (e) {
        onError(e);
        setStatus("保存失敗 — 未保存の入力を別の場所へコピーしてください");
      }
    }
    return () => {
      handle.current = null;
    };
  }, []);
  useEffect(() => {
    if (status === "未保存" || status === "未保存の入力を復元しました") {
      const timer = setTimeout(() => void flush().catch(onError), 650);
      return () => clearTimeout(timer);
    }
  }, [draft, status]);
  const leave = async () => {
    try {
      await flush();
      onClose();
    } catch (e) {
      onError(e);
    }
  };
  const state = async (value: string) => {
    setBusy(true);
    try {
      await flush();
      await api("SetState", task.id, value);
      onSaved();
      onClose();
    } catch (e) {
      onError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <aside className="detail task-detail" aria-label="タスクの詳細">
      <header>
        <h2>{task.series_id ? "定期タスク" : "タスクの詳細"}</h2>
        <div className="detail-tools">
          <button
            aria-label="重要"
            aria-pressed={draft.important}
            data-tip="重要を切り替える"
            disabled={busy}
            onClick={() => change({ important: !draft.important })}
          >
            <Icon name="star" filled={draft.important} />
          </button>
          <button
            aria-label={draft.deleted_at ? "ごみ箱から戻す" : "ごみ箱へ"}
            data-tip={draft.deleted_at ? "ごみ箱から戻す" : "ごみ箱へ"}
            className="danger"
            disabled={busy}
            onClick={() => void state(draft.deleted_at ? "restore" : "trash")}
          >
            <Icon name={draft.deleted_at ? "undo" : "trash"} />
          </button>
          {!draft.deleted_at && (
            <button
              aria-label={draft.status === "pending" ? "完了" : "再開する"}
              data-tip={draft.status === "pending" ? "完了" : "再開する"}
              className="complete-task"
              disabled={busy}
              onClick={() =>
                void state(draft.status === "pending" ? "done" : "pending")
              }
            >
              <Icon name={draft.status === "pending" ? "check" : "undo"} />
            </button>
          )}
          <button
            aria-label="詳細を閉じる"
            data-tip="保存して閉じる"
            onClick={() => void leave()}
          >
            <Icon name="close" />
          </button>
        </div>
      </header>
      <div className="detail-body">
        <fieldset className="form-section">
          <legend>内容</legend>
          <textarea
            aria-label="タスク名"
            className="detail-title"
            value={draft.title}
            onChange={(e) => change({ title: e.target.value })}
          />
          <Editor
            value={draft.memo}
            onChange={(memo) => change({ memo })}
            onError={onError}
            onBusy={(v) => {
              uploading.current = v;
              setBusy(v);
            }}
          />
        </fieldset>
        <fieldset className="form-section">
          <legend>期限・通知</legend>
          <div className="formgrid">
            <label>
              期限日
              <input
                type="date"
                value={draft.deadline.slice(0, 10)}
                onChange={(e) =>
                  change({
                    deadline: e.target.value,
                  })
                }
              />
            </label>
            <label data-tip="期限とは独立した通知時刻です。期限到達だけでは通知しません。">
              通知時刻
              <input
                type="datetime-local"
                value={draft.reminder_at.slice(0, 16)}
                onChange={(e) => change({ reminder_at: e.target.value })}
              />
            </label>
          </div>
        </fieldset>
        <fieldset className="form-section category-section">
          <legend>カテゴリ</legend>
          <select
            aria-label="カテゴリ"
            value={draft.category_id}
            onChange={(e) => change({ category_id: +e.target.value })}
          >
            <option value={0}>未分類</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </fieldset>
        {task.series_id > 0 &&
          draft.status === "pending" &&
          !draft.deleted_at && (
            <button
              className="skip-occurrence"
              disabled={busy}
              onClick={() => void state("skipped")}
            >
              今回は見送る
            </button>
          )}
      </div>
      <footer>
        <span
          role="status"
          className={status.startsWith("保存失敗") ? "danger" : "muted"}
        >
          {status}
        </span>
        <button
          className="primary"
          disabled={busy}
          onClick={() => void leave()}
        >
          今すぐ保存
        </button>
      </footer>
    </aside>
  );
}
