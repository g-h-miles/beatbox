import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
const baseUrl = process.argv[2] || "http://127.0.0.1:5197";
const output = process.env.BEATBOX_QA_OUTPUT || "artifacts/generator-ui";
fs.mkdirSync(output, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
const intent = {
  foundation: "one_drop",
  timekeeping: "offbeat_eighths",
  voice: "closed",
  variation: "subtle",
  syncopation: "offbeats",
};
let calls = [];
let transientFailures = 0;
let failedHistory;
let backoffTest = false;
let attemptCount = 0;
await page.route("**/api/generate-step", async (route) => {
  const body = route.request().postDataJSON();
  attemptCount++;
  if (!transientFailures && body.history.length === 5) {
    failedHistory = body.history;
    transientFailures++;
    await route.fulfill({
      status: 503,
      headers: { "Retry-After": "0" },
      json: { error: "Temporarily unavailable", retryable: true },
    });
    return;
  }
  if (calls.length >= 16 && body.history.length === 1 && !backoffTest) {
    backoffTest = true;
    await route.fulfill({
      status: 503,
      headers: { "Retry-After": "60" },
      json: { error: "Temporarily unavailable", retryable: true },
    });
    return;
  }
  calls.push(body);
  await new Promise((r) => setTimeout(r, 30));
  await route.fulfill({
    json: {
      step: {
        kick: body.history.length % 4 === 0 ? 104 : 0,
        snare: body.history.length % 8 === 4 ? 80 : 0,
        closed: body.history.length % 2 === 0 ? 56 : 0,
        open: 0,
        ride: 0,
        crash: 0,
        aux: 0,
      },
      inputTokens: 234,
      intent,
      modelCalls: body.history.length ? 1 : 2,
    },
  });
});
await page.goto(`${baseUrl}/make`);
await page.screenshot({ path: path.join(output, "desktop.png") });
if ((await page.getByLabel("Length", { exact: true }).inputValue()) !== "8")
  throw Error("Default length must be eight bars");
if (
  (await page.getByLabel("Note division", { exact: true }).inputValue()) !==
  "16"
)
  throw Error("Default resolution must be sixteenths");
await page.getByLabel("Length", { exact: true }).selectOption("1");
await page.getByRole("button", { name: "Make beat", exact: true }).click();
await page.getByRole("button", { name: "Make another beat" }).waitFor();
if (
  calls.length !== 16 ||
  calls.some(
    (c, i) => c.history.length !== i || c.bars !== 1 || c.resolution !== 16,
  )
)
  throw Error("history chain broken");
if (
  calls[0].intent ||
  calls
    .slice(1)
    .some((c) => JSON.stringify(c.intent) !== JSON.stringify(intent))
)
  throw Error("Intent not preserved between steps");
await page
  .getByLabel("TypeSafe musical direction")
  .filter({ hasText: "one drop" })
  .waitFor();
if (
  !(await page
    .locator(".generator-foot")
    .innerText()
    .then((s) => s.includes("17 completed model calls")))
)
  throw Error("Model calls not counted");
if (JSON.stringify(failedHistory) !== JSON.stringify(calls[5].history))
  throw Error("Transient retry changed history");
await page.getByRole("button", { name: "Play loop", exact: true }).click();
await page.waitForTimeout(2900); // One full bar at 90 BPM; playback must still loop.
await page.getByRole("button", { name: "Stop", exact: true }).click();
const download = page.waitForEvent("download");
await page.getByRole("button", { name: "MIDI", exact: true }).click();
const file = await download;
await file.saveAs(path.join(output, "preview.mid"));
await page
  .getByRole("button", { name: "Kick, bar 1, step 1:", exact: false })
  .click();
await page.screenshot({ path: path.join(output, "filled.png") });
await page.setViewportSize({ width: 390, height: 844 });
await page.screenshot({ path: path.join(output, "mobile.png") });
const overflow = await page.evaluate(
  () => document.documentElement.scrollWidth > innerWidth,
);
if (overflow) throw Error("page overflow");
await page.getByLabel("Length", { exact: true }).selectOption("8");
await page.getByLabel("Note division", { exact: true }).selectOption("64");
await page.getByRole("button", { name: "Bar 8", exact: true }).click();
await page
  .getByRole("button", { name: "Kick, bar 8, step 64:", exact: false })
  .click();
await page.screenshot({ path: path.join(output, "mobile64.png") });
const longDownload = page.waitForEvent("download");
await page.getByRole("button", { name: "MIDI", exact: true }).click();
await (await longDownload).saveAs(path.join(output, "eight-bars-64th.mid"));
await page.getByLabel("Length", { exact: true }).selectOption("1");
await page.getByLabel("Note division", { exact: true }).selectOption("8");
await page.getByRole("button", { name: "Make beat", exact: true }).click();
await page.waitForFunction(
  () =>
    Number(
      document
        .querySelector(".generator-foot")
        ?.textContent?.match(/(\d+) completed model calls/)?.[1] || 0,
    ) > 0,
);
await page
  .getByRole("status")
  .filter({ hasText: "Taking a short pause" })
  .waitFor();
await page.getByRole("button", { name: "Stop generating" }).click();
const attemptsAtCancel = attemptCount;
await page.waitForTimeout(1200);
if (attemptCount !== attemptsAtCancel)
  throw Error("Cancel did not stop retry backoff");
await page.getByRole("button", { name: /Continue from bar/ }).waitFor();
await page.getByRole("button", { name: /Continue from bar/ }).click();
await page.getByRole("button", { name: "Make another beat" }).waitFor();
await page.screenshot({ path: path.join(output, "mobile-resumed.png") });
if (
  calls
    .slice(17)
    .some(
      (c) =>
        c.history.length && JSON.stringify(c.intent) !== JSON.stringify(intent),
    )
)
  throw Error("Intent lost after resume");
await page.goto(baseUrl);
await page.getByRole("link", { name: "Make a beat" }).waitFor();
await page.screenshot({ path: path.join(output, "home-mobile.png") });
if (errors.length) throw Error(errors.join("\n"));
console.log(
  "PASS sequential history, transient503retry, generation, edit, playback, MIDI, cancel/resume, mobile overflow",
);
await browser.close();
