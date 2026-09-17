import { drums, type Drum, type Hit } from "./model";

/** Distribution entries are probabilities, unlike Jev's concentration statistic. */
export function probabilities(
  value: unknown,
): Partial<Record<Drum, number>> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  const result: Partial<Record<Drum, number>> = {};
  let sum = 0;
  for (const { id } of drums) {
    const n = (value as Record<string, unknown>)[id];
    if (n === undefined) continue;
    if (typeof n !== "number" || !Number.isFinite(n) || n < 0 || n > 1) return;
    result[id] = n;
    sum += n;
  }
  if (sum < 0.95 || sum > 1.05) return;
  for (const { id } of drums) if (result[id] !== undefined) result[id]! /= sum;
  return result;
}

export type BeatGrid = {
  bpm: number;
  origin: number;
  fit: number;
  source: "manual" | "inferred";
};
const modulo = (n: number, d: number) => ((n % d) + d) % d;

/** Estimate an eighth-note pulse. Tempo alone cannot identify bar one. */
export function estimateTempo(hits: Pick<Hit, "time">[]) {
  const times = hits
    .map((h) => h.time)
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  if (times.length < 6 || times.at(-1)! - times[0] < 2) return null;
  const offsets = times.slice(0, 24);
  let best = { bpm: 120, fit: 0, score: -Infinity };
  for (let bpm = 60; bpm <= 200; bpm += 0.5) {
    const beat = 60 / bpm;
    for (const origin of offsets) {
      const residuals = times.map(
        (t) =>
          Math.abs(
            ((t - origin) / beat) * 2 - Math.round(((t - origin) / beat) * 2),
          ) / 2,
      );
      const fit =
        residuals.reduce((s, r) => s + Math.exp(-0.5 * (r / 0.055) ** 2), 0) /
        times.length;
      // Prefer the common metrical interpretation only when fits are comparable.
      const score = fit - 0.025 * Math.abs(Math.log2(bpm / 110));
      if (score > best.score) best = { bpm, fit, score };
    }
  }
  return best.fit >= 0.7 ? { bpm: best.bpm, fit: best.fit } : null;
}

/** Infer kick/backbeat phase only from clear acoustic or manually confirmed anchors. */
export function inferGrid(
  hits: Hit[],
  bpm: number,
  manualOrigin: number | null,
): BeatGrid | null {
  if (!Number.isFinite(bpm) || bpm < 30 || bpm > 300) return null;
  if (manualOrigin !== null && Number.isFinite(manualOrigin))
    return { bpm, origin: manualOrigin, fit: 1, source: "manual" };
  const beat = 60 / bpm;
  const anchors = hits.flatMap((h) => {
    const p = probabilities(h.probabilities);
    const drum = h.confirmedDrum ? h.drum : (h.acousticDrum ?? h.drum);
    const certainty = h.confirmedDrum ? 1 : (p?.[drum] ?? 0);
    return (drum === "kick" || drum === "snare") && certainty >= 0.75
      ? [{ time: h.time, drum, certainty }]
      : [];
  });
  if (
    anchors.length < 4 ||
    !anchors.some((a) => a.drum === "kick") ||
    !anchors.some((a) => a.drum === "snare")
  )
    return null;
  let best = { origin: 0, fit: 0 };
  for (const anchor of anchors) {
    const origin = anchor.time - (anchor.drum === "snare" ? beat : 0);
    let match = 0,
      total = 0;
    for (const a of anchors) {
      const phase = modulo((a.time - origin) / beat, 2);
      const error =
        a.drum === "kick" ? Math.min(phase, 2 - phase) : Math.abs(phase - 1);
      match += a.certainty * Math.exp(-0.5 * (error / 0.1) ** 2);
      total += a.certainty;
    }
    if (match / total > best.fit) best = { origin, fit: match / total };
  }
  return best.fit >= 0.8 ? { bpm, ...best, source: "inferred" } : null;
}

/** Soft, bounded kick/snare tie-break. Never move, add, remove or quantize events. */
export function applyRhythm(
  hits: Hit[],
  grid: BeatGrid | null,
  enabled: boolean,
): Hit[] {
  return hits.map((h) => {
    const base = h.acousticDrum ?? h.drum;
    const reset = { ...h, drum: base, rhythmAdjusted: false };
    if (h.confirmedDrum || h.source !== "typesafe") return h;
    if (!enabled || !grid) return reset;
    const p = probabilities(h.probabilities);
    if (!p || (base !== "kick" && base !== "snare")) return reset;
    const kick = p.kick ?? 0,
      snare = p.snare ?? 0;
    // Only resolve a real acoustic tie. A hat or a decisive snare stays itself.
    if (
      kick + snare < 0.7 ||
      Math.max(kick, snare) >= 0.75 ||
      Math.min(kick, snare) < 0.2
    )
      return reset;
    const beat = ((h.time - grid.origin) * grid.bpm) / 60;
    const nearest = Math.round(beat),
      error = Math.abs(beat - nearest);
    if (error > 0.12) return reset;
    const expected: Drum = modulo(nearest, 2) === 0 ? "kick" : "snare";
    const weight = 1 + 1.2 * grid.fit * Math.exp(-0.5 * (error / 0.065) ** 2);
    const favored = (p[expected] ?? 0) * weight;
    const rival = expected === "kick" ? snare : kick;
    if (favored <= rival) return reset;
    return { ...reset, drum: expected, rhythmAdjusted: expected !== base };
  });
}
