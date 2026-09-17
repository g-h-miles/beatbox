export interface NeuralEvent {
  time: number;
  drum: "kick" | "snare" | "closed" | "open";
  confidence: number;
  onsetProbability: number;
}

/** Research candidate; callers must not present four-class scores as seven-class validation. */
export async function detectNeural(
  samples: Float32Array,
  sampleRate: number,
  onProgress?: (fraction: number) => void,
  signal?: AbortSignal,
  threshold = 0.4,
): Promise<NeuralEvent[]> {
  if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
  if (
    !samples.length ||
    samples.length / sampleRate > 90 ||
    !Number.isFinite(sampleRate) ||
    sampleRate < 8000
  )
    throw new Error("Use an audio clip between 0 and 90 seconds.");
  let peak = 0;
  for (const sample of samples) {
    if (!Number.isFinite(sample))
      throw new Error("Audio contains invalid samples.");
    peak = Math.max(peak, Math.abs(sample));
  }
  if (peak < 0.0001) return [];
  let resampled: Float32Array;
  if (sampleRate === 22050) resampled = samples.slice();
  else {
    const context = new OfflineAudioContext(
      1,
      Math.ceil((samples.length * 22050) / sampleRate),
      22050,
    );
    const buffer = context.createBuffer(1, samples.length, sampleRate);
    buffer.copyToChannel(new Float32Array(samples), 0);
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);
    source.start();
    resampled = (await context.startRendering()).getChannelData(0).slice();
  }
  if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./neural-worker.ts", import.meta.url), {
      type: "module",
    });
    const finish = () => {
      worker.terminate();
      signal?.removeEventListener("abort", abort);
    };
    const abort = () => {
      finish();
      reject(new DOMException("Cancelled", "AbortError"));
    };
    signal?.addEventListener("abort", abort, { once: true });
    worker.onerror = (event) => {
      finish();
      reject(new Error(event.message || "Neural worker failed."));
    };
    worker.onmessage = (event) => {
      if (event.data.type === "progress") onProgress?.(event.data.fraction);
      if (event.data.type === "complete") {
        finish();
        resolve(event.data.events);
      }
      if (event.data.type === "error") {
        finish();
        reject(new Error(event.data.message));
      }
    };
    worker.postMessage({ samples: resampled, threshold }, [resampled.buffer]);
  });
}
