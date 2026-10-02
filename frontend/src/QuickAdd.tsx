import { useEffect, useRef, useState } from "react";
import { api, on } from "./api";
import { emptyTask, Snapshot } from "./types";
import { useSuggestions } from "./Suggestions";
import { useTheme } from "./theme";
export function QuickAdd() {
  const [text, setText] = useState(
    localStorage.getItem("tray-quick-draft") || "",
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const suggest = useSuggestions(
    snapshot?.tasks ?? [],
    text,
    snapshot?.settings.suggest_min_count ?? 3,
    setText,
  );
  useEffect(() => {
    void api("SetQuickAddExpanded", suggest.open || !!error).catch((e) =>
      setError(String(e)),
    );
  }, [suggest.open, !!error]);
  const input = useRef<HTMLInputElement>(null),
    addLock = useRef(false);
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
    if (addLock.current || !text.trim()) return;
    addLock.current = true;
    setBusy(true);
    setError("");
    try {
      await api("SaveTask", { ...emptyTask(), title: text });
      setText("");
      suggest.reset();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
      addLock.current = false;
      requestAnimationFrame(() => {
        if (
          document.hasFocus() &&
          (document.activeElement === input.current ||
            document.activeElement === document.body)
        )
          input.current?.focus();
      });
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
        readOnly={busy}
        onCompositionStart={suggest.compositionStart}
        onCompositionUpdate={suggest.compositionUpdate}
        onCompositionEnd={suggest.compositionEnd}
        onKeyUp={suggest.keyUp}
        onFocus={suggest.focus}
        onBlur={suggest.blur}
        onChange={(e) => {
          setText(e.target.value);
          suggest.reset();
        }}
        onKeyDown={(e) => {
          if (busy) return;
          if (suggest.keyDown(e)) return;
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
      {suggest.list}
      {error && <p role="alert">{error}</p>}
    </main>
  );
}
