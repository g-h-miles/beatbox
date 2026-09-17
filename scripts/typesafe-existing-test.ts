/** Frozen TypeSafe versus gated hybrid on previously inspected AVP test21–28; no fitting. */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { features } from '../src/audio';
import { activeDuration } from '../src/audio-duration';
import { coreDiversity, supportsRelative } from '../src/core-diversity';
import gateSettings from '../src/generated/core-diversity.json';
if (gateSettings.threshold !== 1.2873168143334053) throw Error('Predeclared gate threshold changed');
const root = 'artifacts/typesafe-existing-test';
mkdirSync(root, { recursive: true });
const records = JSON.parse(readFileSync('artifacts/events-v2.json', 'utf8')).filter((r: any) => r.participant >= 21 && r.participant <= 28 && r.file.includes('Improvisation'));
const neuralReport = JSON.parse(readFileSync('artifacts/neural-crop/relative-report.json', 'utf8'));
const names: Record<string, string> = { hhc: 'closed', hho: 'open', kd: 'kick', sd: 'snare' };
const core = (label: string) => ['closed', 'open'].includes(label) ? 'hat' : label;
const classOrder = ['hat', 'kick', 'snare'];
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
let previous = 0;
const results: any[] = [];
for (const record of records) {
  const neural = neuralReport.recordings.find((r: any) => r.file === record.file && r.pipeline === 'neural');
  if (!neural) throw Error(`Missing frozen boundaries: ${record.file}`);
  const target = `${root}/${record.file.replace('.wav', '')}.json`;
  const prior = `artifacts/neural-typesafe/${record.file.replace('.wav', '')}-neuralActive.json`;
  let hits: any[];
  if (existsSync(target)) hits = JSON.parse(readFileSync(target, 'utf8')).hits;
  else if ([15, 16].includes(record.participant) && existsSync(prior)) hits = JSON.parse(readFileSync(prior, 'utf8')).hits;
  else {
    const bytes = execFileSync('ffmpeg', ['-v', 'error', '-i', record.path, '-f', 'f32le', '-ar', '44100', '-ac', '1', '-'], { maxBuffer: 50_000_000 });
    const audio = new Float32Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    hits = neural.events.map((event: any, i: number) => {
      const end = Math.min(neural.events[i + 1]?.time ?? audio.length / 44100, event.time + .5);
      const { acoustic, ...basic } = features(audio, 44100, event.time, end);
      basic.duration = activeDuration(audio, 44100, event.time, end);
      return { id: `hit-${i}`, time: event.time, duration: end - event.time, features: basic };
    });
  }
  if (hits.length !== neural.events.length || hits.some((h, i) => h.time !== neural.events[i].time)) throw Error('Boundary mismatch');
  for (let offset = 0; offset < hits.length; offset += 24) {
    const batch = hits.slice(offset, offset + 24);
    if (batch.every((h) => h.answer)) continue;
    await sleep(Math.max(0, 2300 - (Date.now() - previous)));
    previous = Date.now();
    const response = await fetch('https://beatbox.grahammiles.me/api/classify', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://beatbox.grahammiles.me' },
      body: JSON.stringify({ mode: 'hits', examples: [], hits: batch.map(({ id, features }) => ({ id, features })) }),
      signal: AbortSignal.timeout(90000),
    });
    const data: any = await response.json();
    if (!response.ok || !Array.isArray(data.answers)) throw Error(`API ${response.status}: ${JSON.stringify(data)}`);
    for (const h of batch) { h.answer = data.answers.find((a: any) => a.id === h.id); if (!h.answer) throw Error('Missing answer'); }
    writeFileSync(target, JSON.stringify({ completed: false, file: record.file, hits }, null, 2));
    console.log(`${record.file}: ${Math.min(offset + 24, hits.length)}/${hits.length}`);
  }
  const diversity = coreDiversity(hits.map((h) => h.features.spectrum));
  const gateEnabled = supportsRelative(hits.map((h) => h.features.spectrum));
  const truth = record.annotations.filter((a: any) => a.label in names);
  const candidates: any[] = [];
  for (let i = 0; i < hits.length; i++) for (let j = 0; j < truth.length; j++) {
    const error = Math.abs(hits[i].time - truth[j].time);
    if (error < .05) candidates.push({ error, hit: i, reference: j });
  }
  candidates.sort((a, b) => a.error - b.error);
  const usedHits = new Set(), usedRefs = new Set();
  const matches = [];
  for (const candidate of candidates) {
    if (usedHits.has(candidate.hit) || usedRefs.has(candidate.reference)) continue;
    usedHits.add(candidate.hit); usedRefs.add(candidate.reference);
    const expected = names[truth[candidate.reference].label];
    const typeSafe = hits[candidate.hit].answer.drum;
    const svm = classOrder[neural.events[candidate.hit].class];
    const probabilities = hits[candidate.hit].answer.probabilities;
    const hybrid = !gateEnabled || ['ride', 'crash', 'aux'].includes(typeSafe) ? typeSafe : svm === 'hat'
      ? ((probabilities.closed ?? 0) >= (probabilities.open ?? 0) ? 'closed' : 'open') : svm;
    matches.push({ ...candidate, expected, typeSafe, svm, hybrid, typeSafeFour: expected === typeSafe,
      typeSafeCore: core(expected) === core(typeSafe), svmCore: core(expected) === svm,
      hybridFour: expected === hybrid, hybridCore: core(expected) === core(hybrid) });
  }
  const result = { completed: true, file: record.file, participant: record.participant, mode: record.mode,
    diversity, gateEnabled, relativeLabels: gateEnabled ? neural.events.map((e: any) => classOrder[e.class]) : null,
    typeSafeCorrectCore: matches.filter((m) => m.typeSafeCore).length, svmCorrectCore: matches.filter((m) => m.svmCore).length,
    hybridCorrectCore: matches.filter((m) => m.hybridCore).length, hybridCorrectFour: matches.filter((m) => m.hybridFour).length,
    detected: hits.length, reference: truth.length, matched: matches.length, matches, hits };
  writeFileSync(target, JSON.stringify(result, null, 2));
  results.push(result);
}
const summaries = ['all', 'Fixed', 'Personal'].map((mode) => {
  const group = results.filter((r) => mode === 'all' || r.mode === mode);
  const matched = group.reduce((a, r) => a + r.matched, 0), detected = group.reduce((a, r) => a + r.detected, 0), reference = group.reduce((a, r) => a + r.reference, 0);
  const events = group.flatMap((r) => r.matches);
  const correct = (key: string) => events.filter((e) => e[key]).length;
  return { mode, matched, detected, reference, onsetF1: 2 * matched / (detected + reference),
    typeSafeFour: correct('typeSafeFour'), typeSafeCore: correct('typeSafeCore'), svmCore: correct('svmCore'),
    hybridFour: correct('hybridFour'), hybridCore: correct('hybridCore'),
    hybridFourAccuracy: correct('hybridFour') / matched, hybridCoreAccuracy: correct('hybridCore') / matched,
    hybridJointFourF1: 2 * correct('hybridFour') / (detected + reference), hybridJointCoreF1: 2 * correct('hybridCore') / (detected + reference),
    typeSafeFourAccuracy: correct('typeSafeFour') / matched, typeSafeCoreAccuracy: correct('typeSafeCore') / matched, svmCoreAccuracy: correct('svmCore') / matched,
    typeSafeJointFourF1: 2 * correct('typeSafeFour') / (detected + reference), typeSafeJointCoreF1: 2 * correct('typeSafeCore') / (detected + reference), svmJointCoreF1: 2 * correct('svmCore') / (detected + reference),
    typeSafeOnlyCorrect: events.filter((e) => e.typeSafeCore && !e.svmCore).length,
    svmOnlyCorrect: events.filter((e) => e.svmCore && !e.typeSafeCore).length,
    perClass: classOrder.map((label) => { const subset = events.filter((e) => core(e.expected) === label); return { label, total: subset.length, typeSafeCorrect: subset.filter((e) => e.typeSafeCore).length, svmCorrect: subset.filter((e) => e.svmCore).length, hybridCorrect: subset.filter((e) => e.hybridCore).length }; }),
    perFourClass: ['closed', 'open', 'kick', 'snare'].map((label) => { const subset = events.filter((e) => e.expected === label); return { label, total: subset.length, typeSafeCorrect: subset.filter((e) => e.typeSafeFour).length, hybridCorrect: subset.filter((e) => e.hybridFour).length }; }) };
});
const report = { date: new Date().toISOString(), scope: 'Frozen previously inspected AVP test performers21–28 Fixed/Personal; excluded from model training; no fitting or threshold tuning. No new reserved MDV/VIS voices.',
  features: 'Original44.1kHz basicfeatures+spectrum; fullneuralcrop up to0.5s, fixed active duration. No texture mask.',
  reused: 'No prior validation answers reused; each new test recording classified once; local reruns reuse exact answers.', summaries,
  hybrid: 'Predeclared threshold1.2873168143334053: gate-off retains all TypeSafe labels; gate-on retains TypeSafe ride/crash/aux; otherwise SVM core class; hat subtype by larger TypeSafe closed/open posterior. No invented SVM probabilities. Noncore retention is not noncore validation.',
  recordings: results.map(({ hits, ...r }) => r), limitation: 'Previously inspected test cohort, not fresh final testing. TypeSafe seven output labels; SVM core three labels.' };
writeFileSync(`${root}/report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(summaries, null, 2));
