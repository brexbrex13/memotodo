import { useState } from "react";
import { api } from "./api";
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
    [backup, setBackup] = useState("");
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
            <label>
              通常の付箋：期限帯で強調する日数
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
            <label>
              通知を保留する期限
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
              付箋をコンパクトに表示
            </label>
          </div>
          <p className="muted">
            独自通知ウィンドウは最前面に表示され、確認まで残ります。確認操作は付箋を完了しません。保留中も通知は保存され、保留終了後に表示します。
          </p>
          <button onClick={() => void api("TestNotification").catch(onError)}>
            現在の保存済み設定で通知をテスト
          </button>
          <h3>データとバックアップ</h3>
          <p className="muted">
            新しいboard.dbと添付画像を保存します。旧todo.dbの読み込み・移行は行いません。日ごとの自動バックアップは10日分を保持します。
          </p>
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
          <label>
            バックアップZIPから復元（50MBまで）
            <input
              type="file"
              accept=".zip"
              disabled={busy}
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (!f) return;
                if (f.size > 50 * 1024 * 1024) {
                  onError("バックアップは50MB以内にしてください");
                  return;
                }
                if (
                  !confirm(
                    "現在の付箋・設定を、このバックアップの内容に戻します。現在のデータは先にバックアップします。復元しますか？",
                  )
                )
                  return;
                setBusy(true);
                try {
                  const encoded = await new Promise<string>(
                    (resolve, reject) => {
                      const r = new FileReader();
                      r.onload = () => resolve(String(r.result).split(",")[1]);
                      r.onerror = reject;
                      r.readAsDataURL(f);
                    },
                  );
                  await api("RestoreBackup", encoded);
                  localStorage.clear();
                  onSaved();
                  onClose();
                } catch (e) {
                  onError(e);
                } finally {
                  setBusy(false);
                }
              }}
            />
          </label>
          <p className="muted">
            アプリを完全終了した状態でdataフォルダをコピーすると、別のPCでも利用できます。50MBを超えるデータはフォルダ全体のコピーを使用してください。
          </p>
        </div>
        <footer>
          <button
            disabled={busy}
            className="primary"
            onClick={async () => {
              setBusy(true);
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
                onError(e);
              } finally {
                setBusy(false);
              }
            }}
          >
            設定を保存
          </button>
        </footer>
      </section>
    </div>
  );
}
