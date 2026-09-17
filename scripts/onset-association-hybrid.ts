/** Frozen dual-detector association feasibility; validation only, no app edits. */
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {features} from '../src/audio';
import {activeDuration} from '../src/audio-duration';
import {supportsRelative,coreDiversity} from '../src/core-diversity';
const out='artifacts/onset-association-hybrid';mkdirSync(out,{recursive:true});
const manifest=JSON.parse(readFileSync('artifacts/onset-only/native-manifest.json','utf8'));
const association=JSON.parse(readFileSync('artifacts/onset-only/association-report.json','utf8'));
const acoustic=JSON.parse(readFileSync('artifacts/onset-only/classification-report.json','utf8'));
const labels=['closed','open','kick','snare'];
const core=(s:string)=>['closed','open'].includes(s)?'hat':s;
const request=process.argv.includes('--request');let previous=0,totalRequested=0;
const rows:any[]=[];
if(manifest.rows.length!==12||manifest.rows.some((r:any)=>r.participant<15||r.participant>20))throw Error('Wrong cohort');
function score(events:any[],refs:any[]){
 const pairs:any[]=[];events.forEach((e,i)=>refs.forEach((r,j)=>{const error=Math.abs(e.time-r.time);if(error<.05)pairs.push({error,hit:i,reference:j});}));pairs.sort((a,b)=>a.error-b.error);
 const h=new Set(),r=new Set(),matches=[];
 for(const p of pairs){if(h.has(p.hit)||r.has(p.reference))continue;h.add(p.hit);r.add(p.reference);matches.push({...p,...events[p.hit],expected:refs[p.reference].label});}
 return {detected:events.length,reference:refs.length,matched:matches.length,correctCore:matches.filter(e=>core(e.drum)===core(e.expected)).length,correctFour:matches.filter(e=>e.drum===e.expected).length,matches};
}
for(const row of manifest.rows){
 const path=`${out}/${row.stem}.json`,old=JSON.parse(readFileSync(`artifacts/typesafe-group-validation/${row.stem}.json`,'utf8'));
 const map=association.mappings.find((r:any)=>r.file===row.file),newPredictions=acoustic.candidate.recordings.find((r:any)=>r.file===row.file).predictions;
 const b=readFileSync(`artifacts/typesafe-group-validation/${row.stem}-audio.f32`),audio=new Float32Array(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));
 let hits:any[];
 if(existsSync(path)){hits=JSON.parse(readFileSync(path,'utf8')).hits;if(hits.length!==row.times.length||hits.some((h,i)=>h.time!==row.times[i]))throw Error('Cached boundaries changed');}
 else hits=row.times.map((time:number,i:number)=>{
  const end=Math.min(row.times[i+1]??audio.length/row.sampleRate,time+.5);const {acoustic,...basic}=features(audio,row.sampleRate,time,end);basic.duration=activeDuration(audio,row.sampleRate,time,end);
  const pair=map.inherited.find((p:any)=>p.candidateIndex===i);
  return {id:`hit-${i}`,time,duration:end-time,features:basic,baselineIndex:pair?.baselineIndex??null,associationDistance:pair?.distanceSeconds??null,model:labels[newPredictions[i]]};
 });
 const save=()=>writeFileSync(path,JSON.stringify({file:row.file,hits},null,2));save();
 const unpaired=hits.filter(h=>h.baselineIndex===null);
 for(let offset=0;offset<unpaired.length;offset+=24){
  const batch=unpaired.slice(offset,offset+24);if(batch.every(h=>h.answer)||!request)continue;
  await new Promise(resolve=>setTimeout(resolve,Math.max(0,2300-(Date.now()-previous))));previous=Date.now();
  const response=await fetch('https://beatbox.grahammiles.me/api/classify',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://beatbox.grahammiles.me'},body:JSON.stringify({mode:'hits',examples:[],hits:batch.map(({id,features})=>({id,features}))}),signal:AbortSignal.timeout(90000)});
  const data:any=await response.json();if(!response.ok||!Array.isArray(data.answers))throw Error(`API ${response.status}: ${JSON.stringify(data)}`);
  for(const hit of batch){hit.answer=data.answers.find((a:any)=>a.id===hit.id);if(!hit.answer)throw Error('Missing answer');}totalRequested+=batch.length;save();console.log(row.file,batch.length,'new answers');
 }
 if(!request)continue;
 const gate=supportsRelative(hits.map(h=>h.features.spectrum));
 const candidateEvents=hits.map(h=>({...h,drum:h.baselineIndex!==null?old.events[h.baselineIndex].current:gate&&labels.includes(h.answer.drum)?h.model:h.answer.drum,source:h.baselineIndex!==null?'inherited-cached-hybrid':'new-event-hybrid'}));
 const oldEvents=old.events.map((e:any)=>({time:e.time,drum:e.current,id:e.id}));
 const name:Record<string,string>={hhc:'closed',hho:'open',kd:'kick',sd:'snare'};
 const refs=readFileSync(`artifacts/avp-full/AVP_Dataset/${row.mode}/Participant_${row.participant}/${row.stem}.csv`,'utf8').trim().split(/\r?\n/).map(line=>{const [time,label]=line.split(',');return {time:Number(time),label:name[label.trim()]};}).filter(r=>r.label);
 const result={file:row.file,mode:row.mode,gate,oldGate:old.gate,diversity:coreDiversity(hits.map(h=>h.features.spectrum)),paired:map.inherited.length,unpaired:unpaired.length,baseline:score(oldEvents,refs),candidate:score(candidateEvents,refs),candidateEvents};
 writeFileSync(path,JSON.stringify({...result,hits},null,2));rows.push(result);
}
if(!request){console.log('Prepared only; --request enables25new-event classifications.');process.exit(0);}
const summaries=[];
for(const mode of ['all','Fixed','Personal'])for(const pipeline of ['baseline','candidate']){
 const records=rows.filter(r=>mode==='all'||r.mode===mode),sum=(key:string)=>records.reduce((n,r)=>n+r[pipeline][key],0),events=records.flatMap(r=>r[pipeline].matches);
 const detected=sum('detected'),reference=sum('reference'),matched=sum('matched'),correctCore=sum('correctCore'),correctFour=sum('correctFour');
 summaries.push({mode,pipeline,detected,reference,matched,correctCore,correctFour,onsetF1:2*matched/(detected+reference),coreAccuracy:correctCore/matched,fourAccuracy:correctFour/matched,coreJointF1:2*correctCore/(detected+reference),fourJointF1:2*correctFour/(detected+reference),perClass:labels.map(label=>{const subset=events.filter(e=>e.expected===label);return {label,matched:subset.length,correctCore:subset.filter(e=>core(e.drum)===core(label)).length,correctFour:subset.filter(e=>e.drum===label).length};})});
}
const old=summaries[0],next=summaries[1];
if(old.detected!==707||old.correctCore!==627||old.correctFour!==593||next.detected!==720||rows.reduce((n,r)=>n+r.paired,0)!==695||rows.reduce((n,r)=>n+r.unpaired,0)!==25)throw Error('Frozen association/baseline parity failed');
const report={protocol:'Candidate times unchanged. Exact old guarded-hybrid labels for695paired events; only25unpaired get currentAPI descriptors/probabilities and frozennewcropacoustic labels whenTSchoicecore andcandidate recording diversitygate passes. No groupoverride. AVP15–20 only, no fitting/tuning/test/private/rawaudioAPI.',associationToleranceSeconds:association.associationToleranceSeconds,requestedThisRun:totalRequested,summaries,recordings:rows,limitation:'Research feasibility only; two detector paths needed, no application integration, baselineAPIcache shared by exact label inheritance; no noncore safety or independent test claim.'};
writeFileSync(`${out}/report.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(summaries,null,2));
