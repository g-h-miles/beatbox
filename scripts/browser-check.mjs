import { chromium } from "@playwright/test";
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
page.on("pageerror", (e) => errors.push(e.message));
await page.setViewportSize({ width: 1440, height: 1100 });
await page.goto("http://localhost:8787");
await page.getByRole("heading", { name: /Good beats/ }).waitFor();
await page.screenshot({ path: "artifacts/desktop-empty.png", fullPage: true });
await page.getByRole("button", { name: "Try a demo groove" }).click();
await page.waitForFunction(
  () => document.querySelectorAll(".hit-row").length > 0,
);
console.log("Demo detected hits:", await page.locator(".hit-row").count());
await page.locator(".hit-row").first().click();
await page.getByLabel("Sound", { exact: true }).selectOption("snare");
await page.getByLabel("Time (seconds)").fill("0.237");
await page.getByLabel("Velocity", { exact: true }).fill("111");
await page.getByRole("button", { name: "Original", exact: true }).click();
await page.waitForTimeout(150);
await page.getByRole("button", { name: "Original", exact: true }).click();
await page.getByRole("button", { name: "Drum preview", exact: true }).click();
await page.waitForTimeout(150);
await page.getByRole("button", { name: "Drum preview", exact: true }).click();
const downloadPromise = page.waitForEvent("download");
await page.getByRole("button", { name: "Download MIDI" }).click();
const download = await downloadPromise;
await (await download).saveAs("artifacts/demo.mid");
await page.screenshot({
  path: "artifacts/desktop-session.png",
  fullPage: true,
});
for (const width of [390, 768, 1920]) {
  await page.setViewportSize({ width, height: 1000 });
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    `overflow at ${width}`,
  );
  await page.screenshot({
    path: `artifacts/session-${width}.png`,
    fullPage: true,
  });
}
await page.setViewportSize({ width: 1440, height: 1100 });
await page.getByRole("button", { name: "Record a beat" }).click();
await page.getByRole("button", { name: "Stop recording" }).waitFor();
await page.waitForTimeout(700);
await page.getByRole("button", { name: "Stop recording" }).click();
await page.waitForFunction(() =>
  document.querySelector(".session-bar")?.textContent.includes("Mic take"),
);
console.log("Microphone recording/decode passed");
assert.deepEqual(errors, []);
await browser.close();
console.log("Browser checks passed.");
