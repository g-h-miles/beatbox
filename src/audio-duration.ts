/** Estimate audible envelope length independently of the analysis crop's silence.
 * This descriptor never changes onset timestamps or chooses drum labels.
 */
export function activeDuration(samples: Float32Array, sampleRate: number, start: number, end: number): number {
  if (!Number.isFinite(sampleRate) || sampleRate <= 0 || end <= start) return 0;
  const lo = Math.max(0, Math.floor(start * sampleRate));
  const hi = Math.min(samples.length, Math.floor(end * sampleRate));
  if (hi <= lo) return 0;
  const window = Math.max(1, Math.round(sampleRate * .005));
  const hop = Math.max(1, Math.round(sampleRate * .001));
  const energy: { time: number; rms: number }[] = [];
  let peak = 0;
  for (let at = lo; at < hi; at += hop) {
    let power = 0;
    for (let i = at; i < Math.min(hi, at + window); i++) power += samples[i] ** 2;
    const rms = Math.sqrt(power / window);
    peak = Math.max(peak, rms);
    energy.push({ time: (at - lo + window / 2) / sampleRate, rms });
  }
  if (peak < 1e-6) return 0;
  // Approximately18dB below peak RMS: retain the sound's body and decay,
  // while excluding trailing background/silence from the duration descriptor.
  const threshold = Math.max(1e-6, peak * .12);
  let last = 0;
  for (const frame of energy) if (frame.rms >= threshold) last = frame.time;
  return Math.min((hi - lo) / sampleRate, last);
}
