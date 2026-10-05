import { useEffect, useState } from "react";
import { api } from "./api";
import { JevEndpoint, jevProvider, JevStatus } from "./smartAdd";
const results: Record<string, string> = {
  ok: "接続できました",
  invalid: "キーが無効です",
  unreachable: "接続できません",
};
// Keys are saved per provider immediately and never come back from Go; only their last
// four characters do. The connection test uses the endpoint as entered, even unsaved.
export function JevKeyField({ endpoint }: { endpoint: JevEndpoint }) {
  const provider = jevProvider(endpoint.provider);
  const [status, setStatus] = useState<JevStatus | null>(null),
    [key, setKey] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const refresh = () =>
    api<JevStatus>("GetJevStatus", provider.id).then((s) =>
      setStatus(s ?? null),
    );
  useEffect(() => {
    setKey("");
    setMessage("");
    void refresh().catch((e) => setMessage(String(e)));
  }, [provider.id]);
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
        {provider.key}
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
              await api("SetJevKey", provider.id, key);
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
              await api("ClearJevKey", provider.id);
              return "削除しました";
            })
          }
        >
          削除
        </button>
        <button
          disabled={busy || !status?.configured}
          onClick={() =>
            void run(
              async () =>
                results[
                  await api<string>("TestJevKey", {
                    ...endpoint,
                    provider: provider.id,
                  })
                ] ?? "",
            )
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
        入力中のタイトル・未完了タスク名・カテゴリ名を {provider.sendTo}{" "}
        に送信します。APIキーはこのPCのユーザーで暗号化して保存し、バックアップには含めません（別のPCへ復元したときは再入力が必要です）。
      </p>
    </div>
  );
}
