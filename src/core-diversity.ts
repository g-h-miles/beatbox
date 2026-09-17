import settings from "./generated/core-diversity.json";
/** Gain-normalized spectral variety; no instrument labels or beat grid are used. */
export function coreDiversity(spectra: (number[] | undefined)[]): number {
  if (spectra.length < 6 || spectra.some(s => !s || s.length !== 20 || s.some(v => !Number.isFinite(v)))) return 0;
  // Bound pairwise work while sampling the complete performance uniformly.
  const count = Math.min(96, spectra.length);
  const selected = Array.from({length: count}, (_, i) => spectra[Math.floor(i * spectra.length / count)]!);
  const distances: number[] = [];
  for (let i=0; i<count; i++) for (let j=i+1; j<count; j++) {
    let square=0;
    for(let k=0;k<20;k++) square+=(selected[i][k]-selected[j][k])**2;
    distances.push(Math.sqrt(square/20));
  }
  distances.sort((a,b)=>a-b);
  return distances[Math.floor((distances.length-1)*.75)];
}

export function supportsRelative(spectra: (number[] | undefined)[]): boolean {
  return coreDiversity(spectra) > settings.threshold;
}
