import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
const base = process.env.UI_URL || "http://127.0.0.1:5197";
const api = process.env.BEATBOX_API_URL;
const out = "artifacts/generator/live-ui";
await mkdir(out, { recursive: true });
const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 1100 },
  });
  const errors = [],
    results = [],
    requests = [];
  page.on("pageerror", (error) => errors.push(error.message));
  if (api)
    await page.route("**/api/generate-step", async (route) => {
      const request = route.request();
      const response = await fetch(`${api}/api/generate-step`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: new URL(api).origin,
        },
        body: request.postData(),
      });
      await route.fulfill({
        status: response.status,
        contentType: "application/json",
        body: await response.text(),
      });
    });
  page.on("request", (request) => {
    if (request.url().endsWith("/api/generate-step"))
      requests.push(request.postDataJSON());
  });
  page.on("response", async (response) => {
    if (response.url().endsWith("/api/generate-step"))
      results.push(await response.json());
  });
  await page.goto(`${base}/make`);
  await page.getByRole("button", { name: "Make beat", exact: true }).click();
  await page
    .getByRole("button", { name: "Make another beat", exact: true })
    .waitFor({ timeout: 90000 });
  assert.equal(requests.length, 16);
  assert.equal(results.length, 16);
  for (let i = 0; i < 16; i++)
    assert.deepEqual(
      requests[i].history,
      results.slice(0, i).map((r) => r.step),
    );
  const active = await page.locator(".generator-cell.on").count();
  assert(active > 0, "Real model produced a silent reggae pattern");
  await page.getByRole("button", { name: "Play loop", exact: true }).click();
  await page.waitForTimeout(600);
  assert(await page.locator(".generator-step-number.current").count());
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "MIDI", exact: true }).click();
  const file = await download;
  await file.saveAs(`${out}/reggae.mid`);
  const bytes = await readFile(`${out}/reggae.mid`);
  assert.equal(bytes.subarray(0, 4).toString(), "MThd");
  await page.screenshot({ path: `${out}/desktop.png`, fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.screenshot({ path: `${out}/mobile.png`, fullPage: true });
  await page.getByRole("link", { name: "Audio to MIDI" }).click();
  await page.getByRole("link", { name: /Make a beat/ }).waitFor();
  assert.equal(errors.length, 0, errors.join("\n"));
  const result = {
    requests: requests.length,
    hits: active,
    inputTokens: results.reduce((s, r) => s + (r.inputTokens || 0), 0),
    errors,
    history: results.map((r) => r.step),
  };
  await writeFile(`${out}/result.json`, JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ ...result, history: undefined }, null, 2));
} finally {
  await browser.close();
}
