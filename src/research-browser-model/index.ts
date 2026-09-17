import metadata3 from "./model3.json";
import metadata4 from "./model4.json";
export {
  recordingFeatures,
  normalizeRecording,
  FEATURE_COUNT,
} from "../research-relative/features";
export type ModelSize = 3 | 4;
interface Section {
  offset: number;
  length: number;
  dtype: string;
}
export interface Metadata {
  format: string;
  classes: string[];
  featureCount: number;
  supportCount: number;
  supportCounts: number[];
  gamma: number;
  byteLength: number;
  sections: Record<string, Section>;
}
export interface BrowserModel {
  metadata: Metadata;
  mean: Float64Array;
  scale: Float64Array;
  supports: Float32Array;
  dual: Float64Array;
  intercepts: Float64Array;
}
export interface Prediction {
  classIndex: number;
  votes: number[];
  pairScores: number[];
}
export function readBrowserModel(
  buffer: ArrayBuffer,
  size: ModelSize,
): BrowserModel {
  const metadata: Metadata =
    size === 3
      ? metadata3
      : size === 4
        ? metadata4
        : (() => {
            throw new Error("Unsupported model size");
          })();
  return loadModel(buffer, metadata);
}

export function loadModel(
  buffer: ArrayBuffer,
  metadata: Metadata,
): BrowserModel {
  if (buffer.byteLength !== metadata.byteLength)
    throw new Error("Browser model size mismatch");
  const { mean, scale, supports, dual, intercepts } = metadata.sections;
  return {
    metadata,
    mean: new Float64Array(buffer, mean.offset, mean.length),
    scale: new Float64Array(buffer, scale.offset, scale.length),
    supports: new Float32Array(buffer, supports.offset, supports.length),
    dual: new Float64Array(buffer, dual.offset, dual.length),
    intercepts: new Float64Array(buffer, intercepts.offset, intercepts.length),
  };
}
export async function loadBrowserModel(
  size: ModelSize,
  signal?: AbortSignal,
): Promise<BrowserModel> {
  const url =
    size === 3
      ? new URL("./model3.bin", import.meta.url)
      : size === 4
        ? new URL("./model4.bin", import.meta.url)
        : null;
  if (!url) throw new Error("Unsupported model size");
  const response = await fetch(url, { signal });
  if (!response.ok)
    throw new Error(`Browser model unavailable (${response.status})`);
  return readBrowserModel(await response.arrayBuffer(), size);
}
/** sklearn StandardScaler rounds both in-place operations back to float32. */
export function standardizeBrowserFeatures(
  features: Float32Array,
  model: BrowserModel,
): Float32Array {
  const count = model.metadata.featureCount;
  if (features.length !== count)
    throw new Error("Browser model feature count mismatch");
  const output = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    if (!Number.isFinite(features[i]))
      throw new Error("Non-finite browser feature");
    output[i] = Math.fround(
      Math.fround(features[i] - model.mean[i]) / model.scale[i],
    );
  }
  return output;
}
/** Generic LIBSVM OVO order (0,1),(0,2),...; earliest class wins vote ties. */
export function predictBrowserModel(
  features: Float32Array,
  model: BrowserModel,
): Prediction {
  const z = standardizeBrowserFeatures(features, model),
    m = model.metadata,
    kernels = new Float64Array(m.supportCount),
    classes = m.classes.length;
  for (let s = 0; s < m.supportCount; s++) {
    let squared = 0;
    const offset = s * m.featureCount;
    for (let d = 0; d < m.featureCount; d++) {
      const delta = z[d] - model.supports[offset + d];
      squared += delta * delta;
    }
    kernels[s] = Math.exp(-m.gamma * squared);
  }
  const boundaries = [0];
  for (const n of m.supportCounts) boundaries.push(boundaries.at(-1)! + n);
  const votes = Array<number>(classes).fill(0),
    pairScores: number[] = [];
  let pair = 0;
  for (let i = 0; i < classes; i++)
    for (let j = i + 1; j < classes; j++) {
      let score = model.intercepts[pair++];
      for (let s = boundaries[i]; s < boundaries[i + 1]; s++)
        score += kernels[s] * model.dual[(j - 1) * m.supportCount + s];
      for (let s = boundaries[j]; s < boundaries[j + 1]; s++)
        score += kernels[s] * model.dual[i * m.supportCount + s];
      pairScores.push(score);
      votes[score > 0 ? i : j]++;
    }
  let winner = 0;
  for (let c = 1; c < classes; c++) if (votes[c] > votes[winner]) winner = c;
  return { classIndex: winner, votes, pairScores };
}
