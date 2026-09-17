import { pendingBatches } from "../src/generator";
import { describe, expect, it } from "vitest";
import {
  patternNotes,
  patternMidi,
  stepSeconds,
  type BeatStep,
} from "../src/generator";
import { midi } from "../src/midi";
const rest: BeatStep = {
  kick: 0,
  closed: 0,
  open: 0,
  ride: 0,
  crash: 0,
  snare: 0,
  aux: 0,
};
function parseMidi(bytes: Uint8Array) {
  let i = 22,
    tick = 0;
  const notes: { tick: number; note: number; velocity: number }[] = [];
  function variable() {
    let n = 0,
      b;
    do {
      b = bytes[i++];
      n = n * 128 + (b & 127);
    } while (b & 128);
    return n;
  }
  while (i < bytes.length) {
    tick += variable();
    const status = bytes[i++];
    if (status === 255) {
      const kind = bytes[i++];
      const length = variable();
      if (kind === 47) return { notes, end: tick };
      i += length;
    } else {
      const note = bytes[i++],
        velocity = bytes[i++];
      if (status === 0x99) notes.push({ tick, note, velocity });
    }
  }
  throw new Error("Missing end-of-track");
}
describe("generated pattern MIDI", () => {
  it("preserves leading and trailing rests, simultaneous drums and model velocity", () => {
    const history = [
      rest,
      { ...rest, kick: 104, closed: 56 },
      rest,
      { ...rest, snare: 127 },
      rest,
      rest,
      rest,
      rest,
    ];
    const notes = patternNotes(history, 90);
    expect(notes).toHaveLength(3);
    expect(notes[0].time).toBe(stepSeconds(90));
    const parsed = parseMidi(
      midi(notes, 90, 8 * stepSeconds(90), "BEATBOX • generated beat"),
    );
    expect(parsed.notes).toEqual([
      { tick: 2400, note: 36, velocity: 104 },
      { tick: 2400, note: 42, velocity: 56 },
      { tick: 7200, note: 38, velocity: 127 },
    ]);
    expect(parsed.end).toBe(19200);
  });
  it.each([8, 16, 32, 64])(
    "keeps eight bars fixed while changing resolution to 1/%i",
    (resolution) => {
      const history = Array.from({ length: 8 * resolution }, () => ({
        ...rest,
      }));
      history[1].kick = 104;
      history[resolution].snare = 80;
      history[history.length - 1].closed = 56;
      const notes = patternNotes(history, 120, resolution);
      expect(stepSeconds(120, resolution)).toBe(2 / resolution);
      expect(notes[1].time).toBe(2);
      const parsed = parseMidi(
        midi(notes, 120, 8 * resolution * stepSeconds(120, resolution)),
      );
      expect(parsed.notes[0].tick).toBe(38400 / resolution);
      expect(parsed.notes[1].tick).toBe(38400);
      expect(parsed.notes[2].tick).toBe(307200 - 38400 / resolution);
      expect(parsed.end).toBe(307200);
    },
  );

  it.each([8, 16, 32, 64])(
    "exports exact bar ticks despite rounded MIDI tempo at 1/%i",
    (resolution) => {
      const history = Array.from({ length: 8 * resolution }, () => ({
        ...rest,
      }));
      history[history.length - 1].snare = 104;
      const parsed = parseMidi(patternMidi(history, 237, 8, resolution));
      expect(parsed.notes).toEqual([
        { tick: 307200 - 38400 / resolution, note: 38, velocity: 104 },
      ]);
      expect(parsed.end).toBe(307200);
    },
  );
  it("exports an entirely silent pattern at its chosen length", () => {
    const parsed = parseMidi(
      midi(patternNotes(Array(64).fill(rest), 120), 120, 64 * stepSeconds(120)),
    );
    expect(parsed.notes).toEqual([]);
    expect(parsed.end).toBe(153600);
  });
});

describe("parallel position coverage", () => {
  it.each([8, 16, 32, 64, 128, 256])(
    "covers all %i positions without gaps or overlaps",
    (total) => {
      const indices = pendingBatches(total, new Set()).flatMap(
        ({ start, size }) => Array.from({ length: size }, (_, i) => start + i),
      );
      expect(indices).toEqual(Array.from({ length: total }, (_, i) => i));
    },
  );
  it("retries a partial batch but preserves completed chunks", () => {
    const done = new Set([...Array(8).keys(), 9, 10]);
    expect(pendingBatches(16, done)).toEqual([{ start: 8, size: 8 }]);
  });
});
