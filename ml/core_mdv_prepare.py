"""Prepare allowed AVP/MDV/Beatboxset1 training and validation events only.

MDV performers11–13 and AVP21–28 are not loaded. MDV labels are recording-level;
no ground-truth onset is asserted. Beatboxset1 uses annotator-consensus labels.
"""
import json
from pathlib import Path
import numpy as np
import librosa
import soundfile as sf
from scipy.ndimage import uniform_filter1d
from prepare import RATE,crop,fbank
OUT=Path('artifacts/core-model/mdv');OUT.mkdir(parents=True,exist_ok=True)
MAP={'hhc':0,'hho':0,'kd':1,'sd':2};EXT={'hc':0,'ho':0,'k':1,'s':2,'sb':2,'sk':2,'br':3,'m':3,'v':3,'x':3};MDV={'hat':0,'kick':1,'snare':2,'cymbal':3,'tom':3}

def main():
 meta=json.loads(Path('artifacts/ml-v2/events.json').read_text());old=np.load('artifacts/ml-v2/fbanks.npy');banks=[];rows=[]
 for i,m in enumerate(meta):
  train=m['participant']<=14 and m['kind']=='annotation';val=15<=m['participant']<=20 and m['kind']=='detection' and m['groove']
  if m['label'] not in MAP or not(train or val):continue
  rows.append({'domain':'avp','split':'train' if train else 'validation','label':MAP[m['label']],'file':m['file'],'kind':m['kind'],'participant':m['participant'],'time':m['time']});banks.append(old[i])
 manifest=json.loads(Path('artifacts/new-public-audio/mdv/manifest.json').read_text())
 for r in manifest['recordings']:
  if r['split'] not in ['train','validation']:continue
  audio,rate=sf.read(r['audio'],always_2d=True,dtype='float32');audio=librosa.resample(audio.mean(1),orig_sr=rate,target_sr=RATE)
  env=np.sqrt(np.maximum(0,uniform_filter1d(audio*audio,80)));active=np.flatnonzero(env>max(env.max()*.08,.00001));start=max(0,active[0]/RATE-.005) if len(active) else 0
  banks.append(fbank(crop(audio,start,len(audio)/RATE)));rows.append({'domain':'mdv','split':r['split'],'label':MDV[r['sourceClass']],'file':r['audio'],'participant':r['performer'],'kind':'recording','estimatedStart':start,'sourceClass':r['sourceClass']})
 records=sorted(json.loads(Path('artifacts/external-events-v2.json').read_text()),key=lambda r:r['file'])
 for ri,r in enumerate(records[:11]):
  split='train' if ri<8 else 'validation';a=r['annotations']['DR'];b=r['annotations']['HT'];truth=[]
  for e in a:
   if e['label'] not in EXT:continue
   matches=[(abs(e['time']-f['time']),f) for f in b if abs(e['time']-f['time'])<.05 and f['label'] in EXT]
   if not matches:continue
   distance,f=min(matches,key=lambda t:t[0])
   if EXT[e['label']]!=EXT[f['label']]:continue
   truth.append({'time':e['time'],'label':EXT[e['label']]})
  events=truth if split=='train' else r['detections'];audio,rate=sf.read(r['path'],always_2d=True,dtype='float32');audio=librosa.resample(audio.mean(1),orig_sr=rate,target_sr=RATE);used=set()
  for j,e in enumerate(events):
   if split=='train':label=e['label']
   else:
    matches=[(abs(e['time']-f['time']),k,f) for k,f in enumerate(truth) if k not in used and abs(e['time']-f['time'])<.05]
    if not matches:continue
    _,k,f=min(matches,key=lambda t:t[0]);used.add(k);label=f['label']
   end=events[j+1]['time'] if j+1<len(events) else len(audio)/RATE
   banks.append(fbank(crop(audio,e['time'],end)));rows.append({'domain':'beatboxset','split':split,'label':label,'file':r['file'],'kind':'annotation' if split=='train' else 'detection','time':e['time']})
  print('Prepared',r['file'],len(banks),flush=True)
 np.save(OUT/'banks.npy',np.stack(banks));(OUT/'events.json').write_text(json.dumps(rows));print({domain:{split:sum(r['domain']==domain and r['split']==split for r in rows) for split in ['train','validation']} for domain in ['avp','mdv','beatboxset']},flush=True)
if __name__=='__main__':main()
