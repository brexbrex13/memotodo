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
