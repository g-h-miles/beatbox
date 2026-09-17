/** One predeclared validation-only rule; no tuning and no test data. */
import {readFileSync,writeFileSync} from 'node:fs';
import {features} from '../src/audio';
import {activeDuration} from '../src/audio-duration';
import {coreDiversity,supportsRelative} from '../src/core-diversity';
import {existsSync} from 'node:fs';
const out='artifacts/typesafe-group-validation';
const {rows}=JSON.parse(readFileSync(`${out}/predictions.json`,'utf8'));
const labels=['closed','open','kick','snare','ride','crash','aux'];
const referenceNames:Record<string,string>={hhc:'closed',hho:'open',kd:'kick',sd:'snare'};
const core=(s:string)=>['closed','open'].includes(s)?'hat':s;
const isCore=(s:string)=>['closed','open','kick','snare'].includes(s);
const argmax=(values:Record<string,number>)=>labels.reduce((a,b)=>values[b]>values[a]?b:a,labels[0]);
const request=process.argv.includes('--request');
let previous=0;
const results:any[]=[];
if(rows.length!==12||rows.some((r:any)=>r.participant<15||r.participant>20)||rows.reduce((n:number,r:any)=>n+r.times.length,0)!==707)throw Error('Unexpected validation cohort');
for(const row of rows){
 const path=`${out}/${row.stem}.json`;
 let hits:any[];
 if(existsSync(path)){
  hits=JSON.parse(readFileSync(path,'utf8')).hits;
  if(hits.length!==row.times.length||hits.some((h,i)=>h.time!==row.times[i]))throw Error('Cache mismatch');
 }else{
  const b=readFileSync(`${out}/${row.stem}-audio.f32`),audio=new Float32Array(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));
  hits=row.times.map((time:number,i:number)=>{
   const end=Math.min(row.times[i+1]??audio.length/row.sampleRate,time+.5);
   const {acoustic,...basic}=features(audio,row.sampleRate,time,end);
   basic.duration=activeDuration(audio,row.sampleRate,time,end);
   return {id:`hit-${i}`,time,duration:end-time,features:basic};
  });
 }
 const save=()=>writeFileSync(path,JSON.stringify({file:row.file,hits,models:row},null,2));save();
 for(let offset=0;offset<hits.length;offset+=24){
  const batch=hits.slice(offset,offset+24);if(batch.every(h=>h.answer)||!request)continue;
  await new Promise(resolve=>setTimeout(resolve,Math.max(0,2300-(Date.now()-previous))));previous=Date.now();
  const response=await fetch('https://beatbox.grahammiles.me/api/classify',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://beatbox.grahammiles.me'},body:JSON.stringify({mode:'hits',examples:[],hits:batch.map(({id,features})=>({id,features}))}),signal:AbortSignal.timeout(90000)});
  const data:any=await response.json();if(!response.ok||!Array.isArray(data.answers))throw Error(`API ${response.status}: ${JSON.stringify(data)}`);
  for(const hit of batch){hit.answer=data.answers.find((a:any)=>a.id===hit.id);if(!hit.answer)throw Error('Missing answer');}
  save();console.log(`${row.file} ${Math.min(offset+24,hits.length)}/${hits.length}`);
 }
 if(!request)continue;
 const gate=supportsRelative(hits.map(h=>h.features.spectrum));
 const grouped:Record<string,any>={};
 hits.forEach((hit,i)=>{
  const group=row.core.groups[i];grouped[group]??={count:0,sums:Object.fromEntries(labels.map(l=>[l,0]))};
  grouped[group].count++;
  for(const label of labels){const value=hit.answer.probabilities[label];if(!Number.isFinite(value))throw Error('Incomplete probabilities');grouped[group].sums[label]+=value;}
 });
 for(const g of Object.values(grouped) as any[]){g.mean=Object.fromEntries(labels.map(l=>[l,g.sums[l]/g.count]));g.argmax=argmax(g.mean);}
 const events=hits.map((hit,i)=>{
  const group=row.core.groups[i],pooled=grouped[group],model=labels[row.combined[i]],ts=hit.answer.drum;
  const current=gate&&isCore(ts)?model:ts;
  const individualArgmax=argmax(hit.answer.probabilities);
  const changed=gate&&!isCore(ts)&&!isCore(individualArgmax)&&isCore(pooled.argmax);
  return {id:hit.id,time:hit.time,group,typeSafe:ts,model,current,rule:changed?model:current,changed,individualArgmax,pooledArgmax:pooled.argmax,pooledProbabilities:pooled.mean};
 });
 const refs=readFileSync(`artifacts/avp-full/AVP_Dataset/${row.mode}/Participant_${row.participant}/${row.stem}.csv`,'utf8').trim().split(/\r?\n/).map(line=>{const [time,label]=line.split(',');return {time:Number(time),label:referenceNames[label.trim()]};}).filter(r=>r.label);
 const pairs:any[]=[];events.forEach((e,i)=>refs.forEach((r,j)=>{const error=Math.abs(e.time-r.time);if(error<.05)pairs.push({error,hit:i,reference:j});}));pairs.sort((a,b)=>a.error-b.error);
 const usedHits=new Set(),usedRefs=new Set(),matches=[];
 for(const p of pairs){if(usedHits.has(p.hit)||usedRefs.has(p.reference))continue;usedHits.add(p.hit);usedRefs.add(p.reference);matches.push({...p,...events[p.hit],expected:refs[p.reference].label});}
 const result={file:row.file,mode:row.mode,participant:row.participant,gate,diversity:coreDiversity(hits.map(h=>h.features.spectrum)),detected:hits.length,reference:refs.length,matched:matches.length,events,matches,groups:grouped};
 writeFileSync(path,JSON.stringify({...result,hits,models:row},null,2));results.push(result);
}
if(!request){console.log('Prepared only. Use --request to query the frozen validation condition.');process.exit(0);}
const summaries=[];
for(const mode of ['all','Fixed','Personal']){
 const records=results.filter(r=>mode==='all'||r.mode===mode),events=records.flatMap(r=>r.matches),detected=records.reduce((n,r)=>n+r.detected,0),reference=records.reduce((n,r)=>n+r.reference,0);
 for(const pipeline of ['typeSafe','model','current','rule']){
  const correctCore=events.filter(e=>core(e[pipeline])===core(e.expected)).length,correctFour=events.filter(e=>e[pipeline]===e.expected).length;
  summaries.push({mode,pipeline,detected,reference,matched:events.length,correctCore,correctFour,coreAccuracy:correctCore/events.length,fourAccuracy:correctFour/events.length,coreJointF1:2*correctCore/(detected+reference),fourJointF1:2*correctFour/(detected+reference),perClass:labels.slice(0,4).map(label=>{const subset=events.filter(e=>e.expected===label);return {label,total:subset.length,correctCore:subset.filter(e=>core(e[pipeline])===core(label)).length,correctFour:subset.filter(e=>e[pipeline]===label).length};})});
 }
}
const baseline=summaries.find(s=>s.mode==='all'&&s.pipeline==='model')!;
if(baseline.correctCore!==639||baseline.correctFour!==605||baseline.matched!==672)throw Error(`Frozen native model parity failed: ${JSON.stringify(baseline)}`);
const changes=results.flatMap(r=>r.events).filter(e=>e.changed),matched=results.flatMap(r=>r.matches).filter(e=>e.changed);
const report={protocol:'Single predeclared rule: average complete TypeSafe probabilities within frozen browser core model8Wardgroups; retain individual noncore unless pooledargmax iscore and the existing diversitygate passes. Frozen707native AVP15–20 events only. No fitting, threshold search, test or private access.',summaries,changes:{all:changes.length,matched:matched.length,coreCorrected:matched.filter(e=>core(e.current)!==core(e.expected)&&core(e.rule)===core(e.expected)).length,coreSpoiled:matched.filter(e=>core(e.current)===core(e.expected)&&core(e.rule)!==core(e.expected)).length,fourCorrected:matched.filter(e=>e.current!==e.expected&&e.rule===e.expected).length,fourSpoiled:matched.filter(e=>e.current===e.expected&&e.rule!==e.expected).length},recordings:results,limitation:'All matched reference classes arecore. This cannot estimate true ride/crash/aux retention or justify promotion without representative labeled noncore recordings.'};
writeFileSync(`${out}/report.json`,JSON.stringify(report,null,2));console.log(JSON.stringify({summaries,changes:report.changes},null,2));
