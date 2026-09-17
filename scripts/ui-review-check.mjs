import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdirSync, readFileSync } from "node:fs";
const base = process.env.UI_URL || "http://127.0.0.1:5182";
const out = "artifacts/ui-review";
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  args: [
    "--use-fake-device-for-media-stream",
    "--use-fake-ui-for-media-stream",
  ],
});
const context = await browser.newContext({
  permissions: ["microphone"],
  reducedMotion: "reduce",
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.route("**/api/status", (r) =>
  r.fulfill({ json: { configured: true } }),
);
await page.route("**/api/classify", async (r) => {
  const body = r.request().postDataJSON();
  await r.fulfill({
    json: {
      answers: body.hits.map((h) => ({
        id: h.id,
        drum: "snare",
        confidence: 0.72,
      })),
    },
  });
});
await page.goto(base);
await page.getByRole("button", { name: "How it works" }).click();
assert.equal(
  await page
    .getByRole("button", { name: "How it works" })
    .getAttribute("aria-expanded"),
  "true",
);
await page.keyboard.press("Escape");
assert.equal(
  await page.evaluate(() => document.activeElement.textContent.trim()),
  "How it works",
);
await page.getByRole("button", { name: "Try a demo groove" }).click();
await page.waitForFunction(
  () => document.querySelectorAll(".hit-row").length > 0,
);
await page.getByRole("button", { name: "Original", exact: true }).click();
await page.getByRole("button", { name: "Original", exact: true }).click();
await page.getByRole("button", { name: "Drum preview", exact: true }).click();
await page.getByRole("button", { name: "Drum preview", exact: true }).click();
await page.getByRole("button", { name: "Classify sounds" }).click();
await page
  .getByRole("status")
  .filter({ hasText: "Classification complete" })
  .waitFor();
await page.locator(".hit-row").first().click();
await page.getByLabel("Sound", { exact: true }).selectOption("kick");
assert((await page.locator(".hit-row").first().innerText()).includes("Kick"));
await page.getByRole("button", { name: "Hear slice" }).click();
await page.locator(".groove-controls summary").click();
await page.getByRole("button", { name: "Selected hit is beat 1" }).click();
await page.getByRole("button", { name: "Reset beat 1" }).waitFor();
await page.locator(".groove-controls summary").click();
for (const width of [390, 768, 1440, 1920]) {
  await page.setViewportSize({ width, height: width === 390 ? 844 : 1080 });
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    `overflow at ${width}`,
  );
  await page.screenshot({ path: `${out}/loaded-${width}.png`, fullPage: true });
}
const download = page.waitForEvent("download");
await page.getByRole("button", { name: "Download MIDI" }).click();
const d = await download;
await d.saveAs(`${out}/preview.mid`);
assert.equal(
  readFileSync(`${out}/preview.mid`).subarray(0, 4).toString(),
  "MThd",
);
await page
  .locator("input[type=file]")
  .setInputFiles({
    name: "bad.wav",
    mimeType: "audio/wav",
    buffer: Buffer.from("bad"),
  });
await page.getByRole("status").filter({ hasText: "decode" }).waitFor();
await page.getByRole("button", { name: "Record a beat" }).click();
await page.getByRole("button", { name: "Stop recording" }).waitFor();
await new Promise((r) => setTimeout(r, 1500));
await page.getByRole("button", { name: "Stop recording" }).click();
await page.waitForFunction(() =>
  document.querySelector(".session-bar").textContent.includes("Mic take"),
);
await page.screenshot({ path: `${out}/recorded.png`, fullPage: true });
assert.deepEqual(errors, []);
await browser.close();
console.log(
  "UI review passed: demo, preview, mocked classification, edit, groove disclosure, MIDI bytes, upload error, microphone recording, Escape focus, four viewport widths.",
);
