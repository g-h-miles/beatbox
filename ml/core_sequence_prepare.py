"""Frozen neural-onset AVP sequences, train1–14 / validation15–20 only.

All detected events stay in sequence. One-to-one annotation matching provides
training labels within50ms; unmatched detection labels are masked, never dropped.
No inferred or ground-truth tempo/downbeat is supplied; timestamps are preserved.
"""
import json
from pathlib import Path
import numpy as np
import librosa
import soundfile as sf
import torch
from prepare import crop,fbank
from neural_crop_evaluate import onsets,features,MAPPING
from train_transcriber import Transcriber,RATE
OUT=Path('artifacts/core-model/sequence');OUT.mkdir(parents=True,exist_ok=True)

def main():
 torch.set_num_threads(4);checkpoint=torch.load('artifacts/ml-v2/transcriber.pt',map_location='cpu',weights_only=True);model=Transcriber().to('mps').eval();model.load_state_dict(checkpoint['state']);records=[r for r in json.loads(Path('artifacts/events-v2.json').read_text()) if r['participant']<=20 and 'Improvisation' in r['file']];items=[];arrays={}
 for ri,r in enumerate(records):
  audio,rate=sf.read(r['path'],always_2d=True,dtype='float32');audio=audio.mean(1);times=onsets(librosa.resample(audio,orig_sr=rate,target_sr=RATE),model,checkpoint['threshold']);class_audio=librosa.resample(audio,orig_sr=rate,target_sr=16000);banks=np.stack([fbank(crop(class_audio,t,times[i+1] if i+1<len(times) else len(class_audio)/16000)) for i,t in enumerate(times)]).astype('float32');x=features(banks,relative=True);truth=[a for a in r['annotations'] if a['label'] in MAPPING];pairs=sorted((abs(t-a['time']),i,j) for i,t in enumerate(times) for j,a in enumerate(truth) if abs(t-a['time'])<.05);labels=np.full(len(times),-100,dtype=np.int64);used=set();errors=[]
  for distance,i,j in pairs:
   if labels[i]!=-100 or j in used:continue
   used.add(j);labels[i]=MAPPING[truth[j]['label']];errors.append(distance)
  # Event interval ratios and normalized elapsed position, never grid snapping.
  differences=np.diff(times);median=max(float(np.median(differences)),.03);before=np.r_[median,differences];after=np.r_[differences,median];rhythm=np.stack([np.log(np.maximum(before,.001)),np.log(np.maximum(after,.001)),np.clip(before/median,0,8),np.clip(after/median,0,8),np.arange(len(times))/max(1,len(times)-1),(times-times[0])/max(times[-1]-times[0],.01)],axis=1).astype('float32')
  arrays[f'x{ri}']=x;arrays[f'r{ri}']=rhythm;arrays[f'y{ri}']=labels;arrays[f't{ri}']=times
  items.append({'index':ri,'file':r['file'],'participant':r['participant'],'mode':r['mode'],'split':'train' if r['participant']<=14 else 'validation','detected':len(times),'annotated':len(truth),'matched':len(used),'absoluteTimingErrorSeconds':sum(errors)});print(items[-1],flush=True)
 np.savez_compressed(OUT/'sequences.npz',**arrays);(OUT/'records.json').write_text(json.dumps(items,indent=2))
if __name__=='__main__':main()
