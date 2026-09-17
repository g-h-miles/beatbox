import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import fixture from "./browser-model-fixture.json";
import {
  predictBrowserModel,
  readBrowserModel,
  standardizeBrowserFeatures,
  type ModelSize,
} from "../src/research-browser-model";
const load = (size: ModelSize) => {
  const b = readFileSync(
    new URL(`../src/research-browser-model/model${size}.bin`, import.meta.url),
  );
  return readBrowserModel(
    b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength),
    size,
  );
};
describe("frozen browser-trained SVM numerical parity", () => {
  for (const size of [3, 4] as ModelSize[])
    it(`matches sklearn labels and OVO margins for ${size} classes`, () => {
      const model = load(size),
        ref = fixture.models[String(size) as "3" | "4"];
      for (let i = 0; i < fixture.vectors.length; i++) {
        const result = predictBrowserModel(
          new Float32Array(fixture.vectors[i]),
          model,
        );
        expect(result.classIndex).toBe(ref.labels[i]);
        expect(result.pairScores).toHaveLength((size * (size - 1)) / 2);
        for (let p = 0; p < result.pairScores.length; p++)
          expect(
            Math.abs(result.pairScores[p] - ref.pairScores[i][p]),
          ).toBeLessThan(1e-6);
      }
    });
  it("rejects malformed model lengths and feature vectors", () => {
    expect(() => readBrowserModel(new ArrayBuffer(8), 3)).toThrow(
      "size mismatch",
    );
    const model = load(3);
    expect(() =>
      standardizeBrowserFeatures(new Float32Array(1), model),
    ).toThrow("count mismatch");
    const bad = new Float32Array(1104);
    bad[5] = NaN;
    expect(() => standardizeBrowserFeatures(bad, model)).toThrow("Non-finite");
  });
});
