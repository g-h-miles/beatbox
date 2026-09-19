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
              k === "intent"
                ? "exact"
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
  "applies only Jev's individual fill decisions at 1/%s",
  async (resolution) => {
    const original = arrangeBar(
      "four_floor",
      "eighths",
      "straight",
      4,
      resolution,
    );
    const picked = resolution + 3;
    const infer = async (_state: any, questions: any) =>
      questions.voice
        ? {
            answers: {
              strike: {
                type: "choice",
                choice: _state.currentPosition.index === picked ? "yes" : "no",
              },
              voice: {
                type: "choice",
                choice:
                  _state.currentPosition.index === picked ? "tom_low" : "keep",
              },
              velocity: { type: "choice", choice: "v80" },
            },
          }
        : {
            answers: Object.fromEntries(
              Object.keys(questions).map((k) => [
                k,
                {
                  type: "choice",
                  choice:
                    k === "supported" || k === "bar_2" || k === "tom_low"
                      ? "yes"
                      : k === "intent"
                        ? "fill"
                        : k === "span"
                          ? "custom"
                          : k === "contour"
                            ? "single"
                            : k.startsWith("alignment_")
                              ? "all"
                              : k.startsWith("p")
                                ? k === `p${picked}`
                                  ? "add"
                                  : "keep"
                                : k.startsWith("v")
                                  ? "v80"
                                  : "no",
                },
              ]),
            ),
          };
    const result = await amendGroove("add tom fills on bar 2", original, infer);
    if (!result.groove || !result.edits) throw Error("Unsupported");
    expect(result.edits).toEqual([
      { step: picked, drum: "tom_low", before: 0, after: 80 },
    ]);
    const expected = structuredClone(original);
    expected.steps[picked].tom_low = 80;
    expect(result.groove).toEqual(expected);
  },
);
