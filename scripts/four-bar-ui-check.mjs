import { chromium } from "@playwright/test";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
const base = process.env.UI_URL || "http://127.0.0.1:5197";
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  if (!process.env.LIVE)
    await page.route("**/api/generate-step", async (route) =>
      route.fulfill({
        json: JSON.parse(
          await readFile("artifacts/four-bar/fill3.json", "utf8"),
        ),
      }),
    );
  await page.goto(base + "/make");
  await page
    .getByRole("textbox", { name: "Your groove" })
    .fill("Classic four on the floor beat with a fill on bar 3");
  await page.getByRole("button", { name: "Make & play", exact: true }).click();
  await page
    .getByRole("button", { name: "Stop", exact: true })
    .waitFor({ timeout: 60000 });
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  await page.getByRole("button", { name: "Bar 3", exact: true }).click();
  assert.match(
    await page.locator(".generator-pattern .generator-direction").innerText(),
    /Fill/,
  );
  await page.getByRole("button", { name: "Bar 4", exact: true }).click();
  assert.doesNotMatch(
    await page.locator(".generator-pattern .generator-direction").innerText(),
    /Fill/,
  );
  for (const kit of ["electronic", "acoustic", "dusty", "funk", "reggae"]) {
    await page.getByLabel("Drum kit").selectOption(kit);
    await page.getByRole("button", { name: "Play loop", exact: true }).click();
    await page.getByRole("button", { name: "Stop", exact: true }).click();
  }
  const oldCells = await page
    .locator(".generator-cell")
    .evaluateAll((nodes) => nodes.map((n) => n.getAttribute("aria-label")));
  await page
    .getByRole("textbox", { name: "Amend your beat" })
    .fill("Add a closed hi hat on bar 3 beat 2e only");
  if (!process.env.LIVE)
    await page.route("**/api/generate-step", async (route) => {
      const body = route.request().postDataJSON();
      const groove = structuredClone(body.amend);
      groove.steps[37].closed = 56;
      await route.fulfill({
        json: {
          groove,
          edits: [{ step: 37, drum: "closed", before: 0, after: 56 }],
          modelCalls: 3,
        },
      });
    });
  await page.getByRole("button", { name: "Apply edit", exact: true }).click();
  await page
    .getByText(
      "1 cell changed. Everything else preserved. Press Play to listen.",
      { exact: true },
    )
    .waitFor({ timeout: 60000 });
  await page.getByRole("button", { name: "Bar 3", exact: true }).click();
  assert.match(
    await page
      .getByRole("button", { name: /Closed hat, step 38:/ })
      .getAttribute("aria-label"),
    /velocity 56/,
  );
  await page.getByRole("button", { name: "Undo edit", exact: true }).click();
  await page.getByRole("button", { name: "Bar 4", exact: true }).click();
  assert.deepEqual(
    await page
      .locator(".generator-cell")
      .evaluateAll((nodes) => nodes.map((n) => n.getAttribute("aria-label"))),
    oldCells,
  );
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "MIDI", exact: true }).click();
  await mkdir("artifacts/four-bar", { recursive: true });
  await (await download).saveAs("artifacts/four-bar/export.mid");
  await page.screenshot({
    path: "artifacts/four-bar/desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page.screenshot({
    path: "artifacts/four-bar/mobile.png",
    fullPage: true,
  });
  if (!process.env.LIVE) {
    const rendering = await page.evaluate(async () => {
      const { grooveSound } = await import("/src/groove-audio.ts");
      const results = {};
      for (const kit of ["electronic", "acoustic", "dusty", "funk", "reggae"]) {
        const ctx = new OfflineAudioContext(1, 48000 * 2, 48000);
        grooveSound(ctx, "kick", 0, 104, kit);
        grooveSound(ctx, "snare", 0.5, 104, kit);
        grooveSound(ctx, "closed", 1, 80, kit);
        const b = await ctx.startRendering();
        const data = b.getChannelData(0);
        results[kit] = {
          energy: data.reduce((s, v) => s + v * v, 0),
          peak: data.reduce((s, v) => Math.max(s, Math.abs(v)), 0),
        };
      }
      return results;
    });
    assert.equal(
      new Set(Object.values(rendering).map((x) => x.energy.toFixed(3))).size,
      5,
    );
    assert.ok(
      Object.values(rendering).every((x) => x.energy > 0 && x.peak < 1),
    );
    await writeFile(
      "artifacts/four-bar/kit-renders.json",
      JSON.stringify(rendering, null, 2),
    );
  }
  assert.deepEqual(errors, []);
  console.log(
    "Passed: bar-specific fill, five kit overrides/playback, MIDI download, mobile layout, no browser errors.",
  );
} finally {
  await browser.close();
}
