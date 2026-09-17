import type { Hit } from "./model";
export type CoreLabel = "hat" | "kick" | "snare" | "closed" | "open";
/** Frozen hybrid rule, evaluated before integration. No note timing changes. */
export function applyCoreLabels(hits: Hit[], labels: CoreLabel[]): Hit[] {
  if (
    hits.length !== labels.length ||
    labels.some(
      (label) => !["hat", "kick", "snare", "closed", "open"].includes(label),
    )
  )
    throw new Error("Incomplete core classification.");
  return hits.map((hit, index) => {
    if (hit.confirmedDrum || hit.source === "manual") return hit;
    if (
      hit.source === "typesafe" &&
      ["ride", "crash", "aux"].includes(hit.drum)
    )
      return hit;
    const core = labels[index];
    const drum =
      core === "hat"
        ? (hit.probabilities?.open ?? 0) > (hit.probabilities?.closed ?? 0)
          ? "open"
          : "closed"
        : core;
    return {
      ...hit,
      drum,
      acousticDrum: drum,
      source: "model",
      confidence: null,
      probabilities: undefined,
      rhythmAdjusted: false,
    };
  });
}
