import { readFileSync, writeFileSync } from "node:fs";
import {
  predictBrowserModel,
  readBrowserModel,
  type ModelSize,
} from "../src/research-browser-model";
const root = "artifacts/browser-model-parity";
const bytes = readFileSync(`${root}/features.f32`),
  features = new Float32Array(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  );
const manifest = JSON.parse(readFileSync(`${root}/manifest.json`, "utf8"));
const results = [];
for (const size of [3, 4] as ModelSize[]) {
  const data = readFileSync(`src/research-browser-model/model${size}.bin`),
    model = readBrowserModel(
      data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
      size,
    );
  const reference = JSON.parse(
    readFileSync(`${root}/reference${size}.json`, "utf8"),
  );
  let mismatches = 0,
    maxMarginError = 0;
  for (let i = 0; i < manifest.events; i++) {
    const result = predictBrowserModel(
      features.subarray(i * manifest.features, (i + 1) * manifest.features),
      model,
    );
    if (result.classIndex !== reference.labels[i]) mismatches++;
    for (let p = 0; p < result.pairScores.length; p++)
      maxMarginError = Math.max(
        maxMarginError,
        Math.abs(result.pairScores[p] - reference.pairScores[i][p]),
      );
  }
  if (mismatches || maxMarginError > 1e-6)
    throw new Error(
      `Model${size} parity failed: ${mismatches} labels, margin error ${maxMarginError}`,
    );
  results.push({
    classes: size,
    events: manifest.events,
    labelMismatches: mismatches,
    maxMarginError,
  });
}
writeFileSync(
  `${root}/report.json`,
  JSON.stringify(
    {
      protocol:
        "Numerical parity only, all cached native validation features; no fitting or accuracy claim",
      recordings: manifest.groups.length,
      results,
    },
    null,
    2,
  ),
);
console.log(JSON.stringify(results, null, 2));
