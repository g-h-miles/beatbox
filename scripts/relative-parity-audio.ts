import { readFileSync, writeFileSync } from "node:fs";
import {
  cropHit,
  kaldiBank,
  describeBank,
  normalizeRecording,
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
const fixtures = JSON.parse(
  readFileSync(`${root}/audio-fixtures.json`, "utf8"),
);
const reports = [];
for (const fixture of fixtures) {
  const samples = new Float32Array(bytes(`${root}/${fixture.stem}-16k.f32`));
  const expectedBanks = new Float32Array(
    bytes(`${root}/${fixture.stem}-banks.f32`),
  );
  const expectedRaw = new Float32Array(
    bytes(`${root}/${fixture.stem}-raw.f32`),
  );
  let bankMax = 0,
    bankMean = 0,
    rawMax = 0;
  const rows = fixture.times.map((time: number, index: number) => {
    const bank = kaldiBank(
      cropHit(
        samples,
        time,
        fixture.times[index + 1] ?? samples.length / 16000,
      ),
    );
    for (let i = 0; i < bank.length; i++) {
      const error = Math.abs(bank[i] - expectedBanks[index * bank.length + i]);
      bankMax = Math.max(bankMax, error);
      bankMean += error;
    }
    const row = describeBank(bank);
    for (let i = 0; i < row.length; i++)
      rawMax = Math.max(
        rawMax,
        Math.abs(row[i] - expectedRaw[index * row.length + i]),
      );
    return row;
  });
  const predicted = normalizeRecording(rows).map((row) =>
    ["hat", "kick", "snare"].indexOf(predictRelative(row, model).drum),
  );
  const mismatches = predicted.filter(
    (label, i) => label !== fixture.expected[i],
  ).length;
  reports.push({
    file: fixture.file,
    events: predicted.length,
    bankMax,
    bankMean: bankMean / expectedBanks.length,
    rawMax,
    mismatches,
  });
}
writeFileSync(
  `${root}/audio-node-report.json`,
  JSON.stringify(reports, null, 2),
);
console.log(reports);
if (reports.some((report) => report.mismatches)) process.exitCode = 1;
