import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
const out = process.env.SMOKE_OUTPUT || "artifacts/hybrid-ui";
mkdirSync(out, { recursive: true });
const root =
  process.env.AVP_PERSONAL_DIR ||
  "artifacts/new-public-audio/avp-lvt/AVP-LVT_Dataset/AVP_Dataset/Personal";
const base = process.env.UI_URL || "http://127.0.0.1:5186";
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 1080 } });
p.setDefaultTimeout(120000);
const errors = [],
  requests = [],
  api = [];
p.on("pageerror", (e) => errors.push(e.message));
p.on("response", (r) => {
  if (/onnx|wasm|relative-model|worker-/.test(r.url()))
    requests.push({ url: r.url(), status: r.status() });
});
await p.route("**/api/**", async (route) => {
  const request = route.request();
  const path = new URL(request.url()).pathname;
  const response = await fetch("https://beatbox.grahammiles.me" + path, {
    method: request.method(),
    headers: {
      "Content-Type": "application/json",
      Origin: "https://beatbox.grahammiles.me",
    },
    ...(request.method() === "POST" ? { body: request.postData() } : {}),
  });
  const text = await response.text();
  api.push({ path, status: response.status });
  await route.fulfill({
    status: response.status,
    contentType: "application/json",
    body: text,
  });
});
await p.goto(base);
const counts = {};
for (const id of [15, 16]) {
  await p
    .locator("input[type=file]")
    .setInputFiles(
      `${root}/Participant_${id}/P${id}_Improvisation_Personal.wav`,
    );
  await p.waitForFunction(() =>
    document.querySelector(".notice")?.textContent.includes("hits found"),
  );
  assert(!(await p.locator(".notice").innerText()).includes("Basic"));
  counts[id] = await p.locator(".hit-row").count();
  assert(counts[id] > 10);
}
assert(
  requests.some(
    (r) => r.url.includes("beatbox-onsets.onnx") && r.status === 200,
  ),
);
assert(requests.some((r) => r.url.includes(".wasm") && r.status === 200));
// A timing-only edit must remain manual through both classifiers.
await p.locator(".hit-row").first().click();
await p.getByLabel("Time (seconds)").fill("0.07");
await p.getByRole("button", { name: "Add at cursor" }).click();
await p.getByLabel("Velocity", { exact: true }).fill("115");
const manualRows = (await p.locator(".hit-row").allTextContents()).slice(0, 2);
const priorTimes = await p
  .locator(".hit-row > span:nth-child(2)")
  .allTextContents();
await p.getByRole("button", { name: "Classify sounds" }).click();
await p
  .getByRole("status")
  .filter({ hasText: "Classification complete" })
  .waitFor();
assert(
  api.filter((a) => a.path === "/api/classify").every((a) => a.status === 200),
);
assert(
  requests.some((r) => r.url.includes("relative-model") && r.status === 200),
);
assert.deepEqual(
  (await p.locator(".hit-row").allTextContents()).slice(0, 2),
  manualRows,
);
assert.equal(await p.getByLabel("Time (seconds)").inputValue(), "0");
assert.deepEqual(
  await p.locator(".hit-row > span:nth-child(2)").allTextContents(),
  priorTimes,
);
assert(
  (await p.locator(".hit-row").allTextContents()).some((t) =>
    t.includes("Suggested"),
  ),
);
await p.getByRole("button", { name: "Original", exact: true }).click();
await p.getByRole("button", { name: "Original", exact: true }).click();
await p.getByRole("button", { name: "Drum preview", exact: true }).click();
await p.getByRole("button", { name: "Drum preview", exact: true }).click();
await p.locator(".hit-row").first().click();
await p.getByLabel("Sound", { exact: true }).selectOption("kick");
await p.getByRole("button", { name: "Hear slice" }).click();
const d = p.waitForEvent("download");
await p.getByRole("button", { name: "Download MIDI" }).click();
await (await d).saveAs(`${out}/P16-reviewed.mid`);
assert.equal(
  readFileSync(`${out}/P16-reviewed.mid`).subarray(0, 4).toString(),
  "MThd",
);
for (const width of [390, 768, 1440, 1920]) {
  await p.setViewportSize({ width, height: 1080 });
  assert(
    await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  );
  await p.screenshot({ path: `${out}/review-${width}.png`, fullPage: true });
}
// Fail the core model explicitly. The API fallback remains visible and usable.
await p.route("**/*relative-model*", (r) => r.abort());
await p.getByRole("button", { name: "Classify sounds" }).click();
await p
  .getByRole("status")
  .filter({ hasText: "TypeSafe suggestions are ready to review" })
  .waitFor();
assert.equal(await p.getByLabel("Time (seconds)").inputValue(), "0");
assert(await p.getByRole("button", { name: "Download MIDI" }).isEnabled());
const beforeFailure = await p.locator(".hit-row").allTextContents();
await p.route("**/api/classify", (r) =>
  r.fulfill({
    status: 502,
    json: { error: "Test classification unavailable" },
  }),
);
await p.getByRole("button", { name: "Classify sounds" }).click();
await p
  .getByRole("status")
  .filter({ hasText: "Test classification unavailable" })
  .waitFor();
assert.deepEqual(await p.locator(".hit-row").allTextContents(), beforeFailure);
const cancellation = "covered separately by relative module tests";
writeFileSync(
  `${out}/report.json`,
  JSON.stringify(
    { counts, api, modelRequests: requests, cancellation, errors },
    null,
    2,
  ),
);
assert.deepEqual(errors, []);
await b.close();
console.log(JSON.stringify({ counts, api, cancellation, errors }));
