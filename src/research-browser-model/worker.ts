/// <reference lib="webworker" />
import { recordingFeatures, loadBrowserModel } from "./index";
import { classifyBrowserFeatures } from "./combine";
self.onmessage = async (
  event: MessageEvent<{ samples: Float32Array; times: number[] }>,
) => {
  try {
    const [coreModel, hatModel] = await Promise.all([
      loadBrowserModel(3),
      loadBrowserModel(4),
    ]);
    const features = recordingFeatures(event.data.samples, event.data.times);
    self.postMessage({
      labels: classifyBrowserFeatures(features, coreModel, hatModel),
    });
  } catch (error) {
    self.postMessage({
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
