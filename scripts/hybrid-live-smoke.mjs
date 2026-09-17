import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
const base = process.env.LIVE_URL || "https://beatbox.grahammiles.me";
const audio =
  process.env.AVP_AUDIO ||
  "artifacts/avp-full/AVP_Dataset/Personal/Participant_15/P15_Improvisation_Personal.wav";
const out = process.env.SMOKE_OUTPUT || "artifacts/hybrid-live";
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1080 } });
page.setDefaultTimeout(120000);
const responses = [],
  errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("response", (r) => {
  if (/onnx|wasm|relative-model|api\//.test(r.url()))
    responses.push({ url: r.url(), status: r.status() });
});
// Deliberately no request routes, mocks, proxy, or API replacement in this smoke.
await page.goto(base);
await page.locator("input[type=file]").setInputFiles(audio);
await page.getByRole("status").filter({ hasText: "hits found" }).waitFor();
assert(!(await page.locator(".notice").innerText()).includes("Basic"));
await page.locator(".hit-row").first().click();
await page.getByLabel("Sound", { exact: true }).selectOption("snare");
await page.getByLabel("Velocity", { exact: true }).fill("101");
const manual = await page.locator(".hit-row").first().innerText(),
  times = await page.locator(".hit-row > span:nth-child(2)").allTextContents();
await page.getByRole("button", { name: "Classify sounds" }).click();
await page
  .getByRole("status")
  .filter({ hasText: "Classification complete" })
  .waitFor();
assert.equal(await page.locator(".hit-row").first().innerText(), manual);
assert.deepEqual(
  await page.locator(".hit-row > span:nth-child(2)").allTextContents(),
  times,
);
assert(
  responses.some((r) => r.url.includes("relative-model") && r.status === 200),
);
assert(
  responses.some(
    (r) => r.url.includes("beatbox-onsets.onnx") && r.status === 200,
  ),
);
assert(responses.some((r) => r.url.includes(".wasm") && r.status === 200));
const api = responses.filter((r) => r.url.includes("/api/classify"));
assert(api.length > 0 && api.every((r) => r.status === 200));
assert(
  (await page.locator(".hit-row").allTextContents()).some((t) =>
    t.includes("Suggested"),
  ),
);
await page.getByRole("button", { name: "Original", exact: true }).click();
await page.getByRole("button", { name: "Original", exact: true }).click();
await page.getByRole("button", { name: "Drum preview", exact: true }).click();
await page.getByRole("button", { name: "Drum preview", exact: true }).click();
const pending = page.waitForEvent("download");
await page.getByRole("button", { name: "Download MIDI" }).click();
await (await pending).saveAs(`${out}/reviewed.mid`);
const bytes = readFileSync(`${out}/reviewed.mid`);
assert.equal(bytes.subarray(0, 4).toString(), "MThd");
let pos = 22,
  ticks = 0,
  tempo = 500000;
const ppq = bytes.readUInt16BE(12),
  notes = [];
function vlq() {
  let n = 0,
    x;
  do {
    x = bytes[pos++];
    n = (n << 7) | (x & 127);
  } while (x & 128);
  return n;
}
while (pos < bytes.length) {
  ticks += vlq();
  const status = bytes[pos++];
  if (status === 255) {
    const type = bytes[pos++],
      length = vlq();
    if (type === 81) tempo = bytes.readUIntBE(pos, 3);
    pos += length;
    if (type === 47) break;
  } else {
    const note = bytes[pos++],
      velocity = bytes[pos++];
    if ((status & 240) === 144 && velocity > 0)
      notes.push({
        time: (ticks * tempo) / ppq / 1e6,
        note,
        velocity,
        channel: status & 15,
      });
  }
}
assert.equal(notes.length, times.length);
assert.equal(notes[0].note, 38);
assert.equal(notes[0].velocity, 101);
let maxError = 0;
for (let i = 0; i < times.length; i++) {
  maxError = Math.max(maxError, Math.abs(parseFloat(times[i]) - notes[i].time));
  assert.equal(notes[i].channel, 9);
}
assert(maxError < 0.0006);
assert.deepEqual(errors, []);
assert(
  await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
);
await page.screenshot({
  path: `${out}/live.png`,
  fullPage: true,
});
const report = {
  url: page.url(),
  date: new Date().toISOString(),
  audio,
  hits: notes.length,
  responses,
  errors,
  manualEditPreserved: true,
  classificationTimesUnchanged: true,
  midiMaxDifferenceFromDisplayedSeconds: maxError,
  midiPpq: ppq,
};
writeFileSync(`${out}/report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));
await browser.close();
