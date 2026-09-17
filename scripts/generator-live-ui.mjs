import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { scorePattern } from "./generator-score.mjs";
const base = process.env.UI_URL || "http://127.0.0.1:5197";
const api = process.env.BEATBOX_API_URL;
const bars = Number(process.env.BEATBOX_BARS || 8);
const resolution = Number(process.env.BEATBOX_RESOLUTION || 16);
const steps = bars * resolution;
const prompt =
  "Kick on beats 1 and 3, snare on beats 2 and 4, closed hi-hat on every eighth note. Repeat for all bars. No fills or other instruments.";
const out = `artifacts/generator/live-ui-${bars}bars-${resolution}`;
await mkdir(out, { recursive: true });
const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 1100 },
  });
  const errors = [],
    results = [],
    requests = [];
  let failEarly;
  const musicalFailure = new Promise((_, reject) => {
    failEarly = reject;
  });
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
        headers: { "Retry-After": response.headers.get("Retry-After") || "2" },
      });
    });
  page.on("request", (request) => {
    if (request.url().endsWith("/api/generate-step"))
      requests.push(request.postDataJSON());
  });
  page.on("response", async (response) => {
    if (!response.url().endsWith("/api/generate-step")) return;
    try {
      results.push({ status: response.status(), ...(await response.json()) });
      const completed = results.filter((r) => r.status === 200);
      if (response.status() === 200 && completed.length % resolution === 0) {
        const history = completed.map((r) => r.step);
        const score = scorePattern(history, resolution);
        await writeFile(
          `${out}/checkpoint.json`,
          JSON.stringify(
            {
              prompt,
              bars,
              resolution,
              history,
              score,
              intent: completed.at(-1)?.intent,
            },
            null,
            2,
          ),
        );
        console.log(
          `Bar ${completed.length / resolution}/${bars}: ${completed.length}/${steps} positions; requested-note F1=${score.f1.toFixed(3)}`,
        );
        if (score.f1 < 0.95)
          failEarly(
            new Error(
              `Musical check failed after bar ${completed.length / resolution}: ${score.correct}/${score.expected} requested notes, ${score.extra.length} extras`,
            ),
          );
      }
    } catch (error) {
      failEarly(error);
    }
  });
  await page.goto(`${base}/make`);
  await page.getByLabel("Your groove").fill(prompt);
  await page.getByLabel("Length", { exact: true }).selectOption(String(bars));
  await page.getByLabel("Note division").selectOption(String(resolution));
  await page.getByRole("button", { name: "Make beat", exact: true }).click();
  await Promise.race([
    page
      .getByRole("button", { name: "Make another beat", exact: true })
      .waitFor({ timeout: 900000 }),
    musicalFailure,
  ]);
  const succeeded = results.filter((r) => r.status === 200);
  assert.equal(
    succeeded.length,
    steps,
    JSON.stringify(results.filter((r) => r.status !== 200)),
  );
  for (const request of requests) {
    assert.equal(request.bars, bars);
    assert.equal(request.resolution, resolution);
    if (request.history.length)
      assert.deepEqual(request.intent, succeeded[0].intent);
    assert.deepEqual(
      request.history,
      succeeded.slice(0, request.history.length).map((r) => r.step),
    );
  }
  const history = succeeded.map((r) => r.step);
  const score = scorePattern(history, resolution);
  await writeFile(
    `${out}/musical-score.json`,
    JSON.stringify({ prompt, bars, resolution, history, score }, null, 2),
  );
  assert(
    score.f1 >= 0.95,
    `Requested musical positions F1=${score.f1}: ${JSON.stringify(score)}`,
  );
  const active = score.actual;
  await page.getByRole("button", { name: "Play loop", exact: true }).click();
  await page.waitForTimeout(600);
  assert(await page.locator(".generator-step-number.current").count());
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "MIDI", exact: true }).click();
  const file = await download;
  await file.saveAs(`${out}/pattern.mid`);
  const bytes = await readFile(`${out}/pattern.mid`);
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
    bars,
    resolution,
    intent: succeeded.at(-1)?.intent,
    modelCalls: succeeded.reduce((sum, r) => sum + (r.modelCalls || 1), 0),
    score,
    inputTokens: succeeded.reduce((s, r) => s + (r.inputTokens || 0), 0),
    errors,
    history,
  };
  await writeFile(`${out}/result.json`, JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ ...result, history: undefined }, null, 2));
} finally {
  await browser.close();
}
