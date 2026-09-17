"""Frozen official music/speech CLAP embeddings; one predeclared clip rendering.

Train: AVP1–14 annotated hits. Validation:15–20 actual frozen neural detections,
including unmatched hits. No21–28/reserved/private recordings are loaded.
Crop starts10ms before event and ends at next event, at most500ms. Mean removal
and peak0.8 normalization precede native48kHz CLAP repeatpad10sec preprocessing.
No alternate rendering, fine-tuning, text prompts, or test-based selection.
"""
import json,hashlib,time
from pathlib import Path
import numpy as np
import librosa
import soundfile as sf
import torch,transformers
from transformers import ClapAudioModelWithProjection,ClapFeatureExtractor
from huggingface_hub import snapshot_download
OUT=Path('artifacts/clap');MODEL='laion/larger_clap_music_and_speech';REVISION='195c3a3e68faebb3e2088b9a79e79b43ddbda76b';RATE=48000;MAPPING={'hhc':0,'hho':0,'kd':1,'sd':2}

def render(audio,start,end):
 lo=max(0,round((start-.01)*RATE));hi=min(len(audio),round(end*RATE),lo+24000);x=audio[lo:hi].copy()
 if not len(x):return np.zeros(480,dtype='float32')
 x-=x.mean();x*=.8/max(float(np.max(np.abs(x))),.0001);return x

def main():
 OUT.mkdir(exist_ok=True,parents=True);torch.set_num_threads(4);np.random.seed(37);torch.manual_seed(37);snapshot_download(MODEL,revision=REVISION,local_dir=OUT/'model',allow_patterns=['config.json','preprocessor_config.json','pytorch_model.bin','README.md']);weightpath=OUT/'model/pytorch_model.bin';hasher=hashlib.sha256()
 with weightpath.open('rb') as source:
  while data:=source.read(8*1024*1024):hasher.update(data)
 manifest={'model':MODEL,'revision':REVISION,'officialCard':'https://huggingface.co/'+MODEL,'license':'Apache-2.0 per official model card','weightBytes':weightpath.stat().st_size,'weightSha256':hasher.hexdigest(),'torch':torch.__version__,'transformers':transformers.__version__,'render':'mono48k;10ms pre-onset;next-event end capped500ms;mean removal;peak0.8;official repeatpad10s; no render alternatives'};(OUT/'model-manifest.json').write_text(json.dumps(manifest,indent=2))
 seqrows=json.loads(Path('artifacts/core-model/sequence/records.json').read_text());seq={r['file']:r for r in seqrows};cache=np.load('artifacts/core-model/sequence/sequences.npz');records=json.loads(Path('artifacts/events-v2.json').read_text());clips=[];metadata=[]
 for r in records:
  if r['participant']>20:continue
  train=r['participant']<=14
  if not train and 'Improvisation' not in r['file']:continue
  if train:events=r['annotations'];labels=[MAPPING.get(e['label'],-100) for e in events]
  else:
   index=seq[r['file']]['index'];events=[{'time':float(t)} for t in cache[f't{index}']];labels=cache[f'y{index}']
  audio,rate=sf.read(r['path'],always_2d=True,dtype='float32');audio=librosa.resample(audio.mean(1),orig_sr=rate,target_sr=RATE)
  for j,e in enumerate(events):
   if train and labels[j]<0:continue
   end=events[j+1]['time'] if j+1<len(events) else len(audio)/RATE;clips.append(render(audio,e['time'],end));metadata.append({'file':r['file'],'participant':r['participant'],'mode':r['mode'],'split':'train' if train else 'validation','time':e['time'],'label':int(labels[j]),'groove':'Improvisation' in r['file']})
 (OUT/'events.json').write_text(json.dumps(metadata));print('Prepared',len(clips),'clips',flush=True);processor=ClapFeatureExtractor.from_pretrained(OUT/'model');model=ClapAudioModelWithProjection.from_pretrained(OUT/'model').to('mps').eval();result=[];starttime=time.monotonic()
 with torch.no_grad():
  for offset in range(0,len(clips),16):
   inputs=processor(clips[offset:offset+16],sampling_rate=RATE,padding='repeatpad',truncation='rand_trunc',return_tensors='pt');embedding=model(**{k:v.to('mps') for k,v in inputs.items()}).audio_embeds;embedding=nn_normalize(embedding);result.append(embedding.cpu().numpy())
   if offset%128==0:print(f'{offset+len(result[-1])}/{len(clips)} embeddings; elapsed{time.monotonic()-starttime:.1f}s',flush=True)
 np.save(OUT/'embeddings.npy',np.concatenate(result));print('Saved embeddings',np.concatenate(result).shape,flush=True)

def nn_normalize(x):return torch.nn.functional.normalize(x,dim=-1)
if __name__=='__main__':main()
