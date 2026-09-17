import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
const browser = await chromium.launch({
  headless: true,
  args: [
    "--use-fake-ui-for-media-stream",
    "--use-fake-device-for-media-stream",
  ],
});
const context = await browser.newContext({
  permissions: ["microphone"],
  acceptDownloads: true,
});
const page = await context.newPage();
const errors = [];
const uploads = [];
page.on("request", (request) => {
  if (request.method() === "POST") uploads.push(request.url());
});
page.on("pageerror", (e) => errors.push(e.message));
await page.goto("http://localhost:5175/teach");
await page.getByRole("heading", { name: "Let’s learn your sounds." }).waitFor();
assert.equal(await page.locator("progress").getAttribute("max"), "60");
assert.ok(
  await page.getByRole("button", { name: "Training", exact: true }).isVisible(),
);
for (const width of [390, 768, 1440, 1920]) {
  await page.setViewportSize({ width, height: 1100 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page.screenshot({
    path: `artifacts/ml-v2/training-${width}.png`,
    fullPage: true,
  });
}
await page.getByRole("button", { name: "Record kick", exact: true }).click();
await page
  .getByRole("button", { name: "Stop recording", exact: true })
  .waitFor();
await page.waitForTimeout(16000);
assert.ok(
  await page
    .getByRole("button", { name: "Stop recording", exact: true })
    .isVisible(),
);
await page.getByRole("button", { name: "Stop recording", exact: true }).click();
await page
  .getByRole("status")
  .filter({ hasText: "saved on this device" })
  .waitFor();
await page.getByRole("button", { name: "Separate check", exact: true }).click();
await page.getByRole("button", { name: "Record kick", exact: true }).click();
await page
  .getByRole("button", { name: "Stop recording", exact: true })
  .waitFor();
await page.waitForTimeout(1200);
await page.getByRole("button", { name: "Stop recording", exact: true }).click();
await page
  .getByRole("status")
  .filter({ hasText: "separate check, saved on this device" })
  .waitFor();
const downloaded = page.waitForEvent("download");
await page.getByRole("button", { name: "Download training pack" }).click();
const download = await downloaded;
await download.saveAs("artifacts/ml-v2/capture-test.json");
const pack = JSON.parse(
  readFileSync("artifacts/ml-v2/capture-test.json", "utf8"),
);
assert.equal(pack.format, "beatbox-training-v1");
assert.deepEqual(
  pack.recordings.map((r) => r.split),
  ["training", "holdout"],
);
assert.ok(
  pack.recordings.every((r) => r.audioBase64.length > 100 && r.duration >= 0.5),
);
await page.reload();
await page
  .getByText("1 of 7 training recordings saved · 1 separate checks", {
    exact: true,
  })
  .waitFor();
assert.deepEqual(errors, []);
assert.deepEqual(uploads, []);
const denied = await browser.newContext();
const deniedPage = await denied.newPage();
await deniedPage.addInitScript(() => {
  navigator.mediaDevices.getUserMedia = async () => {
    throw new DOMException("Denied", "NotAllowedError");
  };
});
await deniedPage.goto("http://localhost:5175/teach");
await deniedPage
  .getByRole("button", { name: "Record kick", exact: true })
  .click();
await deniedPage
  .getByRole("status")
  .filter({ hasText: "Allow microphone access" })
  .waitFor();
assert.ok(
  await deniedPage
    .getByRole("button", { name: "Record kick", exact: true })
    .isEnabled(),
);
await denied.close();
console.log(
  "Training capture: responsive layouts, microphone, both splits, persistence and download passed.",
);
await browser.close();
