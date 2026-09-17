import { resampleRelative } from "../research-relative/index";
import type { BrowserLabel } from "./combine";
export type { BrowserLabel } from "./combine";
function checkAbort(signal?: AbortSignal) {
  if (signal?.aborted)
    throw new DOMException("Classification cancelled", "AbortError");
}

/** Frozen public-data core classifier. Times and source samples are never changed. */
export async function predictBrowserSounds(
  samples: Float32Array,
  sampleRate: number,
  times: number[],
  signal?: AbortSignal,
): Promise<BrowserLabel[]> {
  checkAbort(signal);
  const hitTimes = [...times];
  if (!Number.isFinite(sampleRate) || sampleRate < 8000 || sampleRate > 192000)
    throw new Error("Unsupported audio sample rate");
  if (!samples.length || samples.length / sampleRate > 90.001)
    throw new Error("Audio must contain between zero and 90 seconds");
  if (hitTimes.length > 600) throw new Error("Too many detected hits");
  for (const sample of samples)
    if (!Number.isFinite(sample))
      throw new Error("Audio contains non-finite samples");
  for (let i = 0; i < hitTimes.length; i++) {
    if (
      !Number.isFinite(hitTimes[i]) ||
      hitTimes[i] < 0 ||
      hitTimes[i] > samples.length / sampleRate ||
      (i > 0 && hitTimes[i] <= hitTimes[i - 1])
    )
      throw new Error("Hit times must be ordered within the audio");
  }
  if (!hitTimes.length) return [];
  const audio = await resampleRelative(samples, sampleRate);
  checkAbort(signal);
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./worker.ts", import.meta.url), {
      type: "module",
    });
    const cleanup = () => {
      worker.terminate();
      signal?.removeEventListener("abort", abort);
    };
    const abort = () => {
      cleanup();
      reject(new DOMException("Classification cancelled", "AbortError"));
    };
    signal?.addEventListener("abort", abort, { once: true });
    worker.onerror = (event) => {
      cleanup();
      reject(new Error(event.message || "Acoustic worker failed"));
    };
    worker.onmessage = (
      event: MessageEvent<{ labels?: BrowserLabel[]; error?: string }>,
    ) => {
      cleanup();
      if (event.data.error) return reject(new Error(event.data.error));
      if (
        !event.data.labels ||
        event.data.labels.length !== hitTimes.length ||
        event.data.labels.some(
          (label) => !["closed", "open", "kick", "snare"].includes(label),
        )
      )
        return reject(new Error("Acoustic model returned invalid labels"));
      resolve(event.data.labels);
    };
    if (signal?.aborted) return abort();
    worker.postMessage({ samples: audio, times: hitTimes }, [audio.buffer]);
  });
}
