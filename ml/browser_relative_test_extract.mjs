/** Frozen-candidate test extraction: explicit previously inspected AVP21–28 only. */
import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
const directory='artifacts/browser-relative/existing-test';
const manifest=JSON.parse(readFileSync(`${directory}/audio-manifest.json`,'utf8'));
const allowed=new Set(manifest.rows.map(r=>`${r.stem}-native.f32`));
if(manifest.rows.length!==14 || manifest.rows.some(r=>r.participant<21||r.participant>28||r.file!==`P${r.participant}_Improvisation_${r.mode}.wav`))throw Error('Test allowlist mismatch');
const browser=await chromium.launch({headless:true});const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('**/browser-relative-test-fixtures/*',route=>{const name=new URL(route.request().url()).pathname.split('/').pop();if(!allowed.has(name))throw Error('Unallowlisted audio');return route.fulfill({body:readFileSync(`${directory}/${name}`),contentType:'application/octet-stream'});});
await page.route('**/browser-relative-test-harness',route=>route.fulfill({body:'<!doctype html><html><body></body></html>',contentType:'text/html'}));
await page.goto('http://127.0.0.1:5178/browser-relative-test-harness');
const rows=[];
for(const row of manifest.rows){
 const result=await page.evaluate(async row=>{
  const {resampleRelative}=await import('/src/research-relative/index.ts');const {recordingFeatures}=await import('/src/research-relative/features.ts');const {detectNeural}=await import('/src/neural.ts');
  const samples=new Float32Array(await(await fetch(`/browser-relative-test-fixtures/${row.stem}-native.f32`)).arrayBuffer());
  const mono16=await resampleRelative(samples,row.sampleRate);const events=await detectNeural(samples,row.sampleRate,undefined,undefined,.4);const times=events.map(e=>e.time);
  return {times,features:recordingFeatures(mono16,times).map(x=>Array.from(x))};
 },row);
 const array=Float32Array.from(result.features.flat());writeFileSync(`${directory}/${row.stem}-features.f32`,Buffer.from(array.buffer));rows.push({...row,times:result.times});console.log(row.file,result.times.length,'test events');
}
await browser.close();if(errors.length)throw Error(errors.join('\n'));
writeFileSync(`${directory}/native-manifest.json`,JSON.stringify({rows},null,2));
