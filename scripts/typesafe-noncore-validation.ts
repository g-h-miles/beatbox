/** One predeclared validation-only rule; no tuning and no test data. */
import {readFileSync,writeFileSync} from 'node:fs';
import {features} from '../src/audio';
import {activeDuration} from '../src/audio-duration';
import {coreDiversity,supportsRelative} from '../src/core-diversity';
import {existsSync} from 'node:fs';
const out='artifacts/typesafe-noncore';
const {rows}=JSON.parse(readFileSync(`${out}/predictions.json`,'utf8'));
const labels=['closed','open','kick','snare','ride','crash','aux'];
const referenceNames:Record<string,string>={hhc:'closed',hho:'open',kd:'kick',sd:'snare'};
const core=(s:string)=>['closed','open'].includes(s)?'hat':s;
const isCore=(s:string)=>['closed','open','kick','snare'].includes(s);
const argmax=(values:Record<string,number>)=>labels.reduce((a,b)=>values[b]>values[a]?b:a,labels[0]);
const request=process.argv.includes('--request');
let previous=0;
const results:any[]=[];
if(rows.length!==3||rows.some((r:any)=>!['putfile_bui','putfile_dbztenkaichi','putfile_pepouni'].includes(r.stem)))throw Error('Unexpected validation cohort');
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
 const sourceNames:Record<string,string>={hc:'closed',ho:'open',k:'kick',s:'snare',sb:'snare',sk:'snare',br:'other',m:'other',v:'other',x:'other'};
 const mapped:Record<string,any[]>={};
 for(const annotator of ['DR','HT'])mapped[annotator]=row.annotations[annotator].filter((a:any)=>a.label in sourceNames).map((a:any)=>({...a,expected:sourceNames[a.label]}));
 // Consensus is one-to-one by closest time, with agreement required after pairing.
 const annotationPairs:any[]=[];mapped.DR.forEach((a,i)=>mapped.HT.forEach((b,j)=>{const error=Math.abs(a.time-b.time);if(error<.05)annotationPairs.push({i,j,error});}));annotationPairs.sort((a,b)=>a.error-b.error);
 const usedDR=new Set(),usedHT=new Set();mapped.consensus=[];
 for(const p of annotationPairs){if(usedDR.has(p.i)||usedHT.has(p.j))continue;usedDR.add(p.i);usedHT.add(p.j);const a=mapped.DR[p.i],b=mapped.HT[p.j];if(core(a.expected)===core(b.expected))mapped.consensus.push({...a,otherAnnotator:b});}
 const evaluations:any[]=[];
 const classify=(label:string)=>isCore(label)?core(label):'other';
 for(const [annotator,refs] of Object.entries(mapped)){
  const pairs:any[]=[];events.forEach((e,i)=>refs.forEach((r,j)=>{const error=Math.abs(e.time-r.time);if(error<.05)pairs.push({error,hit:i,reference:j});}));pairs.sort((a,b)=>a.error-b.error);
  const usedHits=new Set(),usedRefs=new Set(),matches=[];
  for(const p of pairs){if(usedHits.has(p.hit)||usedRefs.has(p.reference))continue;usedHits.add(p.hit);usedRefs.add(p.reference);matches.push({...p,...events[p.hit],expected:refs[p.reference].expected,sourceLabel:refs[p.reference].label,referenceTime:refs[p.reference].time,consensusOtherLabel:refs[p.reference].otherAnnotator?.label});}
  const summaries=[];
  for(const pipeline of ['typeSafe','current','rule']){
   const other=matches.filter(e=>e.expected==='other'),cores=matches.filter(e=>e.expected!=='other');
   const correctCore=cores.filter(e=>classify(e[pipeline])===core(e.expected)).length,otherRetained=other.filter(e=>!isCore(e[pipeline])).length;
   summaries.push({pipeline,matchedCore:cores.length,correctCore,matchedOther:other.length,otherRetained,otherToCore:other.length-otherRetained,jointMappedF1:2*(correctCore+otherRetained)/(events.length+refs.length),bySourceLabel:Object.fromEntries([...new Set(matches.map(e=>e.sourceLabel))].map(label=>{const subset=matches.filter(e=>e.sourceLabel===label);return [label,{total:subset.length,correctMapped:subset.filter(e=>classify(e[pipeline])===core(e.expected)).length}]}))});
  }
  evaluations.push({annotator,reference:refs.length,referenceOther:refs.filter(r=>r.expected==='other').length,detected:events.length,matched:matches.length,onsetF1:2*matches.length/(events.length+refs.length),matches,summaries,unmappedReferenceLabels:annotator==='consensus'?null:row.annotations[annotator].filter((a:any)=>!(a.label in sourceNames))});
 }
 const result={file:row.file,gate,diversity:coreDiversity(hits.map(h=>h.features.spectrum)),detected:hits.length,events,groups:grouped,evaluations};
 writeFileSync(path,JSON.stringify({...result,hits,models:row},null,2));results.push(result);
}
if(!request){console.log('Prepared only; --request enables API.');process.exit(0);}
const summary=[];
for(const annotator of ['DR','HT','consensus']){
 const records=results.flatMap(r=>r.evaluations.filter((e:any)=>e.annotator===annotator)),totals={detected:0,reference:0,matched:0,referenceOther:0};
 for(const r of records)for(const key of Object.keys(totals))totals[key]+=r[key];
 for(const pipeline of ['typeSafe','current','rule']){
  const totalsByClass={matchedCore:0,correctCore:0,matchedOther:0,otherRetained:0,otherToCore:0};
  for(const r of records){const a=r.summaries.find((s:any)=>s.pipeline===pipeline);for(const key of Object.keys(totalsByClass))totalsByClass[key]+=a[key];}
  summary.push({annotator,pipeline,...totals,...totalsByClass,onsetF1:2*totals.matched/(totals.detected+totals.reference),jointMappedF1:2*(totalsByClass.correctCore+totalsByClass.otherRetained)/(totals.detected+totals.reference)});
 }
}
const report={protocol:'Frozen TypeSafe group rule on only three pre-existing Beatboxset validation recordings; native detections, identical probabilities for bothconditions, unchanged model/gate, no fitting or test access. DR andHT evaluated separately and one-to-one temporal/core-category consensus.',limitation:'Other collapses breath/humming/speech/miscellaneous. No explicit ride/crash references. Annotator disagreement and unknown labels constrain interpretation. Consensus is a subset, so unmatched detections are not all known false positives.',summary,recordings:results};
writeFileSync(`${out}/changed-other-events.json`,JSON.stringify(results.flatMap(r=>r.evaluations.flatMap((a:any)=>a.matches.filter((e:any)=>e.changed&&e.expected==='other').map((e:any)=>({file:r.file,annotator:a.annotator,...e})))),null,2));
writeFileSync(`${out}/report.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(summary,null,2));
