import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 1440, height: 1100 },
  acceptDownloads: true,
});
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.route("**/api/status", (r) =>
  r.fulfill({ json: { configured: true } }),
);
await page.route("**/api/classify", (r) => {
  const request = r.request().postDataJSON();
  return r.fulfill({
    json: {
      answers: request.hits.map((h) => ({
        id: h.id,
        drum: "snare",
        confidence: 0.02,
        probabilities: { kick: 0.45, snare: 0.55 },
      })),
    },
  });
});
await page.goto(process.env.UI_URL || "http://localhost:5175");
await page.getByRole("button", { name: "Try a demo groove" }).click();
await page.locator(".hit-row").first().click();
await page.locator(".groove-controls summary").click();
await page
  .getByRole("button", { name: "Selected hit is beat 1", exact: true })
  .click();
await page.getByRole("button", { name: /Classify with TypeSafe/ }).click();
await page
  .getByText(
    "TypeSafe pass complete. Play the preview and check any wrong sounds.",
    { exact: true },
  )
  .waitFor();
assert.match(
  await page.locator(".groove-controls [role=status]").textContent(),
  /[1-9]\d* labels? adjusted/,
);
assert.equal(
  await page.getByLabel("Sound", { exact: true }).inputValue(),
  "kick",
);
const time = await page.getByLabel("Time (seconds)").inputValue();
await page.getByLabel("Use 4/4 groove hints").uncheck();
assert.equal(
  await page.getByLabel("Sound", { exact: true }).inputValue(),
  "snare",
);
assert.equal(await page.getByLabel("Time (seconds)").inputValue(), time);
await page.getByLabel("Use 4/4 groove hints").check();
assert.equal(
  await page.getByLabel("Sound", { exact: true }).inputValue(),
  "kick",
);
await page.getByLabel("Sound", { exact: true }).selectOption("snare");
await page.getByLabel("Use 4/4 groove hints").uncheck();
await page.getByLabel("Use 4/4 groove hints").check();
assert.equal(
  await page.getByLabel("Sound", { exact: true }).inputValue(),
  "snare",
);
await page.getByRole("button", { name: "Estimate tempo", exact: true }).click();
const download = page.waitForEvent("download");
await page.getByRole("button", { name: "Download MIDI" }).click();
await (await download).saveAs("artifacts/rhythm-demo.mid");
for (const width of [390, 768, 1440, 1920]) {
  await page.setViewportSize({ width, height: 1100 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page.screenshot({
    path: `artifacts/rhythm-${width}.png`,
    fullPage: true,
  });
}
assert.deepEqual(errors, []);
await browser.close();
console.log(
  "Rhythm UI: reversible hints, manual labels, unchanged times, MIDI, responsive layouts passed.",
);
