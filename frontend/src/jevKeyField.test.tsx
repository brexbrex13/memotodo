import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { JevKeyField } from "./JevKeyField";
import { api } from "./api";
vi.mock("./api", () => ({ api: vi.fn(), on: vi.fn(() => () => {}) }));
let status = { supported: true, configured: false, hint: "", invalid: false };
beforeEach(() => {
  status = { supported: true, configured: false, hint: "", invalid: false };
  vi.mocked(api).mockReset();
  vi.mocked(api).mockImplementation(async (method, ...args) => {
    if (method === "GetJevStatus") return status;
    if (method === "SetJevKey") {
      status = { ...status, configured: true, hint: String(args[0]).slice(-4) };
      return undefined;
    }
    if (method === "ClearJevKey") {
      status = { ...status, configured: false, hint: "" };
      return undefined;
    }
    if (method === "TestJevKey") return "invalid";
    return undefined;
  });
});
afterEach(cleanup);
it("saves a key without keeping it in the field and shows only the hint", async () => {
  render(<JevKeyField />);
  const field = (await screen.findByLabelText(
    "Jev APIキー",
  )) as HTMLInputElement;
  expect(field.type).toBe("password");
  await waitFor(() => expect(field.placeholder).toBe("未設定"));
  fireEvent.change(field, { target: { value: "tsk-secret-1234" } });
  fireEvent.click(screen.getByText("保存"));
  await waitFor(() =>
    expect(field.placeholder).toBe("設定済み（末尾 ••••1234）"),
  );
  expect(field.value).toBe("");
  expect(vi.mocked(api).mock.calls.find((c) => c[0] === "SetJevKey")?.[1]).toBe(
    "tsk-secret-1234",
  );
  fireEvent.click(screen.getByText("接続テスト"));
  await screen.findByText("キーが無効です");
  fireEvent.click(screen.getByText("削除"));
  await waitFor(() => expect(field.placeholder).toBe("未設定"));
});
it("shows save errors and the unsupported state", async () => {
  vi.mocked(api).mockImplementation(async (method) => {
    if (method === "GetJevStatus") return status;
    if (method === "SetJevKey") throw "APIキーを入力してください";
    return undefined;
  });
  render(<JevKeyField />);
  const field = await screen.findByLabelText("Jev APIキー");
  fireEvent.change(field, { target: { value: "x" } });
  fireEvent.click(screen.getByText("保存"));
  await screen.findByText("APIキーを入力してください");
  cleanup();
  status = { ...status, supported: false };
  render(<JevKeyField />);
  await screen.findByText("この環境では使えません");
  await act(async () => {});
  expect(screen.queryByLabelText("Jev APIキー")).toBeNull();
});
