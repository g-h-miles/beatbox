/** Exact browser training features; explicit public participant1–14 manifest only. */
import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const directory = 'artifacts/browser-relative';
const output = 'artifacts/browser-pitch';
mkdirSync(output,{recursive:true});
const manifest = JSON.parse(readFileSync(`${directory}/training-manifest.json`, 'utf8'));
const allowed = new Set(manifest.rows.map(r => `${r.stem}-native.f32`));
if (manifest.rows.length !== 27 || manifest.rows.some(r => r.participant < 1 || r.participant > 14 || r.file !== `P${r.participant}_Improvisation_${r.mode}.wav`)) throw Error('Training allowlist mismatch');
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.route('**/browser-relative-fixtures/*', route => {
  const name = new URL(route.request().url()).pathname.split('/').pop();
  if (!allowed.has(name)) throw Error('Unallowlisted audio request');
  return route.fulfill({ body: readFileSync(`${directory}/${name}`), contentType: 'application/octet-stream' });
});
await page.route('**/browser-relative-harness', route => route.fulfill({ body: '<!doctype html><html><body></body></html>', contentType: 'text/html' }));
await page.goto('http://127.0.0.1:5178/browser-relative-harness');
const augmented=[];
for (const original of manifest.rows) for (const semitones of [-2,2]) {
  const rate=Math.round(original.sampleRate*2**(semitones/12));
  const ratio=rate/original.sampleRate;
  const row={...original,sampleRate:rate,times:original.times.map(t=>t/ratio),semitones,ratio};
  const features = await page.evaluate(async row => {
    const { resampleRelative } = await import('/src/research-relative/index.ts');
    const { recordingFeatures } = await import('/src/research-relative/features.ts');
    const samples = new Float32Array(await (await fetch(`/browser-relative-fixtures/${row.stem}-native.f32`)).arrayBuffer());
    const mono16 = await resampleRelative(samples, row.sampleRate);
    return recordingFeatures(mono16, row.times).map(x => Array.from(x));
  }, row);
  const array = Float32Array.from(features.flat());
  writeFileSync(`${output}/${row.stem}-${row.semitones}-features.f32`, Buffer.from(array.buffer));
  augmented.push({...row,featureFile:`${row.stem}-${row.semitones}-features.f32`});
  console.log(row.file,row.semitones,features.length,'training events');
}
writeFileSync(`${output}/training-manifest.json`,JSON.stringify({rows:augmented},null,2));
await browser.close();
if (errors.length) throw Error(errors.join('\n'));
