import { describe, expect, it } from "vitest";
import { neuralPeaks, neuralSpectrogram } from "../src/neural-spectrogram";
import reference from "./neural-spectrogram-fixture.json";

describe("neural audio preprocessing", () => {
  it("matches independent librosa output, including padding and high-frequency bands", () => {
    const samples = Float32Array.from(
      { length: 4096 },
      (_, i) =>
        (0.3 * Math.sin((2 * Math.PI * 440 * i) / 22050) +
          0.1 * Math.sin((2 * Math.PI * 4100 * i) / 22050)) *
        Math.exp(-i / 1300),
    );
    samples[700] += 0.6;
    const { data, frames } = neuralSpectrogram(samples);
    expect(frames).toBe(reference.frames);
    for (const point of reference.values)
      expect(
        Math.abs(data[point.band * frames + point.frame] - point.value),
      ).toBeLessThan(0.0001);
  });
  it("returns finite features for silence and a sub-frame clip", () => {
    for (const samples of [new Float32Array(1), new Float32Array(400)]) {
      const { data } = neuralSpectrogram(samples);
      expect([...data].every(Number.isFinite)).toBe(true);
    }
  });
  it("keeps the stronger close peak and rejects a low-prominence shoulder", () => {
    const values = new Float32Array(40);
    values.set([0.1, 0.7, 0.2], 5);
    values.set([0.2, 0.8, 0.3], 10);
    values.set([0.58, 0.6, 0.58], 25);
    // The shoulder's surroundings continue to the baseline, giving full prominence.
    expect(neuralPeaks(values, 0.4)).toEqual([11, 26]);
    const shoulder = new Float32Array(40).fill(0.58);
    shoulder[11] = 0.8;
    shoulder[26] = 0.6;
    expect(neuralPeaks(shoulder, 0.4)).toEqual([11]);
    const plateau = new Float32Array([
      0, 0.7, 0.7, 0.7, 0, 0, 0, 0, 0, 0, 0.8, 0,
    ]);
    expect(neuralPeaks(plateau, 0.4)).toEqual([2, 10]);
  });
});
