import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  cropHit,
  kaldiBank,
  describeBank,
  normalizeRecording,
  halfRound,
} from "../src/research-relative/features";
import { readModel, predictRelative } from "../src/research-relative/svm";
import reference from "./relative-fixture.json";

function binary(path: string): ArrayBuffer {
  const b = readFileSync(new URL(path, import.meta.url));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
}

describe("public relative acoustic model numerical parity", () => {
  it("matches independent Kaldi filterbanks and attack/body descriptors", () => {
    const samples = Float32Array.from(
      { length: 8000 },
      (_, i) =>
        (0.3 * Math.sin((2 * Math.PI * 440 * i) / 16000) +
          0.08 * Math.sin((2 * Math.PI * 4100 * i) / 16000)) *
          Math.exp(-i / 1300) +
        0.03,
    );
    samples[700] += 0.6;
    const before = samples.slice();
    const bank = kaldiBank(cropHit(samples, 0.01, 0.5));
    expect(samples).toEqual(before);
    let bankError = 0,
      featureError = 0;
    bank.forEach(
      (value, i) =>
        (bankError = Math.max(bankError, Math.abs(value - reference.bank[i]))),
    );
    const features = describeBank(bank);
    features.forEach(
      (value, i) =>
        (featureError = Math.max(
          featureError,
          Math.abs(value - reference.features[i]),
        )),
    );
    // Float32 FFT cancellation at the synthetic tone’s near-silent high bands
    // may differ by two binary16 steps; descriptor tolerance is tighter.
    expect(bankError).toBeLessThanOrEqual(0.004);
    expect(featureError).toBeLessThan(0.0005);
  });
  it("reproduces independent sklearn predictions from the compact binary model", () => {
    const model = readModel(
      binary("../src/research-relative/relative-model.bin"),
    );
    const classes = ["hat", "kick", "snare"];
    reference.vectors.forEach((values, i) =>
      expect(
        classes.indexOf(predictRelative(Float32Array.from(values), model).drum),
      ).toBe(reference.labels[i]),
    );
    expect(() => readModel(new ArrayBuffer(4))).toThrow("size mismatch");
  });
  it("keeps single-event normalization finite and leaves inputs intact", () => {
    const row = Float32Array.from({ length: 1104 }, (_, i) => i / 100);
    const before = row.slice();
    const [normalized] = normalizeRecording([row]);
    expect([...normalized].every((value) => value === 0)).toBe(true);
    expect(row).toEqual(before);
    expect(normalizeRecording([])).toEqual([]);
    const quiet = kaldiBank(new Float32Array(8000));
    expect([...quiet].every(Number.isFinite)).toBe(true);
  });
  it("uses binary16 ties-to-even rather than truncating filterbanks", () => {
    expect(halfRound(1 + 2 ** -11)).toBe(1);
    expect(halfRound(1 + 3 * 2 ** -11)).toBe(1 + 2 ** -9);
    expect(halfRound(2 ** -25)).toBe(0);
    expect(halfRound(3 * 2 ** -25)).toBe(2 ** -23);
    expect(halfRound(65520)).toBe(Infinity);
  });
});
