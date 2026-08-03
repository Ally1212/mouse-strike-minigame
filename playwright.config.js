import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  workers: 1,
  reporter: "line",
  use: {
    baseURL: "http://127.0.0.1:4188",
    viewport: { width: 375, height: 812 },
    deviceScaleFactor: 1,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run preview",
    url: "http://127.0.0.1:4188/",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
