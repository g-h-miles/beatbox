/** Paired production TypeSafe ablation on four preselected AVP validation recordings.
 * Only public-audio numeric features go to the live API. No prompt changes,
 * examples, learned classifier evidence, or test-cohort tuning.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { analyze, features } from '../src/audio';
import { activeDuration } from '../src/audio-duration';

const root = 'artifacts/neural-typesafe';
mkdirSync(root, { recursive: true });
const records = JSON.parse(readFileSync('artifacts/events-v2.json', 'utf8')).filter(
  (r: any) => [15, 16].includes(r.participant) && r.file.includes('Improvisation'),
);
const neuralReport = JSON.parse(readFileSync('artifacts/neural-crop/report.json', 'utf8'));
const names: Record<string, string> = { hhc: 'closed', hho: 'open', kd: 'kick', sd: 'snare' };
const core = (name: string) => ['open', 'closed'].includes(name) ? 'hat' : name;
let lastRequest = 0;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const all: any[] = [];
const compareActiveDuration = process.argv.includes('--active-duration');

function score(record: any, hits: any[]) {
  const truth = record.annotations.filter((a: any) => a.label in names);
  const pairs: { error: number; hit: number; ref: number }[] = [];
  for (const [i, hit] of hits.entries()) for (const [j, event] of truth.entries()) {
    const error = Math.abs(hit.time - event.time);
    if (error < .05) pairs.push({ error, hit: i, ref: j });
  }
  pairs.sort((a, b) => a.error - b.error);
  const usedHits = new Set(), usedRefs = new Set();
  const matches: any[] = [];
  for (const p of pairs) {
    if (usedHits.has(p.hit) || usedRefs.has(p.ref)) continue;
    usedHits.add(p.hit); usedRefs.add(p.ref);
    const expected = names[truth[p.ref].label], predicted = hits[p.hit].answer.drum;
    matches.push({ ...p, referenceTime: truth[p.ref].time, expected, predicted,
      correctFour: expected === predicted, correctCore: core(expected) === core(predicted) });
  }
  const correctFour = matches.filter((m) => m.correctFour).length;
  const correctCore = matches.filter((m) => m.correctCore).length;
  return { detected: hits.length, reference: truth.length, matched: matches.length,
    correctFour, correctCore, onsetF1: 2 * matches.length / (hits.length + truth.length),
    conditionalFour: correctFour / matches.length, conditionalCore: correctCore / matches.length,
    jointFourF1: 2 * correctFour / (hits.length + truth.length),
    jointCoreF1: 2 * correctCore / (hits.length + truth.length), matches };
}

for (const record of records) {
  const bytes = execFileSync('ffmpeg', ['-v', 'error', '-i', record.path, '-f', 'f32le', '-ar', '44100', '-ac', '1', '-'], { maxBuffer: 50_000_000 });
  const audio = new Float32Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  const neural = neuralReport.recordings.find((r: any) => r.file === record.file && r.pipeline === 'neural');
  if (!neural) throw Error(`Missing frozen neural boundaries for ${record.file}`);
  const raw = analyze(audio, 44100, 50, 'hits');
  const neuralHits = neural.events.map((e: any, i: number) => {
    const end = Math.min(neural.events[i + 1]?.time ?? audio.length / 44100, e.time + .5);
    return { id: `hit-${i}`, time: e.time, duration: end - e.time,
      features: features(audio, 44100, e.time, end) };
  });
  const variants: [string, any[]][] = [['oldRMS', raw], ['neural', neuralHits]];
  if (compareActiveDuration) variants.push(['neuralActive', neuralHits.map((hit: any) => ({ ...hit,
    features: { ...hit.features, duration: activeDuration(audio, 44100, hit.time, hit.time + hit.duration) },
  }))]);
  for (const [pipeline, source] of variants) {
    const hits = source.map((h: any) => {
      const { acoustic, ...basic } = h.features;
      return { id: h.id, time: h.time, duration: h.duration, features: basic };
    });
    const file = `${root}/${record.file.replace('.wav', '')}-${pipeline}.json`;
    let saved: any;
    try { saved = JSON.parse(readFileSync(file, 'utf8')); } catch { saved = null; }
    if (saved?.completed) {
      all.push(saved); console.log(`Cached ${record.file} ${pipeline}`); continue;
    }
    if (saved?.hits?.length === hits.length) {
      for (const [i, hit] of hits.entries()) {
        const prior = saved.hits[i];
        if (prior.id === hit.id && prior.time === hit.time &&
            JSON.stringify(prior.features) === JSON.stringify(hit.features) && prior.answer)
          hit.answer = prior.answer;
      }
    }
    for (let offset = 0; offset < hits.length; offset += 24) {
      const batch = hits.slice(offset, offset + 24);
      if (batch.every((hit: any) => hit.answer)) continue;
      const payload = { mode: 'hits', examples: [], hits: batch.map(({ id, features }: any) => ({ id, features })) };
      await sleep(Math.max(0, 2300 - (Date.now() - lastRequest)));
      lastRequest = Date.now();
      let response = await fetch('https://beatbox.grahammiles.me/api/classify', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://beatbox.grahammiles.me' },
        body: JSON.stringify(payload), signal: AbortSignal.timeout(90000),
      });
      if (response.status === 429) {
        // One bounded retry honors production rate limiting; do not evade it.
        await sleep(60000);
        lastRequest = Date.now();
        response = await fetch('https://beatbox.grahammiles.me/api/classify', {
          method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://beatbox.grahammiles.me' },
          body: JSON.stringify(payload), signal: AbortSignal.timeout(90000),
        });
      }
      const data: any = await response.json();
      if (!response.ok || !Array.isArray(data.answers)) throw Error(`API ${response.status}: ${JSON.stringify(data)}`);
      for (const hit of batch) {
        const answer = data.answers.find((a: any) => a.id === hit.id);
        if (!answer) throw Error(`Missing ${hit.id}`);
        hit.answer = answer;
      }
      console.log(`${record.file} ${pipeline}: ${Math.min(offset + 24, hits.length)}/${hits.length}`);
      writeFileSync(file, JSON.stringify({ completed: false, file: record.file, pipeline, hits }, null, 2));
    }
    const result = { completed: true, file: record.file, participant: record.participant, mode: record.mode,
      pipeline, hits, score: score(record, hits) };
    writeFileSync(file, JSON.stringify(result, null, 2));
    all.push(result);
  }
}
const summaries = [];
for (const pipeline of compareActiveDuration ? ['oldRMS', 'neural', 'neuralActive'] : ['oldRMS', 'neural']) {
  const rows = all.filter((r) => r.pipeline === pipeline);
  const sum = (name: string) => rows.reduce((v, r) => v + r.score[name], 0);
  const detected = sum('detected'), reference = sum('reference'), matched = sum('matched');
  summaries.push({ pipeline, detected, reference, matched, correctFour: sum('correctFour'), correctCore: sum('correctCore'),
    onsetF1: 2 * matched / (detected + reference), conditionalFour: sum('correctFour') / matched,
    conditionalCore: sum('correctCore') / matched, jointFourF1: 2 * sum('correctFour') / (detected + reference),
    jointCoreF1: 2 * sum('correctCore') / (detected + reference) });
}
const commonMatches = (compareActiveDuration ? ['oldRMS', 'neural'] : ['oldRMS']).flatMap((baseline) => records.map((record: any) => {
  const candidate = compareActiveDuration ? 'neuralActive' : 'neural';
  const a = all.find((r) => r.file === record.file && r.pipeline === baseline).score.matches;
  const b = all.find((r) => r.file === record.file && r.pipeline === candidate).score.matches;
  const shared = a.flatMap((old: any) => {
    const next = b.find((n: any) => n.ref === old.ref);
    return next ? [{ reference: old.ref, oldFour: old.correctFour, newFour: next.correctFour,
      oldCore: old.correctCore, newCore: next.correctCore }] : [];
  });
  return { file: record.file, baseline, candidate, count: shared.length,
    oldFour: shared.filter((s: any) => s.oldFour).length, newFour: shared.filter((s: any) => s.newFour).length,
    oldCore: shared.filter((s: any) => s.oldCore).length, newCore: shared.filter((s: any) => s.newCore).length };
}));
const report = { date: new Date().toISOString(), endpoint: 'https://beatbox.grahammiles.me/api/classify',
  selection: 'Preselected validation performers15/16, Fixed and Personal improvisations; no test recordings.',
  prompt: 'Unmodified production endpoint, no examples, hits mode, basic features+spectrum only.',
  neural: 'Frozen ml-v2/transcriber.pt boundaries and threshold; original time to next predicted onset, maximum0.5sec.',
  activeDuration: compareActiveDuration ? 'Same neural features, replacing duration only by last5ms RMS envelope frame above12%peak;1ms hops. Predefined for all recordings, no per-record tuning.' : null,
  summaries, commonMatches, recordings: all.map(({ hits, ...rest }) => rest),
  limitations: ['Four recordings only; no claim of generalization to new voices or boots-and-cats.',
    'This jointly changes onset candidates and feature crop duration; common-match comparison isolates labels only partially.',
    'Full probabilities and exact submitted features are preserved in per-recording JSON files.'] };
writeFileSync(`${root}/${compareActiveDuration ? 'active-duration-report' : 'report'}.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ summaries, commonMatches }, null, 2));
