/** Descriptor masking experiment, NOT a feature measurement or shipping path.
 * All cached neuralActive observations are frozen except flatness=.05, which
 * forces the current production description's neutral texture bucket.
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
const root = 'artifacts/texture-ablation';
mkdirSync(root, { recursive: true });
const core = (label: string) => ['closed', 'open'].includes(label) ? 'hat' : label;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
let previousRequest = 0;
const results = [];
for (const name of readdirSync('artifacts/neural-typesafe').filter((n) => n.endsWith('-neuralActive.json')).sort()) {
  const baseline = JSON.parse(readFileSync(`artifacts/neural-typesafe/${name}`, 'utf8'));
  if (!baseline.completed || ![15, 16].includes(baseline.participant)) throw Error('Unexpected baseline cohort');
  const destination = `${root}/${name}`;
  if (existsSync(destination)) {
    const saved = JSON.parse(readFileSync(destination, 'utf8'));
    if (saved.completed) { results.push(saved); continue; }
  }
  const hits = baseline.hits.map((hit: any) => ({ ...hit, features: { ...hit.features, flatness: .05 }, answer: undefined }));
  for (let offset = 0; offset < hits.length; offset += 24) {
    const batch = hits.slice(offset, offset + 24);
    await sleep(Math.max(0, 2300 - (Date.now() - previousRequest)));
    previousRequest = Date.now();
    const response = await fetch('https://beatbox.grahammiles.me/api/classify', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://beatbox.grahammiles.me' },
      body: JSON.stringify({ mode: 'hits', examples: [], hits: batch.map(({ id, features }: any) => ({ id, features })) }),
      signal: AbortSignal.timeout(90000),
    });
    const data: any = await response.json();
    if (!response.ok || !Array.isArray(data.answers)) throw Error(`API ${response.status}: ${JSON.stringify(data)}`);
    for (const hit of batch) {
      hit.answer = data.answers.find((answer: any) => answer.id === hit.id);
      if (!hit.answer) throw Error(`Missing answer ${hit.id}`);
    }
    console.log(`${name}: ${Math.min(hits.length, offset + 24)}/${hits.length}`);
  }
  const matches = baseline.score.matches.map((m: any) => {
    const predicted = hits[m.hit].answer.drum;
    return { ...m, predicted, correctFour: m.expected === predicted, correctCore: core(m.expected) === core(predicted) };
  });
  const correctFour = matches.filter((m: any) => m.correctFour).length;
  const correctCore = matches.filter((m: any) => m.correctCore).length;
  const score = { ...baseline.score, matches, correctFour, correctCore,
    conditionalFour: correctFour / matches.length, conditionalCore: correctCore / matches.length,
    jointFourF1: 2 * correctFour / (hits.length + baseline.score.reference),
    jointCoreF1: 2 * correctCore / (hits.length + baseline.score.reference) };
  const result = { completed: true, file: baseline.file, participant: baseline.participant, mode: baseline.mode,
    experiment: 'Artificial flatness masking to0.05; not a valid measured descriptor or deployment candidate.',
    baselineScore: baseline.score, score, hits };
  writeFileSync(destination, JSON.stringify(result, null, 2));
  results.push(result);
}
const summaries = ['baselineScore', 'score'].map((key) => {
  const sum = (field: string) => results.reduce((v, r) => v + r[key][field], 0);
  const matched = sum('matched'), detected = sum('detected'), reference = sum('reference');
  const correctFour = sum('correctFour'), correctCore = sum('correctCore');
  return { pipeline: key === 'score' ? 'neutralTextureMask' : 'neuralActive', matched, detected, reference,
    correctFour, correctCore, conditionalFour: correctFour / matched, conditionalCore: correctCore / matched,
    jointFourF1: 2 * correctFour / (detected + reference), jointCoreF1: 2 * correctCore / (detected + reference) };
});
const report = { date: new Date().toISOString(), descriptorMask: { flatness: .05 },
  scope: 'P15/P16 Fixed+Personal public AVP validation grooves; same215neural hits and all other cached features.',
  warning: 'Artificial masking ablation only. Never ship fabricated features. Positive evidence supports studying removal of texture wording or sample-rate-invariant measurements.',
  summaries, recordings: results.map(({ hits, ...rest }) => rest) };
writeFileSync(`${root}/report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(summaries, null, 2));
