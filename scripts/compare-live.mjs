import {readFileSync,writeFileSync} from 'node:fs';
const rows=JSON.parse(readFileSync('artifacts/heldout-grooves.json','utf8'));
const subset=[];
for(const file of [...new Set(rows.map(r=>r.file))]){
const all=rows.filter(r=>r.file===file);for(let i=0;i<12;i++)subset.push(all[Math.floor(i*all.length/12)]);
}
const endpoints={baseline:'https://beatbox.grahammiles.me',candidate:'https://e7cbf413-beatbox.ghmiles328.workers.dev'};
const map={kd:'kick',sd:'snare',hhc:'closed',hho:'open'};
for(const [name,url] of Object.entries(endpoints)){
 for(let i=0;i<subset.length;i+=24){
 const batch=subset.slice(i,i+24);const response=await fetch(url+'/api/classify',{method:'POST',headers:{Origin:url,'Content-Type':'application/json'},body:JSON.stringify({hits:batch.map((r,j)=>({id:`hit-${i+j}`,features:r.features}))})});const data=await response.json();if(!response.ok)throw Error(JSON.stringify(data));
 for(const a of data.answers)subset[Number(a.id.slice(4))][name]=a.drum;
 console.log(name,i+batch.length,flush());
 }
 console.log(name,'accuracy',subset.filter(r=>r[name]===map[r.label]).length,subset.length);
 writeFileSync('artifacts/paired-live-comparison.json',JSON.stringify(subset,null,2));
}
function flush(){return '';}
