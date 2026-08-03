import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

test("本地冷启动十次均在需求阈值内", async ({ browser }, testInfo) => {
  const baseURL = testInfo.project.use.baseURL;
  const samples = [];
  for (let index = 0; index < 10; index += 1) {
    const context = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    await page.addInitScript(() => localStorage.clear());
    const startedAt = Date.now();
    await page.goto(baseURL);
    await page.waitForFunction(() => globalThis.__mouseStrikeMiniGame?.state?.scene === "hangar");
    samples.push(Date.now() - startedAt);
    await context.close();
  }
  const sorted = [...samples].sort((a, b) => a - b);
  const medianMs = sorted[Math.floor(sorted.length / 2)];
  const p90Ms = sorted[Math.ceil(sorted.length * 0.9) - 1];
  const report = { generatedAt: new Date().toISOString(), environment: "local Chromium preview", samplesMs: samples, medianMs, p90Ms };
  const reports = resolve(process.cwd(), "reports");
  await mkdir(reports, { recursive: true });
  await writeFile(resolve(reports, "local-startup-report.json"), `${JSON.stringify(report, null, 2)}\n`);
  expect(medianMs).toBeLessThanOrEqual(6000);
  expect(p90Ms).toBeLessThanOrEqual(10000);
});
