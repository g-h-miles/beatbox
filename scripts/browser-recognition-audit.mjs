import { chromium } from "@playwright/test";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import assert from "node:assert/strict";
const onsetOnly = process.argv.includes("--onsets-only");
const forcedRate = Number(process.env.AUDIO_RATE) || 0;
const out = `artifacts/browser-recognition${onsetOnly ? "-onsets" : ""}${forcedRate ? `-${forcedRate}` : ""}`;
mkdirSync(out, { recursive: true });
const records = JSON.parse(readFileSync("artifacts/events-v2.json")).filter(
  (r) =>
    (onsetOnly
      ? r.participant >= 21 && r.participant <= 28
      : [15, 16].includes(r.participant)) && r.file.includes("Improvisation"),
);
const names = { hhc: "closed", hho: "open", kd: "kick", sd: "snare" };
const labels = {
  Kick: "kick",
  Snare: "snare",
  "Closed hat": "closed",
  "Open hat": "open",
  Ride: "ride",
  Crash: "crash",
  "Aux / breath": "aux",
};
const core = (n) => (["open", "closed"].includes(n) ? "hat" : n);
function score(record, hits) {
  const refs = record.annotations.filter((a) => a.label in names),
    pairs = [];
  for (const [i, h] of hits.entries())
    for (const [j, r] of refs.entries()) {
      const error = Math.abs(h.time - r.time);
      if (error < 0.05) pairs.push({ error, hit: i, ref: j });
    }
  pairs.sort((a, b) => a.error - b.error);
  const usedH = new Set(),
    usedR = new Set(),
    matches = [];
  for (const p of pairs) {
    if (usedH.has(p.hit) || usedR.has(p.ref)) continue;
    usedH.add(p.hit);
    usedR.add(p.ref);
    const expected = names[refs[p.ref].label],
      predicted = hits[p.hit].drum;
    matches.push({
      ...p,
      expected,
      predicted,
      correctFour: expected === predicted,
      correctCore: core(expected) === core(predicted),
    });
  }
  const correctFour = matches.filter((m) => m.correctFour).length,
    correctCore = matches.filter((m) => m.correctCore).length;
  return {
    detected: hits.length,
    reference: refs.length,
    matched: matches.length,
    correctFour,
    correctCore,
    onsetF1: (2 * matches.length) / (hits.length + refs.length),
    conditionalFour: correctFour / matches.length,
    conditionalCore: correctCore / matches.length,
    jointFourF1: (2 * correctFour) / (hits.length + refs.length),
    jointCoreF1: (2 * correctCore) / (hits.length + refs.length),
    matches,
  };
}
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1080 } });
page.setDefaultTimeout(120000);
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.addInitScript((forcedRate) => {
  window.audit = { rates: [], workerEvents: [], calls: [], lastRequest: 0 };
  const AC = window.AudioContext;
  window.AudioContext = class extends AC {
    constructor(...args) {
      super(
        ...(forcedRate
          ? [{ ...(args[0] || {}), sampleRate: forcedRate }]
          : args),
      );
      window.audit.rates.push(this.sampleRate);
    }
  };
  const W = window.Worker;
  window.Worker = class extends W {
    constructor(...args) {
      super(...args);
      this.addEventListener("message", (e) => {
        if (e.data.type === "complete")
          window.audit.workerEvents.push(e.data.events);
      });
    }
  };
  const fetchOriginal = window.fetch;
  window.fetch = async (...args) => {
    if (String(args[0]).includes("/api/classify")) {
      await new Promise((r) =>
        setTimeout(
          r,
          Math.max(0, 2400 - (Date.now() - window.audit.lastRequest)),
        ),
      );
      window.audit.lastRequest = Date.now();
      const body = JSON.parse(args[1].body);
      const response = await fetchOriginal(...args);
      window.audit.calls.push({
        body,
        status: response.status,
        response: await response.clone().json(),
      });
      return response;
    }
    return fetchOriginal(...args);
  };
}, forcedRate);
await page.goto("https://beatbox.grahammiles.me");
const rows = [];
if (onsetOnly) {
  for (const record of records) {
    const count = await page.evaluate(() => audit.workerEvents.length);
    await page.locator("input[type=file]").setInputFiles(record.path);
    await page.waitForFunction((n) => audit.workerEvents.length > n, count);
    await page.getByRole("status").filter({ hasText: "hits found" }).waitFor();
    const capture = await page.evaluate(() => ({
      events: audit.workerEvents.at(-1),
      rates: audit.rates,
      calls: audit.calls.length,
    }));
    assert.equal(capture.calls, 0);
    const measured = score(record, capture.events);
    const { detected, reference, matched, onsetF1, matches } = measured;
    const result = {
      file: record.file,
      rates: capture.rates,
      detected,
      reference,
      matched,
      onsetF1,
      events: capture.events,
      matches: matches.map(({ error, hit, ref }) => ({ error, hit, ref })),
    };
    rows.push(result);
    writeFileSync(
      `${out}/${record.file.replace(".wav", "")}.json`,
      JSON.stringify(result, null, 2),
    );
    console.log(
      JSON.stringify({
        file: record.file,
        detected,
        reference,
        matched,
        onsetF1,
      }),
    );
  }
  const sum = (k) => rows.reduce((n, r) => n + r[k], 0),
    detected = sum("detected"),
    reference = sum("reference"),
    matched = sum("matched");
  const report = {
    recordings: rows.length,
    detected,
    reference,
    matched,
    onsetF1: (2 * matched) / (detected + reference),
    meanTimingError:
      rows.flatMap((r) => r.matches).reduce((n, m) => n + m.error, 0) / matched,
    errors,
    classificationEvaluated: false,
  };
  writeFileSync(`${out}/report.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
  await browser.close();
  process.exit(0);
}
for (const record of records) {
  const start = await page.evaluate(() => ({
    events: audit.workerEvents.length,
    calls: audit.calls.length,
  }));
  await page.locator("input[type=file]").setInputFiles(record.path);
  await page.waitForFunction(
    (n) => window.audit.workerEvents.length > n,
    start.events,
  );
  await page.getByRole("status").filter({ hasText: "hits found" }).waitFor();
  await page.getByRole("button", { name: "Classify with TypeSafe" }).click();
  await page
    .getByRole("status")
    .filter({ hasText: "TypeSafe pass complete" })
    .waitFor();
  const captured = await page.evaluate(
    (s) => ({
      rates: audit.rates,
      events: audit.workerEvents.at(-1),
      calls: audit.calls.slice(s.calls),
    }),
    start,
  );
  assert(captured.calls.every((c) => c.status === 200));
  const defaultRows = await page.locator(".hit-row").allTextContents();
  await page.locator(".groove-controls summary").click();
  await page.getByLabel("Use 4/4 groove hints").uncheck();
  const rawRows = await page.locator(".hit-row").allTextContents();
  const answers = captured.calls.flatMap((c) => c.response.answers),
    features = captured.calls.flatMap((c) => c.body.hits);
  const hits = captured.events.map((event, i) => ({
    id: `hit-${i}`,
    time: event.time,
    features: features.find((h) => h.id === `hit-${i}`).features,
    ...answers.find((h) => h.id === `hit-${i}`),
  }));
  const toDefault = defaultRows.map((text, i) => ({
    ...hits[i],
    drum: Object.entries(labels).find(([name]) => text.includes(name))?.[1],
  }));
  assert.equal(hits.length, rawRows.length);
  const result = {
    file: record.file,
    sampleRates: captured.rates,
    events: captured.events,
    calls: captured.calls,
    hits,
    defaultRows,
    rawRows,
    rawScore: score(record, hits),
    defaultScore: score(record, toDefault),
  };
  writeFileSync(
    `${out}/${record.file.replace(".wav", "")}.json`,
    JSON.stringify(result, null, 2),
  );
  rows.push(result);
  await page.getByLabel("Use 4/4 groove hints").check();
  await page.locator(".groove-controls summary").click();
  console.log(
    JSON.stringify({
      file: record.file,
      sampleRates: captured.rates,
      rawScore: { ...result.rawScore, matches: undefined },
      defaultScore: { ...result.defaultScore, matches: undefined },
    }),
  );
}
function summarize(key) {
  const sums = {};
  for (const k of [
    "detected",
    "reference",
    "matched",
    "correctFour",
    "correctCore",
  ])
    sums[k] = rows.reduce((n, r) => n + r[key][k], 0);
  return {
    ...sums,
    onsetF1: (2 * sums.matched) / (sums.detected + sums.reference),
    conditionalFour: sums.correctFour / sums.matched,
    conditionalCore: sums.correctCore / sums.matched,
    jointFourF1: (2 * sums.correctFour) / (sums.detected + sums.reference),
    jointCoreF1: (2 * sums.correctCore) / (sums.detected + sums.reference),
  };
}
const offline = JSON.parse(
  readFileSync("artifacts/neural-typesafe/active-duration-report.json"),
);
const comparison = rows.map((r) => {
  const old = JSON.parse(
    readFileSync(
      `artifacts/neural-typesafe/${r.file.replace(".wav", "")}-neuralActive.json`,
    ),
  );
  const pairs = r.hits
    .map((h) => {
      const match = old.hits.reduce((a, b) =>
        Math.abs(b.time - h.time) < Math.abs(a.time - h.time) ? b : a,
      );
      return Math.abs(match.time - h.time) < 0.02
        ? {
            time: h.time,
            offlineTime: match.time,
            browserFeatures: h.features,
            offlineFeatures: match.features,
          }
        : null;
    })
    .filter(Boolean);
  return {
    file: r.file,
    browserCount: r.hits.length,
    offlineCount: old.hits.length,
    nearbyFeaturePairs: pairs,
  };
});
const report = {
  date: new Date().toISOString(),
  url: page.url(),
  browserRaw: summarize("rawScore"),
  browserDefault: summarize("defaultScore"),
  offline: offline.summaries,
  comparison,
  errors,
  limitations: [
    "Same four preselected validation recordings, no new voice evaluation.",
    "Browser uses native AudioContext decoding; offline benchmark uses ffmpeg at 44100 Hz.",
    "Production TypeSafe calls are stochastic; sample-rate effect cannot be isolated from this comparison alone.",
  ],
};
writeFileSync(`${out}/report.json`, JSON.stringify(report, null, 2));
await page.screenshot({ path: `${out}/last-recording.png`, fullPage: true });
await browser.close();
console.log(
  JSON.stringify({
    browserRaw: report.browserRaw,
    browserDefault: report.browserDefault,
    errors,
  }),
);
