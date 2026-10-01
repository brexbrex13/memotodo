import { useState } from "react";
import { api } from "./api";
import { Category, Series } from "./types";
import { Editor } from "./Editor";
export function SeriesForm({
  initial,
  categories,
  onClose,
  onSaved,
  onError,
}: {
  initial: Series;
  categories: Category[];
  onClose: () => void;
  onSaved: () => void;
  onError: (e: unknown) => void;
}) {
  const [v, setV] = useState(initial),
    [busy, setBusy] = useState(false),
    [uploading, setUploading] = useState(false);
  const patch = (p: Partial<Series>) => setV((x) => ({ ...x, ...p }));
  const save = async () => {
    setBusy(true);
    try {
      await api("SaveSeries", v);
      onSaved();
      onClose();
    } catch (e) {
      onError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="overlay">
      <section className="modal large">
        <header>
          <h2>{v.id ? "定期設定の編集" : "定期タスクを追加"}</h2>
          <button
            disabled={busy || uploading}
            onClick={() => {
              if (
                JSON.stringify(v) !== JSON.stringify(initial) &&
                !confirm("保存していない定期設定を破棄しますか？")
              )
                return;
              onClose();
            }}
          >
            ×
          </button>
        </header>
        <div className="modal-body">
          <label>
            付箋の内容
            <textarea
              value={v.title}
              onChange={(e) => patch({ title: e.target.value })}
            />
          </label>
          <div className="formgrid">
            <label>
              貼る場所
              <select
                value={v.category_id}
                onChange={(e) => patch({ category_id: +e.target.value })}
              >
                <option value={0}>未分類</option>
                {categories.map((c) => (
                  <option value={c.id} key={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={v.important}
                onChange={(e) => patch({ important: e.target.checked })}
              />
              重要
            </label>
            <label>
              周期
              <select
                value={v.period}
                onChange={(e) => patch({ period: e.target.value })}
              >
                <option value="daily">日ごと</option>
                <option value="weekly">週ごと</option>
                <option value="monthly">月ごと</option>
                <option value="yearly">年ごと</option>
              </select>
            </label>
            <label>
              間隔
              <input
                type="number"
                min={1}
                max={100}
                value={v.interval}
                onChange={(e) => patch({ interval: +e.target.value })}
              />
            </label>
            {v.period === "weekly" && (
              <fieldset className="wide">
                <legend>期限の曜日</legend>
                {["日", "月", "火", "水", "木", "金", "土"].map((n, i) => (
                  <label className="check" key={i}>
                    <input
                      type="checkbox"
                      checked={v.weekdays.includes(i)}
                      onChange={(e) =>
                        patch({
                          weekdays: e.target.checked
                            ? [...v.weekdays, i]
                            : v.weekdays.filter((d) => d !== i),
                        })
                      }
                    />
                    {n}
                  </label>
                ))}
              </fieldset>
            )}
            {(v.period === "monthly" || v.period === "yearly") && (
              <label>
                毎回の期限日（0＝月末）
                <input
                  type="number"
                  min={0}
                  max={31}
                  value={v.month_day}
                  onChange={(e) => patch({ month_day: +e.target.value })}
                />
              </label>
            )}
            {v.period === "yearly" && (
              <label>
                月
                <input
                  type="number"
                  min={1}
                  max={12}
                  value={v.month}
                  onChange={(e) => patch({ month: +e.target.value })}
                />
              </label>
            )}
            <label>
              初回期限日
              <input
                type="date"
                value={v.first_due}
                onChange={(e) => patch({ first_due: e.target.value })}
              />
            </label>
            <label>
              期限時刻（省略で当日末）
              <input
                type="time"
                value={v.due_time}
                onChange={(e) => patch({ due_time: e.target.value })}
              />
            </label>
            <label>
              何日前に付箋を作るか
              <input
                type="number"
                min={0}
                max={366}
                value={v.show_days}
                onChange={(e) => patch({ show_days: +e.target.value })}
              />
            </label>
            <label>
              何日前から期限帯で強調するか
              <input
                type="number"
                min={0}
                max={366}
                value={v.near_days}
                onChange={(e) => patch({ near_days: +e.target.value })}
              />
            </label>
            <label>
              通知方法
              <select
                value={v.notify_mode}
                onChange={(e) => patch({ notify_mode: e.target.value })}
              >
                <option value="days">期限日の何日前・指定時刻</option>
                <option value="hours">期限から何時間前</option>
                <option value="off">通知なし</option>
              </select>
            </label>
            {v.notify_mode === "days" && (
              <>
                <label>
                  何日前
                  <input
                    type="number"
                    min={0}
                    max={366}
                    value={v.notify_days}
                    onChange={(e) => patch({ notify_days: +e.target.value })}
                  />
                </label>
                <label>
                  通知時刻
                  <input
                    type="time"
                    value={v.notify_time}
                    onChange={(e) => patch({ notify_time: e.target.value })}
                  />
                </label>
              </>
            )}
            {v.notify_mode === "hours" && (
              <label>
                何時間前
                <input
                  type="number"
                  min={0}
                  max={8784}
                  value={v.notify_hours}
                  onChange={(e) => patch({ notify_hours: +e.target.value })}
                />
              </label>
            )}
            <label>
              終了日（任意）
              <input
                type="date"
                value={v.end_date}
                onChange={(e) => patch({ end_date: e.target.value })}
              />
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={v.active}
                onChange={(e) => patch({ active: e.target.checked })}
              />
              新しい付箋を作る
            </label>
          </div>
          <p className="muted">
            期限は「その日までに実施」。通知日数は暦日です。通知より前に付箋が作られるよう、作成日数を設定してください。未完了分は残り、次の周期も追加されます。
          </p>
          {v.id > 0 && (
            <p className="muted">
              編集は今後作られる付箋に適用します。既存の付箋は変更しません。一時停止中の周期は再開時に追加しません。
            </p>
          )}
          <h3>毎回の業務メモ</h3>
          <Editor
            value={v.memo}
            onChange={(memo) => patch({ memo })}
            onError={onError}
            onBusy={setUploading}
          />
        </div>
        <footer>
          <button
            disabled={busy || uploading}
            className="primary"
            onClick={() => void save()}
          >
            {busy ? "保存中…" : "定期設定を保存"}
          </button>
        </footer>
      </section>
    </div>
  );
}
