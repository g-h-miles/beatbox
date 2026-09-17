import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {features} from '../src/audio';
import {coreDiversity} from '../src/core-diversity';
const threshold=JSON.parse(readFileSync('artifacts/diversity/training-report.json','utf8')).selected.threshold;
const rows=JSON.parse(readFileSync('artifacts/diversity/validation.json','utf8'));
for(const r of rows){
 const b=execFileSync('ffmpeg',['-v','error','-i',r.path,'-ac','1','-ar','44100','-f','f32le','-'],{maxBuffer:50000000});
 const x=new Float32Array(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));
 r.score=coreDiversity(r.times.map((t:number,i:number)=>features(x,44100,t,Math.min(t+.5,r.times[i+1]??x.length/44100)).spectrum));
 r.useRelative=r.score>threshold;
 const cached=`artifacts/typesafe-validation/${r.file.replace('.wav','.json')}`;
 if(existsSync(cached)){
  const data=JSON.parse(readFileSync(cached,'utf8'));
  if(r.times.length!==data.hits.length || r.times.some((t:number,i:number)=>Math.abs(t-data.hits[i].time)>1e-8)) throw Error('Boundary mismatch '+r.file);
  r.matched=data.matched;r.detected=data.detected;r.reference=data.reference;
  r.typeSafeCore=data.matches.filter((m:any)=>m.typeSafeCore).length;
  r.hybridCore=data.matches.filter((m:any)=>m.hybridCore).length;
  r.gatedCore=r.useRelative?r.hybridCore:r.typeSafeCore;
  r.gatedFour=data.matches.filter((m:any)=>r.useRelative?m.hybridFour:m.typeSafeFour).length;
 }
}
const varied=rows.filter((r:any)=>r.varied),single=rows.filter((r:any)=>!r.varied);
const summary={threshold,varied:varied.length,single:single.length,variedPassed:varied.filter((r:any)=>r.useRelative).length,singleRejected:single.filter((r:any)=>!r.useRelative).length,
 grooveCoreCorrect:varied.reduce((s:number,r:any)=>s+(r.gatedCore??0),0),grooveFourCorrect:varied.reduce((s:number,r:any)=>s+(r.gatedFour??0),0),grooveDetected:varied.reduce((s:number,r:any)=>s+(r.detected??0),0),grooveReferences:varied.reduce((s:number,r:any)=>s+(r.reference??0),0),grooveMatched:varied.reduce((s:number,r:any)=>s+(r.matched??0),0)};
writeFileSync('artifacts/diversity/validation-report.json',JSON.stringify({protocol:'Frozen training-only gate; validation15–20 read once after thresholdselected. Recordingvariety labels neverenter inference.',summary,rows:rows.map(({times,...r}:any)=>({...r,events:times.length}))},null,2));console.log(JSON.stringify(summary,null,2));console.log(rows.filter((r:any)=>r.useRelative!==r.varied).map((r:any)=>({file:r.file,varied:r.varied,score:r.score})));
