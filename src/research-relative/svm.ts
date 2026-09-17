import metadata from "./model.json";
import { FEATURE_COUNT } from "./features";
export type CoreClass = "hat" | "kick" | "snare";
export interface RelativePrediction {
  drum: CoreClass;
  votes: number[];
  pairScores: number[];
}
export interface RelativeModel {
  mean: Float64Array;
  scale: Float64Array;
  supports: Float32Array;
  dual: Float64Array;
  intercepts: Float64Array;
}

export function readModel(buffer: ArrayBuffer): RelativeModel {
  if (buffer.byteLength !== metadata.byteLength)
    throw new Error("Relative model size mismatch");
  const { mean, scale, supports, dual, intercepts } = metadata.sections;
  return {
    mean: new Float64Array(buffer, mean.offset, mean.length),
    scale: new Float64Array(buffer, scale.offset, scale.length),
    supports: new Float32Array(buffer, supports.offset, supports.length),
    dual: new Float64Array(buffer, dual.offset, dual.length),
    intercepts: new Float64Array(buffer, intercepts.offset, intercepts.length),
  };
}

/** LIBSVM one-vs-one voting, with the original earliest-class tie rule. */
export function predictRelative(
  features: Float32Array,
  model: RelativeModel,
): RelativePrediction {
  if (features.length !== FEATURE_COUNT)
    throw new Error("Relative model feature count mismatch");
  const standardized = new Float32Array(FEATURE_COUNT);
  for (let d = 0; d < FEATURE_COUNT; d++) {
    if (!Number.isFinite(features[d]))
      throw new Error("Non-finite relative feature");
    standardized[d] = Math.fround(
      Math.fround(features[d] - model.mean[d]) / model.scale[d],
    );
  }
  const kernels = new Float64Array(metadata.supportCount);
  for (let s = 0; s < kernels.length; s++) {
    let squared = 0;
    const offset = s * FEATURE_COUNT;
    for (let d = 0; d < FEATURE_COUNT; d++) {
      const delta = standardized[d] - model.supports[offset + d];
      squared += delta * delta;
    }
    kernels[s] = Math.exp(-metadata.gamma * squared);
  }
  const boundaries = [0];
  for (const count of metadata.supportCounts)
    boundaries.push(boundaries[boundaries.length - 1] + count);
  const votes = [0, 0, 0],
    pairScores = [];
  let pair = 0;
  for (let i = 0; i < 3; i++)
    for (let j = i + 1; j < 3; j++) {
      let score = model.intercepts[pair++];
      for (let s = boundaries[i]; s < boundaries[i + 1]; s++)
        score += kernels[s] * model.dual[(j - 1) * metadata.supportCount + s];
      for (let s = boundaries[j]; s < boundaries[j + 1]; s++)
        score += kernels[s] * model.dual[i * metadata.supportCount + s];
      pairScores.push(score);
      votes[score > 0 ? i : j]++;
    }
  let winner = 0;
  for (let c = 1; c < 3; c++) if (votes[c] > votes[winner]) winner = c;
  return { drum: metadata.classes[winner] as CoreClass, votes, pairScores };
}
