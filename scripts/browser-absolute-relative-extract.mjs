/** Preserve absolute and recording-relative browser features; fixed public cohorts only. */
import {chromium} from '@playwright/test';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
const out='artifacts/browser-absolute-relative';mkdirSync(out,{recursive:true});
const train=JSON.parse(readFileSync('artifacts/browser-relative/training-manifest.json')).rows;
const val=JSON.parse(readFileSync('artifacts/typesafe-group-validation/predictions.json')).rows;
if(train.length!==27||train.some(r=>r.participant<1||r.participant>14)||val.length!==12||val.some(r=>r.participant<15||r.participant>20))throw Error('Cohort mismatch');
const rows=[...train.map(r=>({...r,split:'training',audio:`artifacts/browser-relative/${r.stem}-native.f32`,reference:`artifacts/browser-relative/${r.stem}-features.f32`})),...val.map(r=>({...r,split:'validation',audio:`artifacts/typesafe-group-validation/${r.stem}-audio.f32`,reference:`artifacts/four-relative/${r.stem}-native.f32`}))];
const allowed=new Map(rows.map(r=>[r.stem,r.audio]));
const browser=await chromium.launch({headless:true}),page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('**/absolute-relative-audio/*',route=>{const path=allowed.get(new URL(route.request().url()).pathname.split('/').pop());if(!path)throw Error('Unallowlisted audio');return route.fulfill({body:readFileSync(path),contentType:'application/octet-stream'});});
await page.route('**/absolute-relative-harness',route=>route.fulfill({body:'<!doctype html><html><body></body></html>',contentType:'text/html'}));
await page.goto('http://127.0.0.1:5178/absolute-relative-harness');
const output=[];
for(const row of rows){
 const result=await page.evaluate(async r=>{
  const {resampleRelative}=await import('/src/research-relative/index.ts');
  const {cropHit,kaldiBank,describeBank,normalizeRecording}=await import('/src/research-relative/features.ts');
  const samples=new Float32Array(await(await fetch(`/absolute-relative-audio/${r.stem}`)).arrayBuffer());
  const mono=await resampleRelative(samples,r.sampleRate);
  const raw=r.times.map((t,i)=>describeBank(kaldiBank(cropHit(mono,t,r.times[i+1]??mono.length/16000))));
  const relative=normalizeRecording(raw);
  return raw.map((v,i)=>[...v,...relative[i]]);
 },{stem:row.stem,times:row.times,sampleRate:row.sampleRate});
 const referenceBytes=readFileSync(row.reference);const reference=new Float32Array(referenceBytes.buffer,referenceBytes.byteOffset,referenceBytes.byteLength/4);
 if(reference.length!==result.length*1104)throw Error('Baseline feature count mismatch');
 let error=0;for(let i=0;i<result.length;i++)for(let j=0;j<1104;j++)error=Math.max(error,Math.abs(result[i][1104+j]-reference[i*1104+j]));
 if(error!==0)throw Error(`${row.stem} relative feature parity failed: ${error}`);
 const values=Float32Array.from(result.flat());writeFileSync(`${out}/${row.stem}-features.f32`,Buffer.from(values.buffer));
 output.push({file:row.file,stem:row.stem,participant:row.participant,mode:row.mode,split:row.split,times:row.times,labels:row.split==='training'?row.labels:undefined,relativeMaxError:error});
 console.log(row.split,row.file,result.length,'relative parity',error);
}
await browser.close();if(errors.length)throw Error(errors.join('\n'));
writeFileSync(`${out}/manifest.json`,JSON.stringify({features:2208,rows:output,errors},null,2));
