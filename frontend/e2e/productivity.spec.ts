import { expect, test } from "@playwright/test";
const service = async (page: any, method: string, ...args: unknown[]) => {
  const response = await page.request.get(
    "/wails/runtime?object=0&method=0&args=" +
      encodeURIComponent(
        JSON.stringify({
          methodName: "main.App." + method,
          args,
          "call-id": "productivity-" + Math.random(),
        }),
      ),
  );
  const value = await response.json();
  if (value.error) throw new Error(JSON.stringify(value.error));
  return value.result ?? value;
};
const create = (page: any, title: string, extra: any = {}) =>
  service(page, "SaveTask", {
    id: 0,
    version: 0,
    title,
    memo: "",
    status: "pending",
    deadline: "",
    reminder_at: "",
    category_id: 0,
    important: false,
    ...extra,
  });
test("today selection combines normal and recurring without changing deadline; completion can be undone", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByLabel("新しい付箋")).toBeVisible();
  const normal = await create(page, "今日着手する来週締切", {
    deadline: "2099-10-08",
  });
  // Seed a regular rule then use its generated occurrence.
  const rule = await service(page, "SaveSeries", {
    id: 0,
    version: 0,
    title: "今日の定例",
    memo: "",
    category_id: 0,
    important: false,
    period: "daily",
    interval: 1,
    weekdays: [],
    month_day: 1,
    month: 1,
    first_due: "",
    next_due: "",
    due_time: "",
    show_days: 7,
    near_days: 3,
    notify_mode: "off",
    notify_days: 0,
    notify_time: "09:00",
    notify_hours: 0,
    active: true,
    deleted: false,
    end_date: "",
  });
  let snapshot = await service(page, "GetSnapshot");
  const recurring = snapshot.tasks.find((t: any) => t.series_id === rule.id);
  expect(recurring).toBeTruthy();
  await service(page, "ToggleToday", normal.id);
  await service(page, "ToggleToday", recurring.id);
  await page.getByRole("button", { name: "今日やる", exact: true }).click();
  const rows = page.locator("article");
  await expect(rows.filter({ hasText: normal.title })).toBeVisible();
  await expect(rows.filter({ hasText: recurring.title })).toBeVisible();
  snapshot = await service(page, "GetSnapshot");
  expect(snapshot.tasks.find((t: any) => t.id === normal.id).deadline).toBe(
    "2099-10-08",
  );
  await rows
    .filter({ hasText: normal.title })
    .getByLabel(normal.title + "を完了")
    .click();
  await expect(rows.filter({ hasText: normal.title })).toHaveCount(0);
  await page.getByRole("button", { name: "元に戻す", exact: true }).click();
  await expect(rows.filter({ hasText: normal.title })).toBeVisible();
  await service(page, "StopSeries", rule.id);
  snapshot = await service(page, "GetSnapshot");
  for (const task of snapshot.tasks.filter((t: any) => t.series_id === rule.id))
    await service(page, "SetState", task.id, "done");
});
test("deadline alone has no reminder; linked notification follows date changes", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByLabel("新しい付箋")).toBeVisible();
  const task = await create(page, "期限日の通知を設定", {
    deadline: "2099-10-08",
  });
  await page
    .locator("article")
    .filter({ hasText: task.title })
    .locator(".card-content")
    .click();
  const detail = page.getByLabel("タスクの詳細", { exact: true });
  await expect(
    detail.getByRole("status").filter({ hasText: "通知なし" }),
  ).toBeVisible();
  await detail.getByLabel("通知方法").selectOption("deadline");
  await detail.getByLabel("期限日の通知時刻").fill("10:30");
  await detail.getByLabel("期限日", { exact: true }).fill("2099-10-09");
  await detail.getByRole("button", { name: "今すぐ保存", exact: true }).click();
  const snapshot = await service(page, "GetSnapshot");
  expect(snapshot.tasks.find((t: any) => t.id === task.id)).toMatchObject({
    deadline: "2099-10-09",
    reminder_at: "2099-10-09T10:30:00",
    reminder_mode: "deadline",
  });
});
test("suggestions complete only title; Enter still adds directly and IME is safe", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByLabel("新しい付箋")).toBeVisible();
  for (let i = 0; i < 3; i++)
    await create(page, "請求書の確認", {
      deadline: "2099-01-01",
      reminder_at: "",
    });
  const input = page.getByLabel("新しい付箋");
  await input.fill("請");
  await expect(
    page.getByRole("option", { name: "請求書の確認", exact: true }),
  ).toBeVisible();
  await input.press("Tab");
  await expect(input).toHaveValue("請求書の確認");
  await input.press("Enter");
  let snapshot = await service(page, "GetSnapshot");
  const added = snapshot.tasks
    .filter((t: any) => t.title === "請求書の確認")
    .at(-1);
  expect(added.deadline).toBe("");
  expect(added.reminder_at).toBe("");
  await input.fill("請");
  await input.press("Enter");
  snapshot = await service(page, "GetSnapshot");
  expect(snapshot.tasks.some((t: any) => t.title === "請")).toBe(true);
});

test("stable tabs, reversible today filter, continuous registration and uncommitted IME suggestions", async ({
  page,
}) => {
  await page.goto("/");
  const input = page.getByLabel("新しい付箋");
  await expect(input).toBeVisible();
  const category = await service(page, "SaveCategory", {
    id: 0,
    name: "復帰確認カテゴリ",
    color: "#ffffff",
    text_color: "#222222",
    sort_order: 0,
    dormant: false,
  });
  const task = await create(page, "カテゴリ復帰確認", {
    category_id: category.id,
  });
  const outside = await create(page, "カテゴリ外の今日", {});
  await service(page, "ToggleToday", outside.id);
  const tab = page.getByRole("button", {
    name: "復帰確認カテゴリ",
    exact: true,
  });
  await tab.click();
  await expect(
    page.locator("article").filter({ hasText: task.title }),
  ).toBeVisible();
  await page.getByRole("button", { name: "今日やる", exact: true }).click();
  await expect(
    page.locator("article").filter({ hasText: outside.title }),
  ).toBeVisible();
  await page.getByRole("button", { name: "今日やる", exact: true }).click();
  await expect(tab).toHaveClass(/active/);
  await expect(
    page.locator("article").filter({ hasText: task.title }),
  ).toBeVisible();
  await expect(
    page.locator("article").filter({ hasText: outside.title }),
  ).toHaveCount(0);
  const regular = page.getByRole("button", { name: "定期", exact: true });
  const before = await regular.boundingBox();
  await regular.click();
  await expect(input).toHaveAttribute("readonly", "");
  const after = await regular.boundingBox();
  expect(after?.y).toBe(before?.y);
  await page.getByRole("button", { name: "全て", exact: true }).click();
  await input.fill("連続登録一件目");
  await input.press("Enter");
  await expect(input).toHaveValue("");
  await expect(input).toBeFocused();
  await input.pressSequentially("second continuous task");
  await input.press("Enter");
  await expect(input).toHaveValue("");
  await expect(input).toBeFocused();
  for (let i = 0; i < 3; i++) await create(page, "日報作成");
  await input.evaluate((el: HTMLTextAreaElement) => el.blur());
  await input.click();
  await expect(
    page.getByRole("option", { name: "日報作成", exact: true }),
  ).toBeVisible();
  await input.dispatchEvent("compositionstart", { data: "" });
  await input.fill("にっ");
  await input.dispatchEvent("compositionupdate", { data: "にっ" });
  await expect(
    page.getByRole("option", { name: "日報作成", exact: true }),
  ).toBeVisible();
  await input.press("Enter");
  await expect(input).toHaveValue(/^にっ/);
  const snapshot = await service(page, "GetSnapshot");
  expect(snapshot.tasks.some((t: any) => t.title === "にっ")).toBe(false);
  await input.dispatchEvent("compositionend", { data: "日報" });
  await input.dispatchEvent("keyup", { key: "Enter" });
});

test("notification pause accepts relative periods and can be cleared; shortcut offers Space", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByLabel("新しい付箋")).toBeVisible();
  await page.getByRole("button", { name: "メニュー", exact: true }).click();
  await page.getByRole("button", { name: "設定", exact: true }).click();
  const panel = page
    .locator(".modal")
    .filter({ has: page.getByRole("heading", { name: "設定", exact: true }) });
  await expect(
    panel
      .getByLabel("ショートカットのキー")
      .locator('option[value="Space"], option')
      .filter({ hasText: /^Space$/ }),
  ).toHaveCount(1);
  await panel.getByRole("button", { name: "30分", exact: true }).click();
  const pause = panel.getByLabel("通知を一時停止（再開日時）");
  expect(
    new Date(await pause.inputValue()).getTime() - Date.now(),
  ).toBeGreaterThan(28 * 60000);
  await panel.getByRole("button", { name: "解除", exact: true }).click();
  await expect(pause).toHaveValue("");
  await panel.getByRole("button", { name: "今すぐ保存", exact: true }).click();
});
