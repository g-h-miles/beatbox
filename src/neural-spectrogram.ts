import FFT from "fft.js";
import settings from "./generated/neural-settings.json";

/** Matches librosa's centered STFT, Slaney mel bank and per-recording dB scale. */
export function neuralSpectrogram(samples: Float32Array) {
  const { fft: size, hop, mel } = settings;
  const frames = 1 + Math.floor(samples.length / hop);
  const output = new Float32Array(mel.length * frames);
  const transform = new FFT(size);
  const window = Float64Array.from(
    { length: size },
    (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / size),
  );
  const input = new Float64Array(size);
  const spectrum = transform.createComplexArray();
  const power = new Float64Array(size / 2 + 1);
  let maximum = 1e-10;
  for (let frame = 0; frame < frames; frame++) {
    const start = frame * hop - size / 2;
    for (let i = 0; i < size; i++)
      input[i] = (samples[start + i] ?? 0) * window[i];
    transform.realTransform(spectrum, input);
    for (let bin = 0; bin < power.length; bin++)
      power[bin] = spectrum[2 * bin] ** 2 + spectrum[2 * bin + 1] ** 2;
    for (let band = 0; band < mel.length; band++) {
      let value = 0;
      for (const [bin, weight] of mel[band]) value += power[bin] * weight;
      output[band * frames + frame] = value;
      maximum = Math.max(maximum, value);
    }
  }
  const reference = 10 * Math.log10(maximum);
  for (let i = 0; i < output.length; i++) {
    const db = Math.max(
      -80,
      10 * Math.log10(Math.max(1e-10, output[i])) - reference,
    );
    output[i] = (db + 40) / 20;
  }
  return { data: output, frames };
}

/** Same local-maxima, spacing and prominence policy used in Python evaluation. */
export function neuralPeaks(
  values: Float32Array,
  threshold = settings.threshold,
) {
  const candidates: number[] = [];
  for (let i = 1; i < values.length - 1; i++) {
    if (values[i] <= values[i - 1]) continue;
    let end = i;
    while (end + 1 < values.length && values[end + 1] === values[i]) end++;
    if (
      end + 1 < values.length &&
      values[end + 1] < values[i] &&
      values[i] >= threshold
    )
      candidates.push(Math.floor((i + end) / 2));
    i = end;
  }
  const blocked = new Uint8Array(values.length);
  const separated: number[] = [];
  candidates.sort((a, b) => values[b] - values[a] || b - a);
  for (const peak of candidates) {
    if (blocked[peak]) continue;
    separated.push(peak);
    blocked.fill(1, Math.max(0, peak - 7), Math.min(values.length, peak + 8));
  }
  return separated
    .filter((peak) => {
      const floor = values[peak] - 0.05;
      const drops = (direction: number) => {
        for (
          let at = peak + direction;
          at >= 0 && at < values.length;
          at += direction
        ) {
          if (values[at] > values[peak]) return false;
          if (values[at] <= floor) return true;
        }
        return false;
      };
      return drops(-1) && drops(1);
    })
    .sort((a, b) => a - b);
}
