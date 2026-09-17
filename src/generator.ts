import { drums, type Drum } from "./model";

export const VELOCITIES = [0, 32, 56, 80, 104, 127] as const;
export type BeatStep = Record<Drum, number>;
export const stepSeconds = (bpm: number) => 60 / bpm / 4;
export function patternNotes(history: BeatStep[], bpm: number) {
  const interval = stepSeconds(bpm);
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
