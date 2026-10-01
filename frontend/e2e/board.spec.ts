import { expect, test } from "@playwright/test";
test("sticky note, rich memo, deadline band, completion and reopen", async ({
  page,
}) => {
  await page.goto("/");
  const quick = page.getByLabel("新しい付箋");
  await expect(quick).toBeVisible();
  await quick.fill("業務メモをすばやく貼る");
  await quick.press("Enter");
  const card = page
    .locator("article")
    .filter({ hasText: "業務メモをすばやく貼る" });
  await expect(card).toBeVisible();
  await card.locator(".card-content").click();
  await page.getByLabel("期限日", { exact: true }).fill("2000-01-01");
  const memo = page.locator(".ProseMirror");
  await memo.fill("太字の業務メモ");
  await memo.press("Control+a");
  await page.getByTitle("太字 Ctrl+B").click();
  await expect(memo.locator("strong")).toHaveText("太字の業務メモ");
  await page.getByLabel("文字色").fill("#cc1122");
  await page.getByLabel("文字色").dispatchEvent("input");
  await page
    .locator(".memo input[type=file]")
    .setInputFiles({
      name: "example.png",
      mimeType: "image/png",
      buffer: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZXkAAAAASUVORK5CYII=",
        "base64",
      ),
    });
  await expect(memo.locator("img")).toBeVisible();
  await page.getByLabel("詳細を閉じる").click();
  await expect(page.getByLabel("期限の確認")).toContainText(
    "業務メモをすばやく貼る",
  );
  await page.reload();
  await card.locator(".card-content").click();
  await expect(memo.locator("strong")).toHaveText("太字の業務メモ");
  await expect(memo.locator("img")).toBeVisible();
  await page.getByRole("button", { name: "完了して外す", exact: true }).click();
  await expect(page.locator("article")).toHaveCount(0);
  await page.getByRole("button", { name: "✓ 完了・見送り" }).click();
  await page.locator("article .card-content").click();
  await page.getByRole("button", { name: "再開する", exact: true }).click();
  await page.getByRole("button", { name: /▤ ボード/ }).click();
  await expect(page.locator("article")).toHaveCount(1);
  await page.screenshot({ path: "test-results/board.png", fullPage: true });
});
test("recurring deadline is independent of previous-day reminder", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: /↻ 定期設定/ }).click();
  await page.getByRole("button", { name: "＋ 定期タスク" }).click();
  await page.getByLabel("付箋の内容", { exact: true }).fill("毎週の報告");
  await page
    .getByLabel("初回期限日")
    .fill(new Date().toISOString().slice(0, 10));
  await page.getByRole("button", { name: "定期設定を保存" }).click();
  await expect(page.locator(".series-row")).toContainText("毎週の報告");
  await page.getByRole("button", { name: /▤ ボード/ }).click();
  await expect(
    page.locator("article").filter({ hasText: "毎週の報告" }).first(),
  ).toBeVisible();
});
test("notification confirmation persists and never completes a note", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "設定", exact: true }).click();
  await page
    .getByRole("button", { name: "現在の保存済み設定で通知をテスト" })
    .click();
  const notice = await context.newPage();
  await notice.goto("/?window=notifications");
  await expect(
    notice.getByRole("heading", { name: /未確認の通知/ }),
  ).toBeVisible();
  await expect(
    notice.getByText("通知テスト — このウィンドウは確認するまで残ります"),
  ).toBeVisible();
  await notice.getByRole("button", { name: "すべて確認", exact: true }).click();
  await expect(
    notice.getByRole("heading", { name: "未確認の通知 0件" }),
  ).toBeVisible();
  await notice.reload();
  await expect(
    notice.getByRole("heading", { name: "未確認の通知 0件" }),
  ).toBeVisible();
  await notice.screenshot({ path: "test-results/notifications.png" });
});
