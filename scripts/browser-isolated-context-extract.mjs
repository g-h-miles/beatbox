/** One isolated descriptor at a time enters a same-voice real-groove context. */
import {chromium} from '@playwright/test';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const out='artifacts/browser-isolated-context',rows=JSON.parse(readFileSync(`${out}/input-manifest.json`)).rows;
if(rows.length!==108||rows.some(r=>r.participant<1||r.participant>14)||rows.reduce((n,r)=>n+r.times.length,0)!==2943)throw Error('Training allowlist');
const allowed=new Set(rows.flatMap(r=>[`${r.stem}-audio.f32`,`${r.contextStem}-context.f32`]));
const browser=await chromium.launch({headless:true}),page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('**/isolated-context-data/*',route=>{const name=new URL(route.request().url()).pathname.split('/').pop();if(!allowed.has(name))throw Error('Unallowlisted file');return route.fulfill({body:readFileSync(`${out}/${name}`),contentType:'application/octet-stream'});});
await page.route('**/isolated-context-harness',route=>route.fulfill({body:'<!doctype html><html><body></body></html>',contentType:'text/html'}));
await page.goto('http://127.0.0.1:5178/isolated-context-harness');
for(const row of rows){
 const result=await page.evaluate(async r=>{
  const {resampleRelative}=await import('/src/research-relative/index.ts');
  const {cropHit,kaldiBank,describeBank,normalizeRecording}=await import('/src/research-relative/features.ts');
  const load=async name=>new Float32Array(await(await fetch(`/isolated-context-data/${name}`)).arrayBuffer());
  const mono=await resampleRelative(await load(`${r.stem}-audio.f32`),r.sampleRate),flat=await load(`${r.contextStem}-context.f32`);
  if(flat.length!==r.contextRows*1104)throw Error('Invalid context rows');
  const context=Array.from({length:r.contextRows},(_,i)=>flat.slice(i*1104,(i+1)*1104));
  return r.times.map((t,i)=>{
   const raw=describeBank(kaldiBank(cropHit(mono,t,r.times[i+1]??mono.length/16000)));
   return Array.from(normalizeRecording([...context,raw]).at(-1));
  });
 },row);
 if(result.length!==row.labels.length||result.some(r=>r.length!==1104||r.some(v=>!Number.isFinite(v))))throw Error('Invalid output');
 const values=Float32Array.from(result.flat());writeFileSync(`${out}/${row.featureFile}`,Buffer.from(values.buffer));
 if(createHash('sha256').update(readFileSync(`artifacts/browser-relative/${row.contextStem}-features.f32`)).digest('hex')!==row.originalContextSha256)throw Error('Original training rows changed');
 console.log(row.file,result.length,'inserted isolated rows');
}
await browser.close();if(errors.length)throw Error(errors.join('\n'));
writeFileSync(`${out}/manifest.json`,JSON.stringify({rows,errors,originalParity:true},null,2));
