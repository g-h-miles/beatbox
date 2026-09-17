import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { features } from '../src/audio';
import { activeDuration } from '../src/audio-duration';
const out='artifacts/hat-shape';mkdirSync(out,{recursive:true});
const train=JSON.parse(readFileSync('artifacts/browser-relative/training-manifest.json','utf8')).rows;
const validation=JSON.parse(readFileSync('artifacts/four-relative/native-manifest.json','utf8')).rows;
const fixtures=JSON.parse(readFileSync('artifacts/relative-parity/audio-fixtures.json','utf8'));
function descriptors(x:Float32Array,sr:number,time:number,end:number){
 const f=features(x,sr,time,end);const a=Math.floor(time*sr),b=Math.min(x.length,Math.floor(end*sr));
 const energy:number[]=[];let total=0,peak=0;const segments=[0,0,0];
 for(let i=a;i<b;i++){const p=x[i]*x[i];energy.push(p);total+=p;peak=Math.max(peak,Math.abs(x[i]));const t=(i-a)/sr;segments[t<.05?0:t<.15?1:2]+=p;}
 const quantiles=[.1,.25,.5,.75,.9].map(q=>{let sum=0;for(let i=0;i<energy.length;i++){sum+=energy[i];if(sum>=q*total)return i/sr;}return (b-a)/sr;});
 const hop=Math.max(1,Math.round(sr*.005));const envelope:number[]=[];
 for(let i=0;i<energy.length;i+=hop){let sum=0;for(let j=i;j<Math.min(i+hop,energy.length);j++)sum+=energy[j];envelope.push(Math.sqrt(sum/Math.min(hop,energy.length-i)));}
 const maximum=Math.max(...envelope,1e-12);
 const decay=[.1,.25,.5].map(q=>{let last=0;for(let i=0;i<envelope.length;i++)if(envelope[i]>=q*maximum)last=i;return Math.min((last+1)*hop/sr,end-time);});
 return [activeDuration(x,sr,time,end),end-time,f.attack,Math.log10(f.rms+1e-8),f.centroid/16000,f.low,f.mid,f.high,f.flatness,f.zcr,...f.spectrum,...quantiles,...segments.map(p=>p/(total||1)),...decay,Math.log10(peak/(f.rms+1e-8)+1)];
}
const rows=[];
for(const split of ['train','validation'])for(const row of split==='train'?train:validation){
 const participant=Number(row.file.match(/^P(\d+)_/)[1]);if(split==='train'?(participant<1||participant>14):(participant<15||participant>20))throw Error('Participant allowlist');
 const fixture=split==='train'?row:fixtures.find((f:any)=>f.file===row.file);const sr=fixture.sampleRate;const directory=split==='train'?'artifacts/browser-relative':'artifacts/relative-parity';
 const buffer=readFileSync(`${directory}/${row.stem}-native.f32`);const x=new Float32Array(buffer.buffer.slice(buffer.byteOffset,buffer.byteOffset+buffer.byteLength));
 const times:number[]=split==='train'?row.times:row.nativeTimes;
 const values=times.map((t,i)=>descriptors(x,sr,t,Math.min(t+.5,times[i+1]??x.length/sr,x.length/sr)));
 if(values.some(v=>v.length!==42||v.some(x=>!Number.isFinite(x))))throw Error('Invalid features');
 const packed=Float32Array.from(values.flat());writeFileSync(`${out}/${row.stem}-shape.f32`,Buffer.from(packed.buffer));rows.push({file:row.file,stem:row.stem,split,participant,times,labels:split==='train'?row.labels:undefined});
 console.log(split,row.file,values.length);
}
writeFileSync(`${out}/manifest.json`,JSON.stringify({features:42,rows},null,2));
