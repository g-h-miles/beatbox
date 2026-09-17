import { describe, it, expect } from "vitest";
import { analyze } from "../src/audio";
import { midi } from "../src/midi";
import { drums, type Hit } from "../src/model";
const f = {
  duration: 0.1,
  centroid: 100,
  low: 0.8,
  mid: 0.15,
  high: 0.05,
  flatness: 0.01,
  zcr: 0.01,
  attack: 0.005,
  rms: 0.5,
};
const hit = (time: number, drum: Hit["drum"] = "kick"): Hit => ({
  id: "hit-0",
  time,
  duration: 0.1,
  velocity: 100,
  drum,
  source: "manual",
  confidence: null,
  features: f,
});
function decode(bytes: Uint8Array) {
  let i = 22,
    ticks = 0,
    tempo = 500000;
  const notes: {
    note: number;
    tick: number;
    velocity: number;
    channel: number;
  }[] = [];
  const vlq = () => {
    let n = 0,
      b = 0;
    do {
      b = bytes[i++];
      n = n * 128 + (b & 127);
    } while (b & 128);
    return n;
  };
  while (i < bytes.length) {
    ticks += vlq();
    const status = bytes[i++];
    if (status === 255) {
      const kind = bytes[i++],
        len = vlq();
      if (kind === 81)
        tempo = bytes[i] * 65536 + bytes[i + 1] * 256 + bytes[i + 2];
      i += len;
    } else {
      const note = bytes[i++],
        velocity = bytes[i++];
      if ((status & 240) === 144)
        notes.push({ note, tick: ticks, velocity, channel: status & 15 });
    }
  }
  return { notes, tempo, ppq: bytes[12] * 256 + bytes[13] };
}
describe("unquantized MIDI", () => {
  for (const bpm of [30, 93, 120, 173, 300])
    it(`preserves leading silence and irregular seconds at ${bpm} BPM`, () => {
      const times = [
          0.23147, 0.49813, 0.77183, 1.0074, 1.0413, 13.39827, 89.12,
        ],
        r = decode(
          midi(
            times.map((t) => hit(t)),
            bpm,
            90,
          ),
        );
      expect(r.notes).toHaveLength(times.length);
      r.notes.forEach((n, i) => {
        expect(
          Math.abs(((n.tick / r.ppq) * r.tempo) / 1e6 - times[i]),
        ).toBeLessThan(0.00011);
        expect(n.channel).toBe(9);
        expect(n.velocity).toBe(100);
      });
    });
  it("maps every class to GM percussion", () => {
    expect(
      decode(midi(drums.map((d, i) => hit(i, d.id)))).notes.map((n) => n.note),
    ).toEqual([36, 42, 46, 51, 49, 38, 75]);
  });
  it("sorts edits chronologically and exports an empty track", () => {
    expect(decode(midi([hit(1), hit(0.2)])).notes.map((n) => n.tick)).toEqual([
      3840, 19200,
    ]);
    expect(decode(midi([])).notes).toEqual([]);
  });
});
describe("onsets", () => {
  it("detects irregular attacks with leading silence at multiple sample rates", () => {
    for (const sr of [22050, 44100, 48000]) {
      const x = new Float32Array(sr * 3);
      const times = [0.233, 0.502, 0.731, 1.08, 1.21, 1.811, 2.31];
      for (const time of times) {
        for (let j = 0; j < sr * 0.08; j++) {
          const k = Math.floor(time * sr) + j;
          x[k] = 0.8 * Math.exp(-j / (sr * 0.016)) * Math.cos(j * 0.2);
        }
      }
      const hits = analyze(x, sr);
      expect(hits).toHaveLength(times.length);
      hits.forEach((h, i) =>
        expect(Math.abs(h.time - times[i])).toBeLessThan(0.0005),
      );
    }
  });
  it("retains a hit at the very beginning", () => {
    const x = new Float32Array(44100);
    for (let i = 0; i < 4000; i++)
      x[i] = 0.8 * Math.exp(-i / 600) * Math.cos(i * 0.2);
    expect(analyze(x, 44100)[0].time).toBe(0);
  });
  it("does not turn silence into hits", () => {
    expect(analyze(new Float32Array(44100), 44100)).toEqual([]);
  });
});

describe("spoken-syllable grouping", () => {
  it("keeps consonant tails with the preceding word without shifting its onset", () => {
    const sr = 44100,
      x = new Float32Array(sr * 2);
    const burst = (
      start: number,
      length: number,
      amp: number,
      frequency = 0.19,
    ) => {
      for (let j = 0; j < length * sr; j++)
        x[Math.floor(start * sr) + j] +=
          amp * Math.cos(j * frequency) * Math.exp(-j / (length * sr * 0.8));
    };
    burst(0.2, 0.25, 0.7);
    burst(0.5, 0.1, 0.15, 1.2);
    burst(0.91, 0.25, 0.7);
    burst(1.21, 0.1, 0.15, 1.2);
    const regular = analyze(x, sr, 50, "hits"),
      syllables = analyze(x, sr, 50, "syllables");
    expect(regular.length).toBeGreaterThan(2);
    expect(syllables).toHaveLength(2);
    expect(syllables[0].time).toBeCloseTo(0.2, 3);
    expect(syllables[1].time).toBeCloseTo(0.91, 3);
  });
});
