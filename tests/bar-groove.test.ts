import { afterEach, describe, expect, it, vi } from "vitest";
import {
  arrangeBar,
  barNotes,
  barMidi,
  foundations,
  tops,
} from "../src/bar-groove";
import { BarPlayer } from "../src/bar-player";
import { composeBar } from "../worker/compose-bar";
afterEach(() => vi.useRealTimers());
describe("whole-bar arrangement", () => {
  it("keeps reggae pulse and a single shared third-beat drop, with hats behind the foundation", () => {
    const g = arrangeBar("one_drop", "offbeat_accent", "straight");
    expect(g.steps.flatMap((s, i) => (s.kick ? [i] : []))).toEqual([8]);
    expect(g.steps.flatMap((s, i) => (s.snare ? [i] : []))).toEqual([8]);
    expect(g.steps.filter((s) => s.closed).length).toBe(8);
    expect(g.steps[0].closed).toBeLessThan(g.steps[2].closed);
    expect(g.steps[8].closed).toBeLessThan(g.steps[8].snare);
  });
  it("exports the same laid-back onset and swing timing used by playback", () => {
    const g = arrangeBar("funk", "sixteenths", "laid_back"),
      notes = barNotes(g, 120);
    expect(
      notes.find((n) => n.drum === "snare" && n.velocity === 104)?.time,
    ).toBeCloseTo(0.509);
    expect(
      notes.find((n) => n.drum === "closed" && n.time > 0)?.time,
    ).toBeCloseTo(0.14);
    const bytes = barMidi(g, 120);
    expect(new TextDecoder().decode(bytes.slice(0, 4))).toBe("MThd");
    // MIDI length is one exact 4/4 bar; subsequent terminal tests inspect exported ticks.
    expect(notes.every((n) => n.time >= 0 && n.time + n.duration < 2)).toBe(
      true,
    );
  });
  it("all authored combinations fit a bar without simultaneous hat voices", () => {
    for (const f of Object.keys(foundations) as (keyof typeof foundations)[])
      for (const t of Object.keys(tops) as (keyof typeof tops)[]) {
        const g = arrangeBar(f, t, "swung");
        expect(g.steps).toHaveLength(16);
        expect(
          g.steps.every(
            (s) => [s.closed, s.open, s.ride].filter(Boolean).length <= 1,
          ),
        ).toBe(true);
        expect(barNotes(g, 240).every((n) => n.time + n.duration <= 1)).toBe(
          true,
        );
      }
  });
  it("conditions cymbals on the entire selected foundation and counts only two calls", async () => {
    const infer = vi
      .fn()
      .mockResolvedValueOnce({
        answers: { foundation: { type: "choice", choice: "one_drop" } },
        usage: { input_tokens: 100 },
      })
      .mockResolvedValueOnce({
        answers: {
          top: { type: "choice", choice: "offbeat_accent" },
          feel: { type: "choice", choice: "straight" },
        },
        usage: { input_tokens: 200 },
      });
    const result = await composeBar("Roots reggae", 90, infer);
    expect(infer.mock.calls[1][0].foundation).toEqual(foundations.one_drop);
    expect(result).toMatchObject({
      modelCalls: 2,
      inputTokens: 300,
      groove: { foundation: "one_drop", top: "offbeat_accent" },
    });
  });
  it("does not substitute a preset for an unsupported request or malformed answer", async () => {
    const infer = vi
      .fn()
      .mockResolvedValue({
        answers: { foundation: { type: "choice", choice: "unsupported" } },
      });
    expect(await composeBar("7/8 polyrhythm", 90, infer)).toMatchObject({
      unsupported: true,
      modelCalls: 1,
    });
    expect(infer).toHaveBeenCalledTimes(1);
    await expect(
      composeBar("x", 90, async () => ({
        answers: { foundation: { type: "choice", choice: "invented" } },
      })),
    ).rejects.toThrow();
  });
});
describe("one-bar playback", () => {
  it("repeats identically without network work and changes only the next bar", () => {
    vi.useFakeTimers();
    let now = 0;
    const first = arrangeBar("straight", "eighths", "straight"),
      second = arrangeBar("one_drop", "offbeat_accent", "straight");
    const hit = vi.fn(),
      bar = vi.fn();
    const p = new BarPlayer(first, 120, {
      now: () => now,
      hit,
      bar,
      click: vi.fn(),
      position: vi.fn(),
    });
    p.start();
    const initial = hit.mock.calls.map(([n, t]) => [n, t]);
    now = 1;
    p.queue(second);
    p.tick();
    expect(bar).toHaveBeenCalledTimes(1);
    now = 2;
    p.tick();
    expect(bar).toHaveBeenLastCalledWith(second);
    const atBoundary = hit.mock.calls.slice(initial.length);
    expect(atBoundary[0][1]).toBeCloseTo(2.08);
    now = 4;
    p.tick();
    const repeated = hit.mock.calls.slice(initial.length + atBoundary.length);
    expect(repeated.map(([n, t]) => [n, t - 2])).toEqual(atBoundary);
    p.stop();
    const count = hit.mock.calls.length;
    now = 8;
    p.tick();
    expect(hit).toHaveBeenCalledTimes(count);
  });
  it("never emits expired notes after a suspended tab", () => {
    vi.useFakeTimers();
    let now = 0;
    const hit = vi.fn();
    const p = new BarPlayer(
      arrangeBar("straight", "eighths", "straight"),
      120,
      { now: () => now, hit, bar: vi.fn(), click: vi.fn(), position: vi.fn() },
    );
    p.start();
    hit.mockClear();
    now = 20.9;
    p.tick();
    expect(hit.mock.calls.every(([, time]) => time >= now)).toBe(true);
    p.stop();
  });
});
