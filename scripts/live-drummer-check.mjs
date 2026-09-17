import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
const base = process.env.UI_URL || "http://127.0.0.1:5197";
const api = process.env.BEATBOX_URL || "http://127.0.0.1:8791";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
const errors = [],
  requests = [],
  responses = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.route("**/api/generate-step", async (route) => {
  const body = route.request().postData();
  requests.push({ time: Date.now(), ...JSON.parse(body) });
  const start = performance.now();
  try {
    const r = await fetch(api + "/api/generate-step", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: new URL(api).origin,
      },
      body,
    });
    const data = await r.text();
    responses.push({
      prompt: JSON.parse(body).prompt,
      ms: performance.now() - start,
      status: r.status,
      ...JSON.parse(data),
    });
    await route.fulfill({
      status: r.status,
      contentType: "application/json",
      body: data,
    });
  } catch (e) {
    await route.abort().catch(() => {});
  }
});
await mkdir("artifacts/live-drummer", { recursive: true });
await page.goto(base + "/make");
await page
  .getByLabel("Your groove")
  .fill(
    "Kick on beats 1 and 3, snare on beats 2 and 4, closed hi-hat on every eighth note. No fills or other instruments.",
  );
await page.getByRole("button", { name: "Start drummer", exact: true }).click();
await page.waitForTimeout(6500);
await page.screenshot({ path: "artifacts/live-drummer/desktop.png" });
const playingText = await page.locator("main").innerText();
await page
  .getByLabel("Your groove")
  .fill(
    "Play only a kick drum on every numbered beat. No snare, hats, cymbals or other instruments.",
  );
await page.getByLabel("Your groove").press("Enter");
await page.waitForTimeout(8500);
await page.getByRole("button", { name: "Stop drummer", exact: true }).click();
if (!responses.some((r) => r.status === 200 && r.steps))
  errors.push("No real drum decisions returned");
const changed = responses.filter(
  (r) =>
    r.status === 200 && r.steps && r.prompt?.startsWith("Play only a kick"),
);
if (
  !changed.length ||
  changed.some((r) =>
    r.steps.some((step) =>
      Object.entries(step).some(([drum, v]) => drum !== "kick" && v > 0),
    ),
  )
)
  errors.push("Kick-only direction was not followed");
try {
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 5000 }),
    page.getByRole("button", { name: "MIDI", exact: true }).click(),
  ]);
  await download.saveAs("artifacts/live-drummer/live-snapshot.mid");
} catch (error) {
  errors.push(`MIDI download failed: ${error.message}`);
}
const stoppedRequests = requests.length;
await page.waitForTimeout(1200);
if (requests.length !== stoppedRequests)
  errors.push("Requests continued after stop");
for (const width of [390, 768, 1440]) {
  await page.setViewportSize({ width, height: 1000 });
  await page.getByLabel("Note division").selectOption("64");
  const overflow = await page
    .locator(".generator-grid-scroll")
    .evaluate((e) => e.scrollWidth > e.clientWidth);
  if (overflow) errors.push("Grid scrolls at " + width);
  const pageOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > innerWidth,
  );
  if (pageOverflow) errors.push("Page scrolls horizontally at " + width);
  await page.screenshot({ path: `artifacts/live-drummer/${width}.png` });
}
await writeFile(
  "artifacts/live-drummer/browser.json",
  JSON.stringify({ errors, playingText, requests, responses }, null, 2),
);
console.log(
  JSON.stringify(
    {
      errors,
      requests: requests.length,
      statuses: responses.map((r) => r.status),
      latencies: responses.map((r) => Math.round(r.ms)),
      playingText,
    },
    null,
    2,
  ),
);
await browser.close();
if (errors.length) process.exitCode = 1;
