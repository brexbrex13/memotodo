import { useEffect, useRef, useState } from "react";
import { api, on } from "./api";
import { emptyTask, Snapshot } from "./types";
import { useTheme } from "./theme";
export function QuickAdd() {
  const [text, setText] = useState(
    localStorage.getItem("tray-quick-draft") || "",
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const input = useRef<HTMLInputElement>(null);
  useTheme(snapshot?.settings.theme);
  useEffect(() => {
    localStorage.setItem("tray-quick-draft", text);
  }, [text]);
  useEffect(() => {
    const reload = () =>
      void api<Snapshot>("GetSnapshot")
        .then(setSnapshot)
        .catch((e) => setError(String(e)));
    const focus = () => input.current?.focus();
    reload();
    const off = [on("board:mini-focus", focus), on("board:changed", reload)];
    window.addEventListener("focus", focus);
    return () => {
      off.forEach((f) => f());
      window.removeEventListener("focus", focus);
    };
  }, []);
  const add = async () => {
    if (busy || !text.trim()) return;
    setBusy(true);
    setError("");
    try {
      await api("SaveTask", { ...emptyTask(), title: text });
      setText("");
      await api("HideQuickAdd");
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="mini-add">
      <header>
        <strong>タスクを追加</strong>
        <button
          aria-label="入力欄を閉じる"
          onClick={() => void api("HideQuickAdd")}
        >
          ×
        </button>
      </header>
      <input
        ref={input}
        aria-label="トレイからタスク追加"
        placeholder="入力してEnterで追加"
        value={text}
        disabled={busy}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (
            e.key === "Enter" &&
            !e.nativeEvent.isComposing &&
            e.keyCode !== 229
          ) {
            e.preventDefault();
            void add();
          }
          if (e.key === "Escape") void api("HideQuickAdd");
        }}
      />
      {error && <p role="alert">{error}</p>}
    </main>
  );
}
