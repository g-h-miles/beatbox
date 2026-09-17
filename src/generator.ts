import { drums, type Drum } from "./model";
import { midi } from "./midi";

export const VELOCITIES = [0, 32, 56, 80, 104, 127] as const;
export type BeatStep = Record<Drum, number>;
export const stepSeconds = (bpm: number, resolution = 16) =>
  240 / bpm / resolution;
export function patternNotes(
  history: BeatStep[],
  bpm: number,
  resolution = 16,
) {
  const interval = stepSeconds(bpm, resolution);
  return history.flatMap((step, index) =>
    drums.flatMap(({ id }) =>
      step[id] > 0
        ? [
            {
              drum: id,
              velocity: step[id],
              time: index * interval,
              duration: Math.min(0.06, interval),
            },
          ]
        : [],
    ),
  );
}

export type MusicalIntent = {
  foundation:
    "one_drop" | "backbeat" | "half_time" | "four_on_floor" | "broken" | "free";
  timekeeping:
    | "eighths"
    | "offbeat_eighths"
    | "sixteenths"
    | "quarters"
    | "sparse"
    | "none"
    | "free";
  voice: "closed" | "open" | "ride" | "mixed";
  variation: "steady" | "subtle" | "fills" | "evolving";
  syncopation: "straight" | "offbeats" | "broken";
};

// MIDI tempo is integer microseconds/quarter. Build export timestamps from that
// exact tempo so fine-grid notes and the phrase end remain on integer beat ticks.
// The recorder still uses midi() directly to preserve its original seconds.
export function patternMidi(
  history: BeatStep[],
  bpm: number,
  bars: number,
  resolution: number,
) {
  const beatSeconds = Math.round(60_000_000 / bpm) / 1_000_000;
  return midi(
    patternNotes(history, 60 / beatSeconds, resolution),
    bpm,
    bars * 4 * beatSeconds,
    "BEATBOX • TypeSafe beat",
  );
}

// Cover every position exactly once; partial completion retries only incomplete chunks.
export function pendingBatches(
  total: number,
  completed: Set<number>,
  size = 8,
) {
  return Array.from({ length: Math.ceil(total / size) }, (_, i) => ({
    start: i * size,
    size: Math.min(size, total - i * size),
  })).filter((batch) =>
    Array.from({ length: batch.size }, (_, i) => batch.start + i).some(
      (index) => !completed.has(index),
    ),
  );
}
