import { analyze, features, guess } from "./audio";
import { activeDuration } from "./audio-duration";
import { detectNeural } from "./neural";
import type { Hit } from "./model";

/** Use the onset network for timing only; instrument decisions stay separate. */
export async function detectHits(
  samples: Float32Array,
  sampleRate: number,
  sensitivity: number,
  mode: "hits" | "syllables",
  signal: AbortSignal,
  progress?: (fraction: number) => void,
): Promise<{ hits: Hit[]; fallback: boolean }> {
  if (mode === "syllables")
    return {
      hits: analyze(samples, sampleRate, sensitivity, mode),
      fallback: false,
    };
  try {
    const events = await detectNeural(
      samples,
      sampleRate,
      progress,
      signal,
      0.7 - sensitivity * 0.006,
    );
    const hits = events.map((event, i): Hit => {
      const end = Math.min(
        samples.length / sampleRate,
        event.time + 0.5,
        events[i + 1]?.time ?? Infinity,
      );
      const f = features(samples, sampleRate, event.time, end);
      f.duration = activeDuration(samples, sampleRate, event.time, end);
      return {
        id: `hit-${i}`,
        time: event.time,
        duration: Math.max(0.025, end - event.time),
        velocity: Math.max(
          30,
          Math.min(127, Math.round(35 + Math.sqrt(f.rms) * 150)),
        ),
        drum: guess(f),
        confidence: null,
        source: "local",
        features: f,
      };
    });
    return { hits, fallback: false };
  } catch (error) {
    if (signal.aborted) throw error;
    return {
      hits: analyze(samples, sampleRate, sensitivity, mode),
      fallback: true,
    };
  }
}
