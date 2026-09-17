import type { CoreClass } from "./svm";
export type { CoreClass } from "./svm";

function checkAbort(signal?: AbortSignal) {
  if (signal?.aborted)
    throw new DOMException("Classification cancelled", "AbortError");
}

/** OfflineAudioContext uses the browser's antialiased resampler, verified separately from Python's. */
export async function resampleRelative(
  samples: Float32Array,
  sampleRate: number,
): Promise<Float32Array> {
  if (sampleRate === 16000) return samples.slice();
  const context = new OfflineAudioContext(
    1,
    Math.ceil((samples.length * 16000) / sampleRate),
    16000,
  );
  const buffer = context.createBuffer(1, samples.length, sampleRate);
  buffer.copyToChannel(new Float32Array(samples), 0);
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.connect(context.destination);
  source.start();
  const rendered = await context.startRendering();
  return rendered.getChannelData(0).slice();
}

/** Frozen public-data core classifier. Times and source samples are never changed. */
export async function predictRelative(
  samples: Float32Array,
  sampleRate: number,
  times: number[],
  signal?: AbortSignal,
): Promise<CoreClass[]> {
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
      event: MessageEvent<{ labels?: CoreClass[]; error?: string }>,
    ) => {
      cleanup();
      if (event.data.error) return reject(new Error(event.data.error));
      if (
        !event.data.labels ||
        event.data.labels.length !== hitTimes.length ||
        event.data.labels.some(
          (label) => !["hat", "kick", "snare"].includes(label),
        )
      )
        return reject(new Error("Acoustic model returned invalid labels"));
      resolve(event.data.labels);
    };
    if (signal?.aborted) return abort();
    worker.postMessage({ samples: audio, times: hitTimes }, [audio.buffer]);
  });
}
