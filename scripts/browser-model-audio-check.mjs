import { chromium } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";
const root = "artifacts/relative-parity";
const fixtures = JSON.parse(
  readFileSync(`${root}/audio-fixtures.json`, "utf8"),
);
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
await page.route("**/relative-fixtures/*", async (route) => {
  const filename = new URL(route.request().url()).pathname.split("/").pop();
  await route.fulfill({
    body: readFileSync(`${root}/${filename}`),
    contentType: "application/octet-stream",
  });
});
await page.route("**/relative-harness", (route) =>
  route.fulfill({
    body: "<!doctype html><html><body></body></html>",
    contentType: "text/html",
  }),
);
await page.goto("http://127.0.0.1:5178/relative-harness");
const result = await page.evaluate(async (fixtures) => {
  const { resampleRelative } = await import("/src/research-relative/index.ts");
  const { predictBrowserSounds: predictRelative } =
    await import("/src/research-browser-model/classifier.ts");
  const { detectNeural } = await import("/src/neural.ts");
  // Raw coefficient parity stays separate from the now-grouped worker API.
  const { recordingFeatures } =
    await import("/src/research-relative/features.ts");
  const { readModel, predictRelative: rawPredict } =
    await import("/src/research-relative/svm.ts");
  const model = readModel(
    await (
      await fetch("/src/research-relative/relative-model.bin")
    ).arrayBuffer(),
  );
  const rawLabels = async (samples, rate, times) =>
    recordingFeatures(await resampleRelative(samples, rate), times).map(
      (row) => rawPredict(row, model).drum,
    );
  function match(times, labels, truth) {
    const pairs = [];
    times.forEach((t, i) =>
      truth.forEach((a, j) => {
        const distance = Math.abs(t - a.time);
        if (distance < 0.05) pairs.push([distance, i, j]);
      }),
    );
    pairs.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
    const usedP = new Set(),
      usedT = new Set();
    let correct = 0;
    for (const [, i, j] of pairs) {
      if (usedP.has(i) || usedT.has(j)) continue;
      usedP.add(i);
      usedT.add(j);
      correct +=
        ["hat", "kick", "snare"].indexOf(
          ["closed", "open"].includes(labels[i]) ? "hat" : labels[i],
        ) === truth[j].class;
    }
    return {
      detected: times.length,
      annotated: truth.length,
      matched: usedP.size,
      correct,
    };
  }
  const classes = ["hat", "kick", "snare"],
    results = [];
  const load = async (file) =>
    new Float32Array(
      await (await fetch(`/relative-fixtures/${file}`)).arrayBuffer(),
    );
  for (const fixture of fixtures) {
    const samples = await load(`${fixture.stem}-16k.f32`);
    const original = await load(`${fixture.stem}-native.f32`);
    const before = samples.slice(),
      timesBefore = [...fixture.times];
    let started = performance.now();
    const labels16k = await rawLabels(samples, 16000, fixture.times);
    const milliseconds16k = performance.now() - started;
    started = performance.now();
    const labelsNative = await rawLabels(
      original,
      fixture.sampleRate,
      fixture.times,
    );
    const millisecondsNative = performance.now() - started;
    let nativeFullPipeline;
    if (fixture.split === "validation") {
      const neural = await detectNeural(original, fixture.sampleRate);
      const actualTimes = neural.map((event) => event.time);
      const actualLabels = await predictRelative(
        original,
        fixture.sampleRate,
        actualTimes,
      );
      nativeFullPipeline = match(actualTimes, actualLabels, fixture.truth);
    }
    results.push({
      file: fixture.file,
      events: fixture.times.length,
      mismatches16k: labels16k.filter(
        (x, i) => classes.indexOf(x) !== fixture.expected[i],
      ).length,
      mismatchesNative: labelsNative.filter(
        (x, i) => classes.indexOf(x) !== fixture.expected[i],
      ).length,
      milliseconds16k,
      millisecondsNative,
      split: fixture.split,
      nativeProvidedOnsets: match(fixture.times, labelsNative, fixture.truth),
      nativeFullPipeline,
      inputPreserved:
        samples.length === before.length &&
        samples.every((x, i) => x === before[i]) &&
        fixture.times.every((x, i) => x === timesBefore[i]),
    });
  }
  const fixture = fixtures[1],
    samples = await load(`${fixture.stem}-16k.f32`);
  const repeats = Math.ceil(100 / fixture.times.length);
  const long = new Float32Array(samples.length * repeats);
  const times = [];
  for (let i = 0; i < repeats; i++) {
    long.set(samples, i * samples.length);
    times.push(...fixture.times.map((t) => t + (i * samples.length) / 16000));
  }
  const started = performance.now();
  const performanceLabels = await predictRelative(
    long,
    16000,
    times.slice(0, 100),
  );
  const milliseconds100 = performance.now() - started;
  const controller = new AbortController();
  controller.abort();
  let immediateCancelled = false;
  try {
    await predictRelative(samples, 16000, fixture.times, controller.signal);
  } catch (error) {
    immediateCancelled = error.name === "AbortError";
  }
  const activeController = new AbortController();
  const pending = predictRelative(
    samples,
    16000,
    fixture.times,
    activeController.signal,
  );
  setTimeout(() => activeController.abort(), 1);
  let activeCancelled = false;
  try {
    await pending;
  } catch (error) {
    activeCancelled = error.name === "AbortError";
  }
  const empty = await predictRelative(samples, 16000, []);
  let invalidRejected = false;
  try {
    await predictRelative(samples, 16000, [1, 0.5]);
  } catch {
    invalidRejected = true;
  }
  return {
    protocol:
      "Original raw coefficient parity plus new frozen browser-trained worker full native validation; no new fitting or selection.",
    results,
    milliseconds100,
    performanceCount: performanceLabels.length,
    immediateCancelled,
    activeCancelled,
    empty: empty.length,
    invalidRejected,
  };
}, fixtures);
await browser.close();
writeFileSync(
  "artifacts/browser-model-parity/audio-report.json",
  JSON.stringify({ ...result, errors }, null, 2),
);
console.log(JSON.stringify({ ...result, errors }, null, 2));
assert.equal(errors.length, 0);
assert.equal(result.performanceCount, 100);
assert.equal(result.immediateCancelled, true);
assert.equal(result.activeCancelled, true);
assert.equal(result.invalidRejected, true);
assert.equal(result.empty, 0);
for (const row of result.results) {
  assert.equal(row.mismatches16k, 0);
  assert.equal(row.inputPreserved, true);
}
