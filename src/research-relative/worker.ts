/// <reference lib="webworker" />
import { recordingFeatures } from "./features";
import { readModel, predictRelative, standardizeRelative } from "./svm";

import { wardGroups, pooledCoreLabels } from "./consistency";

self.onmessage = async (
  event: MessageEvent<{ samples: Float32Array; times: number[] }>,
) => {
  try {
    const response = await fetch(
      new URL("./relative-model.bin", import.meta.url),
    );
    if (!response.ok)
      throw new Error(`Could not load acoustic model (${response.status})`);
    const model = readModel(await response.arrayBuffer());
    const features = recordingFeatures(event.data.samples, event.data.times);
    const predictions = features.map((row) => predictRelative(row, model));
    const groups = wardGroups(
      features.map((row) => standardizeRelative(row, model)),
    );
    const classes = ["hat", "kick", "snare"] as const;
    const labels = pooledCoreLabels(
      groups,
      predictions.map((row) => row.pairScores),
    ).map((label) => classes[label]);
    self.postMessage({ labels });
  } catch (error) {
    self.postMessage({
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
