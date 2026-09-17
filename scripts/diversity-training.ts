import {readFileSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {features} from '../src/audio';
import {coreDiversity} from '../src/core-diversity';
const rows=JSON.parse(readFileSync('artifacts/diversity/training.json','utf8'));
for(const r of rows){
 const b=execFileSync('ffmpeg',['-v','error','-i',r.path,'-ac','1','-ar','44100','-f','f32le','-'],{maxBuffer:50000000});
 const x=new Float32Array(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));
 r.score=coreDiversity(r.times.map((t:number,i:number)=>features(x,44100,t,Math.min(t+.5,r.times[i+1]??x.length/44100)).spectrum));
}
function score(rows:any[],threshold:number){
 const varied=rows.filter(r=>r.varied),single=rows.filter(r=>!r.varied);
 const tp=varied.filter(r=>r.score>threshold).length,tn=single.filter(r=>r.score<=threshold).length;
 return{varied:varied.length,single:single.length,tp,tn,balanced:.5*(tp/varied.length+tn/single.length)};
}
function fit(rows:any[]){
 const scores=[...new Set(rows.map(r=>r.score))].sort((a,b)=>a-b);
 const thresholds=[-1,...scores.map((s,i)=>(s+(scores[i+1]??s+2))/2)];
 return thresholds.map(threshold=>({threshold,...score(rows,threshold)})).sort((a,b)=>b.balanced-a.balanced||b.threshold-a.threshold)[0];
}
const folds=[...new Set(rows.map((r:any)=>r.participant))].map(participant=>{const fitted=fit(rows.filter((r:any)=>r.participant!==participant));return{participant,threshold:fitted.threshold,...score(rows.filter((r:any)=>r.participant===participant),fitted.threshold)}});
const selected=fit(rows);
const report={protocol:'First14trainingvoices only. Fixed75thpercentile pairwise log-mel-spectrum distance, at least6hits, max96uniformly sampled. Threshold maximizes balanced recording-level varied/single accuracy, higher threshold breaks ties. Leave-one-training-voice-out diagnostic; no validation data used.',selected,folds,records:rows.map(({times,...r}:any)=>({...r,detected:times.length}))};
writeFileSync('artifacts/diversity/training-report.json',JSON.stringify(report,null,2));console.log(JSON.stringify({selected,folds},null,2));
