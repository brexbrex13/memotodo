import { useEffect, useRef, useState } from "react";
import { api } from "./api";
import { editable, mergeDraft } from "./drafts";
import { Category, Snapshot, Task } from "./types";
import { Editor } from "./Editor";
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
    <aside className="detail" aria-label="付箋の詳細">
      <header>
        <h2>{task.series_id ? "定期タスクの付箋" : "付箋の詳細"}</h2>
        <button onClick={() => void leave()} aria-label="詳細を閉じる">
          ×
        </button>
      </header>
      <div className="detail-body">
        <textarea
          aria-label="付箋の内容"
          className="detail-title"
          value={draft.title}
          onChange={(e) => change({ title: e.target.value })}
        />
        <div className="formgrid">
          <label>
            貼る場所
            <select
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
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={draft.important}
              onChange={(e) => change({ important: e.target.checked })}
            />
            重要
          </label>
          <label>
            期限日
            <input
              type="date"
              value={draft.deadline.slice(0, 10)}
              onChange={(e) =>
                change({
                  deadline: e.target.value
                    ? e.target.value +
                      (draft.deadline.includes("T")
                        ? "T" + draft.deadline.slice(11)
                        : "")
                    : "",
                })
              }
            />
          </label>
          <label>
            期限時刻（省略で当日末）
            <input
              type="time"
              disabled={!draft.deadline}
              value={
                draft.deadline.includes("T") ? draft.deadline.slice(11, 16) : ""
              }
              onChange={(e) =>
                change({
                  deadline:
                    draft.deadline.slice(0, 10) +
                    (e.target.value ? "T" + e.target.value : ""),
                })
              }
            />
          </label>
          <label className="wide">
            通知時刻（期限とは独立）
            <input
              type="datetime-local"
              value={draft.reminder_at.slice(0, 16)}
              onChange={(e) => change({ reminder_at: e.target.value })}
            />
          </label>
        </div>
        {draft.notified_at && (
          <p className="muted">
            設定した時刻の通知は発行済みです。再通知する場合は新しい時刻を設定してください。
          </p>
        )}
        {task.series_id > 0 && (
          <p className="muted">
            {task.occurrence}
            分。この付箋の編集は、定期設定や別の周期には影響しません。
          </p>
        )}
        <h3>業務メモ</h3>
        <Editor
          value={draft.memo}
          onChange={(memo) => change({ memo })}
          onError={onError}
          onBusy={(v) => {
            uploading.current = v;
            setBusy(v);
          }}
        />
        <p
          role="status"
          className={status.startsWith("保存失敗") ? "danger" : "muted"}
        >
          {status}
        </p>
        <button onClick={() => void flush().catch(onError)}>今すぐ保存</button>
        <div className="detail-actions">
          {draft.deleted_at ? (
            <button disabled={busy} onClick={() => void state("restore")}>
              ごみ箱から戻す
            </button>
          ) : draft.status === "pending" ? (
            <>
              <button
                className="primary"
                disabled={busy}
                onClick={() => void state("done")}
              >
                完了して外す
              </button>
              {task.series_id > 0 && (
                <button disabled={busy} onClick={() => void state("skipped")}>
                  今回は見送る
                </button>
              )}
              <button
                className="danger"
                disabled={busy}
                onClick={() => void state("trash")}
              >
                ごみ箱へ
              </button>
            </>
          ) : (
            <>
              <button disabled={busy} onClick={() => void state("pending")}>
                再開する
              </button>
              <small>再開時に古い通知時刻は解除されます</small>
            </>
          )}
        </div>
      </div>
    </aside>
  );
}
