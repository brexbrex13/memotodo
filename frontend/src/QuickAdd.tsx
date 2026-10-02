import { useEffect, useRef, useState } from "react";
import { api, on } from "./api";
import { emptyTask, Snapshot } from "./types";
import { useSuggestions } from "./Suggestions";
import { ReminderFields } from "./ReminderFields";
import { Icon } from "./Icons";
import { useTheme } from "./theme";
export function QuickAdd() {
  const blank = () => ({
    deadline: "",
    reminder_at: "",
    reminder_mode: "",
    reminder_time: "",
    important: false,
  });
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [optionsOpen, setOptionsOpen] = useState(false),
    [options, setOptions] = useState(blank);
  const [nativeSuggestions, setNativeSuggestions] = useState(true),
    [showCounter, setShowCounter] = useState(0),
    [generation, setGeneration] = useState(0);
  const operation = useRef(0),
    generationRef = useRef(0);
  const anchor = useRef<HTMLDivElement>(null),
    revision = useRef(0),
    input = useRef<HTMLInputElement>(null),
    addLock = useRef(false);
  useEffect(() => {
    localStorage.removeItem("tray-quick-draft");
    localStorage.removeItem("tray-quick-options");
  }, []);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const suggest = useSuggestions(
    snapshot?.tasks ?? [],
    text,
    snapshot?.settings.suggest_min_count ?? 3,
    setText,
  );
  useEffect(() => {
    void api("SetQuickAddLayout", false, optionsOpen, generation).catch((e) =>
      setError(String(e)),
    );
  }, [optionsOpen, generation]);
  useEffect(() => {
    const r = anchor.current?.getBoundingClientRect();
    if (!r) return;
    void api<boolean>("SetQuickSuggestions", {
      items: suggest.items,
      index: suggest.index,
      revision: ++revision.current,
      generation,
      anchor: {
        X: Math.round(r.x),
        Y: Math.round(r.y),
        Width: Math.round(r.width),
        Height: Math.round(r.height),
      },
    })
      .then(setNativeSuggestions)
      .catch((e) => setError(String(e)));
  }, [
    JSON.stringify(suggest.items),
    suggest.index,
    optionsOpen,
    showCounter,
    generation,
  ]);
  useTheme(snapshot?.settings.theme);
  const discard = () => {
    operation.current++;
    setText("");
    setOptions(blank());
    setOptionsOpen(false);
    setError("");
    suggest.blur();
  };
  const cancel = () => {
    discard();
    void api("HideQuickAdd").catch((e) => setError(String(e)));
  };
  useEffect(() => {
    const reload = () =>
      void api<Snapshot>("GetSnapshot")
        .then(setSnapshot)
        .catch((e) => setError(String(e)));
    const focus = (value?: unknown) => {
      if (typeof value === "number") {
        if (value < generationRef.current) return;
        generationRef.current = value;
        setGeneration(value);
      }
      input.current?.focus();
      suggest.focus();
      setShowCounter((n) => n + 1);
    };
    reload();
    const off = [
      on("board:mini-focus", focus),
      on("board:changed", reload),
      on("board:mini-reset", (value) => {
        if (typeof value === "number") {
          if (value < generationRef.current) return;
          generationRef.current = value;
          setGeneration(value);
        }
        discard();
      }),
      on("board:mini-choice", (value) => {
        const choice = value as { title: string; generation: number };
        if (choice.generation !== generationRef.current) return;
        suggest.choose(choice.title);
        requestAnimationFrame(() => input.current?.focus());
      }),
    ];
    const focusWindow = () => {
      if (
        document.activeElement === document.body ||
        document.activeElement === input.current
      )
        focus();
    };
    const resized = () => setShowCounter((n) => n + 1);
    window.addEventListener("resize", resized);
    window.addEventListener("focus", focusWindow);
    return () => {
      off.forEach((f) => f());
      window.removeEventListener("resize", resized);
      window.removeEventListener("focus", focusWindow);
    };
  }, []);
  const add = async () => {
    if (addLock.current || !text.trim()) return;
    addLock.current = true;
    const token = operation.current;
    setBusy(true);
    setError("");
    try {
      await api("SaveTask", { ...emptyTask(), title: text, ...options });
      if (token !== operation.current) return;
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
      if (token === operation.current) setError(String(e));
    } finally {
      setBusy(false);
      addLock.current = false;
      requestAnimationFrame(() => {
        if (token === operation.current && document.hasFocus())
          input.current?.focus();
      });
    }
  };
  return (
    <main
      className="mini-add"
      onKeyDown={(e) => {
        if (
          e.key === "Escape" &&
          !e.nativeEvent.isComposing &&
          e.keyCode !== 229
        ) {
          e.preventDefault();
          cancel();
        }
      }}
    >
      <header>
        <strong>タスクを追加</strong>
        <button aria-label="入力欄を閉じる" onClick={cancel}>
          ×
        </button>
      </header>
      <div className="mini-input" ref={anchor}>
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
            if (e.key === "Escape") return;
            if (suggest.keyDown(e)) return;
            if (
              e.key === "Enter" &&
              !e.nativeEvent.isComposing &&
              e.keyCode !== 229
            ) {
              e.preventDefault();
              void add();
            }
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
      {!nativeSuggestions && suggest.list}
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
          <div className="mini-actions">
            <button
              disabled={busy}
              data-tip="入力中の内容を消去"
              aria-label="入力中の内容を削除"
              onClick={() => {
                setText("");
                setOptions({
                  deadline: "",
                  reminder_at: "",
                  reminder_mode: "",
                  reminder_time: "",
                  important: false,
                });
                setError("");
                suggest.reset();
                input.current?.focus();
              }}
            >
              <Icon name="trash" />
            </button>
            <button
              className="primary"
              disabled={busy || !text.trim()}
              onClick={() => void add()}
            >
              登録
            </button>
          </div>
        </div>
      )}
      {error && <p role="alert">{error}</p>}
    </main>
  );
}
