/** Extract only allowlisted first8 public Beatboxset training recordings. */
import { chromium } from '@playwright/test';
import { readFileSync,writeFileSync } from 'node:fs';
const directory='artifacts/browser-domain';
const manifest=JSON.parse(readFileSync(`${directory}/training-audio-manifest.json`,'utf8'));
if(manifest.rows.length!==8)throw Error('Expected8trainingfiles');
const allowed=new Set(manifest.rows.map(r=>`${r.stem}-native.f32`));
const browser=await chromium.launch({headless:true});const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('**/browser-domain-fixtures/*',route=>{const name=new URL(route.request().url()).pathname.split('/').pop();if(!allowed.has(name))throw Error('Unallowlisted file');return route.fulfill({body:readFileSync(`${directory}/${name}`),contentType:'application/octet-stream'});});
await page.route('**/browser-domain-harness',route=>route.fulfill({body:'<!doctype html><html><body></body></html>',contentType:'text/html'}));await page.goto('http://127.0.0.1:5178/browser-domain-harness');
const rows=[];
for(const row of manifest.rows){
 const result=await page.evaluate(async row=>{
  const {resampleRelative}=await import('/src/research-relative/index.ts');const {recordingFeatures}=await import('/src/research-relative/features.ts');const {detectNeural}=await import('/src/neural.ts');
  const samples=new Float32Array(await(await fetch(`/browser-domain-fixtures/${row.stem}-native.f32`)).arrayBuffer());const mono16=await resampleRelative(samples,row.sampleRate);const events=await detectNeural(samples,row.sampleRate,undefined,undefined,.4);const times=events.map(e=>e.time);
  return {times,features:recordingFeatures(mono16,times).map(x=>Array.from(x))};
 },row);
 const array=Float32Array.from(result.features.flat());writeFileSync(`${directory}/${row.stem}-features.f32`,Buffer.from(array.buffer));rows.push({...row,times:result.times});console.log(row.file,result.times.length,'detected training events');
}
await browser.close();if(errors.length)throw Error(errors.join('\n'));writeFileSync(`${directory}/training-native-manifest.json`,JSON.stringify({rows},null,2));
