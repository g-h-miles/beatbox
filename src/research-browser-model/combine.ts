import { wardGroups, pooledCoreLabels } from "../research-relative/consistency";
import {
  predictBrowserModel,
  standardizeBrowserFeatures,
  type BrowserModel,
} from "./index";
export type BrowserLabel = "closed" | "open" | "kick" | "snare";
/** Frozen core votes plus a separate closed/open pairwise margin. */
export function classifyBrowserFeatures(
  features: Float32Array[],
  coreModel: BrowserModel,
  hatModel: BrowserModel,
): BrowserLabel[] {
  const coreGroups = wardGroups(
    features.map((row) => standardizeBrowserFeatures(row, coreModel)),
  );
  const core = pooledCoreLabels(
    coreGroups,
    features.map((row) => predictBrowserModel(row, coreModel).pairScores),
  );
  const hatGroups = wardGroups(
    features.map((row) => standardizeBrowserFeatures(row, hatModel)),
  );
  const margins = features.map(
    (row) => predictBrowserModel(row, hatModel).pairScores[0],
  );
  const sums = new Map<number, { sum: number; count: number }>();
  hatGroups.forEach((group, i) => {
    const item = sums.get(group) ?? { sum: 0, count: 0 };
    item.sum += margins[i];
    item.count++;
    sums.set(group, item);
  });
  return core.map((label, i) =>
    label === 1
      ? "kick"
      : label === 2
        ? "snare"
        : sums.get(hatGroups[i])!.sum / sums.get(hatGroups[i])!.count > 0
          ? "closed"
          : "open",
  );
}
