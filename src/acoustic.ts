import model from "./generated/acoustic-model.json";
import type { Features, Drum } from "./model";

// Exported CatBoost inference. Inputs and tree ordering are verified against
// Python predictions on held-out voices, rather than a reimplementation mock.
export function acousticProbabilities(
  f: Features,
): { drum: Drum; probability: number }[] | null {
  if (f.acoustic?.length !== 80 || f.spectrum?.length !== 20) return null;
  const x = [
    ...f.acoustic,
    ...f.spectrum,
    f.duration,
    f.centroid,
    f.low,
    f.mid,
    f.high,
    f.flatness,
    f.zcr,
    f.attack,
  ];
  for (const offset of [0, 20, 40, 80]) {
    for (let k = 1; k <= 13; k++) {
      let sum = 0;
      for (let j = 0; j < 20; j++)
        sum += x[offset + j] * Math.cos((Math.PI * k * (2 * j + 1)) / 40);
      x.push(sum * Math.sqrt(2 / 20));
    }
  }
  const scores = Array(4).fill(0);
  for (const tree of model.trees) {
    let leaf = 0;
    tree.splits.forEach(([feature, border], i) => {
      if (Math.fround(x[feature]) > border) leaf |= 1 << i;
    });
    for (let c = 0; c < 4; c++) scores[c] += tree.leaves[leaf * 4 + c];
  }
  const maximum = Math.max(...scores),
    exp = scores.map((v) => Math.exp(v - maximum)),
    total = exp.reduce((s, v) => s + v, 0);
  return model.classes
    .map((drum, i) => ({ drum: drum as Drum, probability: exp[i] / total }))
    .sort((a, b) => b.probability - a.probability);
}
export function acousticEvidence(f: Features) {
  const scores = acousticProbabilities(f);
  if (!scores) return "";
  return ` A supervised acoustic model trained on labeled human beatboxing provides this additional evidence: ${scores.map((s) => `${s.drum} ${(100 * s.probability).toFixed(1)}%`).join(", ")}. These scores compare ONLY kick, snare, closed hat and open hat; they cannot rule out ride, crash or breath. For a normal beatbox hit, prefer the strongest acoustic candidate over simplistic bass/treble rules, especially when its score exceeds 75%. Personal labeled examples take precedence. These are model scores, not guaranteed accuracy.`;
}
