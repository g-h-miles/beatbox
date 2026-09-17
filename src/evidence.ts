import type { Features } from "./model";
// Turn calculated measurements into plain acoustic observations. This is not a
// label predictor; Jev chooses the instrument from the observations.
export function describe(f: Features) {
  const band =
    f.high > 0.65
      ? "Strongly dominated by high-frequency hiss"
      : f.low > 0.4
        ? "Bass-dominated"
        : f.mid > 0.6
          ? "Midrange-dominated"
          : "Mixed-frequency";
  const length =
    f.duration < 0.18
      ? "short"
      : f.duration < 0.35
        ? "medium length"
        : "sustained";
  const texture =
    f.flatness < 0.02
      ? "tonal or resonant"
      : f.flatness > 0.12
        ? "noise-like"
        : "mixed tonal/noisy";
  return `${band}, ${length} (${Math.round(f.duration * 1000)} milliseconds), ${texture}. Spectral brightness ${Math.round(f.centroid)} Hz. Energy: bass ${Math.round(f.low * 100)}%, mids ${Math.round(f.mid * 100)}%, treble ${Math.round(f.high * 100)}%. Attack peak after ${Math.round(f.attack * 1000)} milliseconds.`;
}
export function spectralDistance(a: Features, b: Features) {
  if (!a.spectrum || !b.spectrum) return Infinity;
  return Math.sqrt(
    a.spectrum.reduce((sum, v, i) => sum + (v - b.spectrum![i]) ** 2, 0) /
      a.spectrum.length,
  );
}
