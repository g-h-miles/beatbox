import * as ort from "onnxruntime-web/wasm";
import settings from "./generated/neural-settings.json";
import { neuralPeaks, neuralSpectrogram } from "./neural-spectrogram";

// Bundled assets use the same pinned runtime version, without a third-party CDN.
ort.env.wasm.numThreads = 1;
ort.env.wasm.wasmPaths = {
  wasm: new URL(
    "../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm",
    import.meta.url,
  ).href,
  mjs: new URL(
    "../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.mjs",
    import.meta.url,
  ).href,
};
let session: Promise<ort.InferenceSession> | undefined;
const labels = ["closed", "open", "kick", "snare"] as const;
self.onmessage = async (
  event: MessageEvent<{ samples: Float32Array; threshold?: number }>,
) => {
  try {
    session ??= ort.InferenceSession.create("/models/beatbox-onsets.onnx", {
      executionProviders: ["wasm"],
    });
    const { data, frames } = neuralSpectrogram(event.data.samples);
    const runtime = await session;
    const onset = new Float32Array(frames);
    const drum = new Uint8Array(frames);
    const confidence = new Float32Array(frames);
    for (let offset = 0; offset < frames; offset += 800) {
      const count = Math.min(800, frames - offset);
      const length = count + 192;
      const chunk = new Float32Array(64 * length).fill(-2);
      for (let band = 0; band < 64; band++) {
        for (let t = 0; t < length; t++) {
          const source = offset + t - 96;
          if (source >= 0 && source < frames)
            chunk[band * length + t] = data[band * frames + source];
        }
      }
      const input = new ort.Tensor("float32", chunk, [1, 64, length]);
      const result = await runtime.run({ spectrogram: input });
      const onsets = result.onsetLogits.data as Float32Array;
      const classes = result.drumLogits.data as Float32Array;
      for (let t = 0; t < count; t++) {
        onset[offset + t] = 1 / (1 + Math.exp(-onsets[t + 96]));
        let best = 0;
        for (let c = 1; c < 4; c++)
          if (classes[c * length + t + 96] > classes[best * length + t + 96])
            best = c;
        let sum = 0;
        for (let c = 0; c < 4; c++)
          sum += Math.exp(
            classes[c * length + t + 96] - classes[best * length + t + 96],
          );
        drum[offset + t] = best;
        confidence[offset + t] = 1 / sum;
      }
      input.dispose();
      Object.values(result).forEach((tensor) => tensor.dispose());
      self.postMessage({
        type: "progress",
        fraction: Math.min(1, (offset + count) / frames),
      });
    }
    const events = neuralPeaks(
      onset,
      event.data.threshold ?? settings.threshold,
    ).map((frame) => ({
      time: (frame * settings.hop) / settings.sampleRate,
      drum: labels[drum[frame]],
      confidence: confidence[frame],
      onsetProbability: onset[frame],
    }));
    self.postMessage({ type: "complete", events });
  } catch (error) {
    session = undefined;
    self.postMessage({
      type: "error",
      message:
        error instanceof Error ? error.message : "Neural detection failed.",
    });
  }
};
