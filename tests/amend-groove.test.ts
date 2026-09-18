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
              k === "supported" || k === "closed"
                ? "yes"
                : k.startsWith("p")
                  ? k === "p75"
                    ? "v56"
                    : "keep"
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
    expect(validateGroove(g, 4, 16)).toBe(g);
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
