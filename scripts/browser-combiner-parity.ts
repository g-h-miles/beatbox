import { readFileSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";
import { readBrowserModel } from "../src/research-browser-model";
import { classifyBrowserFeatures } from "../src/research-browser-model/combine";
const buffer = (path: string) => {
  const b = readFileSync(path);
  return b.buffer.slice(
    b.byteOffset,
    b.byteOffset + b.byteLength,
  ) as ArrayBuffer;
};
const m3 = readBrowserModel(buffer("src/research-browser-model/model3.bin"), 3),
  m4 = readBrowserModel(buffer("src/research-browser-model/model4.bin"), 4);
const val = JSON.parse(
  readFileSync("artifacts/browser-relative/combiner-frozen.json", "utf8"),
).validation.recordings.map((r: any) => ({
  file: r.file,
  path: `artifacts/four-relative/${r.file.replace(".wav", "")}-native.f32`,
  expected: r.predictions,
}));
const test = JSON.parse(
  readFileSync(
    "artifacts/browser-relative/existing-test/predictions.json",
    "utf8",
  ),
).rows.map((r: any) => ({
  file: r.file,
  path: `artifacts/browser-relative/existing-test/${r.stem}-features.f32`,
  expected: r.combined,
}));
const classes = ["closed", "open", "kick", "snare"];
const reports = [];
for (const r of [...val, ...test]) {
  const data = new Float32Array(buffer(r.path));
  assert.equal(data.length, r.expected.length * 1104);
  const features = Array.from({ length: r.expected.length }, (_, i) =>
    data.slice(i * 1104, (i + 1) * 1104),
  );
  const labels = classifyBrowserFeatures(features, m3, m4).map((label) =>
    classes.indexOf(label),
  );
  assert.deepEqual(labels, r.expected, r.file);
  reports.push({ file: r.file, events: labels.length });
}
const report = {
  recordings: reports.length,
  events: reports.reduce((sum, r) => sum + r.events, 0),
  reports,
};
writeFileSync(
  "artifacts/browser-model-parity/combiner-report.json",
  JSON.stringify(report, null, 2),
);
console.log({ recordings: report.recordings, events: report.events });
