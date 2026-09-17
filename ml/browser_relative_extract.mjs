/** Exact browser training features; explicit public participant1–14 manifest only. */
import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
const directory = 'artifacts/browser-relative';
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
for (const row of manifest.rows) {
  const features = await page.evaluate(async row => {
    const { resampleRelative } = await import('/src/research-relative/index.ts');
    const { recordingFeatures } = await import('/src/research-relative/features.ts');
    const samples = new Float32Array(await (await fetch(`/browser-relative-fixtures/${row.stem}-native.f32`)).arrayBuffer());
    const mono16 = await resampleRelative(samples, row.sampleRate);
    return recordingFeatures(mono16, row.times).map(x => Array.from(x));
  }, row);
  const array = Float32Array.from(features.flat());
  writeFileSync(`${directory}/${row.stem}-features.f32`, Buffer.from(array.buffer));
  console.log(row.file, features.length, 'training events');
}
await browser.close();
if (errors.length) throw Error(errors.join('\n'));
