import { useEffect, useRef, useState } from "react";
import { api, on } from "./api";
import { emptyTask, Snapshot } from "./types";
import { useSuggestions } from "./Suggestions";
import { ReminderFields } from "./ReminderFields";
import { Icon } from "./Icons";
import { useTheme } from "./theme";
export function QuickAdd() {
  const [text, setText] = useState(
    localStorage.getItem("tray-quick-draft") || "",
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [options, setOptions] = useState(() => {
    try {
      return (
        JSON.parse(localStorage.getItem("tray-quick-options") || "null") || {
          deadline: "",
          reminder_at: "",
          reminder_mode: "",
          reminder_time: "",
          important: false,
        }
      );
    } catch {
      return {
        deadline: "",
        reminder_at: "",
        reminder_mode: "",
        reminder_time: "",
        important: false,
      };
    }
  });
  useEffect(() => {
    localStorage.setItem("tray-quick-options", JSON.stringify(options));
  }, [options]);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const suggest = useSuggestions(
    snapshot?.tasks ?? [],
    text,
    snapshot?.settings.suggest_min_count ?? 3,
    setText,
  );
  useEffect(() => {
    void api("SetQuickAddLayout", suggest.open || !!error, optionsOpen).catch(
      (e) => setError(String(e)),
    );
  }, [suggest.open, !!error, optionsOpen]);
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
    const focusWindow = () => {
      if (
        document.activeElement === document.body ||
        document.activeElement === input.current
      )
        focus();
    };
    window.addEventListener("focus", focusWindow);
    return () => {
      off.forEach((f) => f());
      window.removeEventListener("focus", focusWindow);
    };
  }, []);
  const add = async () => {
    if (addLock.current || !text.trim()) return;
    addLock.current = true;
    setBusy(true);
    setError("");
    try {
      await api("SaveTask", { ...emptyTask(), title: text, ...options });
      setOptions({
        deadline: "",
        reminder_at: "",
        reminder_mode: "",
        reminder_time: "",
        important: false,
      });
      setOptionsOpen(false);
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
      <div className="mini-input">
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
            if (suggest.keyDown(e, !optionsOpen)) return;
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
        <button
          className="mini-clock"
          aria-label="登録時の期限・通知"
          aria-expanded={optionsOpen}
          onClick={() => setOptionsOpen(!optionsOpen)}
        >
          <Icon name="clock" />
        </button>
      </div>
      {!optionsOpen && suggest.list}
      {optionsOpen && (
        <div className="mini-options">
          <ReminderFields
            value={options}
            defaultTime={snapshot?.settings.reminder_default_time}
            onChange={(p) =>
              setOptions((v: typeof options) => ({ ...v, ...p }))
            }
          />
          <label className="check">
            <input
              type="checkbox"
              checked={options.important}
              onChange={(e) =>
                setOptions({ ...options, important: e.target.checked })
              }
            />
            重要
          </label>
        </div>
      )}
      {error && <p role="alert">{error}</p>}
    </main>
  );
}
