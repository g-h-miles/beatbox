import { describe, expect, it } from "vitest";
import {
  applyRhythm,
  estimateTempo,
  inferGrid,
  probabilities,
  type BeatGrid,
} from "../src/rhythm";
import { midi } from "../src/midi";
import type { Hit } from "../src/model";
const f = {
  duration: 0.1,
  centroid: 500,
  low: 0.5,
  mid: 0.4,
  high: 0.1,
  flatness: 0.1,
  zcr: 0.1,
  attack: 0.01,
  rms: 0.2,
};
const hit = (time: number, kick = 0.45, snare = 0.55): Hit => ({
  id: `hit-${Math.round(time * 1000)}`,
  time,
  duration: 0.1,
  velocity: 90,
  drum: snare > kick ? "snare" : "kick",
  acousticDrum: snare > kick ? "snare" : "kick",
  confidence: 0.1,
  probabilities: { kick, snare },
  source: "typesafe",
  features: f,
});
const grid: BeatGrid = { bpm: 120, origin: 0.123, fit: 1, source: "manual" };
describe("rhythm-assisted labels", () => {
  it("resolves uncertain kick/snare ties on alternating beats", () => {
    const result = applyRhythm(
      [hit(0.123), hit(0.623, 0.55, 0.45), hit(1.123), hit(1.623, 0.55, 0.45)],
      grid,
      true,
    );
    expect(result.map((h) => h.drum)).toEqual([
      "kick",
      "snare",
      "kick",
      "snare",
    ]);
    expect(result.every((h) => h.rhythmAdjusted)).toBe(true);
  });
  it("does not override decisive, manual, offbeat or non-kick/snare evidence", () => {
    const examples = [
      hit(0.123, 0.05, 0.95),
      { ...hit(0.123), confirmedDrum: true },
      hit(0.373),
      {
        ...hit(0.123),
        drum: "closed" as const,
        acousticDrum: "closed" as const,
        probabilities: { closed: 0.6, kick: 0.2, snare: 0.2 },
      },
    ];
    expect(applyRhythm(examples, grid, true).map((h) => h.drum)).toEqual(
      examples.map((h) => h.drum),
    );
  });
  it("preserves original hit timing, duration, velocity and raw judgment", () => {
    const original = [hit(0.137), hit(0.61, 0.55, 0.45)];
    const changed = applyRhythm(original, grid, true);
    expect(
      changed.map(
        ({ time, duration, velocity, confidence, probabilities }) => ({
          time,
          duration,
          velocity,
          confidence,
          probabilities,
        }),
      ),
    ).toEqual(
      original.map(
        ({ time, duration, velocity, confidence, probabilities }) => ({
          time,
          duration,
          velocity,
          confidence,
          probabilities,
        }),
      ),
    );
    const restored = applyRhythm(changed, grid, false);
    expect(restored.map((h) => h.drum)).toEqual(original.map((h) => h.drum));
    expect(original[0].drum).toBe("snare");
    // Swapping only note numbers back must produce byte-identical MIDI.
    expect(
      midi(
        changed.map((h, i) => ({ ...h, drum: original[i].drum })),
        120,
        2,
      ),
    ).toEqual(midi(original, 120, 2));
  });
  it("does not compound prior weights on repeated calls", () => {
    const first = applyRhythm([hit(0.123)], grid, true);
    expect(applyRhythm(first, grid, true)).toEqual(first);
  });
  it("ignores missing/invalid probability distributions", () => {
    expect(probabilities({ kick: NaN, snare: 0.5 })).toBeUndefined();
    expect(probabilities({ kick: 0.1, snare: 0.1 })).toBeUndefined();
    const input = { ...hit(0.123), probabilities: undefined };
    expect(applyRhythm([input], grid, true)[0].drum).toBe(input.drum);
  });
});
describe("pulse estimation", () => {
  it("estimates a regular pulse with microtiming variation", () => {
    const times = Array.from({ length: 24 }, (_, i) => ({
      time: 0.23 + i * 0.25 + ((i % 3) - 1) * 0.008,
    }));
    const result = estimateTempo(times);
    expect(result?.bpm).toBeCloseTo(120, 0);
    expect(result!.fit).toBeGreaterThan(0.9);
  });
  it("requires enough evidence and leaves pickups unassumed", () => {
    expect(estimateTempo([hit(0), hit(0.5)])).toBeNull();
    expect(
      inferGrid([hit(0), hit(0.5), hit(1), hit(1.5)], 120, null),
    ).toBeNull();
    const anchors = [
      hit(0.2, 0.05, 0.95),
      hit(0.7, 0.95, 0.05),
      hit(1.2, 0.05, 0.95),
      hit(1.7, 0.95, 0.05),
    ];
    const inferred = inferGrid(anchors, 120, null);
    expect(inferred).not.toBeNull();
    expect(applyRhythm([hit(2.2, 0.55, 0.45)], inferred, true)[0].drum).toBe(
      "snare",
    );
  });
  it("abstains when confident anchors do not fit the entered tempo", () => {
    const anchors = [
      hit(0.2, 0.95, 0.05),
      hit(0.55, 0.05, 0.95),
      hit(1.05, 0.95, 0.05),
      hit(1.4, 0.05, 0.95),
    ];
    expect(inferGrid(anchors, 120, null)).toBeNull();
  });
});
