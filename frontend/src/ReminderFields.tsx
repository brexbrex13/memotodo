import { useEffect, useState } from "react";
export type ReminderValue = {
  deadline: string;
  reminder_at: string;
  reminder_mode?: string;
  reminder_time?: string;
};
export function ReminderFields({
  value,
  onChange,
}: {
  value: ReminderValue;
  onChange: (patch: Partial<ReminderValue>) => void;
}) {
  const [mode, setMode] = useState(
    value.reminder_mode === "deadline"
      ? "deadline"
      : value.reminder_at
        ? "custom"
        : "off",
  );
  useEffect(() => {
    if (value.reminder_mode === "deadline") setMode("deadline");
    else if (value.reminder_at) setMode("custom");
  }, [value.reminder_mode, value.reminder_at]);
  const at =
    value.reminder_mode === "deadline" && value.deadline
      ? value.deadline.slice(0, 10) + "T" + (value.reminder_time || "09:00")
      : value.reminder_at;
  return (
    <>
      <label>
        期限日
        <input
          type="date"
          value={value.deadline.slice(0, 10)}
          onChange={(e) => {
            const deadline = e.target.value;
            if (!deadline && mode === "deadline") {
              setMode("off");
              onChange({
                deadline,
                reminder_at: "",
                reminder_mode: "",
                reminder_time: "",
              });
            } else onChange({ deadline });
          }}
        />
      </label>
      <label>
        通知
        <select
          aria-label="通知方法"
          value={mode}
          onChange={(e) => {
            const next = e.target.value;
            setMode(next);
            onChange({
              reminder_mode: next === "deadline" ? "deadline" : "",
              reminder_time:
                next === "deadline" ? value.reminder_time || "09:00" : "",
              reminder_at: next === "custom" ? value.reminder_at : "",
            });
          }}
        >
          <option value="off">通知なし</option>
          <option value="custom">日時を指定</option>
          <option value="deadline" disabled={!value.deadline}>
            期限に合わせて通知
          </option>
        </select>
      </label>
      {mode === "custom" && (
        <label>
          通知時刻
          <input
            type="datetime-local"
            value={value.reminder_at.slice(0, 16)}
            onChange={(e) => onChange({ reminder_at: e.target.value })}
          />
        </label>
      )}
      {mode === "deadline" && (
        <label>
          期限日の通知時刻
          <input
            type="time"
            value={value.reminder_time || "09:00"}
            onChange={(e) => onChange({ reminder_time: e.target.value })}
          />
        </label>
      )}
      <span className="reminder-status" role="status">
        {at ? "通知：" + at.replace("T", " ").slice(0, 16) : "通知なし"}
      </span>
    </>
  );
}
