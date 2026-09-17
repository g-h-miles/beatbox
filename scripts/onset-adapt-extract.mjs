/** Allowlisted AVP1–14 training onsets; candidate ONNX intercepted only in research. */
import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
const directory='artifacts/onset-adapt';mkdirSync(directory,{recursive:true});
const rows=JSON.parse(readFileSync('artifacts/browser-relative/training-manifest.json','utf8')).rows;
if(rows.length!==27 || rows.some(r=>r.participant<1||r.participant>14||r.file!==`P${r.participant}_Improvisation_${r.mode}.wav`)) throw Error('Unexpected training cohort');
const allowed=new Set(rows.map(r=>`${r.stem}-native.f32`));
const model=readFileSync('artifacts/onset-only/beatbox-onsets.onnx');
const conversion=JSON.parse(readFileSync('artifacts/onset-only/export.json','utf8'));
if(createHash('sha256').update(model).digest('hex')!==conversion.onnxSha256)throw Error('Model hash mismatch');
const browser=await chromium.launch({headless:true});
const context=await browser.newContext();
const page=await context.newPage();
const errors=[];let modelRequests=0;
page.on('pageerror',e=>errors.push(e.message));
await context.route('**/models/beatbox-onsets.onnx',route=>{
  modelRequests++;return route.fulfill({body:model,contentType:'application/octet-stream'});
});
await context.route('**/onset-adapt-fixtures/*',route=>{
  const name=new URL(route.request().url()).pathname.split('/').pop();
  if(!allowed.has(name))throw Error('Unallowlisted audio');
  return route.fulfill({body:readFileSync(`artifacts/browser-relative/${name}`),contentType:'application/octet-stream'});
});
await page.route('**/onset-adapt-harness',route=>route.fulfill({body:'<!doctype html><html><body></body></html>',contentType:'text/html'}));
await page.goto('http://127.0.0.1:5178/onset-adapt-harness');
const output=[];
for(const row of rows){
  const result=await page.evaluate(async row=>{
    const {detectNeural}=await import('/src/neural.ts');
    const {resampleRelative}=await import('/src/research-relative/index.ts');
    const {recordingFeatures}=await import('/src/research-relative/features.ts');
    const samples=new Float32Array(await(await fetch(`/onset-adapt-fixtures/${row.stem}-native.f32`)).arrayBuffer());
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
