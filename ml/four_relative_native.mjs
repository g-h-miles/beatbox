/** Frozen native browser feature extraction for validation15–20 only. */
import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const directory='artifacts/four-relative';mkdirSync(directory,{recursive:true});
const fixtures=JSON.parse(readFileSync('artifacts/relative-parity/audio-fixtures.json','utf8')).filter(x=>x.split==='validation');
const browser=await chromium.launch({headless:true});const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('**/four-relative-fixtures/*',route=>route.fulfill({body:readFileSync('artifacts/relative-parity/'+new URL(route.request().url()).pathname.split('/').pop()),contentType:'application/octet-stream'}));
await page.route('**/four-relative-harness',route=>route.fulfill({body:'<!doctype html><html><body></body></html>',contentType:'text/html'}));await page.goto('http://127.0.0.1:5178/four-relative-harness');
const rows=[];
for(const fixture of fixtures){
 const result=await page.evaluate(async fixture=>{
  const {resampleRelative}=await import('/src/research-relative/index.ts');const {recordingFeatures}=await import('/src/research-relative/features.ts');const {detectNeural}=await import('/src/neural.ts');
  const samples=new Float32Array(await(await fetch('/four-relative-fixtures/'+fixture.stem+'-native.f32')).arrayBuffer());const mono16=await resampleRelative(samples,fixture.sampleRate);const events=await detectNeural(samples,fixture.sampleRate,undefined,undefined,.4);const nativeTimes=events.map(e=>e.time);
  return {nativeTimes,nativeFeatures:recordingFeatures(mono16,nativeTimes).map(x=>Array.from(x)),providedFeatures:recordingFeatures(mono16,fixture.times).map(x=>Array.from(x))};
 },fixture);
 for(const [key,features] of [['native',result.nativeFeatures],['provided',result.providedFeatures]]){const values=Float32Array.from(features.flat());writeFileSync(`${directory}/${fixture.stem}-${key}.f32`,Buffer.from(values.buffer));}
 rows.push({file:fixture.file,stem:fixture.stem,nativeTimes:result.nativeTimes,providedTimes:fixture.times});console.log(fixture.file,result.nativeTimes.length,'native detections');
}
await browser.close();if(errors.length)throw new Error(errors.join('\n'));writeFileSync(directory+'/native-manifest.json',JSON.stringify({protocol:'Validation15–20 only; browser OfflineAudioContext16k; frozen neural threshold0.4; no grid or annotation crop boundaries',rows},null,2));
