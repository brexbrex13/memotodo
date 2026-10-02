import { useEffect, useRef, useState } from "react";
import { api, on } from "./api";
import { emptyTask, Snapshot } from "./types";
import { useSuggestions } from "./Suggestions";
import { ReminderFields } from "./ReminderFields";
import { Icon } from "./Icons";
import { useTheme } from "./theme";
import {
  applySuggestion,
  AutoFields,
  blankOptions,
  chipLabels,
  dropChip,
  Field,
  JevStatus,
  QuickOptions,
  Suggestion,
} from "./smartAdd";
export function QuickAdd() {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [optionsOpen, setOptionsOpen] = useState(false),
    [options, setOptions] = useState<QuickOptions>(blankOptions);
  const [nativeSuggestions, setNativeSuggestions] = useState(true),
    [showCounter, setShowCounter] = useState(0),
    [generation, setGeneration] = useState(0);
  const operation = useRef(0),
    generationRef = useRef(0);
  const anchor = useRef<HTMLDivElement>(null),
    revision = useRef(0),
    input = useRef<HTMLInputElement>(null),
    addLock = useRef(false);
  // Smart add state. Automatic values never overwrite fields the user touched.
  const [jevStatus, setJevStatus] = useState<JevStatus | null>(null),
    [auto, setAuto] = useState<AutoFields>({}),
    [duplicate, setDuplicate] = useState<Suggestion["duplicate"]>(null),
    [jevInvalid, setJevInvalid] = useState(false),
    [composeTick, setComposeTick] = useState(0);
  const touched = useRef(new Set<Field>()),
    autoRef = useRef<AutoFields>({}),
    optionsRef = useRef(options),
    composing = useRef(false),
    lastAsked = useRef(""),
    smartSeq = useRef(0);
  optionsRef.current = options;
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
  const defaultTime = snapshot?.settings.reminder_default_time || "09:00";
  const smartEnabled =
    !!snapshot?.settings.smart_add && !!jevStatus?.configured;
  const chips = chipLabels(auto, options, snapshot?.categories ?? []);
  const rows =
    (chips.length ? 1 : 0) + (duplicate ? 1 : 0) + (jevInvalid ? 1 : 0);
  const commitSmart = (next: { options: QuickOptions; auto: AutoFields }) => {
    autoRef.current = next.auto;
    optionsRef.current = next.options;
    setAuto(next.auto);
    setOptions(next.options);
  };
  const resetSmart = () => {
    smartSeq.current++;
    touched.current = new Set();
    lastAsked.current = "";
    autoRef.current = {};
    setAuto({});
    setDuplicate(null);
  };
  const touch = (field: Field) => {
    touched.current.add(field);
    if (autoRef.current[field] === undefined) return;
    const next = { ...autoRef.current };
    delete next[field];
    autoRef.current = next;
    setAuto(next);
  };
  useEffect(() => {
    void api("SetQuickAddLayout", false, optionsOpen, rows, generation).catch(
      (e) => setError(String(e)),
    );
  }, [optionsOpen, generation, rows]);
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
  // Ask Jev once typing settles; stale answers are dropped by sequence, input session and window generation.
  useEffect(() => {
    const title = text.trim();
    if (!title) {
      lastAsked.current = "";
      if (Object.keys(autoRef.current).length)
        commitSmart(
          applySuggestion(
            optionsRef.current,
            touched.current,
            autoRef.current,
            null,
            defaultTime,
          ),
        );
      setDuplicate(null);
      return;
    }
    if (
      !smartEnabled ||
      jevInvalid ||
      title.length < 2 ||
      title === lastAsked.current
    )
      return;
    const timer = setTimeout(() => {
      if (composing.current) return;
      lastAsked.current = title;
      const seq = ++smartSeq.current,
        token = operation.current,
        gen = generationRef.current;
      void api<Suggestion>("SuggestQuickAdd", title, gen)
        .then((s) => {
          if (
            !s ||
            seq !== smartSeq.current ||
            token !== operation.current ||
            gen !== generationRef.current
          )
            return;
          if (s.invalid) {
            setJevInvalid(true);
            return;
          }
          commitSmart(
            applySuggestion(
              optionsRef.current,
              touched.current,
              autoRef.current,
              s,
              defaultTime,
            ),
          );
          setDuplicate(s.duplicate);
        })
        .catch(() => {
          if (seq === smartSeq.current) lastAsked.current = "";
        });
    }, 400);
    return () => clearTimeout(timer);
  }, [text, smartEnabled, jevInvalid, composeTick]);
  useTheme(snapshot?.settings.theme);
  const discard = () => {
    operation.current++;
    setText("");
    setOptions(blankOptions());
    resetSmart();
    setOptionsOpen(false);
    setError("");
    suggest.blur();
  };
  const cancel = () => {
    discard();
    void api("HideQuickAdd").catch((e) => setError(String(e)));
  };
  useEffect(() => {
    const reload = () => {
      void api<Snapshot>("GetSnapshot")
        .then(setSnapshot)
        .catch((e) => setError(String(e)));
      void api<JevStatus>("GetJevStatus")
        .then((s) => setJevStatus(s ?? null))
        .catch(() => setJevStatus(null));
    };
    const focus = (value?: unknown) => {
      if (typeof value === "number") {
        if (value < generationRef.current) return;
        if (value !== generationRef.current) setJevInvalid(false);
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
      on("board:jev", reload),
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
    // A suggested category may have been deleted since; fall back to the default.
    const category_id = snapshot?.categories?.some(
      (c) => c.id === options.category_id,
    )
      ? options.category_id
      : 0;
    try {
      await api("SaveTask", {
        ...emptyTask(),
        title: text,
        ...options,
        category_id,
      });
      if (token !== operation.current) return;
      setOptions(blankOptions());
      resetSmart();
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
          onCompositionStart={() => {
            composing.current = true;
            suggest.compositionStart();
          }}
          onCompositionUpdate={suggest.compositionUpdate}
          onCompositionEnd={() => {
            composing.current = false;
            suggest.compositionEnd();
            setComposeTick((n) => n + 1);
          }}
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
      {chips.length > 0 && (
        <div className="smart-chips" aria-label="推定した初期値">
          {chips.map((c) => (
            <span key={c.field} className="smart-chip">
              {c.label}
              <button
                aria-label={`${c.label}を外す`}
                onClick={() => {
                  touched.current.add(c.field);
                  commitSmart(
                    dropChip(optionsRef.current, autoRef.current, c.field),
                  );
                }}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      {duplicate && (
        <button
          className="smart-duplicate"
          onClick={() =>
            void api("OpenTask", duplicate.task_id).catch((e) =>
              setError(String(e)),
            )
          }
        >
          ⚠ 似たタスクがあります: {duplicate.title} ›
        </button>
      )}
      {jevInvalid && (
        <p className="smart-invalid" role="status">
          Jevのキーが無効です（設定で確認）
        </p>
      )}
      {optionsOpen && (
        <div className="mini-options">
          <ReminderFields
            value={options}
            defaultTime={snapshot?.settings.reminder_default_time}
            onChange={(p) => {
              if ("deadline" in p) touch("deadline");
              if ("reminder_at" in p || "reminder_mode" in p) touch("reminder");
              setOptions((v) => ({ ...v, ...p }));
            }}
          />
          <label className="check">
            <input
              type="checkbox"
              checked={options.important}
              onChange={(e) => {
                touch("important");
                setOptions({ ...options, important: e.target.checked });
              }}
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
                setOptions(blankOptions());
                resetSmart();
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
