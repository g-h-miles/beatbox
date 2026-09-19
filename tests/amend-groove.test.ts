import { describe, it, expect, vi } from "vitest";
import { amendGroove, validateGroove } from "../worker/amend-groove";
import { arrangeBar } from "../src/bar-groove";
import { drums } from "../src/model";
describe("surgical amendments", () => {
  it("changes only explicitly selected cells, preserves manual edits and metadata", async () => {
    const original = arrangeBar("four_floor", "offbeats", "swung", 4, 32);
    original.steps[127].aux = 127;
    const snapshot = structuredClone(original);
    const infer = vi.fn(async (_state: any, questions: any) => ({
      answers: Object.fromEntries(
        Object.keys(questions).map((k) => [
          k,
          {
            type: "choice",
            choice:
              k === "fill"
                ? "none"
                : k === "supported" || k === "closed" || k.startsWith("bar_")
                  ? "yes"
                  : k.startsWith("p")
                    ? k === "p75"
                      ? "add"
                      : "keep"
                    : k.startsWith("alignment_")
                      ? "all"
                      : k.startsWith("v")
                        ? "v56"
                        : "no",
          },
        ]),
      ),
      usage: { input_tokens: 10 },
    }));
    const r = await amendGroove(
      "Add closed hat on bar 3 beat 2a",
      original,
      infer,
    );
    if (!("groove" in r)) throw Error("unexpected unsupported");
    expect(r.edits).toEqual([
      { step: 75, drum: "closed", before: 0, after: 56 },
    ]);
    const expected = structuredClone(snapshot);
    expected.steps[75].closed = 56;
    expect(r.groove).toEqual(expected);
    expect(original).toEqual(snapshot);
    expect(r.modelCalls).toBe(5);
  });
  it("rejects unsupported edits without mutating the pattern", async () => {
    const g = arrangeBar("straight", "eighths", "straight", 4, 16);
    const result = await amendGroove("Change to 7/8", g, async () => ({
      answers: { supported: { type: "choice", choice: "no" } },
    }));
    expect(result).toMatchObject({ unsupported: true, modelCalls: 1 });
  });
  it("rejects malformed existing notes and arrangements", () => {
    const g = arrangeBar("straight", "eighths", "straight", 4, 16);
    expect(validateGroove(g, 4, 16)).toEqual(g);
    expect(() => validateGroove({ ...g, bars: 1 }, 4, 16)).toThrow("input");
    expect(() => validateGroove({ ...g, arrangements: [{}] }, 4, 16)).toThrow(
      "input",
    );
    expect(() =>
      validateGroove(
        {
          ...g,
          steps: g.steps.map(() =>
            Object.fromEntries(drums.map((d) => [d.id, 999])),
          ),
        },
        4,
        16,
      ),
    ).toThrow("input");
  });
});

it.each([16, 32])(
  "adds a bar-2 tom fill without changing other bars at 1/%s",
  async (resolution) => {
    const original = arrangeBar(
      "four_floor",
      "eighths",
      "straight",
      4,
      resolution,
    );
    const snapshot = structuredClone(original);
    const result = await amendGroove(
      "add tom fills on bar 2",
      original,
      async () => ({
        answers: {
          supported: { type: "choice", choice: "yes" },
          fill: { type: "choice", choice: "tom_run" },
          ...Object.fromEntries(
            [1, 2, 3, 4].map((i) => [
              `bar_${i}`,
              { type: "choice", choice: i === 2 ? "yes" : "no" },
            ]),
          ),
        },
      }),
    );
    if (!result.groove || !result.edits) throw Error("Unsupported");
    expect(result.edits.length).toBeGreaterThan(0);
    expect(
      result.edits.every(
        (e) => e.step >= resolution && e.step < 2 * resolution,
      ),
    ).toBe(true);
    expect(result.groove.steps.slice(0, resolution)).toEqual(
      original.steps.slice(0, resolution),
    );
    expect(result.groove.steps.slice(2 * resolution)).toEqual(
      original.steps.slice(2 * resolution),
    );
    expect(result.groove.steps[resolution * 2 - resolution / 4].tom_high).toBe(
      104,
    );
    expect(original).toEqual(snapshot);
  },
);
