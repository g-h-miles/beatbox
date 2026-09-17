/** Native validation with candidate ONNX intercepted only inside this browser. */
import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const directory='artifacts/onset-only';
const rows=JSON.parse(readFileSync('artifacts/typesafe-group-validation/predictions.json','utf8')).rows;
if(rows.length!==12 || rows.some(r=>r.participant<15||r.participant>20||r.file!==`P${r.participant}_Improvisation_${r.mode}.wav`)) throw Error('Unexpected validation cohort');
const allowed=new Set(rows.map(r=>`${r.stem}-audio.f32`));
const model=readFileSync(`${directory}/beatbox-onsets.onnx`);
const conversion=JSON.parse(readFileSync(`${directory}/export.json`,'utf8'));
if(createHash('sha256').update(model).digest('hex')!==conversion.onnxSha256)throw Error('Model hash mismatch');
const browser=await chromium.launch({headless:true});
const context=await browser.newContext();
const page=await context.newPage();
const errors=[];let modelRequests=0;
page.on('pageerror',e=>errors.push(e.message));
await context.route('**/models/beatbox-onsets.onnx',route=>{
  modelRequests++;return route.fulfill({body:model,contentType:'application/octet-stream'});
});
await context.route('**/onset-only-fixtures/*',route=>{
  const name=new URL(route.request().url()).pathname.split('/').pop();
  if(!allowed.has(name))throw Error('Unallowlisted audio');
  return route.fulfill({body:readFileSync(`artifacts/typesafe-group-validation/${name}`),contentType:'application/octet-stream'});
});
await page.route('**/onset-only-harness',route=>route.fulfill({body:'<!doctype html><html><body></body></html>',contentType:'text/html'}));
await page.goto('http://127.0.0.1:5178/onset-only-harness');
const output=[];
for(const row of rows){
  const result=await page.evaluate(async row=>{
    const {detectNeural}=await import('/src/neural.ts');
    const {resampleRelative}=await import('/src/research-relative/index.ts');
    const {recordingFeatures}=await import('/src/research-relative/features.ts');
    const samples=new Float32Array(await(await fetch(`/onset-only-fixtures/${row.stem}-audio.f32`)).arrayBuffer());
    const events=await detectNeural(samples,row.sampleRate,undefined,undefined,.4);
    const times=events.map(e=>e.time);
    const mono=await resampleRelative(samples,row.sampleRate);
    return {times,features:recordingFeatures(mono,times).map(f=>Array.from(f))};
  },row);
  const array=Float32Array.from(result.features.flat());
  writeFileSync(`${directory}/${row.stem}-features.f32`,Buffer.from(array.buffer));
  output.push({file:row.file,stem:row.stem,participant:row.participant,mode:row.mode,sampleRate:row.sampleRate,times:result.times});
  console.log(row.file,result.times.length,'candidate native events');
}
await browser.close();
if(errors.length || modelRequests!==rows.length)throw Error(JSON.stringify({errors,modelRequests,expected:rows.length}));
writeFileSync(`${directory}/native-manifest.json`,JSON.stringify({modelSha256:conversion.onnxSha256,modelRequests,errors,rows:output},null,2));
