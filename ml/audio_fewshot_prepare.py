"""Freeze public training medoids and deterministic validation queries before API use."""
import base64,hashlib,io,json,math
from pathlib import Path
import numpy as np
import soundfile as sf
from scipy.signal import resample_poly
from sklearn.cluster import KMeans
from sklearn.preprocessing import StandardScaler
OUT=Path('artifacts/audio-fewshot');OUT.mkdir(parents=True,exist_ok=True)
CLASSES=['closed','open','kick','snare']
def wav_clip(audio,rate,start,end):
 clip=audio[max(0,int((start-.01)*rate)):min(len(audio),int(end*rate))].copy()
 clip=resample_poly(clip,16000//math.gcd(rate,16000),rate//math.gcd(rate,16000)).astype('float32')
 if len(clip):
  clip-=clip.mean();peak=np.max(np.abs(clip))
  if peak>0:clip*=.8/peak
 repeated=np.concatenate([clip,np.zeros(1600,dtype='float32'),clip]);assert len(repeated)<=24000
 padded=np.pad(repeated,(0,24000-len(repeated)));buffer=io.BytesIO();sf.write(buffer,padded,16000,format='WAV',subtype='PCM_16');data=buffer.getvalue()
 assert len(data)==48044 and data[:4]==b'RIFF' and data[8:12]==b'WAVE'
 return data,dict(cropStart=max(0,start-.01),cropEnd=end,rate=16000,samples=24000,sha256=hashlib.sha256(data).hexdigest())
def main():
 manifest=json.load(open('artifacts/browser-relative/training-manifest.json'))['rows'];assert len(manifest)==27 and all(1<=r['participant']<=14 for r in manifest)
 entries=[];features=[]
 for r in manifest:
  x=np.fromfile(f"artifacts/browser-relative/{r['stem']}-features.f32",dtype='float32').reshape(-1,1104);assert len(x)==len(r['times'])
  features.extend(x)
  entries.extend(dict(row=r,index=i,label=label) for i,label in enumerate(r['labels']))
 x=StandardScaler().fit_transform(np.stack(features));examples=[];example_meta=[]
 for label in range(4):
  indices=np.array([i for i,e in enumerate(entries) if e['label']==label]);cluster=KMeans(n_clusters=3,random_state=1709,n_init=10).fit(x[indices]);used=set()
  for group in range(3):
   order=np.argsort(np.sum((x[indices]-cluster.cluster_centers_[group])**2,axis=1),kind='stable')
   members=[int(indices[k]) for k in order if cluster.labels_[k]==group and entries[int(indices[k])]['row']['participant'] not in used]
   fallback=not bool(members)
   if fallback:members=[int(indices[k]) for k in order if entries[int(indices[k])]['row']['participant'] not in used]
   selected=members[0];e=entries[selected];r=e['row'];i=e['index'];used.add(r['participant'])
   audio,rate=sf.read(f"artifacts/avp-full/AVP_Dataset/{r['mode']}/Participant_{r['participant']}/{r['file']}",dtype='float32',always_2d=True);audio=audio.mean(1)
   start=r['times'][i];end=min(r['times'][i+1] if i+1<len(r['times']) else len(audio)/rate,start+.5)
   data,details=wav_clip(audio,rate,start,end);name=f'example-{CLASSES[label]}-{group}.wav';(OUT/name).write_bytes(data)
   examples.append(dict(label=CLASSES[label],audio=base64.b64encode(data).decode()))
   example_meta.append(dict(label=CLASSES[label],cluster=group,participant=r['participant'],file=r['file'],eventIndex=i,time=start,nearestUnusedVoiceOutsideCluster=fallback,wav=name,**details))
 queries=[]
 for r in json.load(open('artifacts/typesafe-group-validation/predictions.json'))['rows']:
  assert 15<=r['participant']<=20
  cache=json.load(open(f"artifacts/typesafe-group-validation/{r['stem']}.json"));audio=np.fromfile(f"artifacts/typesafe-group-validation/{r['stem']}-audio.f32",dtype='float32');n=len(r['times']);selected=[int((i+.5)*n/8) for i in range(8)];assert len(set(selected))==8
  matches={m['hit']:m for m in cache['matches']};hits=[];metadata=[]
  for i in selected:
   start=r['times'][i];end=min(r['times'][i+1] if i+1<n else len(audio)/r['sampleRate'],start+.5);data,details=wav_clip(audio,r['sampleRate'],start,end);id=f'hit-{i}';name=f"{r['stem']}-{id}.wav";(OUT/name).write_bytes(data)
   hits.append(dict(id=id,audio=base64.b64encode(data).decode()));m=matches.get(i)
   metadata.append(dict(id=id,index=i,time=start,expected=m['expected'] if m else None,matchError=m['error'] if m else None,acoustic=CLASSES[r['combined'][i]],wav=name,**details))
  queries.append(dict(file=r['file'],stem=r['stem'],participant=r['participant'],mode=r['mode'],hits=hits,metadata=metadata))
 assert len(examples)==12 and len(queries)==12 and sum(len(r['hits']) for r in queries)==96
 prepared=dict(protocol='Frozen train1–14 medoids, seed1709,n_init10,3perclass distinctvoices; deterministic native15–20 midpointindices8perrecord; allhitseligible;16kPCM16mono repeatedtwice100msgap padded1.5s. No API yet.',examples=examples,exampleMetadata=example_meta,queries=queries)
 blob=json.dumps(prepared,indent=2).encode();(OUT/'prepared.json').write_bytes(blob);(OUT/'prepared.sha256').write_text(hashlib.sha256(blob).hexdigest()+'\n')
 print('FROZEN',hashlib.sha256(blob).hexdigest());print('Examples',[(e['label'],e['participant'],e['file'],e['eventIndex']) for e in example_meta]);print('Queries96 unmatched',sum(m['expected'] is None for q in queries for m in q['metadata']))
if __name__=='__main__':main()
