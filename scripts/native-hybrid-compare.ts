/** Exact native-onset hybrid comparison after frozen positive raw-model evidence.
 * Only previously inspected public AVP21–28; no fitting or condition search.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { features } from '../src/audio';
import { activeDuration } from '../src/audio-duration';
import { coreDiversity, supportsRelative } from '../src/core-diversity';
const input = 'artifacts/browser-relative/existing-test';
const out = 'artifacts/native-hybrid';
mkdirSync(out, { recursive: true });
const predictions = JSON.parse(readFileSync(`${input}/predictions.json`, 'utf8'));
const names: Record<string, string> = { hhc: 'closed', hho: 'open', kd: 'kick', sd: 'snare' };
const coreNames = ['hat', 'kick', 'snare'], fourNames = ['closed', 'open', 'kick', 'snare'];
const core = (name: string) => ['closed', 'open'].includes(name) ? 'hat' : name;
const allowRequests = process.argv.includes('--request');
if (predictions.rows.length !== 14 || predictions.rows.some((r: any) => r.participant < 21 || r.participant > 28)) throw Error('Unexpected cohort');
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
let previous = 0;
const results = [];
for (const row of predictions.rows) {
  const target = `${out}/${row.stem}.json`;
  let hits: any[];
  if (existsSync(target)) {
    const saved = JSON.parse(readFileSync(target, 'utf8'));
    hits = saved.hits;
    if (hits.length !== row.times.length || hits.some((h, i) => h.time !== row.times[i])) throw Error('Cached boundaries differ');
  } else {
    const bytes = readFileSync(`${input}/${row.stem}-native.f32`);
    const samples = new Float32Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    hits = row.times.map((time: number, i: number) => {
      const end = Math.min(row.times[i+1] ?? samples.length/row.sampleRate, time+.5);
      const { acoustic, ...basic } = features(samples, row.sampleRate, time, end);
      basic.duration = activeDuration(samples, row.sampleRate, time, end);
      return { id: `hit-${i}`, time, duration: end-time, features: basic };
    });
  }
  writeFileSync(target, JSON.stringify({ completed: false, file: row.file, hits, models: row }, null, 2));
  for (let offset = 0; offset < hits.length; offset += 24) {
    const batch = hits.slice(offset, offset+24);
    if (batch.every((h) => h.answer)) continue;
    if (!allowRequests) continue;
    await sleep(Math.max(0, 2300-(Date.now()-previous)));
    previous = Date.now();
    const response = await fetch('https://beatbox.grahammiles.me/api/classify', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://beatbox.grahammiles.me' },
      body: JSON.stringify({ mode: 'hits', examples: [], hits: batch.map(({ id, features }) => ({ id, features })) }),
      signal: AbortSignal.timeout(90000),
    });
    const data: any = await response.json();
    if (!response.ok || !Array.isArray(data.answers)) throw Error(`API ${response.status}: ${JSON.stringify(data)}`);
    for (const hit of batch) { hit.answer = data.answers.find((a: any) => a.id === hit.id); if (!hit.answer) throw Error('Missing answer'); }
    writeFileSync(target, JSON.stringify({ completed: false, file: row.file, hits, models: row }, null, 2));
    console.log(`${row.file}: ${Math.min(offset+24,hits.length)}/${hits.length}`);
  }
  if (!allowRequests) continue;
  const gate = supportsRelative(hits.map((h) => h.features.spectrum));
  const diversity = coreDiversity(hits.map((h) => h.features.spectrum));
  const csv = `artifacts/avp-full/AVP_Dataset/${row.mode}/Participant_${row.participant}/${row.stem}.csv`;
  const reference = readFileSync(csv, 'utf8').trim().split(/\r?\n/).map((line) => { const [time,label] = line.split(','); return { time: Number(time), label: label.trim() }; }).filter((a) => a.label in names);
  const pairs: any[] = [];
  hits.forEach((h, i) => reference.forEach((r, j) => { const error = Math.abs(h.time-r.time); if (error < .05) pairs.push({ error, hit: i, reference: j }); }));
  pairs.sort((a,b) => a.error-b.error);
  const usedHits = new Set(), usedRefs = new Set(), matches = [];
  for (const pair of pairs) {
    if (usedHits.has(pair.hit) || usedRefs.has(pair.reference)) continue;
    usedHits.add(pair.hit); usedRefs.add(pair.reference);
    const i=pair.hit, answer=hits[i].answer, expected=names[reference[pair.reference].label];
    const originalCore=coreNames[row.original.labels[i]], candidateRaw=fourNames[row.combined[i]];
    const retained = !gate || ['ride','crash','aux'].includes(answer.drum);
    const oldHat = (answer.probabilities.closed ?? 0) >= (answer.probabilities.open ?? 0) ? 'closed' : 'open';
    matches.push({ ...pair, expected, typeSafe: answer.drum, originalCore, candidateRaw,
      deployedHybrid: retained ? answer.drum : originalCore === 'hat' ? oldHat : originalCore,
      candidateHybrid: retained ? answer.drum : candidateRaw });
  }
  const result = { completed: true, file: row.file, participant: row.participant, mode: row.mode,
    sampleRate: row.sampleRate, gate, diversity, detected: hits.length, reference: reference.length,
    matched: matches.length, matches, hits, models: row,
    eventPredictions: hits.map((hit, i) => {
      const retained = !gate || ['ride', 'crash', 'aux'].includes(hit.answer.drum);
      const original = coreNames[row.original.labels[i]];
      const subtype = (hit.answer.probabilities.open ?? 0) > (hit.answer.probabilities.closed ?? 0) ? 'open' : 'closed';
      return { id: hit.id, time: hit.time, typeSafe: hit.answer.drum,
        originalCore: original, candidateRaw: fourNames[row.combined[i]],
        deployedHybrid: retained ? hit.answer.drum : original === 'hat' ? subtype : original,
        candidateHybrid: retained ? hit.answer.drum : fourNames[row.combined[i]] };
    }) };
  writeFileSync(target, JSON.stringify(result, null, 2));
  results.push(result);
}
if (!allowRequests) { console.log('Prepared exact features only. No API requests; pass --request after frozen positive raw evidence.'); process.exit(0); }
const summaries = [];
for (const mode of ['all','Fixed','Personal']) {
  const rows=results.filter((r) => mode==='all'||r.mode===mode), events=rows.flatMap((r)=>r.matches);
  const detected=rows.reduce((n,r)=>n+r.detected,0), reference=rows.reduce((n,r)=>n+r.reference,0);
  for (const pipeline of ['typeSafe','originalCore','candidateRaw','deployedHybrid','candidateHybrid']) {
    const correctCore=events.filter((e)=>core(e[pipeline])===core(e.expected)).length;
    const correctFour=pipeline==='originalCore'?null:events.filter((e)=>e[pipeline]===e.expected).length;
    summaries.push({mode,pipeline,detected,reference,matched:events.length,correctCore,correctFour,
      coreAccuracy:correctCore/events.length,coreJointF1:2*correctCore/(detected+reference),
      fourAccuracy:correctFour===null?null:correctFour/events.length,fourJointF1:correctFour===null?null:2*correctFour/(detected+reference),
      perClass:fourNames.map((label)=>{const subset=events.filter((e)=>e.expected===label);return {label,total:subset.length,correctCore:subset.filter((e)=>core(e[pipeline])===core(label)).length,correctFour:pipeline==='originalCore'?null:subset.filter((e)=>e[pipeline]===label).length};})});
  }
}
const old=summaries.find((s)=>s.mode==='all'&&s.pipeline==='originalCore')!, next=summaries.find((s)=>s.mode==='all'&&s.pipeline==='candidateRaw')!;
if(old.detected!==1179||old.matched!==1141||old.correctCore!==950||next.correctCore!==962)throw Error('Native raw baseline parity failed');
const report={scope:'Exact same1179native events on14 previously inspected AVP21–28 grooves. Frozen original/candidate models, gate, API prompt. No fitting or tuning; no reserved/private data.',
  requested:allowRequests,featureSource:'Native original sampleRate audio+pureJS src/audio.ts features, full crop and activeDuration; no acoustic evidence or examples sent.',
  summaries,recordings:results.map(({hits,models,eventPredictions,...r})=>r),limitation:'Previously inspected test cohort; native browser raw features and Python frozen model predictions checked by counts. Production native model inference parity is separate. Noncore retention does not validate noncore classes.'};
writeFileSync(`${out}/report.json`,JSON.stringify(report,null,2));
console.log(JSON.stringify(summaries,null,2));
