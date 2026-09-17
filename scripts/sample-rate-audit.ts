import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { features } from '../src/audio';
import { activeDuration } from '../src/audio-duration';
import { describe } from '../src/evidence';
const records=JSON.parse(readFileSync('artifacts/events-v2.json','utf8')).filter((r:any)=>[15,16].includes(r.participant)&&r.file.includes('Improvisation'));
const neural=JSON.parse(readFileSync('artifacts/neural-crop/report.json','utf8'));
const results=[];
for(const record of records){
 const events=neural.recordings.find((r:any)=>r.file===record.file&&r.pipeline==='neural').events;
 const rates=[];
 for(const sr of [22050,44100,48000]){
  const bytes=execFileSync('ffmpeg',['-v','error','-i',record.path,'-f','f32le','-ar',String(sr),'-ac','1','-'],{maxBuffer:50000000});
  const x=new Float32Array(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
  const hits=events.map((e:any,i:number)=>{const end=Math.min(x.length/sr,e.time+.5,events[i+1]?.time??Infinity);const f=features(x,sr,e.time,end);f.duration=activeDuration(x,sr,e.time,end);return {time:e.time,features:f,description:describe(f)};});
  rates.push({sr,hits});
 }
 results.push({file:record.file,rates});
}
const summaries=[22050,48000].map(sr=>{
 const pairs=results.flatMap(r=>r.rates.find(v=>v.sr===sr)!.hits.map((h:any,i:number)=>[r.rates.find(v=>v.sr===44100)!.hits[i],h]));
 const fields=['centroid','low','mid','high','flatness','duration','attack'];
 return{sr,events:pairs.length,meanAbsoluteDifference:Object.fromEntries(fields.map(k=>[k,pairs.reduce((s,p)=>s+Math.abs(p[0].features[k]-p[1].features[k]),0)/pairs.length])),textureChanges:pairs.filter(p=>{const texture=(f:any)=>f.flatness<.02?'tonal':f.flatness>.12?'noise':'mixed';return texture(p[0].features)!==texture(p[1].features)}).length};
});
mkdirSync('artifacts/sample-rate',{recursive:true});writeFileSync('artifacts/sample-rate/report.json',JSON.stringify({protocol:'Same frozen neural onset times/crop bounds, different ffmpeg decode rates; no labels or parameter tuning.',summaries,results},null,2));console.log(JSON.stringify(summaries,null,2));
