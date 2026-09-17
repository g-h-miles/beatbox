import { beforeEach, describe, expect, it, vi } from "vitest";
import { detectHits } from "../src/detect";
import { detectNeural } from "../src/neural";
import { guess } from "../src/audio";
vi.mock("../src/neural", () => ({ detectNeural: vi.fn() }));
const network = vi.mocked(detectNeural);
const sr = 22050;
const samples = Float32Array.from(
  { length: sr },
  (_, i) => Math.sin(i * 0.02) * 0.25,
);
beforeEach(() => {
  network.mockReset();
});
describe("onset integration", () => {
  it("keeps network onset seconds while ignoring its drum labels", async () => {
    network.mockResolvedValue([
      {
        time: 0.123456,
        drum: "snare",
        confidence: 0.99,
        onsetProbability: 0.99,
      },
    ]);
    const result = await detectHits(
      samples,
      sr,
      50,
      "hits",
      new AbortController().signal,
    );
    expect(result.fallback).toBe(false);
    expect(result.hits[0].time).toBe(0.123456);
    expect(result.hits[0].drum).toBe(guess(result.hits[0].features));
    expect(result.hits[0].drum).not.toBe("snare");
    expect(result.hits[0].confidence).toBeNull();
    expect(result.hits[0].source).toBe("local");
  });
  it("marks fallback explicitly if model loading fails", async () => {
    network.mockRejectedValue(new Error("weights unavailable"));
    const result = await detectHits(
      samples,
      sr,
      50,
      "hits",
      new AbortController().signal,
    );
    expect(result.fallback).toBe(true);
    expect(Array.isArray(result.hits)).toBe(true);
  });
  it("propagates cancellation instead of silently using basic detection", async () => {
    const controller = new AbortController();
    controller.abort();
    network.mockRejectedValue(new DOMException("Cancelled", "AbortError"));
    await expect(
      detectHits(samples, sr, 50, "hits", controller.signal),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
  it("keeps spoken syllable mode separate from the onset network", async () => {
    const result = await detectHits(
      samples,
      sr,
      50,
      "syllables",
      new AbortController().signal,
    );
    expect(network).not.toHaveBeenCalled();
    expect(result.fallback).toBe(false);
  });
});
