import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import App, { Notifications } from "./App";
import { TaskDetail, DraftHandle } from "./TaskDetail";
import { emptyTask, Snapshot, urgency } from "./types";
import { createRef } from "react";
import { api } from "./api";
vi.mock("./api", () => ({ api: vi.fn(), on: vi.fn(() => () => {}) }));
vi.mock("./Editor", () => ({
  Editor: ({
    value,
    onChange,
  }: {
    value: string;
    onChange: (v: string) => void;
  }) => (
    <textarea
      aria-label="業務メモ"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}));
const defaults = {
  series_show_days: 7,
  custom_colors: [],
  near_days: 3,
  workdays: true,
  notify_times: [],
  notify_weekdays: [1, 2, 3, 4, 5],
  sound: true,
  native_toast: false,
  private: false,
  pause_until: "",
  font_size: 14,
  compact: false,
  collapsed: [],
  monitor: "active",
};
let snapshot: Snapshot;
beforeEach(() => {
  localStorage.clear();
  snapshot = {
    tasks: [],
    categories: [],
    series: [],
    notifications: [],
    settings: defaults,
  };
  vi.mocked(api).mockReset();
  vi.mocked(api).mockImplementation(async (method, ...args) => {
    if (method === "GetSnapshot") return snapshot;
    if (method === "SaveTask") {
      const task = {
        ...(args[0] as object),
        id: (args[0] as { id: number }).id || 1,
        version: 2,
      };
      return task;
    }
    return undefined;
  });
});
afterEach(cleanup);
describe("sticky board and notification semantics", () => {
  it("adds a note with Enter but does not commit an IME composition", async () => {
    render(<App />);
    const input = await screen.findByLabelText("新しい付箋");
    fireEvent.change(input, { target: { value: "ぱぱっと要件" } });
    fireEvent.keyDown(input, { key: "Enter", keyCode: 229, isComposing: true });
    expect(
      vi.mocked(api).mock.calls.filter((c) => c[0] === "SaveTask"),
    ).toHaveLength(0);
    fireEvent.keyDown(input, { key: "Enter", keyCode: 13, isComposing: false });
    await waitFor(() =>
      expect(
        vi.mocked(api).mock.calls.find((c) => c[0] === "SaveTask")?.[1],
      ).toMatchObject({ title: "ぱぱっと要件", deadline: "", reminder_at: "" }),
    );
  });
  it("keeps deadline band separate from manual board order", async () => {
    snapshot.tasks = [
      { ...emptyTask(), id: 1, title: "期限なしの付箋", sort_order: 0 },
      {
        ...emptyTask(),
        id: 2,
        title: "期限切れ",
        deadline: "2000-01-01",
        sort_order: 1,
      },
    ];
    render(<App />);
    await screen.findByText("期限なしの付箋");
    const cards = screen.getAllByRole("article");
    expect(cards[0].textContent).toContain("期限なしの付箋");
    expect(cards[1].textContent).toContain("期限切れ");
    expect(screen.getByLabelText("期限の確認").textContent).toContain(
      "期限切れ",
    );
  });
  it("acknowledges notification without completing task", async () => {
    snapshot.tasks = [{ ...emptyTask(), id: 1, title: "確認と完了は別" }];
    snapshot.notifications = [
      {
        id: 7,
        key: "x",
        task_id: 1,
        kind: "reminder",
        title: "確認と完了は別",
        fired_at: "2026-10-01T09:00",
        acknowledged: false,
      },
    ];
    render(<Notifications />);
    fireEvent.click(await screen.findByRole("button", { name: /^閉じる$/ }));
    await waitFor(() => expect(api).toHaveBeenCalledWith("Acknowledge", 7));
    expect(api).not.toHaveBeenCalledWith("SetState", 1, "done");
  });
  it("flushes draft before closing and retains it after failure", async () => {
    const task = { ...emptyTask(), id: 3, version: 1, title: "要件" };
    const close = vi.fn(),
      error = vi.fn();
    const handle = createRef<DraftHandle>();
    render(
      <TaskDetail
        task={task}
        categories={[]}
        onClose={close}
        onSaved={() => {}}
        onError={error}
        handle={handle}
      />,
    );
    fireEvent.change(screen.getByLabelText("業務メモ"), {
      target: { value: "保存するメモ" },
    });
    vi.mocked(api).mockRejectedValueOnce(new Error("ディスクエラー"));
    fireEvent.click(screen.getByLabelText("詳細を閉じる"));
    await waitFor(() => expect(error).toHaveBeenCalled());
    expect(close).not.toHaveBeenCalled();
    expect(localStorage.getItem("draft:3")).toContain("保存するメモ");
    fireEvent.click(screen.getByLabelText("詳細を閉じる"));
    await waitFor(() => expect(close).toHaveBeenCalled());
    expect(localStorage.getItem("draft:3")).toBeNull();
  });
  it("uses end of day and workday-based near deadlines", () => {
    const task = { ...emptyTask(), deadline: "2026-10-05" };
    expect(
      urgency(
        task,
        { ...defaults, near_days: 1 },
        new Date("2026-10-02T12:00"),
      ),
    ).toBe("near");
    expect(
      urgency(
        task,
        { ...defaults, near_days: 1, workdays: false },
        new Date("2026-10-02T12:00"),
      ),
    ).toBe("");
    task.deadline = "2026-10-01";
    expect(urgency(task, defaults, new Date("2026-10-01T23:59"))).toBe("today");
    expect(urgency(task, defaults, new Date("2026-10-02T00:00"))).toBe(
      "overdue",
    );
  });
});

describe("draft conflict resolution", () => {
  it("preserves snooze and completion from notification window while saving memo", async () => {
    const { mergeDraft } = await import("./drafts");
    const base = { ...emptyTask(), id: 1, version: 1, title: "x" };
    const draft = { ...base, memo: "updated memo" };
    const latest = {
      ...base,
      version: 2,
      reminder_at: "2026-10-01T13:00",
      status: "done",
      done_at: "2026-10-01T10:00",
    };
    expect(mergeDraft(base, draft, latest)).toMatchObject({
      version: 2,
      memo: "updated memo",
      reminder_at: latest.reminder_at,
      status: "done",
    });
  });
  it("rejects concurrent edits of same field", async () => {
    const { mergeDraft } = await import("./drafts");
    const base = { ...emptyTask(), title: "x" };
    expect(() =>
      mergeDraft(base, { ...base, memo: "a" }, { ...base, memo: "b" }),
    ).toThrow("同じ項目");
  });
});
