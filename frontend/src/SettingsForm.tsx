import { useEffect, useState } from "react";
import { api } from "./api";
import { ShortcutField } from "./ShortcutField";
import { Settings } from "./types";
export function SettingsForm({
  initial,
  onClose,
  onSaved,
  onError,
}: {
  initial: Settings;
  onClose: () => void;
  onSaved: () => void;
  onError: (e: unknown) => void;
}) {
  const [v, setV] = useState(initial),
    [times, setTimes] = useState(initial.notify_times.join(", ")),
    [busy, setBusy] = useState(false),
    [backup, setBackup] = useState(""),
    [saveError, setSaveError] = useState("");
  useEffect(() => {
    void api<string>("GetShortcutStatus")
      .then((e) => setSaveError(e || ""))
      .catch(onError);
  }, []);
  const patch = (p: Partial<Settings>) => setV((x) => ({ ...x, ...p }));
  return (
    <div className="overlay">
      <section className="modal">
        <header>
          <h2>設定</h2>
          <button disabled={busy} onClick={onClose}>
            ×
          </button>
        </header>
        <div className="modal-body">
          <div className="formgrid">
            <ShortcutField
              value={v.quick_shortcut ?? "Ctrl+Alt+N"}
              onChange={(quick_shortcut) => patch({ quick_shortcut })}
            />
            <label>
              候補を表示する最低登録回数
              <input
                type="number"
                min={0}
                max={100}
                value={v.suggest_min_count ?? 3}
                data-tip="手動で登録したタスク名が候補になります。0で候補表示を無効にします。"
                onChange={(e) => patch({ suggest_min_count: +e.target.value })}
              />
            </label>
            <label>
              新規定期タスクの追加日数（初期値）
              <input
                type="number"
                min={0}
                max={366}
                value={v.series_show_days ?? 7}
                onChange={(e) => patch({ series_show_days: +e.target.value })}
              />
            </label>
            <label>
              期限が近いとする日数
              <input
                type="number"
                min={0}
                max={366}
                value={v.near_days}
                onChange={(e) => patch({ near_days: +e.target.value })}
              />
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={v.workdays}
                onChange={(e) => patch({ workdays: e.target.checked })}
              />
              土日を除いて日数を数える
            </label>
            <label className="wide">
              まとめ通知の時刻（カンマ区切り・空欄でなし）
              <input
                value={times}
                placeholder="13:00, 17:00"
                onChange={(e) => setTimes(e.target.value)}
              />
            </label>
            <fieldset className="wide">
              <legend>まとめ通知の曜日</legend>
              {["日", "月", "火", "水", "木", "金", "土"].map((n, i) => (
                <label key={i} className="check">
                  <input
                    type="checkbox"
                    checked={v.notify_weekdays.includes(i)}
                    onChange={(e) =>
                      patch({
                        notify_weekdays: e.target.checked
                          ? [...v.notify_weekdays, i]
                          : v.notify_weekdays.filter((d) => d !== i),
                      })
                    }
                  />
                  {n}
                </label>
              ))}
            </fieldset>
            <label className="check">
              <input
                type="checkbox"
                checked={v.sound}
                onChange={(e) => patch({ sound: e.target.checked })}
              />
              通知音
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={v.native_toast}
                onChange={(e) => patch({ native_toast: e.target.checked })}
              />
              Windows標準通知を併用
            </label>
            <label className="check wide">
              <input
                type="checkbox"
                checked={v.private}
                onChange={(e) => patch({ private: e.target.checked })}
              />
              通知内容を隠し、件数だけ表示
            </label>
            <div className="wide pause-presets">
              {[10, 30, 60, 360, 1440].map((minutes) => (
                <button
                  type="button"
                  key={minutes}
                  onClick={() => {
                    const until = new Date(Date.now() + minutes * 60000);
                    const local = new Date(
                      until.getTime() - until.getTimezoneOffset() * 60000,
                    )
                      .toISOString()
                      .slice(0, 16);
                    patch({ pause_until: local });
                  }}
                >
                  {minutes < 60
                    ? minutes + "分"
                    : minutes < 1440
                      ? minutes / 60 + "時間"
                      : "1日"}
                </button>
              ))}
              <button type="button" onClick={() => patch({ pause_until: "" })}>
                解除
              </button>
            </div>
            <label>
              通知を一時停止（再開日時）
              <input
                type="datetime-local"
                value={v.pause_until.slice(0, 16)}
                onChange={(e) => patch({ pause_until: e.target.value })}
              />
            </label>
            <label>
              通知を表示する画面
              <select
                value={v.monitor}
                onChange={(e) => patch({ monitor: e.target.value })}
              >
                <option value="active">現在作業中の画面</option>
                <option value="primary">メインディスプレイ</option>
              </select>
            </label>
            <label>
              文字サイズ
              <input
                type="number"
                min={12}
                max={22}
                value={v.font_size}
                onChange={(e) => patch({ font_size: +e.target.value })}
              />
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={v.compact}
                onChange={(e) => patch({ compact: e.target.checked })}
              />
              一覧をコンパクトに表示
            </label>
          </div>
          <button
            data-tip="保存済みの設定で通知をテストします"
            onClick={() => void api("TestNotification").catch(onError)}
          >
            通知をテスト
          </button>
          <h3>データとバックアップ</h3>
          <div className="actions">
            <button
              onClick={() =>
                void api<string>("Backup").then(setBackup).catch(onError)
              }
            >
              画像を含めてバックアップ
            </button>
            <button onClick={() => void api("OpenDataFolder").catch(onError)}>
              保存フォルダを開く
            </button>
          </div>
          {backup && <p className="path">保存しました：{backup}</p>}
          <button
            disabled={busy}
            onClick={async () => {
              if (
                !confirm(
                  "現在のタスク・設定をバックアップの内容に戻します。現在のデータは先にバックアップします。復元しますか？",
                )
              )
                return;
              setBusy(true);
              setSaveError("");
              try {
                const restored = await api<boolean>("RestoreBackupFile");
                if (restored) {
                  localStorage.clear();
                  onSaved();
                  onClose();
                }
              } catch (e) {
                setSaveError(String(e));
                onError(e);
              } finally {
                setBusy(false);
              }
            }}
          >
            バックアップZIPから復元
          </button>
        </div>
        <footer>
          {saveError && (
            <p role="alert" className="danger">
              {saveError}
            </p>
          )}
          <button
            disabled={busy}
            className="primary"
            onClick={async () => {
              setBusy(true);
              setSaveError("");
              try {
                await api("SaveSettings", {
                  ...v,
                  notify_times: times
                    .split(",")
                    .map((x) => x.trim())
                    .filter(Boolean),
                });
                onSaved();
                onClose();
              } catch (e) {
                setSaveError(String(e));
                onError(e);
              } finally {
                setBusy(false);
              }
            }}
          >
            今すぐ保存
          </button>
        </footer>
      </section>
    </div>
  );
}
