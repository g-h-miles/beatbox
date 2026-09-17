import { readFileSync, writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import {
  describeBank,
  normalizeRecording,
  FEATURE_COUNT,
} from "../src/research-relative/features";
import { readModel, predictRelative } from "../src/research-relative/svm";
const root = "artifacts/relative-parity";
function bytes(path: string) {
  const buffer = readFileSync(path);
  return buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  );
}
const model = readModel(bytes("src/research-relative/relative-model.bin"));
const file = readFileSync("artifacts/ml-v2/fbanks.npy");
if (file.subarray(0, 6).toString("latin1") !== "\x93NUMPY")
  throw new Error("Invalid numpy bank");
const header =
  file[6] === 1 ? 10 + file.readUInt16LE(8) : 12 + file.readUInt32LE(8);
const bankBits = new Uint16Array(
  file.buffer,
  file.byteOffset + header,
  (file.length - header) / 2,
);
const halves = new Float32Array(65536);
for (let h = 0; h < halves.length; h++) {
  const sign = h & 0x8000 ? -1 : 1,
    exponent = (h >>> 10) & 31,
    mantissa = h & 1023;
  halves[h] =
    exponent === 31
      ? mantissa
        ? NaN
        : sign * Infinity
      : sign *
        (exponent === 0
          ? mantissa * 2 ** -24
          : (1 + mantissa / 1024) * 2 ** (exponent - 15));
}
const expectedRaw = new Float32Array(bytes(`${root}/cached-raw-features.f32`));
const expectedRelative = new Float32Array(
  bytes(`${root}/cached-relative-features.f32`),
);
const expectedLabels = new Uint8Array(bytes(`${root}/cached-labels.u8`));
const groups: number[][] = JSON.parse(
  readFileSync(`${root}/cached-groups.json`, "utf8"),
);
const bank = new Float32Array(6144),
  rows: Float32Array[] = [];
const started = performance.now();
let rawMax = 0,
  relativeMax = 0,
  mismatches = 0;
for (let event = 0; event < expectedLabels.length; event++) {
  for (let i = 0; i < bank.length; i++)
    bank[i] = halves[bankBits[event * bank.length + i]];
  const row = describeBank(bank);
  for (let i = 0; i < row.length; i++)
    rawMax = Math.max(
      rawMax,
      Math.abs(row[i] - expectedRaw[event * FEATURE_COUNT + i]),
    );
  rows.push(row);
}
let completed = 0;
for (const group of groups) {
  const relative = normalizeRecording(group.map((index) => rows[index]));
  for (let j = 0; j < group.length; j++) {
    const index = group[j],
      row = relative[j];
    for (let i = 0; i < row.length; i++)
      relativeMax = Math.max(
        relativeMax,
        Math.abs(row[i] - expectedRelative[index * FEATURE_COUNT + i]),
      );
    const label = ["hat", "kick", "snare"].indexOf(
      predictRelative(row, model).drum,
    );
    if (label !== expectedLabels[index]) mismatches++;
    completed++;
  }
  if (completed % 1000 < group.length) console.log(completed, "events checked");
}
const result = {
  events: completed,
  rawMax,
  relativeMax,
  mismatches,
  milliseconds: performance.now() - started,
  source: "All public cached banks; numerical parity only, not accuracy",
};
writeFileSync(
  `${root}/cached-node-report.json`,
  JSON.stringify(result, null, 2),
);
console.log(result);
if (mismatches) process.exitCode = 1;
