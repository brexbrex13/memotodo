import { useEffect, useState } from "react";
import { api } from "./api";
import { JevStatus } from "./smartAdd";
const results: Record<string, string> = {
  ok: "接続できました",
  invalid: "キーが無効です",
  unreachable: "接続できません",
};
// The key is saved immediately and never comes back from Go; only its last four characters do.
export function JevKeyField() {
  const [status, setStatus] = useState<JevStatus | null>(null),
    [key, setKey] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const refresh = () =>
    api<JevStatus>("GetJevStatus").then((s) => setStatus(s ?? null));
  useEffect(() => {
    void refresh().catch((e) => setMessage(String(e)));
  }, []);
  const run = async (f: () => Promise<string>) => {
    setBusy(true);
    setMessage("");
    try {
      setMessage(await f());
      await refresh();
    } catch (e) {
      setMessage(String(e));
    } finally {
      setBusy(false);
    }
  };
  if (status && !status.supported)
    return <p className="wide jev-note">この環境では使えません</p>;
  return (
    <div className="wide jev-key">
      <label>
        Jev APIキー
        <input
          type="password"
          autoComplete="off"
          value={key}
          placeholder={
            status?.configured
              ? `設定済み（末尾 ••••${status.hint}）`
              : "未設定"
          }
          onChange={(e) => setKey(e.target.value)}
        />
      </label>
      <div className="actions">
        <button
          disabled={busy || !key.trim()}
          onClick={() =>
            void run(async () => {
              await api("SetJevKey", key);
              setKey("");
              return "保存しました";
            })
          }
        >
          保存
        </button>
        <button
          disabled={busy || !status?.configured}
          onClick={() =>
            void run(async () => {
              await api("ClearJevKey");
              return "削除しました";
            })
          }
        >
          削除
        </button>
        <button
          disabled={busy || !status?.configured}
          onClick={() =>
            void run(async () => results[await api<string>("TestJevKey")] ?? "")
          }
        >
          接続テスト
        </button>
      </div>
      {status?.invalid && (
        <p className="danger">キーが無効です。保存し直してください。</p>
      )}
      {message && <p role="status">{message}</p>}
      <p className="jev-note">
        入力中のタイトル・未完了タスク名・カテゴリ名を TypeSafe AI
        に送信します。APIキーはこのPCのユーザーで暗号化して保存し、バックアップには含めません（別のPCへ復元したときは再入力が必要です）。
      </p>
    </div>
  );
}
