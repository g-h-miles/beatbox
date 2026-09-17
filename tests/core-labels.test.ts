import { describe, expect, it } from "vitest";
import { applyCoreLabels } from "../src/core-labels";
import type { Hit } from "../src/model";
const hit = (patch: Partial<Hit> = {}): Hit => ({
  id: "hit-0",
  time: 0.173291,
  duration: 0.11231,
  velocity: 97,
  drum: "kick",
  source: "typesafe",
  confidence: 0.99,
  features: {} as Hit["features"],
  probabilities: { kick: 0.7, snare: 0.2, closed: 0.06, open: 0.04 },
  ...patch,
});
describe("validated core and cymbal combination", () => {
  it("uses the core decision without claiming the old TypeSafe confidence or moving notes", () => {
    const original = hit();
    const [result] = applyCoreLabels([original], ["snare"]);
    expect(result).toMatchObject({
      drum: "snare",
      acousticDrum: "snare",
      source: "model",
      confidence: null,
      time: original.time,
      duration: original.duration,
      velocity: original.velocity,
    });
    expect(result.probabilities).toBeUndefined();
    expect(original.drum).toBe("kick");
  });
  it("preserves user edits and TypeSafe noncore outputs", () => {
    for (const original of [
      hit({ source: "manual" }),
      hit({ confirmedDrum: true }),
      hit({ drum: "ride" }),
      hit({ drum: "crash" }),
      hit({ drum: "aux" }),
    ])
      expect(applyCoreLabels([original], ["snare"])[0]).toBe(original);
  });
  it("uses only the closed/open posterior for a predicted hat and has a deterministic tie", () => {
    expect(applyCoreLabels([hit()], ["hat"])[0].drum).toBe("closed");
    expect(
      applyCoreLabels(
        [hit({ probabilities: { kick: 0.8, open: 0.15, closed: 0.05 } })],
        ["hat"],
      )[0].drum,
    ).toBe("open");
    expect(
      applyCoreLabels([hit({ probabilities: undefined })], ["hat"])[0].drum,
    ).toBe("closed");
  });
  it("rejects a partial result rather than shifting predictions onto the wrong hit", () => {
    expect(() => applyCoreLabels([hit()], [])).toThrow("Incomplete");
  });
});
