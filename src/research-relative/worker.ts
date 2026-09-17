/// <reference lib="webworker" />
import { recordingFeatures } from "./features";
import { readModel, predictRelative } from "./svm";

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
    const labels = features.map((row) => predictRelative(row, model).drum);
    self.postMessage({ labels });
  } catch (error) {
    self.postMessage({
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
