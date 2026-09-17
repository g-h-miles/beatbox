/** Validation-only fixed-rule diagnostic; does not read the existing test cohort. */
import { readFileSync, writeFileSync } from 'node:fs';
import { supportsRelative } from '../src/core-diversity';
const root = 'artifacts/typesafe-validation';
const original = JSON.parse(readFileSync(`${root}/report.json`, 'utf8'));
const core = (label: string) => ['closed', 'open'].includes(label) ? 'hat' : label;
const recordings = original.recordings.map((record: any) => {
  if (record.participant < 15 || record.participant > 20) throw Error('Validation cohort only');
  const full = JSON.parse(readFileSync(`${root}/${record.file.replace('.wav', '')}.json`, 'utf8'));
  const gate = supportsRelative(full.hits.map((hit: any) => hit.features.spectrum));
  const matches = record.matches.map((event: any) => {
    const baseline = gate ? event.hybrid : event.typeSafe;
    const candidate = event.typeSafe === 'snare' ? 'snare' : baseline;
    return { expected: event.expected, baseline, candidate, changed: baseline !== candidate,
      baselineFour: baseline === event.expected, candidateFour: candidate === event.expected,
      baselineCore: core(baseline) === core(event.expected), candidateCore: core(candidate) === core(event.expected) };
  });
  return { file: record.file, participant: record.participant, mode: record.mode, gate,
    detected: record.detected, reference: record.reference, matched: record.matched, matches };
});
const summaries = ['all', 'Fixed', 'Personal'].map((mode) => {
  const rows = recordings.filter((r: any) => mode === 'all' || r.mode === mode);
  const matches = rows.flatMap((r: any) => r.matches);
  const detected = rows.reduce((a: number, r: any) => a + r.detected, 0);
  const reference = rows.reduce((a: number, r: any) => a + r.reference, 0);
  const sum = (key: string, subset = matches) => subset.filter((m: any) => m[key]).length;
  const fields = Object.fromEntries(['baselineFour', 'candidateFour', 'baselineCore', 'candidateCore'].map((key) => [key,
    { correct: sum(key), accuracy: sum(key) / matches.length, jointF1: 2 * sum(key) / (detected + reference) }]));
  return { mode, detected, reference, matched: matches.length, ...fields,
    changed: sum('changed'), correctedCore: matches.filter((m: any) => !m.baselineCore && m.candidateCore).length,
    spoiledCore: matches.filter((m: any) => m.baselineCore && !m.candidateCore).length,
    perClass: ['closed', 'open', 'kick', 'snare'].map((label) => {
      const subset = matches.filter((m: any) => m.expected === label);
      return { label, total: subset.length, baselineCorrect: sum('baselineFour', subset), candidateCorrect: sum('candidateFour', subset) };
    }) };
});
const report = { scope: 'Only existing P15–20 validation caches read. No new API calls, fitting, threshold search, or P21–28 evaluation.',
  rule: 'If TypeSafe predicts snare, preserve it; otherwise use the frozen diversity-gated hybrid.',
  limitation: 'Hypothesis motivated by previously seen snare errors; this validation diagnostic is not independent test evidence. No deployment.',
  summaries, recordings };
writeFileSync(`${root}/preserve-snare-report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(summaries, null, 2));
