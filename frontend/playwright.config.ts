import { defineConfig } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const dir = mkdtempSync(join(tmpdir(), "memotodo-e2e-"));
export default defineConfig({
  testDir: "e2e",
  workers: 1,
  timeout: 30000,
  use: {
    baseURL: "http://127.0.0.1:18991",
    headless: true,
    channel: process.env.MEMOTODO_CHROME ? "chrome" : undefined,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: process.env.MEMOTODO_SERVER ?? "/tmp/memotodo-server",
    url: "http://127.0.0.1:18991",
    reuseExistingServer: false,
    env: {
      MEMOTODO_DATA_DIR: dir,
      WAILS_SERVER_HOST: "127.0.0.1",
      WAILS_SERVER_PORT: "18991",
    },
  },
});
