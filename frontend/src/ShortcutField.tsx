export function shortcutWarning(value: string): string {
  const keys = value.split("+");
  const key = keys[keys.length - 1];
  const ctrl = keys.includes("Ctrl"),
    alt = keys.includes("Alt"),
    shift = keys.includes("Shift");
  if (
    ctrl &&
    !alt &&
    ((key && "ACVXZYSOPNFHWTLBIUK".includes(key)) ||
      [
        "Home",
        "End",
        "Left",
        "Right",
        "Backspace",
        "Delete",
        "Tab",
        "Space",
        "Insert",
      ].includes(key || ""))
  )
    return "WindowsやOffice等の標準操作と重なります。アプリが起動中はその操作より優先される場合があります。";
  if (
    (alt && ["Tab", "F4", "Space", "Escape"].includes(key || "")) ||
    (ctrl && key === "Escape") ||
    (shift && ["Insert", "Delete"].includes(key || "")) ||
    (ctrl && alt && key === "Delete")
  )
    return "Windowsの標準操作に使われる組み合わせです。登録できない場合や標準操作を妨げる場合があります。";
  return "";
}
const keys = [
  ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
  "Space",
  "Tab",
  "Enter",
  "Escape",
  "Backspace",
  "Insert",
  "Delete",
  "Home",
  "End",
  "PageUp",
  "PageDown",
  "Left",
  "Up",
  "Right",
  "Down",
  ...Array.from({ length: 24 }, (_, i) => "F" + (i + 1)).filter(
    (k) => k !== "F12",
  ),
  ...Array.from({ length: 10 }, (_, i) => "Numpad" + i),
  "NumpadMultiply",
  "NumpadAdd",
  "NumpadSubtract",
  "NumpadDecimal",
  "NumpadDivide",
];
export function ShortcutField({
  value,
  onChange,
}: {
  value: string;
  onChange: (key: string) => void;
}) {
  const parts = (value || "Ctrl+Alt+N").split("+"),
    key = parts[parts.length - 1] || "N";
  const change = (modifier: string, checked: boolean) => {
    const mods = ["Ctrl", "Alt", "Shift"].filter((m) =>
      m === modifier ? checked : parts.includes(m),
    );
    onChange([...mods, key].join("+"));
  };
  return (
    <fieldset className="wide shortcut-field">
      <legend>タスク追加ショートカット</legend>
      <label className="check">
        <input
          type="checkbox"
          checked={!!value}
          onChange={(e) => onChange(e.target.checked ? "Ctrl+Alt+N" : "")}
        />
        有効
      </label>
      <div className="shortcut-keys">
        {["Ctrl", "Alt", "Shift"].map((m) => (
          <label key={m} className="check">
            <input
              type="checkbox"
              disabled={!value}
              checked={parts.includes(m)}
              onChange={(e) => change(m, e.target.checked)}
            />
            {m}
          </label>
        ))}
        <select
          aria-label="ショートカットのキー"
          disabled={!value}
          value={key}
          onChange={(e) =>
            onChange([...parts.slice(0, -1), e.target.value].join("+"))
          }
        >
          {keys.map((k) => (
            <option key={k}>{k}</option>
          ))}
        </select>
      </div>
      {value && shortcutWarning(value) && (
        <p className="shortcut-warning" role="status">
          {shortcutWarning(value)}
        </p>
      )}
    </fieldset>
  );
}
