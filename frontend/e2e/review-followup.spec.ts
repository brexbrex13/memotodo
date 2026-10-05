import { expect, test } from "@playwright/test";
import { createServer } from "node:http";
import { AddressInfo } from "node:net";

const service = async (page: any, method: string, ...args: unknown[]) => {
  const response = await page.request.get(
    "/wails/runtime?object=0&method=0&args=" +
      encodeURIComponent(
        JSON.stringify({
          methodName: "main.App." + method,
          args,
          "call-id": "review-" + Math.random(),
        }),
      ),
  );
  const value = await response.json();
  if (value.error) throw new Error(JSON.stringify(value.error));
  return value.result ?? value;
};

test("category tabs wrap at minimum width and right click focuses the selected category", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("カテゴリを追加", { exact: true }).click();
  await expect(page.getByLabel("新しいカテゴリ名")).toBeFocused();
  await page.getByLabel("カテゴリ管理を閉じる").click();
  for (let i = 0; i < 9; i++)
    await service(page, "SaveCategory", {
      id: 0,
      name: `確認用カテゴリ${i}`,
      color: "#fffdf8",
      text_color: "#302d25",
      sort_order: 0,
      dormant: false,
    });
  await page.setViewportSize({ width: 360, height: 760 });
  await expect(
    page
      .locator(".category-tabs")
      .getByRole("button", { name: "確認用カテゴリ8", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(360);
  await page
    .locator(".category-tabs")
    .getByRole("button", { name: "確認用カテゴリ8", exact: true })
    .click({ button: "right" });
  await page
    .getByRole("menuitem", { name: "カテゴリ編集", exact: true })
    .click();
  await expect(page.getByLabel("確認用カテゴリ8の名前")).toBeFocused();
  await page.getByLabel("カテゴリ管理を閉じる").click();
  await page.screenshot({ path: "/tmp/memotodo-review-narrow.png" });
});

test("bulk trash is independent of search and empty trash permanently removes only trashed tasks", async ({
  page,
}) => {
  await page.goto("/");
  const create = (title: string, status: string) =>
    service(page, "SaveTask", {
      id: 0,
      version: 0,
      title,
      status,
      memo: "",
      deadline: "",
      reminder_at: "",
      category_id: 0,
      important: false,
    });
  const a = await create("一括削除確認A", "done");
  const b = await create("一括削除確認B", "done");
  const keep = await create("一括削除で残す未完了", "pending");
  await page.getByRole("button", { name: "完了済み", exact: true }).click();
  await page.getByLabel("検索", { exact: true }).click();
  await page.getByLabel("検索語", { exact: true }).fill("一括削除確認A");
  await page.getByLabel("検索語", { exact: true }).press("Enter");
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "完了済みをすべてごみ箱へ", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await service(page, "GetSnapshot")).tasks.find(
          (t: any) => t.id === a.id,
        ).deleted_at,
    )
    .not.toBe("");
  const moved = await service(page, "GetSnapshot");
  expect(moved.tasks.find((t: any) => t.id === a.id).deleted_at).toBeTruthy();
  expect(moved.tasks.find((t: any) => t.id === b.id).deleted_at).toBeTruthy();
  await page.getByRole("button", { name: "メニュー", exact: true }).click();
  await page.getByRole("button", { name: "ごみ箱", exact: true }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "ごみ箱を空にする", exact: true })
    .click();
  await expect
    .poll(async () =>
      (await service(page, "GetSnapshot")).tasks.some(
        (t: any) => t.id === a.id || t.id === b.id,
      ),
    )
    .toBe(false);
  await expect(
    page.getByRole("button", { name: "ごみ箱を空にする", exact: true }),
  ).toBeDisabled();
  const purged = await service(page, "GetSnapshot");
  expect(purged.tasks.some((t: any) => t.id === a.id || t.id === b.id)).toBe(
    false,
  );
  expect(purged.tasks.some((t: any) => t.id === keep.id && !t.deleted_at)).toBe(
    true,
  );
  await page.screenshot({ path: "/tmp/memotodo-review-trash.png" });
});

test("AI failure stops requests, ordinary registration works and connection check resumes AI", async ({
  page,
}) => {
  let healthy = false,
    calls = 0;
  const server = createServer((req, res) => {
    req.resume();
    req.on("end", () => {
      calls++;
      if (!healthy) {
        res.writeHead(503);
        res.end();
        return;
      }
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  ok: true,
                  important: true,
                  deadline: "tomorrow",
                  reminder: "off",
                }),
              },
              finish_reason: "stop",
            },
          ],
        }),
      );
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  try {
    await page.goto("/");
    const snapshot = await service(page, "GetSnapshot");
    await service(page, "SaveSettings", {
      ...snapshot.settings,
      smart_add: true,
      jev_provider: "local",
      jev_custom_url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`,
      jev_custom_model: "review-local",
      ai_timeout_seconds: 2,
    });
    await page.reload();
    const input = page.getByLabel("新しい付箋");
    await input.fill("接続失敗を確認する入力");
    await expect(page.locator(".smart-hints")).toContainText(
      "通常登録に切り替え",
    );
    expect(calls).toBe(1);
    await input.fill("通信せず通常登録する入力");
    await page.waitForTimeout(600);
    expect(calls).toBe(1);
    await input.press("Enter");
    await expect(
      page.locator(".task-row").filter({ hasText: "通信せず通常登録する入力" }),
    ).toBeVisible();
    healthy = true;
    await page.getByRole("button", { name: "メニュー", exact: true }).click();
    await page.getByRole("button", { name: "設定", exact: true }).click();
    await page.getByRole("button", { name: "接続確認", exact: true }).click();
    await expect(page.locator(".jev-key")).toContainText("接続できました");
    await page.getByRole("button", { name: "今すぐ保存", exact: true }).click();
    await input.fill("再接続後の入力");
    await expect(page.getByLabel("推定した初期値")).toContainText("重要");
    const latest = await service(page, "GetSnapshot");
    await service(page, "SaveSettings", {
      ...latest.settings,
      smart_add: false,
    });
  } finally {
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
  }
});

test("list context menus edit categories and follow task state without opening the category menu", async ({
  page,
}) => {
  await page.goto("/");
  const category = await service(page, "SaveCategory", {
    id: 0,
    name: "右クリック確認",
    color: "#fffdf8",
    text_color: "#302d25",
    sort_order: 0,
    dormant: false,
  });
  const task = await service(page, "SaveTask", {
    id: 0,
    version: 0,
    title: "右クリック用タスク",
    status: "pending",
    memo: "",
    deadline: "",
    reminder_at: "",
    category_id: category.id,
    important: false,
  });
  await page.reload();
  const group = page.getByRole("region", {
    name: "右クリック確認",
    exact: true,
  });
  await group.locator(".category-caption").click({ button: "right" });
  await page
    .getByRole("menuitem", { name: "カテゴリ編集", exact: true })
    .click();
  await expect(page.getByLabel("右クリック確認の名前")).toBeFocused();
  await page.getByLabel("カテゴリ管理を閉じる").click();
  const row = page
    .locator(".task-row")
    .filter({ hasText: "右クリック用タスク" });
  await row.click({ button: "right" });
  await expect(
    page.getByRole("menuitem", { name: "カテゴリ編集", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("menuitem", { name: "詳細を開く", exact: true }).click();
  await expect(
    page.getByRole("complementary", { name: "タスクの詳細" }),
  ).toBeVisible();
  await page.getByLabel("詳細の外側を閉じる").click();
  await row.click({ button: "right" });
  await page.getByRole("menuitem", { name: "完了にする", exact: true }).click();
  await page.getByRole("button", { name: "完了済み", exact: true }).click();
  await expect(row).toBeVisible();
  await row.click({ button: "right" });
  await expect(
    page.getByRole("menuitem", { name: "未完了に戻す", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("menuitem", { name: "ごみ箱へ送る", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await service(page, "GetSnapshot")).tasks.find(
          (t: any) => t.id === task.id,
        ).deleted_at,
    )
    .not.toBe("");
  await page.getByRole("button", { name: "メニュー", exact: true }).click();
  await page.getByRole("button", { name: "ごみ箱", exact: true }).click();
  await row.click({ button: "right" });
  await expect(
    page.getByRole("menuitem", { name: "完了にする", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("menuitem", { name: "ごみ箱から戻す", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await service(page, "GetSnapshot")).tasks.find(
          (t: any) => t.id === task.id,
        ).deleted_at,
    )
    .toBe("");
  await page.getByRole("button", { name: "完了済み", exact: true }).click();
  await row.click({ button: "right" });
  await page
    .getByRole("menuitem", { name: "未完了に戻す", exact: true })
    .click();
  await page.getByRole("button", { name: "一覧に戻る", exact: true }).click();
  await expect(row).toBeVisible();
  await page.setViewportSize({ width: 360, height: 760 });
  await row.click({ button: "right", position: { x: 280, y: 20 } });
  const menu = page.getByRole("menu", { name: "タスクの操作" });
  const box = await menu.boundingBox();
  expect(box!.x + box!.width).toBeLessThanOrEqual(360);
  expect(box!.y + box!.height).toBeLessThanOrEqual(760);
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
});
