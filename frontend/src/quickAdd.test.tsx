import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QuickAdd } from "./QuickAdd";
import { api, on } from "./api";
vi.mock("./api", () => ({ api: vi.fn(), on: vi.fn() }));
const listeners = new Map<string, (value: unknown) => void>();
beforeEach(() => {
  localStorage.clear();
  listeners.clear();
  vi.mocked(api).mockReset();
  vi.mocked(on).mockImplementation((name, callback) => {
    listeners.set(name, callback);
    return () => {
      listeners.delete(name);
    };
  });
  vi.mocked(api).mockImplementation(async (method) =>
    method === "GetSnapshot"
      ? { tasks: [], settings: { suggest_min_count: 3 } }
      : method === "SetQuickSuggestions"
        ? false
        : undefined,
  );
});
afterEach(cleanup);
it("keeps a focus-loss draft but cancels with Escape and never restores legacy persisted input", async () => {
  localStorage.setItem("tray-quick-draft", "古い入力");
  localStorage.setItem(
    "tray-quick-options",
    JSON.stringify({ deadline: "2000-01-01" }),
  );
  render(<QuickAdd />);
  const input = screen.getByLabelText("トレイからタスク追加");
  await act(async () => {});
  expect((input as HTMLInputElement).value).toBe("");
  expect(localStorage.getItem("tray-quick-draft")).toBeNull();
  fireEvent.change(input, { target: { value: "途中の入力" } });
  fireEvent.blur(input);
  expect((input as HTMLInputElement).value).toBe("途中の入力");
  fireEvent.keyDown(input, { key: "Escape" });
  expect((input as HTMLInputElement).value).toBe("");
  await waitFor(() =>
    expect(vi.mocked(api).mock.calls.some((c) => c[0] === "HideQuickAdd")).toBe(
      true,
    ),
  );
});
it("ignores an old cancel event and old save completion after a newer input session", async () => {
  let finishSave!: (value: unknown) => void;
  const original = vi.mocked(api).getMockImplementation()!;
  vi.mocked(api).mockImplementation((method, ...args) =>
    method === "SaveTask"
      ? new Promise((resolve) => {
          finishSave = resolve;
        })
      : original(method, ...args),
  );
  render(<QuickAdd />);
  const input = screen.getByLabelText("トレイからタスク追加");
  await act(async () => {});
  act(() => listeners.get("board:mini-focus")?.(1));
  fireEvent.change(input, { target: { value: "登録中" } });
  fireEvent.keyDown(input, { key: "Enter", keyCode: 13 });
  await waitFor(() => expect(finishSave).toBeDefined());
  act(() => listeners.get("board:mini-reset")?.(2));
  act(() => listeners.get("board:mini-focus")?.(3));
  fireEvent.change(input, { target: { value: "次の入力" } });
  act(() => listeners.get("board:mini-reset")?.(2));
  expect((input as HTMLInputElement).value).toBe("次の入力");
  act(() =>
    listeners.get("board:mini-choice")?.({ title: "古い候補", generation: 1 }),
  );
  expect((input as HTMLInputElement).value).toBe("次の入力");
  await act(async () => {
    finishSave({ id: 1 });
  });
  expect((input as HTMLInputElement).value).toBe("次の入力");
});
