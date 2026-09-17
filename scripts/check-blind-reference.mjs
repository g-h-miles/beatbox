/** Validate human reference exports without manufacturing reference labels. */
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
export const AUDIO_SHA256='4aea162754fccae8f049da5b3c37f2ec8044f5d9baee2307f95324013816b090';
const labels=new Set(['kick','snare','hat','closed','open','ride','crash','aux','unknown']);
export function checkReference(value,{requireComplete=false}={}) {
 const fail=message=>{throw new Error(message);};
 if(!value||typeof value!=='object'||value.version!==1||value.recordingId!=='recording-001'||value.audioSha256!==AUDIO_SHA256)fail('Wrong reference format or audio identity');
 if(typeof value.durationSeconds!=='number'||!Number.isFinite(value.durationSeconds)||Math.abs(value.durationSeconds-8.352)>.1)fail('Invalid decoded duration');
 if(typeof value.reviewer!=='string'||typeof value.notes!=='string'||typeof value.complete!=='boolean'||!Array.isArray(value.events))fail('Missing review metadata');
 if(value.complete&&!value.reviewer.trim())fail('Completed review needs reviewer attribution');
 if(requireComplete&&!value.complete)fail('Review is still a draft');
 let previous=-1;
 for(const [i,event] of value.events.entries()) {
  if(!event||typeof event.time!=='number'||!Number.isFinite(event.time)||event.time<0||event.time>=value.durationSeconds)fail(`Event ${i+1}: time outside audio`);
  if(event.time<=previous)fail(`Event ${i+1}: times must be strictly increasing`);previous=event.time;
  if((!labels.has(event.drum)&&!(event.drum===''&&!value.complete))||typeof event.transcript!=='string'||typeof event.ambiguous!=='boolean')fail(`Event ${i+1}: unfinished or invalid annotation`);
 }
 const uncertain=value.events.filter(e=>e.ambiguous||e.drum==='unknown').length;
 return {valid:true,complete:value.complete,events:value.events.length,uncertainEvents:uncertain,unfinishedEvents:value.events.filter(e=>e.drum==='').length,reviewer:value.reviewer,independentVerification:'Not established by file validation; reviewer identity, listening, completeness and onset accuracy need independent review.',limitations:uncertain?['Ambiguous/unknown events need adjudication; do not silently remove them from an accuracy denominator.']:[]};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
 try {if(!process.argv[2])throw Error('Usage: node scripts/check-blind-reference.mjs reference.json [--require-complete]');console.log(JSON.stringify(checkReference(JSON.parse(readFileSync(process.argv[2],'utf8')),{requireComplete:process.argv.includes('--require-complete')}),null,2));}
 catch(error){console.error(error.message);process.exitCode=1;}
}
