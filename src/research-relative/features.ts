import FFT from "fft.js";
import settings from "./settings.json";

const f32 = Math.fround;
const scratch = new ArrayBuffer(4);
const bits = new Uint32Array(scratch);
const floats = new Float32Array(scratch);
const WINDOWS = [
  [0, 2],
  [2, 10],
  [10, 25],
  [0, 10],
] as const;
export const FEATURE_COUNT = 1104;

/** Round float32 through IEEE binary16, matching the cached Python fbank. */
export function halfRound(value: number): number {
  floats[0] = value;
  const u = bits[0],
    sign = u >>> 31 ? -1 : 1;
  const exponent = ((u >>> 23) & 255) - 127;
  const mantissa = u & 0x7fffff;
  if (exponent === 128) return mantissa ? NaN : sign * Infinity;
  if (exponent > 15) return sign * Infinity;
  if (exponent < -25) return sign * 0;
  const shift = exponent < -14 ? -14 - exponent + 13 : 13;
  const significand = exponent < -14 ? mantissa + 0x800000 : mantissa;
  const divisor = 2 ** shift;
  let rounded = Math.floor(significand / divisor);
  const remainder = significand - rounded * divisor;
  if (remainder > divisor / 2 || (remainder === divisor / 2 && rounded % 2))
    rounded++;
  if (exponent < -14) return sign * rounded * 2 ** -24;
  if (exponent === 15 && rounded === 1024) return sign * Infinity;
  return sign * (1 + rounded / 1024) * 2 ** exponent;
}

/** Python round: ties to even, including an exactly half-sample crop boundary. */
function roundEven(value: number): number {
  const floor = Math.floor(value),
    fraction = value - floor;
  return fraction > 0.5 || (fraction === 0.5 && floor % 2 !== 0)
    ? floor + 1
    : floor;
}

export function cropHit(
  samples: Float32Array,
  start: number,
  end: number,
): Float32Array {
  const result = new Float32Array(8000);
  const lo = Math.max(0, roundEven((start - 0.01) * 16000));
  const hi = Math.min(samples.length, roundEven(end * 16000), lo + 8000);
  const length = Math.max(0, hi - lo);
  if (!length) return result;
  let mean = 0;
  for (let i = lo; i < hi; i++) mean += samples[i];
  mean = f32(mean / length);
  let peak = 0.0001;
  for (let i = 0; i < length; i++) {
    result[i] = f32(samples[lo + i] - mean);
    peak = Math.max(peak, Math.abs(result[i]));
  }
  const gain = f32(0.8 / peak);
  for (let i = 0; i < length; i++) result[i] = f32(result[i] * gain);
  return result;
}

/** Kaldi defaults: snip edges, frame DC removal, .97 preemphasis, Povey, power/log mel. */
export function kaldiBank(crop: Float32Array): Float32Array {
  if (crop.length !== 8000) throw new Error("Expected an 8000-sample hit crop");
  const transform = new FFT(512);
  const input = new Float64Array(512);
  const spectrum = transform.createComplexArray();
  const frame = new Float32Array(400);
  const power = new Float32Array(257);
  const output = new Float32Array(48 * 128);
  for (let n = 0; n < 48; n++) {
    let mean = 0;
    for (let j = 0; j < 400; j++) {
      frame[j] = f32(crop[n * 160 + j] * 32768);
      mean += frame[j];
    }
    mean = f32(mean / 400);
    for (let j = 0; j < 400; j++) frame[j] = f32(frame[j] - mean);
    input.fill(0);
    for (let j = 0; j < 400; j++) {
      const emphasized = f32(
        frame[j] - f32(f32(0.97) * frame[Math.max(0, j - 1)]),
      );
      input[j] = f32(emphasized * settings.window[j]);
    }
    transform.realTransform(spectrum, input);
    for (let bin = 0; bin <= 256; bin++) {
      const magnitude = f32(
        Math.hypot(f32(spectrum[2 * bin]), f32(spectrum[2 * bin + 1])),
      );
      power[bin] = f32(magnitude * magnitude);
    }
    for (let band = 0; band < 128; band++) {
      let energy = 0;
      for (const [bin, weight] of settings.mel[band])
        energy = f32(energy + f32(power[bin] * weight));
      const log = f32(Math.log(Math.max(2 ** -23, energy)));
      output[n * 128 + band] = halfRound(
        f32(f32(log - f32(15.41663)) / f32(13.11164)),
      );
    }
  }
  return output;
}

/** Independent event descriptors; no label information enters preprocessing. */
export function describeBank(bank: Float32Array): Float32Array {
  if (bank.length !== 48 * 128) throw new Error("Expected 48 × 128 filterbank");
  const output = new Float32Array(FEATURE_COUNT);
  let offset = 0;
  for (const [lo, hi] of WINDOWS) {
    const means = new Float32Array(128);
    const deviations = new Float32Array(128);
    for (let band = 0; band < 128; band++) {
      let sum = 0;
      for (let n = lo; n < hi; n++) sum = f32(sum + bank[n * 128 + band]);
      means[band] = f32(sum / (hi - lo));
      let variance = 0;
      for (let n = lo; n < hi; n++) {
        const difference = f32(bank[n * 128 + band] - means[band]);
        variance = f32(variance + f32(difference * difference));
      }
      deviations[band] = f32(Math.sqrt(f32(variance / (hi - lo))));
    }
    let frequencyMean = 0;
    for (const value of means) frequencyMean += value;
    frequencyMean = f32(frequencyMean / 128);
    for (let band = 0; band < 128; band++)
      output[offset++] = f32(means[band] - frequencyMean);
    output.set(deviations, offset);
    offset += 128;
    for (let k = 0; k < 20; k++) {
      let value = 0;
      for (let band = 0; band < 128; band++)
        value += means[band] * settings.dct[k][band];
      output[offset++] = f32(value);
    }
  }
  return output;
}

/** Includes every predicted event, even a false or unmatched onset. */
export function normalizeRecording(rows: Float32Array[]): Float32Array[] {
  if (!rows.length) return [];
  const output = rows.map(() => new Float32Array(FEATURE_COUNT));
  const sorted = new Float32Array(rows.length);
  for (let feature = 0; feature < FEATURE_COUNT; feature++) {
    let mean = 0;
    for (let i = 0; i < rows.length; i++) {
      sorted[i] = rows[i][feature];
      mean = f32(mean + sorted[i]);
    }
    mean = f32(mean / rows.length);
    sorted.sort();
    const mid = Math.floor(rows.length / 2);
    const median =
      rows.length % 2
        ? sorted[mid]
        : f32(f32(sorted[mid - 1] + sorted[mid]) / 2);
    let variance = 0;
    for (const row of rows) {
      const difference = f32(row[feature] - mean);
      variance = f32(variance + f32(difference * difference));
    }
    const denominator = f32(
      f32(Math.sqrt(f32(variance / rows.length))) + f32(0.1),
    );
    for (let i = 0; i < rows.length; i++)
      output[i][feature] = f32(f32(rows[i][feature] - median) / denominator);
  }
  return output;
}

export function recordingFeatures(
  samples16k: Float32Array,
  times: number[],
  progress?: (value: number) => void,
): Float32Array[] {
  const rows = times.map((time, index) => {
    const end = times[index + 1] ?? samples16k.length / 16000;
    const row = describeBank(kaldiBank(cropHit(samples16k, time, end)));
    progress?.((index + 1) / times.length);
    return row;
  });
  return normalizeRecording(rows);
}
