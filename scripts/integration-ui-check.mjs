import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
const out = "artifacts/integration-ui";
mkdirSync(out, { recursive: true });
const root =
  process.env.AVP_PERSONAL_DIR ||
  "artifacts/new-public-audio/avp-lvt/AVP-LVT_Dataset/AVP_Dataset/Personal";
const base = process.env.UI_URL || "http://127.0.0.1:5183";
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 1080 } });
p.setDefaultTimeout(120000);
const errors = [],
  requests = [],
  api = [];
p.on("pageerror", (e) => errors.push(e.message));
p.on("response", (r) => {
  if (/onnx|wasm/.test(r.url()))
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
await p.getByRole("button", { name: "Classify with TypeSafe" }).click();
await p
  .getByRole("status")
  .filter({ hasText: "TypeSafe pass complete" })
  .waitFor();
assert(
  api.filter((a) => a.path === "/api/classify").every((a) => a.status === 200),
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
// Exercise real worker cancellation, not merely an already-aborted signal.
const cancellation = process.env.BUILT
  ? "not exercised on built bundle"
  : await p.evaluate(async () => {
      const { detectNeural } = await import("/src/neural.ts");
      const controller = new AbortController();
      const samples = new Float32Array(22050 * 60);
      for (let i = 0; i < samples.length; i++)
        samples[i] = Math.sin(i * 0.1) * 0.2;
      const pending = detectNeural(
        samples,
        22050,
        undefined,
        controller.signal,
      );
      setTimeout(() => controller.abort(), 10);
      try {
        await pending;
        return "not cancelled";
      } catch (e) {
        return e.name;
      }
    });
if (!process.env.BUILT) assert.equal(cancellation, "AbortError");
// Force unavailable weights and confirm visible fallback keeps the app usable.
await p.route("**/models/beatbox-onsets.onnx", (r) => r.abort());
await p.getByRole("button", { name: "Re-detect", exact: true }).click();
await p
  .getByRole("status")
  .filter({ hasText: "Basic detection is ready" })
  .waitFor();
assert(await p.getByRole("button", { name: "Download MIDI" }).isEnabled());
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
