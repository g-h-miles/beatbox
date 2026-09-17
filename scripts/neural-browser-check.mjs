import { chromium } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.route("**/reference-audio.f32", (route) =>
  route.fulfill({
    body: readFileSync("artifacts/ml-v2/browser-audio.f32"),
    contentType: "application/octet-stream",
  }),
);
await page.route("**/original-audio.f32", (route) =>
  route.fulfill({
    body: readFileSync("artifacts/ml-v2/browser-original.f32"),
    contentType: "application/octet-stream",
  }),
);
const audioInfo = JSON.parse(
  readFileSync("artifacts/ml-v2/browser-audio-info.json", "utf8"),
);
await page.goto("http://localhost:5174");
const result = await page.evaluate(async (originalSampleRate) => {
  const { detectNeural } = await import("/src/neural.ts");
  const silence = await detectNeural(new Float32Array(22050), 22050);
  if (silence.length) throw new Error("Silence produced notes");
  const cancellation = new AbortController();
  cancellation.abort();
  try {
    await detectNeural(
      new Float32Array(22050),
      22050,
      undefined,
      cancellation.signal,
    );
    throw new Error("Cancellation ignored");
  } catch (error) {
    if (error.name !== "AbortError") throw error;
  }
  const audio = new Float32Array(
    await (await fetch("/reference-audio.f32")).arrayBuffer(),
  );
  const originalLength = audio.length;
  const progress = [];
  const start = performance.now();
  const events = await detectNeural(audio, 22050, (value) =>
    progress.push(value),
  );
  const milliseconds = performance.now() - start;
  const original = new Float32Array(
    await (await fetch("/original-audio.f32")).arrayBuffer(),
  );
  const nativeResampled = await detectNeural(original, originalSampleRate);
  return {
    events,
    nativeResampled,
    milliseconds,
    progress,
    inputPreserved: audio.length === originalLength,
  };
}, audioInfo.sampleRate);
const reference = JSON.parse(
  readFileSync("artifacts/ml-v2/browser-reference.json", "utf8"),
);
assert.equal(result.events.length, reference.length);
reference.forEach((expected, i) => {
  assert.ok(Math.abs(expected.time - result.events[i].time) < 1e-8);
  assert.equal(result.events[i].drum, expected.drum);
});
assert.equal(result.nativeResampled.length, reference.length);
let maxNativeTimingDelta = 0;
reference.forEach((expected, i) => {
  maxNativeTimingDelta = Math.max(
    maxNativeTimingDelta,
    Math.abs(expected.time - result.nativeResampled[i].time),
  );
  assert.equal(result.nativeResampled[i].drum, expected.drum);
});
assert.ok(maxNativeTimingDelta <= 110 / 22050 + 1e-8);
result.maxNativeTimingDelta = maxNativeTimingDelta;
assert.ok(result.inputPreserved);
assert.equal(result.progress.at(-1), 1);
assert.deepEqual(errors, []);
writeFileSync(
  "artifacts/ml-v2/browser-parity.json",
  JSON.stringify(
    {
      ...result,
      note: "Execution parity only; these predicted labels are not ground truth.",
    },
    null,
    2,
  ),
);
console.log(
  JSON.stringify({
    events: result.events.length,
    milliseconds: result.milliseconds,
    errors,
  }),
);
await browser.close();
