import { describe, expect, it } from "vitest";
import { patternNotes, stepSeconds, type BeatStep } from "../src/generator";
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
  it("exports an entirely silent pattern at its chosen length", () => {
    const parsed = parseMidi(
      midi(patternNotes(Array(64).fill(rest), 120), 120, 64 * stepSeconds(120)),
    );
    expect(parsed.notes).toEqual([]);
    expect(parsed.end).toBe(153600);
  });
});
