import {readFileSync,readdirSync,writeFileSync,mkdirSync} from 'node:fs';
import assert from 'node:assert/strict';
import {wardGroups,pooledCoreLabels} from '../src/research-relative/consistency';
const reports=[];
for(const split of ['validation','existingTest'])for(const file of readdirSync(`artifacts/relative-consistency/parity/${split}`)){
 const r=JSON.parse(readFileSync(`artifacts/relative-consistency/parity/${split}/${file}`,'utf8'));
 const start=performance.now();const groups=wardGroups(r.standardizedFeatures.map((row:number[])=>new Float32Array(row)));const predicted=pooledCoreLabels(groups,r.margins);const elapsed=performance.now()-start;
 for(let i=0;i<groups.length;i++)for(let j=0;j<groups.length;j++)assert.equal(groups[i]===groups[j],r.groups[i]===r.groups[j],`${file}:partition ${i},${j}`);
 assert.deepEqual(predicted,r.pooledLabels,`${file}:labels`);reports.push({split,file,events:groups.length,milliseconds:elapsed});
}
const result={recordings:reports.length,events:reports.reduce((s,r)=>s+r.events,0),reports};mkdirSync('artifacts/relative-consistency/browser',{recursive:true});writeFileSync('artifacts/relative-consistency/browser/parity.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
